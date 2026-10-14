import "server-only";
import { notifyRoles } from "./notify";
import { atLeast, TRIP_STATUS, type TripStatus } from "../config";
import type { Admin } from "./auth";

// Transportation, Admins and Head admins post trips and updates; the Secretariat watches.
export const canPostTrips = (a: Admin) => a.role === "transportation" || atLeast(a.role, "admin");

// Tells the Secretariat, Admins and Head admins (except the person who posted it).
export async function notifyTripUpdate(
  trip: { id: string; name: string },
  u: { status: TripStatus; location: string | null; note: string | null; passengers: number | null },
  by: { id: string; name: string },
) {
  const s = TRIP_STATUS[u.status];
  const body = [u.location ? `📍 ${u.location}` : null, u.passengers !== null ? `${u.passengers} on board` : null, u.note, `— ${by.name}`]
    .filter(Boolean)
    .join(" · ");
  await notifyRoles(
    ["head_admin", "admin", "secretariat"],
    { kind: `trip.${u.status}`, title: `${s.icon} ${trip.name}: ${s.label}`, body, link: `/admin/transport#t-${trip.id}` },
    [by.id],
  );
}
