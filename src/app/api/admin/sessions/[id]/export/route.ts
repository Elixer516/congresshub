import { db } from "@/lib/server/supabase";
import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { SESSION_TYPES, type SessionType } from "@/lib/config";
import { formatDate, formatTime } from "@/lib/time";

// Stops spreadsheet programs from treating a cell as a formula.
function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]/export">) => {
  await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Session not found.");
  const { data: s } = await db().from("attendance_sessions").select("title, type, starts_at, venue").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "Session not found.");

  const { data: recs } = await db()
    .from("attendance_records")
    .select("member_id, stage, scanned_at, method, was_offline, scanned_by_label, members(member_no, last_name, first_name, diocese, parish, position)")
    .eq("session_id", id)
    .order("scanned_at");

  type Row = { m: Record<string, string>; in?: (typeof recs & object)[number]; out?: (typeof recs & object)[number] };
  const rows = new Map<string, Row>();
  for (const r of recs ?? []) {
    const row = rows.get(r.member_id) ?? { m: r.members as unknown as Record<string, string> };
    row[r.stage as "in" | "out"] = r;
    rows.set(r.member_id, row);
  }
  const sorted = [...rows.values()].sort((a, b) => a.m.last_name.localeCompare(b.m.last_name) || a.m.first_name.localeCompare(b.m.first_name));

  const header = ["Delegate ID", "Last name", "First name", "Position", "Diocese", "Parish", "Time in", "Time out", "Timed in by", "Timed out by", "How recorded"];
  const lines = [
    [`${s.title} — ${SESSION_TYPES[s.type as SessionType]} — ${formatDate(s.starts_at)}${s.venue ? ` — ${s.venue}` : ""}`].map(cell).join(","),
    header.map(cell).join(","),
    ...sorted.map((r) =>
      [
        r.m.member_no,
        r.m.last_name,
        r.m.first_name,
        r.m.position,
        r.m.diocese,
        r.m.parish,
        r.in ? formatTime(r.in.scanned_at) : "",
        r.out ? formatTime(r.out.scanned_at) : "",
        r.in?.scanned_by_label ?? "",
        r.out?.scanned_by_label ?? "",
        [r.in, r.out].some((x) => x?.method === "manual") ? "Includes manual entry" : [r.in, r.out].some((x) => x?.was_offline) ? "QR (some saved offline)" : "QR",
      ]
        .map(cell)
        .join(","),
    ),
  ];
  const name = `${s.title.replace(/[^A-Za-z0-9 -]/g, "").trim() || "attendance"} ${formatDate(s.starts_at).replace(/,/g, "")}.csv`;
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
});
