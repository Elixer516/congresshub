import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { atLeast, type AdminRole } from "../config";
import { SESSION_COOKIE, verifySession } from "../session-token";
import { db } from "./supabase";
import { verifyPin } from "./crypto";
import { audit } from "./audit";
import { rateLimit } from "./rate-limit";
import { notifyRoles } from "./notify";

export type Admin = {
  id: string;
  login_id: string;
  display_name: string;
  role: AdminRole;
  committee_id: string | null;
  pin_must_change: boolean;
  session_version: number;
};

export const MAX_WRONG_PINS = 5;
export const LOCK_MINUTES = 15;

const ADMIN_COLUMNS = "id, login_id, display_name, role, committee_id, pin_must_change, session_version, is_active";

export function adminLabel(a: Pick<Admin, "display_name" | "login_id">) {
  return `${a.display_name} (${a.login_id})`;
}

export function actorOf(a: Admin) {
  return { id: a.id, label: adminLabel(a) };
}

// Admin rows are remembered for a few seconds so each page or scan doesn't need an extra
// trip to the database. Changes to an admin (role, access, PIN reset) clear their entry at once
// on this server, and reach any other server within ADMIN_CACHE_MS. Irreversible actions still
// re-read the account when they check the PIN.
const ADMIN_CACHE_MS = 10_000;
const adminCache = new Map<string, { at: number; row: (Admin & { is_active: boolean }) | null }>();

export function forgetAdmin(id: string) {
  adminCache.delete(id);
}

async function loadAdmin(id: string) {
  const hit = adminCache.get(id);
  if (hit && Date.now() - hit.at < ADMIN_CACHE_MS) return hit.row;
  const { data } = await db().from("admins").select(ADMIN_COLUMNS).eq("id", id).maybeSingle();
  const row = (data as (Admin & { is_active: boolean }) | null) ?? null;
  // Accounts in the middle of changing their PIN are always read fresh, so the new PIN
  // takes effect on the very next page (pages and routes may not share this memory).
  if (row && !row.pin_must_change) adminCache.set(id, { at: Date.now(), row });
  else adminCache.delete(id);
  if (adminCache.size > 200) adminCache.delete(adminCache.keys().next().value!);
  return row;
}

// The signed-in admin, or null. Checks the account is still active and not signed out elsewhere.
// Wrapped in cache() so the layout and the page share one lookup per request.
export const currentAdmin = cache(async (): Promise<Admin | null> => {
  const jar = await cookies();
  const claims = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const data = await loadAdmin(claims.sub);
  if (!data || !data.is_active || data.session_version !== claims.sv) return null;
  return data;
});

// For pages. Sends the visitor to sign-in (or to change their PIN) when needed.
// role: exactly this role (used for head-admin-only pages). min: this role or higher.
// transportation: let Transportation accounts in. They are kept out of every page and API that doesn't say so.
type Guard = { role?: AdminRole; min?: AdminRole; allowPinChange?: boolean; transportation?: boolean };
const transportBlocked = (a: Admin, opts: Guard) => a.role === "transportation" && !opts.transportation;

export async function requireAdmin(opts: Guard = {}): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) {
    const h = await headers();
    const path = h.get("x-pathname") ?? "/admin";
    redirect(`/admin/sign-in?next=${encodeURIComponent(path)}`);
  }
  if (admin.pin_must_change && !opts.allowPinChange) redirect("/admin/change-pin");
  if (transportBlocked(admin, opts)) redirect("/admin/attendance");
  if (admin.role === "transportation" && opts.transportation) return admin;
  if (opts.role && admin.role !== opts.role) redirect("/admin?denied=1");
  if (opts.min && !atLeast(admin.role, opts.min)) redirect("/admin?denied=1");
  return admin;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

// For API routes. Also blocks requests sent from other websites.
export async function requireAdminApi(req: Request, opts: Guard = {}) {
  if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
  const admin = await currentAdmin();
  if (!admin) throw new HttpError(401, "You are signed out. Please sign in again.");
  if (admin.pin_must_change && !opts.allowPinChange) throw new HttpError(403, "Please change your PIN first.");
  if (transportBlocked(admin, opts)) throw new HttpError(403, "Your account can't do this. Ask an admin.");
  if (admin.role === "transportation" && opts.transportation) return admin;
  if (opts.role && admin.role !== opts.role) throw new HttpError(403, "Only the head admin can do this.");
  if (opts.min && !atLeast(admin.role, opts.min)) throw new HttpError(403, "Your account can't do this. Ask an admin.");
  return admin;
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) throw new HttpError(403, "This request was blocked for your safety.");
  try {
    if (new URL(origin).host !== host) throw new Error();
  } catch {
    throw new HttpError(403, "This request was blocked for your safety.");
  }
}

// Asks for the admin's PIN again before an irreversible action.
// Wrong PINs count toward the same lockout as sign-in.
export async function confirmPin(admin: Admin, pin: unknown) {
  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    throw new HttpError(400, "Enter your 6-digit PIN to confirm.", { pin: "Enter your 6-digit PIN." });
  }
  if (!(await rateLimit(`confirm:${admin.id}`, 40, 15 * 60))) {
    throw new HttpError(429, "Too many tries. Please wait a few minutes.");
  }
  const { data } = await db()
    .from("admins")
    .select("pin_hash, failed_attempts, locked_until")
    .eq("id", admin.id)
    .single();
  if (!data) throw new HttpError(401, "You are signed out. Please sign in again.");
  if (data.locked_until && new Date(data.locked_until) > new Date()) {
    throw new HttpError(423, "Your account is locked for a few minutes because of wrong PINs.");
  }
  if (await verifyPin(pin, data.pin_hash)) {
    if (data.failed_attempts > 0) await db().from("admins").update({ failed_attempts: 0 }).eq("id", admin.id);
    return;
  }
  await recordWrongPin(admin.id, adminLabel(admin), data.failed_attempts);
  throw new HttpError(400, "That PIN is not correct.", { pin: "That PIN is not correct." });
}

export async function recordWrongPin(adminId: string, label: string, previousFailures: number) {
  const failures = previousFailures + 1;
  if (failures >= MAX_WRONG_PINS) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    await db().from("admins").update({ failed_attempts: 0, locked_until: until }).eq("id", adminId);
    await audit({ id: null, label: "System" }, {
      action: "admin.locked",
      targetType: "admin",
      targetId: adminId,
      targetLabel: label,
      after: { locked_until: until },
    });
    await notifyRoles(["head_admin"], {
      kind: "security.locked",
      title: `Account locked: ${label}`,
      body: `${MAX_WRONG_PINS} wrong PINs in a row. It unlocks by itself in ${LOCK_MINUTES} minutes. If this wasn't them, reset their PIN.`,
      link: "/admin/settings",
    });
  } else {
    await db().from("admins").update({ failed_attempts: failures }).eq("id", adminId);
  }
}
