import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { sessionSchema } from "@/lib/session-form";
import { afterSessionOpened } from "@/lib/server/sessions";

const schema = z.union([
  z.object({ action: z.enum(["open", "close"]) }),
  z.object({ action: z.literal("edit"), details: z.unknown() }),
]);

// Open, close or reopen a session by hand, or change its details.
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  const { data: s } = await db().from("attendance_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "This session no longer exists.");

  if (body.action === "edit") {
    const parsed = sessionSchema.safeParse(body.details);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const i of parsed.error.issues) fields[i.path.join(".")] ??= i.message;
      throw new HttpError(400, "Please check the highlighted fields.", fields);
    }
    const changes = diff(s, parsed.data);
    if (!changes.changed.length) return ok();
    await db().from("attendance_sessions").update(changes.after).eq("id", id);
    await audit(actorOf(admin), { action: "session.edited", targetType: "session", targetId: id, targetLabel: parsed.data.title, before: changes.before, after: changes.after });
    return ok();
  }

  const status = body.action === "open" ? "open" : "closed";
  if (s.status === status) return ok();
  await db()
    .from("attendance_sessions")
    .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
    .eq("id", id);
  await audit(actorOf(admin), {
    action: status === "open" ? (s.status === "closed" ? "session.reopened" : "session.opened") : "session.closed",
    targetType: "session",
    targetId: id,
    targetLabel: s.title,
    before: { status: s.status },
    after: { status },
  });
  if (status === "open") await afterSessionOpened(s, actorOf(admin));
  return ok();
});
