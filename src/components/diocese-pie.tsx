// Pie chart of people per diocese: the 7 largest get their own slice, the rest fold into "Other".
// Colors are the validated categorical palette in fixed order; every slice is also named in the
// legend and in the full table, so no one depends on color alone.

const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const OTHER = "#a8a29e";
const MAX_SLICES = 7;

type Row = { name: string; count: number };

function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const a0 = start * 2 * Math.PI - Math.PI / 2;
  const a1 = end * 2 * Math.PI - Math.PI / 2;
  const large = end - start > 0.5 ? 1 : 0;
  return `M${cx} ${cy} L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
}

const short = (d: string) => d.replace(/^(Archdiocese|Diocese|Apostolic Vicariate|Prelature) of /, "");

export default function DiocesePie({ rows, unit }: { rows: Row[]; unit: string }) {
  const sorted = rows.filter((r) => r.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const total = sorted.reduce((n, r) => n + r.count, 0);
  if (!total) return <p className="py-8 text-center text-sm text-muted">No {unit} yet.</p>;

  const top = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);
  const slices = [
    ...top.map((r, i) => ({ label: short(r.name), full: r.name, count: r.count, color: SERIES[i] })),
    ...(rest.length ? [{ label: `Other (${rest.length})`, full: rest.map((r) => r.name).join(", "), count: rest.reduce((n, r) => n + r.count, 0), color: OTHER }] : []),
  ];
  const pct = (n: number) => `${Math.round((n / total) * 1000) / 10}%`;

  let at = 0;
  return (
    <div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <svg viewBox="0 0 200 200" className="size-52 shrink-0" role="img" aria-label={`${total} ${unit} by diocese`}>
          {slices.length === 1 ? (
            <circle cx="100" cy="100" r="92" fill={slices[0].color}>
              <title>{`${slices[0].full}: ${slices[0].count} (100%)`}</title>
            </circle>
          ) : (
            slices.map((s) => {
              const start = at;
              at += s.count / total;
              return (
                <path key={s.label} d={slicePath(100, 100, 92, start, at)} fill={s.color} stroke="var(--surface)" strokeWidth="2" strokeLinejoin="round" className="transition-opacity hover:opacity-80">
                  <title>{`${s.full}: ${s.count} ${unit} (${pct(s.count)})`}</title>
                </path>
              );
            })
          )}
        </svg>
        <ul className="w-full min-w-0 space-y-1.5 text-sm">
          {slices.map((s) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate" title={s.full}>
                {s.label}
              </span>
              <span className="font-semibold tabular-nums">{s.count}</span>
              <span className="w-12 text-right text-muted tabular-nums">{pct(s.count)}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t border-border pt-1.5 font-semibold">
            <span className="size-3 shrink-0" aria-hidden />
            <span className="flex-1">Total</span>
            <span className="tabular-nums">{total}</span>
            <span className="w-12" />
          </li>
        </ul>
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted">See all {sorted.length} dioceses</summary>
        <table className="mt-2 w-full">
          <tbody className="divide-y divide-border">
            {sorted.map((r) => (
              <tr key={r.name}>
                <td className="py-1.5 pr-2">{r.name}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{r.count}</td>
                <td className="w-14 py-1.5 text-right text-muted tabular-nums">{pct(r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
