import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { dutyDateOf } from "@/lib/server/committee";

// Working Committee duty: one time-in and one time-out per person per day (Philippine date).
const schema = z
  .object({
    token: z.string().min(8).max(200).optional(),
    memberId: z.uuid().optional(), // manual entry (staff id)
    stage: z.enum(["in", "out"]),
    scannedAt: z.iso.datetime({ offset: true }).optional(),
    offline: z.boolean().default(false),
  })
  .refine((v) => !!v.token !== !!v.memberId, "Send either a QR code or a person.");

const DAY = 24 * 60 * 60 * 1000;

export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "secretariat" });
  const body = await readJson(req, schema);

  let at = new Date();
  if (body.offline && body.scannedAt) {
    const t = new Date(body.scannedAt);
    if (t.getTime() > Date.now() + 2 * 60 * 1000 || t.getTime() < Date.now() - DAY) return ok({ result: "bad_time" });
    at = new Date(Math.min(t.getTime(), Date.now()));
  }

  const { data, error } = await db().rpc("record_duty", {
    p_qr_token: body.token ?? null,
    p_staff_id: body.memberId ?? null,
    p_stage: body.stage,
    p_date: dutyDateOf(at),
    p_at: at.toISOString(),
    p_method: body.memberId ? "manual" : "qr",
    p_admin_id: admin.id,
    p_admin_label: actorOf(admin).label,
  });
  if (error) throw new HttpError(500, error.message);
  return ok(data);
});
