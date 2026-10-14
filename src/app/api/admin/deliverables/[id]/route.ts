import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, parse, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { can, canEditDeliverable, requireCommitteeAccess } from "@/lib/server/committee";
import { deliverableSchema } from "@/lib/committee-forms";
import { DELIVERABLE_STATUS } from "@/lib/config";
import { localToUtc } from "@/lib/time";
import { notifyDeliverableAssigned, notifyDeliverableDone } from "@/lib/server/deliverables";

const schema = z.discriminatedUnion("action", [
  // Quick status change (committee heads can do this for their own items).
  z.object({ action: z.literal("status"), status: z.enum(["not_started", "ongoing", "done"]) }),
  // Committee heads may also update the link and notes of their own items.
  z.object({ action: z.literal("update"), link: z.string().optional(), notes: z.string().optional() }),
  // Full edit (Head admin / Admin).
  z.object({ action: z.literal("edit"), details: z.unknown() }),
]);

async function find(id: string) {
  const { data } = await db().from("deliverables").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "This deliverable no longer exists.");
  return data;
}

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/deliverables/[id]">) => {
  const admin = await requireAdminApi(req);
  requireCommitteeAccess(admin);
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const d = await find(id);
  if (!(await canEditDeliverable(admin, d))) throw new HttpError(403, "You can only update your own committee's deliverables.");
  const actor = actorOf(admin);
  const log = (summary: string) => db().from("deliverable_updates").insert({ deliverable_id: id, actor_id: admin.id, actor_label: actor.label, summary });

  if (body.action === "status") {
    if (d.status === body.status) return ok();
    await db().from("deliverables").update({ status: body.status, updated_by_label: actor.label }).eq("id", id);
    await log(`Status: ${DELIVERABLE_STATUS[d.status as keyof typeof DELIVERABLE_STATUS]} → ${DELIVERABLE_STATUS[body.status]}`);
    await audit(actor, { action: "deliverable.status", targetType: "deliverable", targetId: id, targetLabel: d.name, before: { status: DELIVERABLE_STATUS[d.status as keyof typeof DELIVERABLE_STATUS] }, after: { status: DELIVERABLE_STATUS[body.status] } });
    if (body.status === "done") await notifyDeliverableDone(d, admin.display_name, admin.id);
    return ok();
  }

  if (body.action === "update") {
    const v = parse(deliverableSchema.pick({ link: true, notes: true }), { link: body.link ?? d.link ?? "", notes: body.notes ?? d.notes ?? "" });
    const parts: string[] = [];
    if ((v.link ?? null) !== (d.link ?? null)) parts.push(v.link ? "Link updated" : "Link removed");
    if ((v.notes ?? null) !== (d.notes ?? null)) parts.push("Notes updated");
    if (!parts.length) return ok();
    await db().from("deliverables").update({ ...v, updated_by_label: actor.label }).eq("id", id);
    await log(parts.join(" · "));
    return ok();
  }

  if (!can.manage(admin)) throw new HttpError(403, "Only admins can change the name, deadline or who's in charge.");
  const v = parse(deliverableSchema, body.details);
  const deadline = v.deadline ? localToUtc(v.deadline.slice(0, 10), v.deadline.slice(11, 16)).toISOString() : null;
  await db().from("deliverables").update({ ...v, deadline, updated_by_label: actor.label }).eq("id", id);
  await log("Details edited");
  await audit(actor, { action: "deliverable.edited", targetType: "deliverable", targetId: id, targetLabel: v.name });
  if (v.committee_id !== d.committee_id || v.staff_id !== d.staff_id) await notifyDeliverableAssigned({ id, name: v.name, committee_id: v.committee_id, staff_id: v.staff_id }, admin.id);
  if (v.status === "done" && d.status !== "done") await notifyDeliverableDone({ id, name: v.name }, admin.display_name, admin.id);
  return ok();
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/deliverables/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const { pin } = await readJson(req, z.object({ pin: z.string() }));
  await confirmPin(admin, pin);
  const d = await find(id);
  await db().from("deliverables").delete().eq("id", id);
  await audit(actorOf(admin), { action: "deliverable.deleted", targetType: "deliverable", targetId: id, targetLabel: d.name });
  return ok();
});
