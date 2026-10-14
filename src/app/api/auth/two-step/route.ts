import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { decrypt, encrypt } from "@/lib/server/crypto";
import { HttpError, assertSameOrigin } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { checkTotp, newTotpSecret, totpSetupQr } from "@/lib/server/totp";
import {
  PENDING_COOKIE,
  SESSION_COOKIE,
  SESSION_IDLE_SECONDS,
  TRUST_COOKIE,
  TRUST_SECONDS,
  cookieBase,
  signSession,
  signTrust,
  verifyPending,
  verifyTrust,
} from "@/lib/session-token";

async function pendingAdmin() {
  const jar = await cookies();
  const pending = await verifyPending(jar.get(PENDING_COOKIE)?.value);
  if (!pending) throw new HttpError(401, "Your sign-in took too long. Please enter your PIN again.");
  const { data: admin } = await db()
    .from("admins")
    .select("id, login_id, display_name, is_active, session_version, totp_secret, totp_enabled, totp_last_step, totp_version")
    .eq("id", pending.sub)
    .maybeSingle();
  if (!admin || !admin.is_active || admin.session_version !== pending.sv) {
    throw new HttpError(401, "Please sign in again.");
  }
  return { admin, pending, jar };
}

// Setting up the authenticator app for the first time: show the QR to scan.
export const GET = handle(async () => {
  const { admin, pending } = await pendingAdmin();
  if (pending.step !== "enroll" || admin.totp_enabled) return ok({ step: "verify" });

  // Reuse the secret if setup was started but not finished, so a reload doesn't break a scanned code.
  let secret = admin.totp_secret ? decrypt(admin.totp_secret) : null;
  if (!secret) {
    secret = newTotpSecret();
    await db().from("admins").update({ totp_secret: encrypt(secret) }).eq("id", admin.id);
  }
  const { svg } = await totpSetupQr(secret, admin.login_id);
  return ok({ step: "enroll", qrSvg: svg, secret, loginId: admin.login_id });
});

const schema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
  trustDevice: z.boolean().default(false),
});

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const { code, trustDevice } = await readJson(req, schema);
  const { admin, pending, jar } = await pendingAdmin();

  if (!(await rateLimit(`totp:${admin.id}`, 8, 10 * 60))) {
    throw new HttpError(429, "Too many tries. Please wait 10 minutes.");
  }
  if (!admin.totp_secret) throw new HttpError(400, "Please start the setup again.");

  const step = await checkTotp(decrypt(admin.totp_secret), code, admin.totp_last_step);
  if (step === null) {
    throw new HttpError(400, "That code is not correct. Check the time on your phone and try the newest code.", {
      code: "That code is not correct.",
    });
  }

  const label = `${admin.display_name} (${admin.login_id})`;
  await db()
    .from("admins")
    .update({ totp_last_step: step, totp_enabled: true, last_sign_in_at: new Date().toISOString() })
    .eq("id", admin.id);
  if (pending.step === "enroll" && !admin.totp_enabled) {
    await audit({ id: admin.id, label }, { action: "admin.two_step_enabled", targetType: "admin", targetId: admin.id, targetLabel: label });
  }
  await audit({ id: admin.id, label }, { action: "admin.signed_in" });

  const now = Math.floor(Date.now() / 1000);
  jar.set(SESSION_COOKIE, await signSession({ sub: admin.id, sv: admin.session_version, started: now }), {
    ...cookieBase,
    maxAge: SESSION_IDLE_SECONDS,
  });
  jar.delete(PENDING_COOKIE);

  if (trustDevice) {
    const existing = await verifyTrust(jar.get(TRUST_COOKIE)?.value);
    const devices = (existing?.devices ?? []).filter((d) => d.sub !== admin.id && d.until > now);
    devices.push({ sub: admin.id, tv: admin.totp_version, until: now + TRUST_SECONDS });
    jar.set(TRUST_COOKIE, await signTrust({ devices: devices.slice(-5) }), { ...cookieBase, maxAge: TRUST_SECONDS });
  }

  return ok({ next: "done" });
});
