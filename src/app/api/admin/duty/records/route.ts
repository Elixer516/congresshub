import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { atLocal } from "@/lib/server/committee";

const time = z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("").transform(() => undefined));

const schema = z.object({
  staff_id: z.uuid(),
  duty_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_in: time,
  time_out: time,
  reason: z.string().trim().min(3, "Write why the time is being corrected (e.g. forgot to scan out).").max(300),
});

// Head admin / Admin corrects a duty record (e.g. a forgotten time-out). Always needs a reason; logged.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const v = await readJson(req, schema);
  const tin = v.time_in ? atLocal(v.duty_date, v.time_in).toISOString() : null;
  // A time-out earlier than the time-in means it went past midnight.
  let tout = v.time_out ? atLocal(v.duty_date, v.time_out) : null;
  if (tin && tout && tout.getTime() <= new Date(tin).getTime()) tout = new Date(tout.getTime() + 86400000);
  if (!tin && tout) throw new HttpError(400, "Enter a time in first.", { time_in: "Enter a time in." });

  const { data: s } = await db().from("committee_staff").select("full_name, staff_no").eq("id", v.staff_id).maybeSingle();
  if (!s) throw new HttpError(404, "This person is no longer on the list.");
  const { data: before } = await db().from("duty_records").select("time_in, time_out").eq("staff_id", v.staff_id).eq("duty_date", v.duty_date).maybeSingle();
  const actor = actorOf(admin);

  const { error } = await db()
    .from("duty_records")
    .upsert(
      {
        staff_id: v.staff_id,
        duty_date: v.duty_date,
        time_in: tin,
        time_out: tout?.toISOString() ?? null,
        in_by: admin.id,
        in_by_label: actor.label,
        in_method: tin ? "corrected" : null,
        out_by: tout ? admin.id : null,
        out_by_label: tout ? actor.label : null,
        out_method: tout ? "corrected" : null,
        note: v.reason,
      },
      { onConflict: "staff_id,duty_date" },
    );
  if (error) throw new Error(error.message);
  await audit(actor, {
    action: "duty.corrected",
    targetType: "staff",
    targetId: v.staff_id,
    targetLabel: `${s.full_name} (${s.staff_no}) — ${v.duty_date}`,
    before: { time_in: before?.time_in ?? null, time_out: before?.time_out ?? null },
    after: { time_in: tin, time_out: tout?.toISOString() ?? null },
    reason: v.reason,
  });
  return ok();
});
