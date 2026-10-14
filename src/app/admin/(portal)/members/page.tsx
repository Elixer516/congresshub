import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { cleanSearch, pageNum, str, wordFilters } from "@/lib/server/list-helpers";
import Pagination, { DEFAULT_PAGE_SIZE, pageSizeFrom } from "@/components/pagination";
import { DIOCESES, MEMBER_STATUS_LABELS, REGIONS, regionOf, type MemberStatus } from "@/lib/config";
import { formatDate } from "@/lib/time";
import { Badge, PageTitle, Select } from "@/components/ui";
import { Empty, Filter, SearchForm } from "@/components/list-controls";

export const metadata: Metadata = { title: "Delegates" };

const SORTS = { name: "Name (A–Z)", id: "Delegate ID", joined: "Newest delegates" } as const;

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const admin = await requireAdmin({ min: "secretariat", transportation: true });
  const sp = await searchParams;
  const q = cleanSearch(sp.q);
  const status = str(sp.status) in MEMBER_STATUS_LABELS ? str(sp.status) : "";
  const role = str(sp.role).slice(0, 80);
  const region = REGIONS.find((r) => r.key === str(sp.region)) ?? null;
  // With a region picked, only that region's dioceses can be chosen.
  const dioceseChoices: readonly string[] = region ? region.dioceses : DIOCESES;
  const diocese = dioceseChoices.includes(str(sp.diocese)) ? str(sp.diocese) : "";
  const kit = ["yes", "no"].includes(str(sp.kit)) ? str(sp.kit) : "";
  const sort = (str(sp.sort) in SORTS ? str(sp.sort) : "name") as keyof typeof SORTS;
  const page = pageNum(sp.page);
  const PAGE_SIZE = pageSizeFrom(sp.size);

  // Roles (positions) people actually have, for the filter.
  let query = db()
    .from("members")
    .select("id, member_no, status, last_name, first_name, position, diocese, parish, joined_at, shirt_size, kit_received_at", { count: "exact" });
  for (const f of wordFilters(q, ["last_name", "first_name", "member_no", "nickname"])) query = query.or(f);
  if (status) query = query.eq("status", status);
  if (kit === "yes") query = query.not("kit_received_at", "is", null);
  if (kit === "no") query = query.is("kit_received_at", null);
  if (role) query = query.eq("position", role);
  if (diocese) query = query.eq("diocese", diocese);
  else if (region) query = query.in("diocese", [...region.dioceses]);
  if (sort === "id") query = query.order("member_no");
  else if (sort === "joined") query = query.order("joined_at", { ascending: false });
  else query = query.order("last_name").order("first_name");
  const [{ data: rows, count }, { data: roleRows }, { count: kitsGiven }, { count: everyone }, { count: notActive }] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    db().from("members").select("position").not("position", "is", null).limit(2000),
    db().from("members").select("id", { count: "exact", head: true }).eq("status", "active").not("kit_received_at", "is", null),
    db().from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    db().from("members").select("id", { count: "exact", head: true }).neq("status", "active"),
  ]);
  const filtered = !!(q || status || role || region || diocese || kit);
  const roles = [...new Set((roleRows ?? []).map((r) => r.position as string))].sort((a, b) => a.localeCompare(b));

  const params: Record<string, string> = { ...(PAGE_SIZE !== DEFAULT_PAGE_SIZE ? { size: String(PAGE_SIZE) } : {}), ...(q ? { q } : {}), ...(status ? { status } : {}), ...(role ? { role } : {}), ...(region ? { region: region.key } : {}), ...(diocese ? { diocese } : {}), ...(kit ? { kit } : {}), sort };

  return (
    <>
      <PageTitle
        title="Delegates"
        subtitle={
          <>
            {/* Headcount = active delegates only; people who backed out (inactive) are counted separately. */}
            <b className="text-text">{everyone ?? 0}</b> active delegate{everyone === 1 ? "" : "s"}
            {notActive ? (
              <Link href="/admin/members?status=inactive" className="ml-2 text-xs font-semibold text-warn underline">
                {notActive} inactive / backed out
              </Link>
            ) : null}
            {filtered ? (
              <span className="ml-2 text-xs">
                · showing {count ?? 0}
                {status ? ` ${MEMBER_STATUS_LABELS[status as MemberStatus].toLowerCase()}` : ""}
              </span>
            ) : null}
            <span className="ml-2 inline-flex items-center rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">
              🎒 {kitsGiven ?? 0} of {everyone ?? 0} kits given
            </span>
          </>
        }
        actions={
          admin.role === "transportation" ? undefined : (
            <Link href="/admin/id-cards" className="inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-primary">
              ⬇ Download IDs
            </Link>
          )
        }
      />
      <SearchForm action="/admin/members" q={q} placeholder="Search name or delegate ID" clearHref={q || status || role || region || diocese || kit || sort !== "name" ? "/admin/members" : null}>
        <Filter label="Youth Congress kit" active={!!kit}>
          <Select name="kit" defaultValue={kit}>
            <option value="">Everyone</option>
            <option value="no">🎒 Not yet received</option>
            <option value="yes">✓ Received</option>
          </Select>
        </Filter>
        <Filter label="Region" active={!!region}>
          <Select name="region" defaultValue={region?.key ?? ""}>
            <option value="">All regions</option>
            {REGIONS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.key} ({r.colorName})
              </option>
            ))}
          </Select>
        </Filter>
        <Filter label="Diocese" active={!!diocese}>
          <Select name="diocese" defaultValue={diocese}>
            <option value="">{region ? `All in ${region.key}` : "All dioceses"}</option>
            {dioceseChoices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </Filter>
        <Filter label="Role" active={!!role}>
          <Select name="role" defaultValue={role}>
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Filter>
        <Filter label="Status" active={!!status}>
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            {Object.entries(MEMBER_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Filter>
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
        <Empty>{q || status || role || region || diocese || kit ? "No delegates match." : "No delegates yet. Approve an application to add one."}</Empty>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
                <img src={`/api/admin/members/${m.id}/photo`} alt="" loading="lazy" className="size-11 shrink-0 rounded-full bg-surface-2 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {m.last_name}, {m.first_name}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {[m.position, m.parish || m.diocese].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <span className="whitespace-nowrap font-mono">{m.member_no}</span>
                    {regionOf(m.diocese) ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span className="size-2 rounded-full" style={{ background: regionOf(m.diocese)!.color }} aria-hidden />
                        {regionOf(m.diocese)!.key}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <div className="flex items-center gap-1.5">
                  {m.kit_received_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ok px-2.5 py-1 text-xs font-bold text-white">✓ Kit</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-warn bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">No kit</span>
                  )}
                  <span className="inline-flex min-w-11 items-center justify-center rounded-md border border-primary/40 bg-primary-soft px-2 py-0.5 text-xs font-black text-primary" title="T-shirt size">
                    👕 {m.shirt_size ?? "—"}
                  </span>
                  </div>
                  <Badge status={m.status}>{MEMBER_STATUS_LABELS[m.status as MemberStatus]}</Badge>
                  <p className="mt-1 hidden whitespace-nowrap text-xs text-muted sm:block">Joined {formatDate(m.joined_at)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE_SIZE} href={(p, size) => `/admin/members?${new URLSearchParams({ ...params, ...(size ? { size: String(size) } : {}), page: String(p) })}`} />
    </>
  );
}
