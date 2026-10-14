// Turns audit entries into plain sentences. Internal values (IDs, storage paths, tokens) are never shown.
import { APPLICATION_STATUS_LABELS, MEMBER_STATUS_LABELS, ROLE_LABELS, SESSION_TYPES } from "./config";
import { FIELD_LABELS } from "./schemas";
import { formatDateTime, formatLocalDateTime, formatPlainDate } from "./time";

export const ACTION_TEXT: Record<string, string> = {
  "application.approved": "Approved an application",
  "application.incomplete": "Marked an application incomplete",
  "application.rejected": "Rejected an application",
  "member.created": "Added a delegate",
  "member.edited": "Edited a delegate's details",
  "member.status_changed": "Changed a delegate's status",
  "member.qr_replaced": "Replaced a QR code",
  "member.photo_added": "Added a delegate's photo",
  "member.photo_changed": "Changed a delegate's photo",
  "member.reassigned": "Moved a delegate to another parish, group or immersion place",
  "member.kit_received": "Gave a delegate their Youth Congress kit",
  "member.kit_undone": "Undid a kit hand-out",
  "member.imported": "Imported delegates",
  "member.deleted": "Deleted a delegate for good",
  "session.created": "Created an attendance session",
  "session.edited": "Edited an attendance session",
  "session.opened": "Opened an attendance session",
  "session.reopened": "Reopened an attendance session",
  "session.closed": "Closed an attendance session",
  "scan.removed": "Removed a scan",
  "settings.changed": "Changed a setting",
  "drive.connected": "Connected Google Drive",
  "drive.disconnected": "Disconnected Google Drive",
  "admin.created": "Added an admin",
  "admin.edited": "Changed an admin account",
  "admin.deleted": "Removed an admin",
  "admin.pin_reset": "Reset an admin's PIN",
  "admin.pin_changed": "Changed their own PIN",
  "admin.two_step_enabled": "Set up two-step sign-in",
  "admin.two_step_reset": "Reset an admin's two-step sign-in",
  "admin.locked": "Account locked after wrong PINs",
  "admin.signed_in": "Signed in",
  "staff.created": "Added a Working Committee member",
  "staff.edited": "Edited a Working Committee member",
  "staff.deleted": "Removed a Working Committee member",
  "staff.qr_replaced": "Replaced a staff QR code",
  "staff.photo_changed": "Changed a staff photo",
  "staff.imported": "Imported the Working Committee list",
  "committee.created": "Added a committee",
  "committee.edited": "Changed a committee",
  "deliverable.created": "Added a deliverable",
  "deliverable.edited": "Edited a deliverable",
  "deliverable.status": "Changed a deliverable's status",
  "deliverable.deleted": "Removed a deliverable",
  "deliverable.imported": "Imported deliverables",
  "trip.created": "Added a trip",
  "trip.edited": "Edited a trip",
  "trip.updated": "Posted a trip update",
  "trip.deleted": "Removed a trip",
  "duty.corrected": "Corrected a duty time",
  "duty.day_set": "Set a duty day's hours",
  "duty.day_removed": "Removed a duty day",
};

const HIDDEN = new Set(["id", "committee_id", "staff_id", "qr_token", "qr_mask", "storage_key", "folder_name", "drive_folder_id", "pin_hash", "totp_secret", "refresh_token", "root_folder_id"]);

const EXTRA_LABELS: Record<string, string> = {
  stage: "Time in or out",
  scanned_at: "Scanned at",
  method: "How recorded",
  scanned_by: "Scanned by",
  automatic: "Opened by itself",
  account: "Google account",
  member_no: "Delegate ID",
  title: "Title",
  full_name: "Name",
  is_head: "Committee head",
  shift_start: "Usual start",
  shift_end: "Usual end",
  time_in: "Time in",
  time_out: "Time out",
  starts_at: "Expected start",
  ends_at: "Expected end",
  label: "Day",
  duty_date: "Date",
  origin: "From",
  destination: "To",
  driver: "Driver",
  passengers: "People on board",
  location: "Where",
  parish_assignment: "Parish assignment",
  dynamic_group: "Dynamic group",
  community_immersion: "Community immersion",
  remarks: "Remarks",
};

function valueText(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "status") {
    const s = String(v);
    return (
      (APPLICATION_STATUS_LABELS as Record<string, string>)[s] ??
      (MEMBER_STATUS_LABELS as Record<string, string>)[s] ??
      ({ scheduled: "Scheduled", open: "Open", closed: "Closed" } as Record<string, string>)[s] ??
      s
    );
  }
  if (key === "role") return (ROLE_LABELS as Record<string, string>)[String(v)] ?? String(v);
  if (key === "type") return (SESSION_TYPES as Record<string, string>)[String(v)] ?? String(v);
  if (key === "stage") return v === "in" ? "Time in" : "Time out";
  if (key === "method") return v === "manual" ? "Manual entry" : "QR scan";
  if (key === "file_store") return v === "gdrive" ? "Google Drive" : "Supabase Storage";
  if (key === "birthday" && typeof v === "string") return formatPlainDate(v);
  if ((key === "arrival_eta" || key === "departure_eta") && typeof v === "string") return formatLocalDateTime(v);
  if (key === "has_driver" && typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function labelFor(key: string) {
  return EXTRA_LABELS[key] ?? FIELD_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// "Birthday: May 17, 2004 → May 18, 2004"
export function changeLines(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter((k) => !HIDDEN.has(k));
  return keys.map((k) => {
    const b = before && k in before ? valueText(k, before[k]) : null;
    const a = after && k in after ? valueText(k, after[k]) : null;
    if (b !== null && a !== null) return `${labelFor(k)}: ${b} → ${a}`;
    return `${labelFor(k)}: ${a ?? b}`;
  });
}
