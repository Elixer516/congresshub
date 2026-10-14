import "server-only";
import { db } from "./supabase";
import { HttpError, type Admin } from "./auth";
import { newQrToken } from "./crypto";
import { readableBadge } from "./qr";
import { ID_PREFIX, atLeast } from "../config";
import { todayLocal } from "../time";

export const LATE_GRACE_MINUTES = 10;

// The current time, read once per request on the server (pages pass it down instead of reading the clock while rendering).
export const serverNow = () => Date.now();

// Who may do what in the Working Committee area.
export const can = {
  view: (a: Admin) => a.role !== "transportation" && (a.role !== "committee_head" || !!a.committee_id),
  manage: (a: Admin) => atLeast(a.role, "admin"), // staff, committees, duty days, corrections, all deliverables
  scanDuty: (a: Admin) => atLeast(a.role, "secretariat"),
};

export function requireCommitteeAccess(a: Admin) {
  if (!can.view(a)) throw new HttpError(403, "Your account isn't linked to a committee yet. Ask the head admin.");
}

// Committee heads see only their own committee.
export function committeeScope(a: Admin): string | null {
  return a.role === "committee_head" ? a.committee_id : null;
}

// May this person change this deliverable? Admins: any. Committee heads: their committee's,
// or ones assigned to a person in their committee.
export async function canEditDeliverable(a: Admin, d: { committee_id: string | null; staff_id: string | null }) {
  if (can.manage(a)) return true;
  if (a.role !== "committee_head" || !a.committee_id) return false;
  if (d.committee_id === a.committee_id) return true;
  if (d.staff_id) {
    const { data } = await db().from("committee_staff").select("committee_id").eq("id", d.staff_id).maybeSingle();
    return data?.committee_id === a.committee_id;
  }
  return false;
}

export async function newStaffBadge() {
  const { data: staffNo, error } = await db().rpc("next_staff_no", { p_prefix: ID_PREFIX });
  if (error) throw new Error(error.message);
  const { token, mask } = readableBadge(newQrToken);
  return { staffNo: staffNo as string, token, mask };
}

// Philippine date (YYYY-MM-DD) of a moment.
export const dutyDateOf = (d: Date) => todayLocal(d);

// "07:30:00" on a date → the UTC moment (Manila is UTC+8, no daylight saving).
export function atLocal(date: string, time: string) {
  return new Date(`${date}T${time.slice(0, 5)}:00+08:00`);
}

export type DutyFlags = { late: boolean; leftEarly: boolean; forgotOut: boolean; minutes: number | null };

// Late / left early / forgot to time out, and minutes worked for one record.
export function dutyFlags(
  r: { duty_date: string; time_in: string | null; time_out: string | null },
  expected: { start: string | null; end: string | null },
  today = todayLocal(),
): DutyFlags {
  const minutes = r.time_in && r.time_out ? Math.round((new Date(r.time_out).getTime() - new Date(r.time_in).getTime()) / 60000) : null;
  const late = !!(r.time_in && expected.start && new Date(r.time_in).getTime() > atLocal(r.duty_date, expected.start).getTime() + LATE_GRACE_MINUTES * 60000);
  const leftEarly = !!(r.time_out && expected.end && new Date(r.time_out).getTime() < atLocal(r.duty_date, expected.end).getTime());
  const forgotOut = !!(r.time_in && !r.time_out && r.duty_date < today);
  return { late, leftEarly, forgotOut, minutes };
}

export function hoursText(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}
