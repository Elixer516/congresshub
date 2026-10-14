import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { REGIONS, regionOf } from "@/lib/config";
import { PageTitle } from "@/components/ui";
import BackLink from "@/components/back-link";
import BulkDownload, { type RegionGroup } from "./bulk-download";

export const metadata: Metadata = { title: "Download IDs" };

// Bulk download of delegate ID cards: one zip of PNGs per region (built in the browser, card by card).
export default async function IdCardsPage() {
  await requireAdmin({ min: "secretariat" });
  const { data } = await db().from("members").select("id, member_no, first_name, last_name, diocese").eq("status", "active").order("member_no").limit(5000);
  const groups: RegionGroup[] = REGIONS.map((r) => ({ key: r.key, color: r.color, colorName: r.colorName, people: [] }));
  const other: RegionGroup = { key: "OTHER", color: "#6b7280", colorName: "No region", people: [] };
  for (const m of data ?? []) {
    const g = groups.find((x) => x.key === regionOf(m.diocese)?.key) ?? other;
    g.people.push({ id: m.id, no: m.member_no, name: `${m.first_name} ${m.last_name}` });
  }
  if (other.people.length) groups.push(other);
  return (
    <>
      <BackLink href="/admin/members" label="Back to Delegates" />
      <PageTitle title="Download IDs" subtitle="Every active delegate's ID card as a PNG, zipped per region. Keep this page open while it downloads." />
      <BulkDownload groups={groups} />
    </>
  );
}
