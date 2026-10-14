import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { getSettings } from "@/lib/server/settings";

// One scan = one small request. No rate limit: the database's unique rule settles duplicates,
// even with several phones scanning the same session at once.
const schema = z
  .object({
    token: z.string().min(8).max(200).optional(),
    memberId: z.uuid().optional(),
    stage: z.enum(["in", "out"]),
    scannedAt: z.iso.datetime({ offset: true }).optional(), // set for scans saved offline
    offline: z.boolean().default(false),
  })
  .refine((v) => !!v.token !== !!v.memberId, "Send either a QR code or a delegate.");

const DAY = 24 * 60 * 60 * 1000;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]/scan">) => {
  const admin = await requireAdminApi(req, { min: "secretariat", transportation: true });
  const { id } = await ctx.params;
  const body = await readJson(req, schema);

  // Offline scans keep the time they were scanned, but only within the last 24 hours and not in the future.
  let scannedAt = new Date();
  if (body.offline && body.scannedAt) {
    const t = new Date(body.scannedAt);
    const now = Date.now();
    if (t.getTime() > now + 2 * 60 * 1000 || t.getTime() < now - DAY) {
      return ok({ result: "bad_time" });
    }
    scannedAt = new Date(Math.min(t.getTime(), now));
  }

  const settings = await getSettings();
  const { data, error } = await db().rpc("record_scan", {
    p_session_id: id,
    p_qr_token: body.token ?? null,
    p_member_id: body.memberId ?? null,
    p_stage: body.stage,
    p_scanned_at: scannedAt.toISOString(),
    p_was_offline: body.offline,
    p_admin_id: admin.id,
    p_admin_label: actorOf(admin).label,
    p_allow_out_without_in: settings.allow_timeout_without_timein === true,
  });
  if (error) {
    if (/invalid input syntax for type uuid/.test(error.message)) throw new HttpError(404, "This session no longer exists.");
    throw new Error(error.message);
  }
  return ok(data);
});
