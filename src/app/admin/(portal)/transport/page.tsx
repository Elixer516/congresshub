import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { canPostTrips } from "@/lib/server/trips";
import { atLeast } from "@/lib/config";
import { PageTitle } from "@/components/ui";
import TripBoard, { type TripItem } from "./trip-board";

export const metadata: Metadata = { title: "Transport" };

export default async function TransportPage() {
  const admin = await requireAdmin({ min: "secretariat", transportation: true });
  const [{ data: trips }, { data: updates }] = await Promise.all([
    db().from("trips").select("*").order("updated_at", { ascending: false }).limit(200),
    db().from("trip_updates").select("trip_id, status, location, lat, lng, note, passengers, actor_label, created_at").order("created_at", { ascending: false }).limit(1000),
  ]);

  const items: TripItem[] = (trips ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    origin: t.origin,
    destination: t.destination,
    driver: t.driver,
    passengers: t.passengers,
    status: t.status,
    location: t.last_location,
    lat: t.last_lat,
    lng: t.last_lng,
    note: t.last_note,
    updatedAt: t.updated_at,
    updatedBy: t.updated_by_label?.replace(/ \(.*\)$/, "") ?? null,
    history: (updates ?? [])
      .filter((u) => u.trip_id === t.id)
      .slice(0, 12)
      .map((u) => ({ status: u.status, location: u.location, lat: u.lat, lng: u.lng, note: u.note, passengers: u.passengers, by: u.actor_label.replace(/ \(.*\)$/, ""), at: u.created_at })),
  }));

  const canPost = canPostTrips(admin);
  return (
    <>
      <PageTitle
        title="Transport"
        subtitle={canPost ? "Post where each trip is. The Secretariat and admins are notified right away." : "Where each trip is, as posted by the Transportation team."}
      />
      <TripBoard items={items} canPost={canPost} canRemove={atLeast(admin.role, "admin")} />
    </>
  );
}
