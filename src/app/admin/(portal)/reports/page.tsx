import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { DIOCESES, REGIONS, SHIRT_SIZES, regionOf } from "@/lib/config";
import { Card, PageTitle } from "@/components/ui";
import PrintButton from "../members/[id]/card/print-button";
import DownloadCsv from "./download-csv";

export const metadata: Metadata = { title: "Reports" };

// Counts for planning and suppliers, straight from the records (always current):
// delegates per diocese, and shirt sizes per ID colour (region).
type Delegate = { first_name: string; last_name: string; member_no: string; diocese: string; title: string | null; shirt_size: string | null };

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export default async function ReportsPage() {
  await requireAdmin({ min: "secretariat" });
  const [{ data: m }, { data: s }, { count: inactive }] = await Promise.all([
    db().from("members").select("first_name, last_name, member_no, diocese, title, shirt_size").eq("status", "active").order("member_no").limit(5000),
    db().from("committee_staff").select("full_name, shirt_size").eq("status", "active").limit(5000),
    db().from("members").select("id", { count: "exact", head: true }).neq("status", "active"),
  ]);
  const delegates = (m ?? []) as Delegate[];
  const staff = s ?? [];
  const sizes = [...SHIRT_SIZES] as string[];
  const isClergy = (d: Delegate) => !!d.title && !["Mr.", "Ms."].includes(d.title);

  // 1) Delegates per diocese, grouped by region (ecclesiastical province).
  const regions = REGIONS.map((r) => {
    const dioceses = (r.dioceses as readonly string[])
      .map((name) => {
        const list = delegates.filter((d) => d.diocese === name);
        return { name, total: list.length, clergy: list.filter(isClergy).length };
      })
      .filter((x) => x.total > 0);
    return { ...r, dioceses, total: dioceses.reduce((n, x) => n + x.total, 0) };
  });
  const unmapped = delegates.filter((d) => !regionOf(d.diocese));
  const listedDioceses = new Set(DIOCESES as readonly string[]);

  // 2) Shirt sizes per ID colour.
  const bySize = (list: { shirt_size: string | null }[], size: string) => list.filter((x) => x.shirt_size === size).length;
  const regionPeople = REGIONS.map((r) => delegates.filter((d) => regionOf(d.diocese)?.key === r.key));
  const noSize = delegates.filter((d) => !d.shirt_size);
  const usedSizes = sizes.filter((z) => delegates.some((d) => d.shirt_size === z) || staff.some((x) => x.shirt_size === z));

  const dioceseCsv = toCsv([
    ["Region", "Colour", "Diocese", "Delegates", "Clergy / religious", "Lay"],
    ...regions.flatMap((r) => r.dioceses.map((d) => [r.key, r.colorName, d.name, d.total, d.clergy, d.total - d.clergy])),
    ["", "", "TOTAL", delegates.length, delegates.filter(isClergy).length, delegates.length - delegates.filter(isClergy).length],
  ]);
  const shirtCsv = toCsv([
    ["Size", ...REGIONS.map((r) => `${r.colorName} (${r.key})`), "Delegates total", "Working Committee", "Grand total"],
    ...usedSizes.map((z) => [z, ...regionPeople.map((p) => bySize(p, z)), bySize(delegates, z), bySize(staff, z), bySize(delegates, z) + bySize(staff, z)]),
    ["No size yet", ...regionPeople.map((p) => p.filter((d) => !d.shirt_size).length), noSize.length, staff.filter((x) => !x.shirt_size).length, noSize.length + staff.filter((x) => !x.shirt_size).length],
    ["TOTAL", ...regionPeople.map((p) => p.length), delegates.length, staff.length, delegates.length + staff.length],
  ]);

  const th = "border-b-2 border-border px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-muted";
  const td = "border-b border-border px-2 py-1.5";
  const num = "text-right tabular-nums";

  return (
    <>
      <PageTitle
        title="Reports"
        subtitle={`Live counts from the records: ${delegates.length} active delegates, ${staff.length} Working Committee.${inactive ? ` ${inactive} inactive / backed-out delegate${inactive === 1 ? " is" : "s are"} not counted.` : ""}`}
        actions={
          <div className="no-print">
            <PrintButton />
          </div>
        }
      />

      <div className="space-y-6">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Delegates per diocese</h2>
            <DownloadCsv name="CongressHub - delegates per diocese.csv" csv={dioceseCsv} label="Download (Excel)" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr>
                  <th className={th}>Diocese</th>
                  <th className={`${th} ${num}`}>Delegates</th>
                  <th className={`${th} ${num}`}>Clergy / religious</th>
                  <th className={`${th} ${num}`}>Lay</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <RegionRows key={r.key} r={r} td={td} num={num} />
                ))}
                {unmapped.length ? (
                  <tr>
                    <td className={td}>Other / no region</td>
                    <td className={`${td} ${num}`}>{unmapped.length}</td>
                    <td className={td} colSpan={2} />
                  </tr>
                ) : null}
                <tr className="text-base font-black">
                  <td className="px-2 py-2">TOTAL</td>
                  <td className={`px-2 py-2 ${num}`}>{delegates.length}</td>
                  <td className={`px-2 py-2 ${num}`}>{delegates.filter(isClergy).length}</td>
                  <td className={`px-2 py-2 ${num}`}>{delegates.length - delegates.filter(isClergy).length}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {[...listedDioceses].filter((d) => !delegates.some((x) => x.diocese === d)).length ? (
            <p className="mt-2 text-xs text-muted">
              No delegates yet from: {[...listedDioceses].filter((d) => !delegates.some((x) => x.diocese === d)).join(", ")}.
            </p>
          ) : null}
        </Card>

        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Shirt sizes per colour</h2>
              <p className="text-sm text-muted">Colours follow the delegates&apos; ID colour (region). Working Committee is counted separately.</p>
            </div>
            <DownloadCsv name="CongressHub - shirt sizes per colour.csv" csv={shirtCsv} label="Download for the supplier (Excel)" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr>
                  <th className={th}>Size</th>
                  {REGIONS.map((r) => (
                    <th key={r.key} className={`${th} ${num}`}>
                      <span className="inline-flex items-center gap-1">
                        <span className="size-2.5 rounded-full" style={{ background: r.color }} aria-hidden />
                        {r.colorName}
                      </span>
                      <span className="block text-[10px] font-semibold normal-case tracking-normal">{r.key}</span>
                    </th>
                  ))}
                  <th className={`${th} ${num}`}>Delegates</th>
                  <th className={`${th} ${num}`}>Working Com.</th>
                  <th className={`${th} ${num}`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {usedSizes.map((z) => (
                  <tr key={z}>
                    <td className={`${td} font-bold`}>{z}</td>
                    {regionPeople.map((p, i) => (
                      <td key={i} className={`${td} ${num}`}>
                        {bySize(p, z) || <span className="text-muted/50">0</span>}
                      </td>
                    ))}
                    <td className={`${td} ${num} font-bold`}>{bySize(delegates, z)}</td>
                    <td className={`${td} ${num}`}>{bySize(staff, z)}</td>
                    <td className={`${td} ${num} font-bold`}>{bySize(delegates, z) + bySize(staff, z)}</td>
                  </tr>
                ))}
                <tr className="text-warn">
                  <td className={td}>No size yet</td>
                  {regionPeople.map((p, i) => (
                    <td key={i} className={`${td} ${num}`}>
                      {p.filter((d) => !d.shirt_size).length}
                    </td>
                  ))}
                  <td className={`${td} ${num}`}>{noSize.length}</td>
                  <td className={`${td} ${num}`}>{staff.filter((x) => !x.shirt_size).length}</td>
                  <td className={`${td} ${num}`}>{noSize.length + staff.filter((x) => !x.shirt_size).length}</td>
                </tr>
                <tr className="text-base font-black">
                  <td className="px-2 py-2">TOTAL</td>
                  {regionPeople.map((p, i) => (
                    <td key={i} className={`px-2 py-2 ${num}`}>
                      {p.length}
                    </td>
                  ))}
                  <td className={`px-2 py-2 ${num}`}>{delegates.length}</td>
                  <td className={`px-2 py-2 ${num}`}>{staff.length}</td>
                  <td className={`px-2 py-2 ${num}`}>{delegates.length + staff.length}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {noSize.length ? (
            <p className="mt-2 text-sm text-warn">
              Delegates without a shirt size: {noSize.map((d) => `${d.first_name} ${d.last_name} (${d.member_no.slice(-4)})`).join(", ")}.
            </p>
          ) : null}
        </Card>
      </div>
    </>
  );
}

function RegionRows({
  r,
  td,
  num,
}: {
  r: { key: string; color: string; colorName: string; total: number; dioceses: { name: string; total: number; clergy: number }[] };
  td: string;
  num: string;
}) {
  return (
    <>
      <tr className="bg-surface-2">
        <td className="px-2 py-1.5 font-bold" colSpan={4}>
          <span className="inline-flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: r.color }} aria-hidden />
            {r.key} <span className="font-normal text-muted">({r.colorName}) · {r.total} delegates</span>
          </span>
        </td>
      </tr>
      {r.dioceses.map((d) => (
        <tr key={d.name}>
          <td className={`${td} pl-6`}>{d.name}</td>
          <td className={`${td} ${num} font-bold`}>{d.total}</td>
          <td className={`${td} ${num}`}>{d.clergy}</td>
          <td className={`${td} ${num}`}>{d.total - d.clergy}</td>
        </tr>
      ))}
    </>
  );
}
