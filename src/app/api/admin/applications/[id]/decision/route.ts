import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { newQrToken } from "@/lib/server/crypto";
import { readableBadge } from "@/lib/server/qr";
import { ID_PREFIX } from "@/lib/config";
import { localYear } from "@/lib/time";

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: z.string().trim().max(500).optional() }),
  z.object({
    decision: z.literal("incomplete"),
    note: z.string().trim().min(3, "Write what's missing so the applicant knows what to fix.").max(500),
  }),
  z.object({
    decision: z.literal("reject"),
    note: z.string().trim().min(3, "Write the reason. The applicant will see it.").max(500),
    pin: z.string(),
  }),
]);

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/applications/[id]/decision">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const actor = actorOf(admin);

  if (body.decision === "approve") {
    const { token, mask } = readableBadge(newQrToken);
    const { data, error } = await db().rpc("approve_application", {
      p_application_id: id,
      p_admin_id: admin.id,
      p_admin_label: actor.label,
      p_prefix: ID_PREFIX,
      p_year: localYear(),
      p_qr_token: token,
      p_qr_mask: mask,
      p_note: body.note || null,
    });
    if (error) throw new Error(error.message);
    if (data?.error === "not_found") throw new HttpError(404, "This application no longer exists.");
    if (data?.error === "already_decided") throw new HttpError(409, "This application was already decided by someone else. Refresh the page.");
    return ok({ memberId: data.member_id, memberNo: data.member_no });
  }

  if (body.decision === "reject") await confirmPin(admin, body.pin);

  const { data: app } = await db()
    .from("applications")
    .select("id, status, reference_no, last_name, first_name, admin_note")
    .eq("id", id)
    .maybeSingle();
  if (!app) throw new HttpError(404, "This application no longer exists.");
  if (!["pending", "incomplete"].includes(app.status)) {
    throw new HttpError(409, "This application was already decided. Refresh the page.");
  }

  const status = body.decision === "reject" ? "rejected" : "incomplete";
  const { data: updated, error } = await db()
    .from("applications")
    .update({ status, admin_note: body.note, decided_by: admin.id, decided_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending", "incomplete"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new HttpError(409, "This application was already decided. Refresh the page.");

  await audit(actor, {
    action: body.decision === "reject" ? "application.rejected" : "application.incomplete",
    targetType: "application",
    targetId: app.id,
    targetLabel: `${app.last_name}, ${app.first_name} (${app.reference_no})`,
    before: { status: app.status, admin_note: app.admin_note },
    after: { status, admin_note: body.note },
    reason: body.decision === "reject" ? body.note : null,
  });
  return ok();
});
