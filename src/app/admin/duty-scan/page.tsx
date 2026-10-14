import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { formatPlainDate, todayLocal } from "@/lib/time";
import IdleSignOut from "../(portal)/idle-sign-out";
import Scanner, { DUTY } from "../scan/[id]/scanner";

export const metadata: Metadata = { title: "Duty scanner" };

// Full-screen scanner for Working Committee duty time in / time out (today, Philippine time).
export default async function DutyScanPage() {
  const admin = await requireAdmin({ min: "secretariat" });
  return (
    <>
      <IdleSignOut />
      <Scanner sessionId={DUTY} title={`Staff duty · ${formatPlainDate(todayLocal())}`} status="open" adminName={admin.display_name} />
    </>
  );
}
