import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { notifyAdmins } from "@/lib/server/notify";
import { afterSessionOpened } from "@/lib/server/sessions";

const schema = z.object({ action: z.enum(["approve", "decline"]), note: z.string().trim().max(200).optional() });

// Admin / Head admin answers an open-session request: approve (opens the session) or decline.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/session-requests/[rid]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { rid } = await ctx.params;
  const { action, note } = await readJson(req, schema);
  const actor = actorOf(admin);

  const { data: r } = await db()
    .from("session_requests")
    .select("id, status, session_id, requested_by, attendance_sessions(id, title, status)")
    .eq("id", rid)
    .maybeSingle();
  if (!r) throw new HttpError(404, "This request no longer exists.");
  const s = r.attendance_sessions as unknown as { id: string; title: string; status: string };
  if (r.status !== "pending") return ok({ already: r.status });

  if (action === "approve") {
    if (s.status !== "open") {
      await db().from("attendance_sessions").update({ status: "open", closed_at: null }).eq("id", s.id);
      await audit(actor, {
        action: s.status === "closed" ? "session.reopened" : "session.opened",
        targetType: "session",
        targetId: s.id,
        targetLabel: s.title,
        before: { status: s.status },
        after: { status: "open" },
      });
    }
    await afterSessionOpened(s, actor);
    return ok({ opened: true });
  }

  const { data: updated } = await db()
    .from("session_requests")
    .update({ status: "declined", handled_by: admin.id, handled_by_label: actor.label, handled_note: note || null, handled_at: new Date().toISOString() })
    .eq("id", rid)
    .eq("status", "pending")
    .select("id");
  if (updated?.length) {
    await notifyAdmins([r.requested_by], {
      kind: "request.declined",
      title: `Your request to open “${s.title}” was declined`,
      body: note ? `${admin.display_name}: ${note}` : `Declined by ${admin.display_name}.`,
      link: `/admin/attendance/${s.id}`,
    });
  }
  return ok({ declined: true });
});
