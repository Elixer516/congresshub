import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { canPostTrips, notifyTripUpdate } from "@/lib/server/trips";
import { tripSchema, tripUpdateSchema } from "@/lib/trip-forms";
import { TRIP_STATUS } from "@/lib/config";

const schema = z.discriminatedUnion("action", [
  tripUpdateSchema.extend({ action: z.literal("update") }),
  tripSchema.extend({ action: z.literal("edit") }),
]);

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Trip not found.");
  const { data } = await db().from("trips").select("*").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "This trip no longer exists.");
  return data;
}

// Post where the trip is now (notifies the Secretariat, Admins and Head admins), or edit its details.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/trips/[id]">) => {
  const admin = await requireAdminApi(req, { min: "secretariat", transportation: true });
  if (!canPostTrips(admin)) throw new HttpError(403, "Only Transportation and admins can post trip updates.");
  const { id } = await ctx.params;
  const trip = await load(id);
  const body = await readJson(req, schema);
  const actor = actorOf(admin);
  const now = new Date().toISOString();

  if (body.action === "edit") {
    const { action: _a, ...v } = body;
    void _a;
    const { error } = await db().from("trips").update({ ...v, updated_at: now, updated_by_label: actor.label }).eq("id", id);
    if (error) throw new Error(error.message);
    await audit(actor, { action: "trip.edited", targetType: "trip", targetId: id, targetLabel: v.name, ...diff(trip, v) });
    return ok();
  }

  const u = body;
  const passengers = u.passengers ?? trip.passengers;
  const { error } = await db()
    .from("trips")
    .update({
      status: u.status,
      last_location: u.location,
      last_lat: u.lat,
      last_lng: u.lng,
      last_note: u.note,
      passengers,
      updated_at: now,
      updated_by_label: actor.label,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await db().from("trip_updates").insert({
    trip_id: id,
    status: u.status,
    location: u.location,
    lat: u.lat,
    lng: u.lng,
    note: u.note,
    passengers: u.passengers,
    actor_id: admin.id,
    actor_label: actor.label,
  });
  await audit(actor, { action: "trip.updated", targetType: "trip", targetId: id, targetLabel: trip.name, after: { status: TRIP_STATUS[u.status].label, location: u.location } });
  await notifyTripUpdate(trip, { status: u.status, location: u.location, note: u.note, passengers: u.passengers }, { id: admin.id, name: admin.display_name });
  return ok();
});

// Remove a trip and its updates (Admin, Head admin).
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/trips/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const trip = await load(id);
  await db().from("trips").delete().eq("id", id);
  await audit(actorOf(admin), { action: "trip.deleted", targetType: "trip", targetId: id, targetLabel: trip.name });
  return ok();
});
