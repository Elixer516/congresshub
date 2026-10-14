import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, parse, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { deleteStored } from "@/lib/server/storage";
import { readableBadge } from "@/lib/server/qr";
import { newQrToken } from "@/lib/server/crypto";
import { staffSchema } from "@/lib/committee-forms";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), details: z.unknown() }),
  z.object({ action: z.literal("status"), status: z.enum(["active", "inactive"]) }),
  z.object({ action: z.literal("replace_qr"), pin: z.string() }),
]);

async function find(id: string) {
  const { data } = await db().from("committee_staff").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "This person is no longer on the list.");
  return data;
}

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const s = await find(id);
  const label = `${s.full_name} (${s.staff_no})`;

  if (body.action === "edit") {
    const v = parse(staffSchema, body.details);
    const changes = diff(s, v);
    if (!changes.changed.length) return ok({ changed: 0 });
    await db().from("committee_staff").update(changes.after).eq("id", id);
    await audit(actorOf(admin), { action: "staff.edited", targetType: "staff", targetId: id, targetLabel: label, before: changes.before, after: changes.after });
    return ok({ changed: changes.changed.length });
  }
  if (body.action === "status") {
    if (s.status === body.status) return ok();
    await db().from("committee_staff").update({ status: body.status }).eq("id", id);
    await audit(actorOf(admin), { action: "staff.edited", targetType: "staff", targetId: id, targetLabel: label, before: { status: s.status }, after: { status: body.status } });
    return ok();
  }
  await confirmPin(admin, body.pin);
  const { token, mask } = readableBadge(newQrToken);
  await db().from("committee_staff").update({ qr_token: token, qr_mask: mask }).eq("id", id);
  await audit(actorOf(admin), { action: "staff.qr_replaced", targetType: "staff", targetId: id, targetLabel: label });
  return ok();
});

// Remove from the Working Committee for good (PIN + reason). Their duty records go too.
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ pin: z.string(), reason: z.string().trim().min(3, "Write why they're being removed.").max(300) }));
  await confirmPin(admin, body.pin);
  const s = await find(id);
  const { data: files } = await db().from("files").select("backend, storage_key").eq("staff_id", id);
  await db().from("committee_staff").delete().eq("id", id);
  await deleteStored((files ?? []).map((f) => ({ backend: f.backend, key: f.storage_key })));
  await audit(actorOf(admin), {
    action: "staff.deleted",
    targetType: "staff",
    targetId: id,
    targetLabel: `${s.full_name} (${s.staff_no})`,
    before: { committee_id: s.committee_id },
    reason: body.reason,
  });
  return ok();
});
