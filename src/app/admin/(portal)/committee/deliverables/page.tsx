import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { can, committeeScope, serverNow } from "@/lib/server/committee";
import { utcToLocalParts } from "@/lib/time";
import DeliverablesBoard, { type DeliverableItem } from "./deliverables-board";

export const metadata: Metadata = { title: "Deliverables" };

export default async function DeliverablesPage() {
  const admin = await requireAdmin();
  const scope = committeeScope(admin);
  const [{ data: dels }, { data: committees }, { data: staff }, { data: updates }] = await Promise.all([
    db().from("deliverables").select("*, committees(name), committee_staff(full_name, committee_id)").order("sort_order"),
    db().from("committees").select("id, name").order("name"),
    db().from("committee_staff").select("id, full_name, committee_id").eq("status", "active").order("full_name"),
    db().from("deliverable_updates").select("deliverable_id, actor_label, summary, created_at").order("created_at", { ascending: false }).limit(300),
  ]);

  const items: DeliverableItem[] = (dels ?? [])
    .map((d) => {
      const person = d.committee_staff as unknown as { full_name: string; committee_id: string | null } | null;
      const committeeName = (d.committees as unknown as { name: string } | null)?.name ?? null;
      const ownerCommittee = d.committee_id ?? person?.committee_id ?? null;
      const local = d.deadline ? utcToLocalParts(d.deadline) : null;
      return {
        id: d.id,
        name: d.name,
        status: d.status,
        deadline: d.deadline,
        deadlineLocal: local ? `${local.date}T${local.time}` : "",
        link: d.link,
        notes: d.notes,
        committeeId: d.committee_id,
        committeeName,
        staffId: d.staff_id,
        staffName: person?.full_name ?? null,
        updatedBy: d.updated_by_label?.replace(/ \(.*\)$/, "") ?? null,
        updatedAt: d.updated_at,
        ownerCommittee,
        editable: can.manage(admin) || (!!scope && ownerCommittee === scope),
        history: (updates ?? [])
          .filter((u) => u.deliverable_id === d.id)
          .slice(0, 6)
          .map((u) => ({ by: u.actor_label.replace(/ \(.*\)$/, ""), summary: u.summary, at: u.created_at })),
      };
    })
    .filter((d) => !scope || d.ownerCommittee === scope);

  return <DeliverablesBoard now={serverNow()} items={items} canManage={can.manage(admin)} committees={committees ?? []} staff={staff ?? []} />;
}
