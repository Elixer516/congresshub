import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { canPostTrips } from "@/lib/server/trips";
import { tripSchema } from "@/lib/trip-forms";

// Add a trip (Transportation, Admin, Head admin).
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "secretariat", transportation: true });
  if (!canPostTrips(admin)) throw new HttpError(403, "Only Transportation and admins can add trips.");
  const v = await readJson(req, tripSchema);
  const actor = actorOf(admin);
  const { data, error } = await db()
    .from("trips")
    .insert({ ...v, created_by: admin.id, updated_by_label: actor.label })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await db().from("trip_updates").insert({ trip_id: data.id, status: "preparing", note: "Trip added", passengers: v.passengers, actor_id: admin.id, actor_label: actor.label });
  await audit(actor, { action: "trip.created", targetType: "trip", targetId: data.id, targetLabel: v.name });
  return ok({ id: data.id });
});
