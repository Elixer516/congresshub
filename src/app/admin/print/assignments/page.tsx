import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { str } from "@/lib/server/list-helpers";
import PrintButton from "../../(portal)/members/[id]/card/print-button";

export const metadata: Metadata = { title: "Facilitator lists" };

// Facilitator lists: one sheet per dynamic group / immersion place / parish, names only (A4 portrait).
// Page margins are 0 so the browser prints no date, title, link or page number; the sheet adds its own padding.
const VIEWS = {
  groups: { field: "dynamic_group", title: (k: string) => `Dynamic Group ${k}`, label: "Dynamic Groups" },
  immersion: { field: "community_immersion", title: (k: string) => `Community Immersion: ${k}`, label: "Community Immersion" },
  parish: { field: "parish_assignment", title: (k: string) => k, label: "Parishes" },
} as const;
type View = keyof typeof VIEWS;

type Row = { id: string; title: string | null; first_name: string; middle_name: string | null; last_name: string } & Record<
  "dynamic_group" | "community_immersion" | "parish_assignment",
  string | null
>;

const nameOf = (m: Row) =>
  `${m.title && !["Mr.", "Ms."].includes(m.title) ? `${m.title} ` : ""}${m.last_name}, ${m.first_name}${m.middle_name ? ` ${m.middle_name.trim()[0]}.` : ""}`;

export default async function FacilitatorLists({ searchParams }: PageProps<"/admin/print/assignments">) {
  await requireAdmin({ min: "secretariat" });
  const sp = await searchParams;
  const view = (str(sp.view) in VIEWS ? str(sp.view) : "groups") as View;
  const only = str(sp.only);
  const { field, title } = VIEWS[view];

  const { data } = await db()
    .from("members")
    .select("id, title, first_name, middle_name, last_name, dynamic_group, community_immersion, parish_assignment")
    .eq("status", "active")
    .order("last_name")
    .order("first_name")
    .limit(5000);

  const buckets = new Map<string, Row[]>();
  for (const m of (data ?? []) as Row[]) {
    const k = m[field] ?? "Not assigned";
    buckets.set(k, [...(buckets.get(k) ?? []), m]);
  }
  const keys = [...buckets.keys()].sort((a, b) => (view === "groups" ? Number(a) - Number(b) || a.localeCompare(b) : a.localeCompare(b)));
  const sheets = keys.filter((k) => !only || k === only);

  return (
    <div className="facilitator-print bg-white text-black">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .facilitator-print .sheet { break-after: page; box-shadow: none !important; margin: 0 !important; }
          .facilitator-print .sheet:last-child { break-after: auto; }
        }
        .facilitator-print { font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .facilitator-print .sheet { width: 210mm; min-height: 297mm; padding: 16mm 18mm; box-sizing: border-box; }
        .facilitator-print .names li { break-inside: avoid; }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3">
        <Link href={`/admin/assignments?view=${view}`} className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-semibold text-green-800">
          ‹ Back to Assignments
        </Link>
        <span className="mx-1 text-sm text-gray-500">Facilitator lists:</span>
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/admin/print/assignments?view=${v}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${v === view ? "bg-green-800 text-white" : "border border-gray-300 text-gray-700"}`}
          >
            {VIEWS[v].label}
          </Link>
        ))}
        <form action="/admin/print/assignments" className="flex items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <select name="only" defaultValue={only} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All ({keys.length} sheets)</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {title(k)}
              </option>
            ))}
          </select>
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold">Show</button>
        </form>
        <div className="ml-auto">
          <PrintButton />
        </div>
        <p className="w-full text-xs text-gray-500">
          One sheet per {view === "groups" ? "group" : view === "immersion" ? "place" : "parish"}, A4. No headers or footers are printed.
        </p>
      </div>

      <div className="flex flex-col items-center gap-6 bg-gray-100 py-6 print:block print:bg-white print:py-0">
        {sheets.map((k) => {
          const people = buckets.get(k)!;
          const twoColumns = people.length > 14; // long lists (immersion, parish) in two columns
          return (
            <section key={k} className="sheet bg-white shadow">
              <p className="text-[9pt] font-bold uppercase tracking-widest text-green-800">CongressHub · Youth Congress</p>
              <h1 className="mt-1 text-[24pt] font-black leading-tight">{title(k)}</h1>
              <p className="text-[11pt] text-gray-600">
                {people.length} delegate{people.length === 1 ? "" : "s"}
              </p>

              <div className={`${twoColumns ? "mt-4 space-y-3" : "mt-6 space-y-4"} text-[12pt]`}>
                <p>Facilitator: _______________________________________________</p>
                <p>Co-facilitator: ____________________________________________</p>
                <p>Contact no.: _______________________________________________</p>
              </div>

              <ol
                className={`names ${twoColumns ? "mt-5" : "mt-8"} border-t-2 border-green-800 pt-3`}
                style={{ columnCount: twoColumns ? 2 : 1, columnGap: "10mm", fontSize: twoColumns ? "10pt" : "13pt" }}
              >
                {people.map((m, i) => (
                  <li key={m.id} className="flex gap-3 border-b border-gray-200" style={{ padding: twoColumns ? "0.8mm 0" : "2.6mm 0" }}>
                    <span className="w-7 shrink-0 text-right text-gray-500">{i + 1}.</span>
                    <span className="font-semibold">{nameOf(m)}</span>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
