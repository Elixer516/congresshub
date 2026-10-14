import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { can, committeeScope, hoursText, serverNow } from "@/lib/server/committee";
import { dutyForDate } from "@/lib/server/duty-report";
import { DELIVERABLE_STATUS, type DeliverableStatus } from "@/lib/config";
import { formatDateTime, formatTime, todayLocal } from "@/lib/time";
import { Card, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Working Committee" };

const STATUS_STYLE: Record<DeliverableStatus, string> = { not_started: "bg-surface-2 text-muted", ongoing: "bg-warn-soft text-warn", done: "bg-ok-soft text-ok" };

// Head admin's monitoring page (committee heads see the same for their own committee).
export default async function CommitteeOverview() {
  const admin = await requireAdmin();
  const scope = committeeScope(admin);
  const today = todayLocal();
  const now = serverNow();

  const delQ = db().from("deliverables").select("id, name, status, deadline, committee_id, staff_id, updated_at, committees(name), committee_staff(full_name, committee_id)").order("sort_order");
  const [{ rows, day }, { data: dels }, { data: updates }, { data: committees }] = await Promise.all([
    dutyForDate(today, admin, today),
    delQ,
    db().from("deliverable_updates").select("deliverable_id, actor_label, summary, created_at").order("created_at", { ascending: false }).limit(40),
    db().from("committees").select("id, name").order("name"),
  ]);

  // Committee heads also see items assigned to a person in their committee.
  const mine = (dels ?? []).filter((d) => !scope || d.committee_id === scope || (d.committee_staff as unknown as { committee_id: string } | null)?.committee_id === scope);
  const delIds = new Set(mine.map((d) => d.id));
  const counts = { not_started: 0, ongoing: 0, done: 0 } as Record<DeliverableStatus, number>;
  for (const d of mine) counts[d.status as DeliverableStatus]++;
  const total = mine.length || 1;
  const overdue = mine.filter((d) => d.status !== "done" && d.deadline && new Date(d.deadline).getTime() < now);
  const soon = mine.filter((d) => d.status !== "done" && d.deadline && new Date(d.deadline).getTime() >= now && new Date(d.deadline).getTime() < now + 3 * 86400000);

  const onDuty = rows.filter((r) => r.timeIn && !r.timeOut);
  const timedIn = rows.filter((r) => r.timeIn);
  const late = rows.filter((r) => r.flags.late);
  const noShow = rows.filter((r) => r.flags.noShow);
  const minutes = rows.reduce((n, r) => n + (r.flags.minutes ?? 0), 0);

  // Per committee: deliverable progress + people on duty now.
  const perCommittee = (committees ?? [])
    .filter((c) => !scope || c.id === scope)
    .map((c) => {
      const items = mine.filter((d) => d.committee_id === c.id || (d.committee_staff as unknown as { committee_id: string } | null)?.committee_id === c.id);
      return { ...c, done: items.filter((d) => d.status === "done").length, total: items.length, onDuty: onDuty.filter((r) => r.committeeId === c.id) };
    });

  const tiles = [
    { label: "On duty now", value: onDuty.length, tone: "text-primary" },
    { label: "Timed in today", value: timedIn.length, tone: "text-primary" },
    { label: "Late today", value: late.length, tone: late.length ? "text-warn" : "text-primary" },
    { label: day ? "No-shows today" : "Hours today", value: day ? noShow.length : hoursText(minutes), tone: day && noShow.length ? "text-danger" : "text-primary" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          Today{day ? ` · ${day.label}, expected from ${day.starts_at.slice(0, 5)}` : " · no duty schedule set for today"}
        </p>
        {can.scanDuty(admin) ? (
          <Link href="/admin/duty-scan" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-fg">
            Scan duty time in / out
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href="/admin/committee/duty" className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
            <p className={cx("text-3xl font-extrabold", t.tone)}>{t.value}</p>
            <p className="mt-1 text-sm font-medium">{t.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold text-primary">Deliverables</h2>
            <Link href="/admin/committee/deliverables" className="text-sm font-semibold text-primary underline">
              See all
            </Link>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" aria-label={`${counts.done} of ${mine.length} done`}>
            <div className="bg-ok" style={{ width: `${(counts.done / total) * 100}%` }} />
            <div className="bg-warn" style={{ width: `${(counts.ongoing / total) * 100}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {(Object.keys(DELIVERABLE_STATUS) as DeliverableStatus[]).map((k) => (
              <span key={k} className={cx("rounded-full px-3 py-1 font-semibold", STATUS_STYLE[k])}>
                {DELIVERABLE_STATUS[k]}: {counts[k]}
              </span>
            ))}
          </div>
          {overdue.length || soon.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {overdue.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2">
                  <span className="min-w-0 truncate font-semibold">{d.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-danger">Overdue · {formatDateTime(d.deadline!)}</span>
                </li>
              ))}
              {soon.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-warn-soft px-3 py-2">
                  <span className="min-w-0 truncate font-semibold">{d.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-warn">Due {formatDateTime(d.deadline!)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">Nothing overdue or due in the next 3 days.</p>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-primary">By committee</h2>
          <ul className="space-y-3">
            {perCommittee.map((c) => (
              <li key={c.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">
                    {c.total ? `${c.done}/${c.total} done` : "no deliverables"} · {c.onDuty.length} on duty
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-ok" style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%` }} />
                </div>
                {c.onDuty.length ? <p className="mt-1 truncate text-xs text-muted">On duty: {c.onDuty.map((r) => r.name).join(", ")}</p> : null}
              </li>
            ))}
            {!perCommittee.length ? <p className="text-sm text-muted">No committees yet.</p> : null}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-bold text-primary">Recent activity</h2>
        <ul className="divide-y divide-border text-sm">
          {[
            ...(updates ?? [])
              .filter((u) => delIds.has(u.deliverable_id))
              .map((u) => ({ at: u.created_at, text: `${u.actor_label.replace(/ \(.*\)$/, "")} — ${mine.find((d) => d.id === u.deliverable_id)?.name}: ${u.summary}` })),
            ...rows.flatMap((r) => [
              r.timeIn ? { at: r.timeIn, text: `${r.name} timed in${r.flags.late ? " (late)" : ""}` } : null,
              r.timeOut ? { at: r.timeOut, text: `${r.name} timed out · ${hoursText(r.flags.minutes)}` } : null,
            ]).filter((x): x is { at: string; text: string } => !!x),
          ]
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 15)
            .map((a, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">{a.text}</span>
                <span className="shrink-0 text-xs text-muted">{a.at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? formatTime(a.at) : formatDateTime(a.at)}</span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}
