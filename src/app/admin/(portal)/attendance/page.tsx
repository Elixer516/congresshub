import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { autoOpenSessions, openNowFilter, shownStatus } from "@/lib/server/settings";
import { SESSION_TYPES, atLeast, type SessionType } from "@/lib/config";
import { formatDate, formatTime } from "@/lib/time";
import { Badge, PageTitle } from "@/components/ui";
import { Empty } from "@/components/list-controls";
import NewSession from "./new-session";

export const metadata: Metadata = { title: "Attendance" };

type S = { id: string; title: string; type: string; starts_at: string; ends_at: string | null; venue: string | null; status: string };

const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", open: "Open", closed: "Closed" };

function SessionList({ sessions, empty, scanOnly = false }: { sessions: S[]; empty: string; scanOnly?: boolean }) {
  if (!sessions.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-4 py-3">
          <Link href={scanOnly ? `/admin/scan/${s.id}` : `/admin/attendance/${s.id}`} className="min-w-0 flex-1">
            <p className="truncate font-semibold">{s.title}</p>
            <p className="truncate text-sm text-muted">
              {SESSION_TYPES[s.type as SessionType]} · {formatDate(s.starts_at)}, {formatTime(s.starts_at)}{s.ends_at ? `–${formatTime(s.ends_at)}` : ""}
              {s.venue ? ` · ${s.venue}` : ""}
            </p>
          </Link>
          <Badge status={shownStatus(s)}>{STATUS_LABEL[shownStatus(s)]}</Badge>
          {shownStatus(s) === "open" ? (
            <Link href={`/admin/scan/${s.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg">
              Scan
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default async function AttendancePage() {
  const admin = await requireAdmin({ min: "secretariat", transportation: true });
  const now = new Date().toISOString();
  const [{ data: open }, { data: upcoming }, { data: past }] = await Promise.all([
    db().from("attendance_sessions").select("*").or(openNowFilter()).order("starts_at", { ascending: false }),
    db().from("attendance_sessions").select("*").eq("status", "scheduled").gt("starts_at", now).order("starts_at").limit(20),
    db().from("attendance_sessions").select("*").eq("status", "closed").order("starts_at", { ascending: false }).limit(30),
    autoOpenSessions(),
  ]);

  if (admin.role === "transportation") {
    return (
      <>
        <PageTitle title="Attendance" subtitle="Scan QR badges for time in and time out. Sessions appear here when an admin opens them." />
        <h2 className="mb-2 mt-2 font-bold text-primary">Open now</h2>
        <SessionList sessions={open ?? []} empty="No session is open right now. You'll get a notification when one opens." scanOnly />
      </>
    );
  }

  return (
    <>
      <PageTitle title="Attendance" subtitle="Create sessions and scan QR badges for time in and time out." actions={atLeast(admin.role, "admin") ? <NewSession /> : undefined} />
      <h2 className="mb-2 mt-2 font-bold text-primary">Open now</h2>
      <SessionList sessions={open ?? []} empty="No session is open. Create one, or open a scheduled one." />
      <h2 className="mb-2 mt-6 font-bold text-primary">Coming up</h2>
      <SessionList sessions={upcoming ?? []} empty="Nothing scheduled." />
      <h2 className="mb-2 mt-6 font-bold text-primary">Past sessions</h2>
      <SessionList sessions={past ?? []} empty="No past sessions yet." />
    </>
  );
}
