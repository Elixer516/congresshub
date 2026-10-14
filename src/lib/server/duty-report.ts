import "server-only";
import { db } from "./supabase";
import { committeeScope, dutyFlags, type DutyFlags } from "./committee";
import type { Admin } from "./auth";

export type DutyRow = {
  staffId: string;
  staffNo: string;
  name: string;
  committee: string | null;
  committeeId: string | null;
  isHead: boolean;
  timeIn: string | null;
  timeOut: string | null;
  inBy: string | null;
  outBy: string | null;
  corrected: boolean;
  note: string | null;
  flags: DutyFlags & { noShow: boolean };
};

// Everyone on the Working Committee for one day, with their times and flags (late, left early,
// forgot to time out, no-show). Committee heads only get their own committee.
export async function dutyForDate(date: string, viewer: Admin, today: string) {
  const scope = committeeScope(viewer);
  let staffQ = db().from("committee_staff").select("id, staff_no, full_name, committee_id, is_head, status, committees(name, shift_start, shift_end)").order("full_name");
  if (scope) staffQ = staffQ.eq("committee_id", scope);
  const [{ data: staff }, { data: recs }, { data: day }] = await Promise.all([
    staffQ,
    db().from("duty_records").select("*").eq("duty_date", date),
    db().from("duty_days").select("*").eq("duty_date", date).maybeSingle(),
  ]);

  const byStaff = new Map((recs ?? []).map((r) => [r.staff_id, r]));
  const rows: DutyRow[] = [];
  for (const s of staff ?? []) {
    const r = byStaff.get(s.id);
    if (!r && s.status !== "active") continue;
    const c = s.committees as unknown as { name: string; shift_start: string | null; shift_end: string | null } | null;
    const expected = { start: c?.shift_start ?? day?.starts_at ?? null, end: c?.shift_end ?? day?.ends_at ?? null };
    const flags = dutyFlags({ duty_date: date, time_in: r?.time_in ?? null, time_out: r?.time_out ?? null }, expected, today);
    // No-show: a scheduled duty day that has started (or passed) and no time-in.
    const started = day && (date < today || (date === today && Date.now() > new Date(`${date}T${day.starts_at.slice(0, 5)}:00+08:00`).getTime()));
    rows.push({
      staffId: s.id,
      staffNo: s.staff_no,
      name: s.full_name,
      committee: c?.name ?? null,
      committeeId: s.committee_id,
      isHead: s.is_head,
      timeIn: r?.time_in ?? null,
      timeOut: r?.time_out ?? null,
      inBy: r?.in_by_label?.replace(/ \(.*\)$/, "") ?? null,
      outBy: r?.out_by_label?.replace(/ \(.*\)$/, "") ?? null,
      corrected: r?.in_method === "corrected" || r?.out_method === "corrected",
      note: r?.note ?? null,
      flags: { ...flags, noShow: !!started && s.status === "active" && !r?.time_in },
    });
  }
  return { rows, day: day ?? null };
}
