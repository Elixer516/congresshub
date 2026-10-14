import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, parse, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { committeeSchema } from "@/lib/committee-forms";

const schema = z.object({ id: z.uuid().optional(), details: z.unknown() });

// Create a committee, or change its name / usual duty hours.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id, details } = await readJson(req, schema);
  const v = parse(committeeSchema, details);
  const actor = actorOf(admin);

  const { data: same } = await db().from("committees").select("id").ilike("name", v.name).maybeSingle();
  if (same && same.id !== id) throw new HttpError(400, "There's already a committee with that name.", { name: "There's already a committee with that name." });

  if (!id) {
    const { data, error } = await db().from("committees").insert(v).select("id").single();
    if (error) throw new Error(error.message);
    await audit(actor, { action: "committee.created", targetType: "committee", targetId: data.id, targetLabel: v.name, after: v });
    return ok({ id: data.id });
  }
  const { data: c } = await db().from("committees").select("*").eq("id", id).maybeSingle();
  if (!c) throw new HttpError(404, "This committee no longer exists.");
  const changes = diff(c, v);
  if (changes.changed.length) {
    await db().from("committees").update(changes.after).eq("id", id);
    await audit(actor, { action: "committee.edited", targetType: "committee", targetId: id, targetLabel: v.name, before: changes.before, after: changes.after });
  }
  return ok({ id });
});
