import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { autoOpenSessions, openNowFilter } from "@/lib/server/settings";
import { str } from "@/lib/server/list-helpers";
import DiocesePie from "@/components/diocese-pie";
import ChartPicker from "./chart-picker";
import { SESSION_TYPES, type SessionType } from "@/lib/config";
import { formatDate, formatTime } from "@/lib/time";
import { Alert, Card, PageTitle } from "@/components/ui";

const countOf = (res: { count: number | null }) => res.count ?? 0;
const head = { count: "exact" as const, head: true };

export default async function DashboardPage({ searchParams }: PageProps<"/admin">) {
  const admin = await requireAdmin({ transportation: true });
  if (admin.role === "committee_head") redirect("/admin/committee");
  if (admin.role === "transportation") redirect("/admin/attendance");
  const { denied, chart } = await searchParams;
  const chartSession = /^[0-9a-f-]{36}$/.test(str(chart)) ? str(chart) : "";

  // Everything the dashboard needs, fetched at the same time.
  const [pending, incomplete, active, total, { data: open }, { data: upcoming }, { data: recentSessions }, chartRows] = await Promise.all([
    db().from("applications").select("id", head).eq("status", "pending").then(countOf),
    db().from("applications").select("id", head).eq("status", "incomplete").then(countOf),
    db().from("members").select("id", head).eq("status", "active").then(countOf),
    db().from("members").select("id", head).then(countOf),
    db().from("attendance_sessions").select("id, title, type, starts_at, ends_at, venue").or(openNowFilter()).order("starts_at"),
    db()
      .from("attendance_sessions")
      .select("id, title, type, starts_at, ends_at, venue")
      .eq("status", "scheduled")
      .gt("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(5),
    db().from("attendance_sessions").select("id, title, starts_at").lte("starts_at", new Date().toISOString()).order("starts_at", { ascending: false }).limit(20),
    chartSession
      ? db()
          .from("attendance_records")
          .select("members(diocese)")
          .eq("session_id", chartSession)
          .eq("stage", "in")
          .limit(10000)
          .then((r) => (r.data ?? []).map((x) => (x.members as unknown as { diocese: string }).diocese))
      : db()
          .from("members")
          .select("diocese")
          .eq("status", "active")
          .limit(10000)
          .then((r) => (r.data ?? []).map((x) => x.diocese as string)),
    autoOpenSessions(),
  ]);

  const perDiocese = new Map<string, number>();
  for (const d of chartRows) perDiocese.set(d, (perDiocese.get(d) ?? 0) + 1);
  const chartTitle = chartSession
    ? `Participants per diocese — ${recentSessions?.find((s) => s.id === chartSession)?.title ?? "session"}`
    : "Active delegates per diocese";

  const isSecretariat = admin.role === "secretariat";
  const tiles = [
    ...(isSecretariat
      ? []
      : [
          { label: "Pending applications", value: pending, href: "/admin/applications?status=pending", highlight: pending > 0, sub: "" },
          { label: "Incomplete applications", value: incomplete, href: "/admin/applications?status=incomplete", highlight: false, sub: "" },
        ]),
    { label: "Active delegates", value: active, href: "/admin/members?status=active", sub: total - active ? `${total - active} inactive / backed out` : "", highlight: false },
    { label: "Sessions open now", value: open?.length ?? 0, href: "/admin/attendance", sub: "", highlight: false },
  ];

  return (
    <>
      <PageTitle title={`Hello, ${admin.display_name.split(" ")[0]}`} subtitle="Here's what needs attention." />
      {denied ? (
        <Alert tone="warn" className="mb-4">
          That page is for the head admin only.
        </Alert>
      ) : null}

      <div className={`grid grid-cols-2 gap-3 ${isSecretariat ? "" : "lg:grid-cols-4"}`}>
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="rounded-xl border border-border bg-surface p-4 hover:bg-surface-2">
            <p className={`text-3xl font-extrabold ${t.highlight ? "text-accent" : "text-primary"}`}>{t.value}</p>
            <p className="mt-1 text-sm font-medium">{t.label}</p>
            {t.sub ? <p className="text-xs text-muted">{t.sub}</p> : null}
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-primary">{chartTitle}</h2>
          <ChartPicker value={chartSession} sessions={(recentSessions ?? []).map((s) => ({ id: s.id, label: `${s.title} · ${formatDate(s.starts_at)}` }))} />
        </div>
        <DiocesePie rows={[...perDiocese].map(([name, count]) => ({ name, count }))} unit={chartSession ? "participants" : "delegates"} />
      </Card>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-primary">Open now</h2>
          {open?.length ? (
            <ul className="space-y-2">
              {open.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <Link href={`/admin/attendance/${s.id}`} className="min-w-0">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-sm text-muted">
                      {SESSION_TYPES[s.type as SessionType]}{s.ends_at ? ` · until ${formatTime(s.ends_at)}` : ""}
                    </p>
                  </Link>
                  <Link href={`/admin/scan/${s.id}`} className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-fg">
                    Scan
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No session is open right now.</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-primary">Coming up</h2>
          {upcoming?.length ? (
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/attendance/${s.id}`}>
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-sm text-muted">
                      {formatDate(s.starts_at)}, {formatTime(s.starts_at)}
                      {s.venue ? ` · ${s.venue}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing scheduled.</p>
          )}
        </Card>
      </div>
    </>
  );
}
