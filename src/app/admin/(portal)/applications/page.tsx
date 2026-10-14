import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { cleanSearch, pageNum, str, wordFilters } from "@/lib/server/list-helpers";
import Pagination, { pageSizeFrom } from "@/components/pagination";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/config";
import { formatDate } from "@/lib/time";
import { Badge, PageTitle, Select } from "@/components/ui";
import { Empty, Filter, SearchForm, Tabs } from "@/components/list-controls";

export const metadata: Metadata = { title: "Applications" };

const STATUSES = Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[];
const SORTS = { newest: "Newest first", oldest: "Oldest first", name: "Name (A–Z)" } as const;

export default async function ApplicationsPage({ searchParams }: PageProps<"/admin/applications">) {
  await requireAdmin({ min: "admin" });
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(str(sp.status)) ? (str(sp.status) as ApplicationStatus) : "pending";
  const q = cleanSearch(sp.q);
  const sort = (str(sp.sort) in SORTS ? str(sp.sort) : "newest") as keyof typeof SORTS;
  const page = pageNum(sp.page);
  const PAGE_SIZE = pageSizeFrom(sp.size);

  let query = db()
    .from("applications")
    .select("id, reference_no, status, title, last_name, first_name, diocese, parish, created_at", { count: "exact" })
    .eq("status", status);
  for (const f of wordFilters(q, ["last_name", "first_name", "reference_no", "parish"])) query = query.or(f);
  if (sort === "name") query = query.order("last_name").order("first_name");
  else query = query.order("created_at", { ascending: sort === "oldest" });
  const [counts, { data: rows, count }] = await Promise.all([
    Promise.all(
      STATUSES.map(async (s) => {
        const { count } = await db().from("applications").select("id", { count: "exact", head: true }).eq("status", s);
        return count ?? 0;
      }),
    ),
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
  ]);

  const link = (over: Record<string, string | number>) => {
    const p = new URLSearchParams({ status, ...(q ? { q } : {}), sort, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) });
    return `/admin/applications?${p}`;
  };

  return (
    <>
      <PageTitle title="Applications" subtitle="Review people who applied to become delegates." />
      <Tabs
        tabs={STATUSES.map((s, i) => ({
          href: `/admin/applications?status=${s}`,
          label: APPLICATION_STATUS_LABELS[s],
          count: counts[i],
          active: s === status,
        }))}
      />
      <SearchForm action="/admin/applications" q={q} placeholder="Search name, parish or reference number" hidden={{ status }}>
        <Filter label="Sort by">
          <Select name="sort" defaultValue={sort}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Filter>
      </SearchForm>

      {!rows?.length ? (
        <Empty>{q ? "No applications match your search." : `No ${APPLICATION_STATUS_LABELS[status].toLowerCase()} applications.`}</Empty>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/applications/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {a.last_name}, {a.first_name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {a.parish} · {a.diocese}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{a.reference_no}</p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge status={a.status}>{APPLICATION_STATUS_LABELS[a.status as ApplicationStatus]}</Badge>
                  <p className="mt-1 text-xs text-muted">{formatDate(a.created_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} href={(p, size) => link({ page: p, size: size ?? PAGE_SIZE })} />
    </>
  );
}
