import "server-only";
import { db } from "./supabase";

export type Actor = { id: string | null; label: string };

export type AuditEntry = {
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
};

export async function audit(actor: Actor, e: AuditEntry) {
  const { error } = await db().from("audit_log").insert({
    actor_id: actor.id,
    actor_label: actor.label,
    action: e.action,
    target_type: e.targetType ?? null,
    target_id: e.targetId ?? null,
    target_label: e.targetLabel ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    reason: e.reason ?? null,
  });
  if (error) console.error("audit log write failed", e.action, error.message);
}

// Only the fields that actually changed, as { before, after }.
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    const oldV = before[k] ?? null;
    const newV = after[k] ?? null;
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      b[k] = oldV;
      a[k] = newV;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}
