import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { hoursText, requireCommitteeAccess } from "@/lib/server/committee";
import { dutyForDate } from "@/lib/server/duty-report";
import { formatTime, todayLocal } from "@/lib/time";

function cell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Daily duty report as CSV.
export const GET = handle(async (req: Request) => {
  const admin = await requireAdminApi(req);
  requireCommitteeAccess(admin);
  const date = new URL(req.url).searchParams.get("date") ?? todayLocal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Choose a date.");
  const { rows, day } = await dutyForDate(date, admin, todayLocal());

  const lines = [
    [`Working Committee duty — ${date}${day ? ` — ${day.label}` : ""}`].map(cell).join(","),
    ["Staff no.", "Name", "Committee", "Time in", "Time out", "Hours", "Late", "Left early", "No-show", "Forgot to time out", "Corrected", "Note"].map(cell).join(","),
    ...rows.map((r) =>
      [
        r.staffNo,
        r.name,
        r.committee ?? "",
        r.timeIn ? formatTime(r.timeIn) : "",
        r.timeOut ? formatTime(r.timeOut) : "",
        hoursText(r.flags.minutes).replace("—", ""),
        r.flags.late ? "Yes" : "",
        r.flags.leftEarly ? "Yes" : "",
        r.flags.noShow ? "Yes" : "",
        r.flags.forgotOut ? "Yes" : "",
        r.corrected ? "Yes" : "",
        r.note ?? "",
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="Working Committee duty ${date}.csv"`, "cache-control": "private, no-store" },
  });
});
