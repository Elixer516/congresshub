import { TIMEZONE } from "./config";

// All dates and times shown in the app are Philippine time.

export function formatTime(d: string | Date) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}

export function formatDate(d: string | Date) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
}

export function formatDateTime(d: string | Date) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

// A plain date (YYYY-MM-DD, e.g. a birthday) shown without shifting days.
export function formatPlainDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

// Today's date in Manila as YYYY-MM-DD.
export function todayLocal(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function localYear(now = new Date()) {
  return Number(todayLocal(now).slice(0, 4));
}

// Manila has no daylight saving: always UTC+8.
export function localToUtc(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+08:00`);
}

export function utcToLocalParts(d: string | Date) {
  const local = new Date(new Date(d).getTime() + 8 * 60 * 60 * 1000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
}

export function ageOn(birthday: string, now = new Date()) {
  const [y, m, d] = birthday.split("-").map(Number);
  const [ty, tm, td] = todayLocal(now).split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

// "2026-10-21T08:30" (already Philippine time, as typed on the form) → "Oct 21, 2026, 8:30 AM".
// Anything else (e.g. imported wording like "Oct 21 morning") is shown as typed.
export function formatLocalDateTime(v: string) {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return v;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])),
  );
}
