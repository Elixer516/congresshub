import "server-only";
import { db } from "./supabase";
import { notifyAdmins, notifyRoles } from "./notify";

// The committee heads who look after a deliverable (via its committee, or the committee of the person in charge).
export async function headsFor(d: { committee_id: string | null; staff_id: string | null }) {
  let committeeId = d.committee_id;
  if (!committeeId && d.staff_id) {
    const { data } = await db().from("committee_staff").select("committee_id").eq("id", d.staff_id).maybeSingle();
    committeeId = data?.committee_id ?? null;
  }
  if (!committeeId) return [];
  const { data } = await db().from("admins").select("id").eq("role", "committee_head").eq("committee_id", committeeId).eq("is_active", true);
  return (data ?? []).map((a) => a.id);
}

export async function notifyDeliverableAssigned(d: { id: string; name: string; committee_id: string | null; staff_id: string | null }, exceptId: string) {
  const heads = (await headsFor(d)).filter((id) => id !== exceptId);
  await notifyAdmins(heads, {
    kind: "deliverable.assigned",
    title: `New deliverable for your committee: ${d.name}`,
    body: "Open it to see the deadline and link.",
    link: `/admin/committee/deliverables#d-${d.id}`,
  });
}

export async function notifyDeliverableDone(d: { id: string; name: string }, byName: string, exceptId: string) {
  await notifyRoles(
    ["head_admin"],
    { kind: "deliverable.done", title: `Done: ${d.name}`, body: `Marked done by ${byName}.`, link: `/admin/committee/deliverables#d-${d.id}` },
    [exceptId],
  );
}
