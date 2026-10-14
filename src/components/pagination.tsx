import Link from "next/link";
import { cx } from "./ui";
import PageSizeSelect from "./page-size-select";

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export function pageSizeFrom(v: unknown): number {
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

// Page numbers to show: always first and last, the current page and its neighbours, "…" for gaps.
function pageList(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3].forEach((p) => keep.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2].forEach((p) => keep.add(p));
  const list = [...keep].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  list.forEach((p, i) => {
    if (i > 0 && p - list[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const box = "grid size-11 place-items-center rounded-xl border text-sm font-semibold";

export default function Pagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  // Link for a page number (and optionally a new page size).
  href: (page: number, size?: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const from = total ? (current - 1) * pageSize + 1 : 0;
  const to = Math.min(current * pageSize, total);

  return (
    <div className="mt-4 space-y-3">
      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Pages">
          {current > 1 ? (
            <Link href={href(current - 1)} className={cx(box, "border-border bg-surface hover:bg-surface-2")} aria-label="Previous page">
              ‹
            </Link>
          ) : (
            <span className={cx(box, "border-border bg-surface text-muted/50")} aria-hidden>
              ‹
            </span>
          )}
          {pageList(current, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap${i}`} className={cx(box, "border-border bg-surface text-muted")} aria-hidden>
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-current={p === current ? "page" : undefined}
                className={cx(box, p === current ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface hover:bg-surface-2")}
              >
                {p}
              </Link>
            ),
          )}
          {current < pages ? (
            <Link href={href(current + 1)} className={cx(box, "border-border bg-surface hover:bg-surface-2")} aria-label="Next page">
              ›
            </Link>
          ) : (
            <span className={cx(box, "border-border bg-surface text-muted/50")} aria-hidden>
              ›
            </span>
          )}
        </nav>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Results: {from} – {to} of {total}
        </p>
        <PageSizeSelect value={pageSize} sizes={[...PAGE_SIZES]} links={Object.fromEntries(PAGE_SIZES.map((s) => [s, href(1, s)]))} />
      </div>
    </div>
  );
}
