import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { dummyPinHash, verifyPin } from "@/lib/server/crypto";
import { HttpError, assertSameOrigin, recordWrongPin } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import {
  PENDING_COOKIE,
  PENDING_SECONDS,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  TRUST_COOKIE,
  cookieBase,
  signPending,
  signSession,
  verifyTrust,
} from "@/lib/session-token";

const schema = z.object({
  loginId: z.string().trim().toLowerCase().min(1, "Enter your admin ID.").max(32),
  pin: z.string().regex(/^\d{6}$/, "Your PIN is 6 digits."),
});

const WRONG = "That admin ID and PIN don't match.";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { loginId, pin } = await readJson(req, schema);

  const ip = clientIp(req.headers);
  if (!(await rateLimit(`signin-ip:${ip}`, 30, 15 * 60)) || !(await rateLimit(`signin-id:${loginId}`, 10, 15 * 60))) {
    throw new HttpError(429, "Too many sign-in tries. Please wait 15 minutes and try again.");
  }

  const { data: admin } = await db()
    .from("admins")
    .select("id, login_id, display_name, pin_hash, failed_attempts, locked_until, is_active, session_version, totp_enabled, totp_version")
    .eq("login_id", loginId)
    .maybeSingle();

  if (!admin || !admin.is_active) {
    await verifyPin(pin, await dummyPinHash()); // same timing as a real check
    throw new HttpError(401, WRONG);
  }

  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const minutes = Math.ceil((new Date(admin.locked_until).getTime() - Date.now()) / 60000);
    throw new HttpError(423, `This account is locked because of too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  if (!(await verifyPin(pin, admin.pin_hash))) {
    await recordWrongPin(admin.id, `${admin.display_name} (${admin.login_id})`, admin.failed_attempts);
    throw new HttpError(401, WRONG);
  }

  if (admin.failed_attempts > 0) await db().from("admins").update({ failed_attempts: 0 }).eq("id", admin.id);

  const jar = await cookies();

  // A trusted device skips the two-step code for 30 days.
  const trust = await verifyTrust(jar.get(TRUST_COOKIE)?.value);
  const now = Math.floor(Date.now() / 1000);
  const trusted =
    admin.totp_enabled &&
    trust?.devices.some((d) => d.sub === admin.id && d.tv === admin.totp_version && d.until > now);

  if (trusted) {
    await db().from("admins").update({ last_sign_in_at: new Date().toISOString() }).eq("id", admin.id);
    await audit({ id: admin.id, label: `${admin.display_name} (${admin.login_id})` }, { action: "admin.signed_in" });
    jar.set(SESSION_COOKIE, await signSession({ sub: admin.id, sv: admin.session_version, started: now }), {
      ...cookieBase,
      maxAge: SESSION_IDLE_SECONDS,
    });
    return ok({ next: "done" });
  }

  const step = admin.totp_enabled ? "verify" : "enroll";
  jar.set(PENDING_COOKIE, await signPending({ sub: admin.id, sv: admin.session_version, step }), {
    ...cookieBase,
    maxAge: PENDING_SECONDS,
  });
  return ok({ next: step });
});
