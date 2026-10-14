import { db } from "@/lib/server/supabase";
import { actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { deliverableSchema } from "@/lib/committee-forms";
import { localToUtc } from "@/lib/time";
import { notifyDeliverableAssigned } from "@/lib/server/deliverables";

// Add a deliverable (Head admin / Admin).
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const v = await readJson(req, deliverableSchema);
  const actor = actorOf(admin);
  const deadline = v.deadline ? localToUtc(v.deadline.slice(0, 10), v.deadline.slice(11, 16)).toISOString() : null;
  const { data: last } = await db().from("deliverables").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db()
    .from("deliverables")
    .insert({ ...v, deadline, sort_order: (last?.sort_order ?? 0) + 1, updated_by_label: actor.label })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db().from("deliverable_updates").insert({ deliverable_id: data.id, actor_id: admin.id, actor_label: actor.label, summary: "Added" });
  await audit(actor, { action: "deliverable.created", targetType: "deliverable", targetId: data.id, targetLabel: v.name });
  await notifyDeliverableAssigned({ id: data.id, name: v.name, committee_id: v.committee_id, staff_id: v.staff_id }, admin.id);
  return ok({ id: data.id });
});
