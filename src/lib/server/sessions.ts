import "server-only";
import { db } from "./supabase";
import { audit, type Actor } from "./audit";
import { notifyAdmins, notifyRoles } from "./notify";

type Session = { id: string; title: string; status: string };

// After a session opens: settle any pending open-request and tell the Secretariat they can scan.
export async function afterSessionOpened(s: Session, by: Actor) {
  const { data: pending } = await db()
    .from("session_requests")
    .update({ status: "approved", handled_by: by.id, handled_by_label: by.label, handled_at: new Date().toISOString() })
    .eq("session_id", s.id)
    .eq("status", "pending")
    .select("requested_by");
  const requesters = (pending ?? []).map((r) => r.requested_by);
  await notifyAdmins(requesters, {
    kind: "request.approved",
    title: `Your request was approved: “${s.title}” is open`,
    body: `Opened by ${by.label.replace(/ \(.*\)$/, "")}. You can start scanning.`,
    link: `/admin/scan/${s.id}`,
  });
  // Everyone else in the Secretariat (requesters already got the "approved" notice).
  await notifyRoles(
    ["secretariat", "transportation"],
    { kind: "session.opened", title: `“${s.title}” is now open`, body: "You can start scanning time in and time out.", link: `/admin/scan/${s.id}` },
    requesters,
  );
}

// Opens scheduled sessions whose start time has come, logs it, and notifies the Secretariat.
// Runs at most every 20 s per server; pages run it alongside their own queries.
let lastAutoOpen = 0;
export async function autoOpenSessions() {
  if (Date.now() - lastAutoOpen < 20_000) return;
  lastAutoOpen = Date.now();
  // The update only changes rows still "scheduled", so each session is opened (and announced) once.
  const { data: opened } = await db()
    .from("attendance_sessions")
    .update({ status: "open" })
    .eq("status", "scheduled")
    .lte("starts_at", new Date().toISOString())
    .select("id, title, status");
  for (const s of opened ?? []) {
    await audit({ id: null, label: "System" }, {
      action: "session.opened",
      targetType: "session",
      targetId: s.id,
      targetLabel: s.title,
      before: { status: "scheduled" },
      after: { status: "open", automatic: true },
    });
    await afterSessionOpened(s, { id: null, label: "System (start time)" });
  }
}
