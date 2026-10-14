import "server-only";
import { db } from "./supabase";

let cache: { at: number; values: Record<string, unknown> } | null = null;

// App settings, cached briefly because the scanner reads them on every scan.
export async function getSettings(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.values;
  const { data } = await db().from("settings").select("key, value").neq("key", "gdrive");
  const values = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  cache = { at: Date.now(), values };
  return values;
}

export function clearSettingsCache() {
  cache = null;
}

// Automatic opening lives in ./sessions (it also sends notifications).
export { autoOpenSessions } from "./sessions";

// Sessions that are open right now, counting scheduled ones whose start time has passed.
export function openNowFilter() {
  return `status.eq.open,and(status.eq.scheduled,starts_at.lte.${new Date().toISOString()})`;
}

// What to show for a session's status, even before the automatic opening has been saved.
export function shownStatus(s: { status: string; starts_at: string }) {
  return s.status === "scheduled" && new Date(s.starts_at) <= new Date() ? "open" : s.status;
}
