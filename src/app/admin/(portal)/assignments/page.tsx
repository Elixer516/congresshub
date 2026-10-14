import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { cleanSearch, str } from "@/lib/server/list-helpers";
import { regionOf } from "@/lib/config";
import { PageTitle } from "@/components/ui";
import { Empty, SearchForm, Tabs } from "@/components/list-controls";

export const metadata: Metadata = { title: "Assignments" };

// Where every delegate is assigned: dynamic groups, community immersion places and host parishes.
const VIEWS = {
  groups: { label: "Dynamic Groups", field: "dynamic_group", unit: "Group" },
  immersion: { label: "Community Immersion", field: "community_immersion", unit: "" },
  parish: { label: "Parishes", field: "parish_assignment", unit: "" },
} as const;
type View = keyof typeof VIEWS;

type Row = {
  id: string;
  member_no: string;
  first_name: string;
  last_name: string;
  diocese: string;
  dynamic_group: string | null;
  community_immersion: string | null;
  parish_assignment: string | null;
  kit_received_at: string | null;
  remarks: string | null;
};

const shortDiocese = (d: string) => d.replace(/^(Arch)?[Dd]iocese of |^Prelature of |^Apostolic Vicariate of /, "");

export default async function AssignmentsPage({ searchParams }: PageProps<"/admin/assignments">) {
  await requireAdmin({ min: "secretariat", transportation: true });
  const sp = await searchParams;
  const view = (str(sp.view) in VIEWS ? str(sp.view) : "groups") as View;
  const q = cleanSearch(sp.q).toLowerCase();
  const { field, unit } = VIEWS[view];

  const { data } = await db()
    .from("members")
    .select("id, member_no, first_name, last_name, diocese, dynamic_group, community_immersion, parish_assignment, kit_received_at, remarks")
    .eq("status", "active")
    .order("last_name")
    .limit(5000);
  const all = (data ?? []) as Row[];
  const matches = (m: Row) => !q || `${m.first_name} ${m.last_name} ${m.member_no} ${m.diocese}`.toLowerCase().includes(q);

  // One card per group / place / parish, plus "Not assigned yet" when needed.
  const buckets = new Map<string, Row[]>();
  for (const m of all) {
    const key = (m[field] as string | null) ?? "";
    buckets.set(key, [...(buckets.get(key) ?? []), m]);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    if (view === "groups") return Number(a) - Number(b) || a.localeCompare(b);
    return (buckets.get(b)!.length - buckets.get(a)!.length) || a.localeCompare(b);
  });
  const assigned = all.filter((m) => m[field]).length;
  const shown = keys.map((k) => ({ key: k, people: buckets.get(k)!, hits: buckets.get(k)!.filter(matches) })).filter((b) => !q || b.hits.length);

  return (
    <>
      <PageTitle
        title="Assignments"
        subtitle={`Where each of the ${all.length} delegates is assigned. ${assigned} of ${all.length} have a ${VIEWS[view].label.toLowerCase().replace(/s$/, "")}.`}
        actions={
          <Link
            href={`/admin/print/assignments?view=${view}`}
            className="no-print inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg"
          >
            🖨 Facilitator lists
          </Link>
        }
      />
      <div className="no-print">
        <Tabs
          tabs={(Object.keys(VIEWS) as View[]).map((v) => ({
            href: `/admin/assignments?view=${v}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
            label: VIEWS[v].label,
            count: new Set(all.map((m) => m[VIEWS[v].field]).filter(Boolean)).size,
            active: v === view,
          }))}
        />
        <SearchForm action="/admin/assignments" q={q} placeholder="Find a delegate (name, ID or diocese)" hidden={{ view }} />
      </div>

      {!shown.length ? (
        <Empty>{q ? "No delegate matches." : "No delegates yet."}</Empty>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))] print:grid-cols-[repeat(2,minmax(0,1fr))]">
          {shown.map(({ key, people, hits }) => {
            const dioceses = new Set(people.map((m) => m.diocese)).size;
            const kits = people.filter((m) => m.kit_received_at).length;
            const regions = [...new Set(people.map((m) => regionOf(m.diocese)?.color).filter(Boolean))] as string[];
            return (
              <section key={key || "none"} className="min-w-0 break-inside-avoid rounded-xl border border-border bg-surface p-3 sm:p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className={key ? "text-lg font-bold" : "text-lg font-bold text-warn"}>{key ? `${unit ? `${unit} ` : ""}${key}` : "Not assigned yet"}</h2>
                    <p className="text-xs text-muted">
                      {dioceses} diocese{dioceses === 1 ? "" : "s"} · 🎒 {kits}/{people.length} kits
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-primary px-3 py-1 text-sm font-black text-primary-fg">{people.length}</span>
                    <span className="flex gap-0.5" aria-hidden>
                      {regions.map((c) => (
                        <span key={c} className="size-2 rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                  </div>
                </div>
                <ol className="divide-y divide-border text-sm">
                  {(q ? hits : people).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 py-1.5">
                      <span className="w-9 shrink-0 font-mono text-xs text-muted">{m.member_no.slice(-4)}</span>
                      <Link href={`/admin/members/${m.id}?from=assignments`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                        {m.first_name} {m.last_name}
                        {m.remarks ? <span className="ml-1 text-xs text-warn" title={m.remarks}>📝</span> : null}
                      </Link>
                      <span className="shrink-0 text-xs text-muted">{shortDiocese(m.diocese)}</span>
                      <span className={m.kit_received_at ? "shrink-0 text-xs font-bold text-ok" : "shrink-0 text-xs text-muted/50"} title={m.kit_received_at ? "Kit received" : "No kit yet"}>
                        {m.kit_received_at ? "✓" : "·"}
                      </span>
                    </li>
                  ))}
                </ol>
                {q && hits.length < people.length ? <p className="mt-1 text-xs text-muted">Showing {hits.length} of {people.length}</p> : null}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
