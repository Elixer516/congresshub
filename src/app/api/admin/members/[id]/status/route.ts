import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

const schema = z.object({
  status: z.enum(["active", "inactive", "suspended"], { error: "Choose a status." }),
  reason: z.string().trim().max(500).optional(),
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/status">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const { status, reason } = await readJson(req, schema);

  const { data: m } = await db().from("members").select("id, status, member_no, last_name, first_name").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "This member no longer exists.");
  if (m.status === status) return ok();

  const { error } = await db().from("members").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "member.status_changed",
    targetType: "member",
    targetId: id,
    targetLabel: `${m.last_name}, ${m.first_name} (${m.member_no})`,
    before: { status: m.status },
    after: { status },
    reason: reason || null,
  });
  return ok();
});
