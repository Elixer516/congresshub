import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { cleanSearch, pageNum, str } from "@/lib/server/list-helpers";
import Pagination, { pageSizeFrom } from "@/components/pagination";
import { ACTION_TEXT, changeLines } from "@/lib/audit-text";
import { formatDateTime, localToUtc } from "@/lib/time";
import { PageTitle, Select, inputClass } from "@/components/ui";
import { Empty } from "@/components/list-controls";

export const metadata: Metadata = { title: "Audit log" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Head admin only. Entries can never be edited or deleted from the app.
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin({ role: "head_admin" });
  const sp = await searchParams;
  const action = str(sp.action) in ACTION_TEXT ? str(sp.action) : "";
  const who = /^[0-9a-f-]{36}$|^system$/.test(str(sp.who)) ? str(sp.who) : "";
  const from = DATE.test(str(sp.from)) ? str(sp.from) : "";
  const to = DATE.test(str(sp.to)) ? str(sp.to) : "";
  const q = cleanSearch(sp.q);
  const page = pageNum(sp.page);
  const PAGE = pageSizeFrom(sp.size ?? "50");

  let query = db().from("audit_log").select("*", { count: "exact" });
  if (action) query = query.eq("action", action);
  if (who === "system") query = query.is("actor_id", null);
  else if (who) query = query.eq("actor_id", who);
  if (from) query = query.gte("created_at", localToUtc(from, "00:00").toISOString());
  if (to) query = query.lt("created_at", new Date(localToUtc(to, "00:00").getTime() + 86400000).toISOString());
  if (q) query = query.or(`target_label.ilike.*${q}*,actor_label.ilike.*${q}*,reason.ilike.*${q}*`);
  const [{ data: rows, count }, { data: admins }] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1),
    db().from("admins").select("id, display_name, login_id").order("display_name"),
  ]);

  const params = { ...(action ? { action } : {}), ...(who ? { who } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), ...(q ? { q } : {}) };

  return (
    <>
      <PageTitle title="Audit log" subtitle="Every change made in the app. Entries can't be edited or deleted." />
      <form action="/admin/audit" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={q} type="search" placeholder="Search names or reasons" className={`${inputClass} lg:col-span-2`} />
        <Select name="action" defaultValue={action} aria-label="Action">
          <option value="">All actions</option>
          {Object.entries(ACTION_TEXT).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="who" defaultValue={who} aria-label="Who">
          <option value="">Anyone</option>
          <option value="system">System</option>
          {(admins ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name}
            </option>
          ))}
        </Select>
        <input name="from" type="date" defaultValue={from} aria-label="From date" className={inputClass} />
        <input name="to" type="date" defaultValue={to} aria-label="To date" className={inputClass} />
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg lg:col-start-6">Filter</button>
      </form>

      {!rows?.length ? (
        <Empty>No entries match.</Empty>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((r) => {
            const lines = changeLines(r.before, r.after);
            return (
              <li key={r.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p>
                    <span className="font-semibold">{r.actor_label.replace(/ \([^)]*\)$/, "")}</span>{" "}
                    <span>{(ACTION_TEXT[r.action] ?? r.action).replace(/^./, (c) => c.toLowerCase())}</span>
                    {r.target_label ? <span className="text-muted"> — {r.target_label}</span> : null}
                  </p>
                  <time className="text-xs text-muted">{formatDateTime(r.created_at)}</time>
                </div>
                {lines.length ? (
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : null}
                {r.reason ? <p className="mt-1">Reason: {r.reason}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
      <Pagination page={page} total={count ?? 0} pageSize={PAGE} href={(p, size) => `/admin/audit?${new URLSearchParams({ ...params, size: String(size ?? PAGE), page: String(p) })}`} />
    </>
  );
}
