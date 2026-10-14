import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { autoOpenSessions, shownStatus } from "@/lib/server/settings";
import IdleSignOut from "../../(portal)/idle-sign-out";
import Scanner from "./scanner";

export const metadata: Metadata = { title: "Scanner" };

// Full-screen scanner (no navigation bar), for phones.
export default async function ScanPage({ params }: PageProps<"/admin/scan/[id]">) {
  const admin = await requireAdmin({ min: "secretariat", transportation: true });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: s }] = await Promise.all([
    db().from("attendance_sessions").select("id, title, status, starts_at").eq("id", id).maybeSingle(),
    autoOpenSessions(),
  ]);
  if (!s) notFound();
  return (
    <>
      <IdleSignOut />
      <Scanner sessionId={s.id} title={s.title} status={shownStatus(s)} adminName={admin.display_name} canRequest={admin.role === "secretariat"} />
    </>
  );
}
