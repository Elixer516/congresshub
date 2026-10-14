import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { can, committeeScope, dutyFlags, hoursText } from "@/lib/server/committee";
import { qrSvg } from "@/lib/server/qr";
import { formatDateTime, formatPlainDate, formatTime, todayLocal } from "@/lib/time";
import { Badge, Card } from "@/components/ui";
import BackLink from "@/components/back-link";
import StaffActions from "./staff-actions";
import StaffAccess from "./staff-access";

export const metadata: Metadata = { title: "Working Committee member" };

export default async function StaffMemberPage({ params }: PageProps<"/admin/committee/staff/[id]">) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: s }, { data: recs }, { data: committees }, { data: days }] = await Promise.all([
    db().from("committee_staff").select("*, committees(name, shift_start, shift_end)").eq("id", id).maybeSingle(),
    db().from("duty_records").select("*").eq("staff_id", id).order("duty_date", { ascending: false }).limit(60),
    db().from("committees").select("id, name").order("name"),
    db().from("duty_days").select("duty_date, label, starts_at, ends_at"),
  ]);
  if (!s) notFound();
  const isHead = admin.role === "head_admin";
  const { data: acct } = isHead
    ? await db().from("admins").select("login_id, role, is_active, last_sign_in_at").eq("staff_id", id).maybeSingle()
    : { data: null };
  const scope = committeeScope(admin);
  if (scope && s.committee_id !== scope) notFound();

  const c = s.committees as unknown as { name: string; shift_start: string | null; shift_end: string | null } | null;
  const today = todayLocal();
  const history = (recs ?? []).map((r) => {
    const day = days?.find((d) => d.duty_date === r.duty_date);
    return { ...r, day, flags: dutyFlags(r, { start: c?.shift_start ?? day?.starts_at ?? null, end: c?.shift_end ?? day?.ends_at ?? null }, today) };
  });
  const totalMinutes = history.reduce((n, r) => n + (r.flags.minutes ?? 0), 0);
  const lateCount = history.filter((r) => r.flags.late).length;

  return (
    <>
      <BackLink href="/admin/committee/staff" label="Back to Staff" />
      <div className="mb-5 mt-1 flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
        <img src={`/api/admin/staff/${s.id}/photo`} alt="" className="size-24 rounded-xl bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{s.full_name}</h1>
          <p className="font-mono text-sm text-muted">{s.staff_no}</p>
          <p className="text-sm text-muted">
            {c?.name ?? "No committee"}
            {s.is_head ? " · Committee head" : ""}
            {s.diocese ? ` · ${s.diocese}` : ""}
          </p>
        </div>
        <Badge status={s.status === "active" ? "active" : "inactive"}>{s.status === "active" ? "Active" : "Inactive"}</Badge>
      </div>

      {can.manage(admin) ? (
        <StaffActions
          id={s.id}
          name={s.full_name}
          status={s.status}
          committees={committees ?? []}
          values={{ full_name: s.full_name, committee_id: s.committee_id ?? "", is_head: s.is_head, diocese: s.diocese ?? "", contact_number: s.contact_number ?? "", shirt_size: s.shirt_size ?? "" }}
        />
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold">Duty record</h2>
            <p className="text-sm text-muted">
              {history.filter((r) => r.time_in).length} days · {hoursText(totalMinutes)} total{lateCount ? ` · late ${lateCount}×` : ""}
            </p>
          </div>
          {history.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Day</th>
                    <th className="py-1 pr-3 font-medium">In</th>
                    <th className="py-1 pr-3 font-medium">Out</th>
                    <th className="py-1 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {history.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/admin/committee/duty?date=${r.duty_date}`} className="hover:underline">
                          {formatPlainDate(r.duty_date)}
                        </Link>
                        {r.day ? <span className="block text-xs text-muted">{r.day.label}</span> : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.time_in ? formatTime(r.time_in) : "—"}
                        {r.flags.late ? <span className="ml-1 text-xs font-semibold text-warn">late</span> : null}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.time_out ? formatTime(r.time_out) : r.flags.forgotOut ? <span className="text-xs font-semibold text-danger">no time out</span> : "—"}
                      </td>
                      <td className="py-2 font-semibold">{hoursText(r.flags.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No duty time yet.</p>
          )}
        </Card>
        <div className="space-y-4">
          {isHead ? (
            <StaffAccess
              id={s.id}
              name={s.full_name}
              hasCommittee={!!s.committee_id}
              account={acct ? { loginId: acct.login_id, role: acct.role, active: acct.is_active, lastSignIn: acct.last_sign_in_at ? formatDateTime(acct.last_sign_in_at) : null } : null}
            />
          ) : null}
          <Card>
            <h2 className="mb-3 font-bold">QR badge</h2>
            <div className="qr-light mx-auto w-48 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: qrSvg(s.qr_token, s.qr_mask ?? 0) }} />
            <Link
              href={`/admin/committee/staff/${s.id}/card`}
              className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg"
            >
              ID card — print or download
            </Link>
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">Details</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Contact #</dt>
                <dd>{s.contact_number ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">T-shirt size</dt>
                <dd>{s.shirt_size ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Usual hours</dt>
                <dd>{c?.shift_start ? `${c.shift_start.slice(0, 5)}${c.shift_end ? `–${c.shift_end.slice(0, 5)}` : ""}` : "Per day's schedule"}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
