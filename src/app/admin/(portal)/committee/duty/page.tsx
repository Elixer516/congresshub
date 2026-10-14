import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { can, hoursText } from "@/lib/server/committee";
import { dutyForDate } from "@/lib/server/duty-report";
import { str } from "@/lib/server/list-helpers";
import { formatPlainDate, todayLocal } from "@/lib/time";
import DutyTable from "./duty-table";
import DutyDayForm from "./duty-day-form";

export const metadata: Metadata = { title: "Duty" };

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

export default async function DutyPage({ searchParams }: PageProps<"/admin/committee/duty">) {
  const admin = await requireAdmin();
  const today = todayLocal();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.date)) ? str(sp.date) : today;
  const [{ rows, day }, { data: days }] = await Promise.all([
    dutyForDate(date, admin, today),
    db().from("duty_days").select("*").order("duty_date", { ascending: false }).limit(20),
  ]);
  const totalMinutes = rows.reduce((n, r) => n + (r.flags.minutes ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/committee/duty?date=${shift(date, -1)}`} className="grid size-11 place-items-center rounded-lg border border-border bg-surface" aria-label="Previous day">
          ‹
        </Link>
        <form action="/admin/committee/duty" className="flex gap-2">
          <input type="date" name="date" defaultValue={date} className="min-h-11 rounded-lg border border-border bg-surface px-3" aria-label="Date" />
          <button className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm font-semibold">Go</button>
        </form>
        <Link href={`/admin/committee/duty?date=${shift(date, 1)}`} className="grid size-11 place-items-center rounded-lg border border-border bg-surface" aria-label="Next day">
          ›
        </Link>
        {date !== today ? (
          <Link href="/admin/committee/duty" className="text-sm font-semibold text-primary underline">
            Today
          </Link>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          {can.scanDuty(admin) && date === today ? (
            <Link href="/admin/duty-scan" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-fg">
              Scan duty
            </Link>
          ) : null}
          <a href={`/api/admin/duty/export?date=${date}`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold">
            Download CSV
          </a>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="font-bold">{formatPlainDate(date)}</p>
        <p className="text-sm text-muted">
          {day ? `${day.label} · expected ${day.starts_at.slice(0, 5)}${day.ends_at ? `–${day.ends_at.slice(0, 5)}` : ""}` : "No schedule for this day — late and no-show are only checked against committee hours."}
          {" · "}
          {rows.filter((r) => r.timeIn).length} timed in · total {hoursText(totalMinutes)}
        </p>
        {can.manage(admin) ? <DutyDayForm date={date} day={day ? { label: day.label, starts_at: day.starts_at.slice(0, 5), ends_at: day.ends_at?.slice(0, 5) ?? "" } : null} /> : null}
      </div>

      <DutyTable date={date} rows={rows} canCorrect={can.manage(admin)} />

      {can.manage(admin) && days?.length ? (
        <details className="rounded-xl border border-border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-semibold">Scheduled duty days</summary>
          <ul className="mt-2 space-y-1">
            {days.map((d) => (
              <li key={d.duty_date}>
                <Link href={`/admin/committee/duty?date=${d.duty_date}`} className="underline">
                  {formatPlainDate(d.duty_date)}
                </Link>{" "}
                — {d.label}, {d.starts_at.slice(0, 5)}
                {d.ends_at ? `–${d.ends_at.slice(0, 5)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
