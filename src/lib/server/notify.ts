import "server-only";
import { db } from "./supabase";
import type { AdminRole } from "../config";

export type Notice = { kind: string; title: string; body?: string | null; link?: string | null; requestId?: string | null };

// Sends a notice to specific admins. Never throws: a failed notice must not break the action itself.
export async function notifyAdmins(adminIds: (string | null | undefined)[], n: Notice) {
  const ids = [...new Set(adminIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const { error } = await db()
    .from("notifications")
    .insert(ids.map((admin_id) => ({ admin_id, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null, request_id: n.requestId ?? null })));
  if (error) console.error("notification failed", n.kind, error.message);
}

// Sends a notice to everyone with one of these roles (active accounts only), optionally skipping some people.
export async function notifyRoles(roles: AdminRole[], n: Notice, except: (string | null | undefined)[] = []) {
  const { data } = await db().from("admins").select("id").in("role", roles).eq("is_active", true);
  await notifyAdmins((data ?? []).map((a) => a.id).filter((id) => !except.includes(id)), n);
}
