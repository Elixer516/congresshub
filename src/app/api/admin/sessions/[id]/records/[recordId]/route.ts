import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

// Remove a wrong scan (PIN + reason, logged).
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]/records/[recordId]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id, recordId } = await ctx.params;
  const body = await readJson(req, z.object({ pin: z.string(), reason: z.string().trim().min(3, "Write why this scan is wrong.").max(300) }));
  await confirmPin(admin, body.pin);

  const { data: r } = await db()
    .from("attendance_records")
    .select("id, stage, scanned_at, method, scanned_by_label, members(member_no, first_name, last_name), attendance_sessions(title)")
    .eq("id", recordId)
    .eq("session_id", id)
    .maybeSingle();
  if (!r) throw new HttpError(404, "That scan was already removed.");

  await db().from("attendance_records").delete().eq("id", recordId);
  const m = r.members as unknown as { member_no: string; first_name: string; last_name: string };
  const s = r.attendance_sessions as unknown as { title: string };
  await audit(actorOf(admin), {
    action: "scan.removed",
    targetType: "session",
    targetId: id,
    targetLabel: `${s.title} — ${m.last_name}, ${m.first_name} (${m.member_no})`,
    before: { stage: r.stage, scanned_at: r.scanned_at, method: r.method, scanned_by: r.scanned_by_label },
    reason: body.reason,
  });
  return ok();
});
