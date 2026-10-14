import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { autoOpenSessions, shownStatus } from "@/lib/server/settings";
import { SESSION_TYPES, atLeast, type SessionType } from "@/lib/config";
import { formatDate, formatTime, utcToLocalParts } from "@/lib/time";
import { Badge } from "@/components/ui";
import SessionControls from "./session-controls";
import RecordsTable, { type AttendanceRow } from "./records-table";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Session" };

const STATUS_LABEL: Record<string, string> = { scheduled: "Scheduled", open: "Open", closed: "Closed" };

export default async function SessionPage({ params }: PageProps<"/admin/attendance/[id]">) {
  const admin = await requireAdmin({ min: "secretariat" });
  const canManage = atLeast(admin.role, "admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: session }, { data: recs }, { data: req }] = await Promise.all([
    db().from("attendance_sessions").select("*").eq("id", id).maybeSingle(),
    db()
      .from("attendance_records")
      .select("id, member_id, stage, scanned_at, method, was_offline, scanned_by_label, members(member_no, first_name, last_name, parish)")
      .eq("session_id", id)
      .order("scanned_at"),
    db().from("session_requests").select("id, requested_by, requested_by_label, note").eq("session_id", id).eq("status", "pending").maybeSingle(),
    autoOpenSessions(),
  ]);
  if (!session) notFound();
  const s = { ...session, status: shownStatus(session) };

  const byMember = new Map<string, AttendanceRow>();
  for (const r of recs ?? []) {
    const m = r.members as unknown as { member_no: string; first_name: string; last_name: string; parish: string };
    const row: AttendanceRow = byMember.get(r.member_id) ?? { memberId: r.member_id, memberNo: m.member_no, name: `${m.last_name}, ${m.first_name}`, parish: m.parish };
    row[r.stage as "in" | "out"] = { id: r.id, time: r.scanned_at, by: r.scanned_by_label, manual: r.method === "manual", offline: r.was_offline };
    byMember.set(r.member_id, row);
  }
  const rows = [...byMember.values()].sort((a, b) => a.name.localeCompare(b.name));
  const inCount = rows.filter((r) => r.in).length;
  const outCount = rows.filter((r) => r.out).length;
  const start = utcToLocalParts(s.starts_at);
  const end = s.ends_at ? utcToLocalParts(s.ends_at) : null;

  return (
    <>
      <BackLink href="/admin/attendance" label="Back to Attendance" />
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{s.title}</h1>
          <p className="mt-1 text-sm text-muted">
            {SESSION_TYPES[s.type as SessionType]} · {formatDate(s.starts_at)}, {formatTime(s.starts_at)}
            {s.ends_at && end ? ` – ${start.date !== end.date ? `${formatDate(s.ends_at)}, ` : ""}${formatTime(s.ends_at)}` : " · no end time"}
            {s.venue ? ` · ${s.venue}` : ""}
          </p>
        </div>
        <Badge status={s.status}>{STATUS_LABEL[s.status]}</Badge>
      </div>

      <SessionControls
        id={s.id}
        status={s.status}
        canManage={canManage}
        pending={req ? { id: req.id, by: req.requested_by_label.replace(/ \(.*\)$/, ""), note: req.note, mine: req.requested_by === admin.id } : null}
        values={{ title: s.title, type: s.type, date: start.date, start: start.time, end_date: end && end.date !== start.date ? end.date : "", end: end?.time ?? "", venue: s.venue ?? "" }}
      />

      <div className="my-4 grid grid-cols-3 gap-3">
        {[
          ["Timed in", inCount],
          ["Timed out", outCount],
          ["Still in", inCount - rows.filter((r) => r.in && r.out).length],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-3 text-center">
            <p className="text-2xl font-bold text-primary">{n}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <RecordsTable sessionId={s.id} rows={rows} canRemove={canManage} />
    </>
  );
}
