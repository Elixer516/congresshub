import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { dutyDaySchema } from "@/lib/committee-forms";

// Set the expected hours for a duty day (meeting, preparation, event day), used for late / no-show.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const v = await readJson(req, dutyDaySchema);
  const { error } = await db().from("duty_days").upsert(v, { onConflict: "duty_date" });
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), { action: "duty.day_set", targetType: "duty_day", targetId: v.duty_date, targetLabel: `${v.label} — ${v.duty_date}`, after: v });
  return ok();
});

export const DELETE = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { duty_date } = await readJson(req, z.object({ duty_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  await db().from("duty_days").delete().eq("duty_date", duty_date);
  await audit(actorOf(admin), { action: "duty.day_removed", targetType: "duty_day", targetId: duty_date, targetLabel: duty_date });
  return ok();
});
