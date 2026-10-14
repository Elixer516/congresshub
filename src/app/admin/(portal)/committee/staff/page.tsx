import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { can, committeeScope } from "@/lib/server/committee";
import { cleanSearch, str, wordFilters } from "@/lib/server/list-helpers";
import { Badge, Select } from "@/components/ui";
import { Empty, Filter, SearchForm } from "@/components/list-controls";
import StaffTools from "./staff-tools";

export const metadata: Metadata = { title: "Working Committee staff" };

export default async function StaffPage({ searchParams }: PageProps<"/admin/committee/staff">) {
  const admin = await requireAdmin();
  const scope = committeeScope(admin);
  const sp = await searchParams;
  const q = cleanSearch(sp.q);
  const committee = scope ?? (/^[0-9a-f-]{36}$/.test(str(sp.committee)) || str(sp.committee) === "none" ? str(sp.committee) : "");

  let query = db().from("committee_staff").select("id, staff_no, full_name, committee_id, is_head, status, diocese, committees(name)");
  for (const f of wordFilters(q, ["full_name", "staff_no"])) query = query.or(f);
  if (committee === "none") query = query.is("committee_id", null);
  else if (committee) query = query.eq("committee_id", committee);
  let everyoneQuery = db().from("committee_staff").select("committee_id, is_head, status");
  if (scope) everyoneQuery = everyoneQuery.eq("committee_id", scope);
  const [{ data: staff }, { data: committees }, { data: everyone }] = await Promise.all([
    query.order("full_name").limit(500),
    db().from("committees").select("id, name, shift_start, shift_end").order("name"),
    everyoneQuery.limit(2000),
  ]);

  // Headcount for the summary: active people per committee, biggest first.
  const active = (everyone ?? []).filter((s) => s.status === "active");
  const perCommittee = (committees ?? [])
    .map((c) => ({ id: c.id, name: c.name, count: active.filter((s) => s.committee_id === c.id).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const unassigned = active.filter((s) => !s.committee_id).length;
  const heads = active.filter((s) => s.is_head).length;
  const inactive = (everyone ?? []).length - active.length;
  const chip = (href: string, label: string, count: number, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold " +
        (on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text hover:border-primary/50 hover:bg-primary-soft")
      }
    >
      {label}
      <span className={"rounded-full px-2 text-xs font-bold " + (on ? "bg-white/25" : "bg-primary-soft text-primary")}>{count}</span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border-2 border-primary/30 bg-primary-soft p-4 sm:p-5" aria-label="Working Committee headcount">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-primary">{scope ? "In your committee" : "Working Committee"}</p>
            <p className="text-5xl font-black leading-none text-primary">{active.length}</p>
            <p className="mt-1 text-sm font-semibold text-primary">active member{active.length === 1 ? "" : "s"}</p>
          </div>
          {!scope ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2 pb-1 text-sm">
              <p>
                <span className="text-2xl font-extrabold text-text">{perCommittee.length}</span> <span className="text-muted">committees</span>
              </p>
              <p>
                <span className="text-2xl font-extrabold text-text">{heads}</span> <span className="text-muted">committee head{heads === 1 ? "" : "s"}</span>
              </p>
              {unassigned ? (
                <p>
                  <span className="text-2xl font-extrabold text-warn">{unassigned}</span> <span className="text-muted">without a committee</span>
                </p>
              ) : null}
              {inactive ? (
                <p>
                  <span className="text-2xl font-extrabold text-muted">{inactive}</span> <span className="text-muted">inactive</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {!scope ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {chip("/admin/committee/staff", "All", active.length, !committee)}
            {perCommittee.map((c) => chip(`/admin/committee/staff?committee=${c.id}`, c.name, c.count, committee === c.id))}
            {unassigned ? chip("/admin/committee/staff?committee=none", "No committee", unassigned, committee === "none") : null}
          </div>
        ) : null}
      </section>
      {can.manage(admin) ? (
        <StaffTools
          committees={(committees ?? []).map((c) => ({ id: c.id, name: c.name, shift_start: c.shift_start?.slice(0, 5) ?? "", shift_end: c.shift_end?.slice(0, 5) ?? "" }))}
        />
      ) : null}
      <SearchForm action="/admin/committee/staff" q={q} placeholder="Search name or staff no.">
        {!scope ? (
          <Filter label="Committee" active={!!committee}>
            <Select name="committee" defaultValue={committee}>
              <option value="">All committees</option>
              <option value="none">No committee</option>
              {(committees ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Filter>
        ) : null}
      </SearchForm>
      {!staff?.length ? (
        <Empty>{q || committee ? "No one matches." : "No Working Committee members yet."}</Empty>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {staff.map((s) => (
            <li key={s.id}>
              <Link href={`/admin/committee/staff/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
                <img src={`/api/admin/staff/${s.id}/photo`} alt="" loading="lazy" className="size-11 shrink-0 rounded-full bg-surface-2 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {s.full_name}
                    {s.is_head ? <span className="ml-2 rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Head</span> : null}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {(s.committees as unknown as { name: string } | null)?.name ?? "No committee"}
                    {s.diocese ? ` · ${s.diocese}` : ""}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{s.staff_no}</p>
                </div>
                {s.status !== "active" ? <Badge status="inactive">Inactive</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        Showing {staff?.length ?? 0} {staff?.length === 1 ? "person" : "people"}
        {q || committee ? " (filtered)" : ""}
      </p>
    </div>
  );
}
