import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { notifyRoles } from "@/lib/server/notify";
import { shownStatus } from "@/lib/server/settings";

// Secretariat (or anyone) asks the Admins / Head admins to open a session.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]/request-open">) => {
  const admin = await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  const { note } = await readJson(req, z.object({ note: z.string().trim().max(200).optional() }));

  const { data: s } = await db().from("attendance_sessions").select("id, title, status, starts_at").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "This session no longer exists.");
  if (shownStatus(s) === "open") throw new HttpError(409, "This session is already open. You can start scanning.");

  const { data: existing } = await db().from("session_requests").select("id, requested_by_label").eq("session_id", id).eq("status", "pending").maybeSingle();
  if (existing) return ok({ already: true, by: existing.requested_by_label.replace(/ \(.*\)$/, "") });

  const actor = actorOf(admin);
  const { data: request, error } = await db()
    .from("session_requests")
    .insert({ session_id: id, requested_by: admin.id, requested_by_label: actor.label, note: note || null })
    .select("id")
    .single();
  if (error) {
    // Someone else asked at the same moment.
    if (error.code === "23505") return ok({ already: true });
    throw new Error(error.message);
  }

  await notifyRoles(
    ["head_admin", "admin"],
    {
      kind: "request.open_session",
      title: `${admin.display_name} asks to open “${s.title}”`,
      body: note || "Tap to open the session so scanning can start.",
      link: `/admin/attendance/${id}`,
      requestId: request.id,
    },
    [admin.id],
  );
  return ok({ requested: true });
});
