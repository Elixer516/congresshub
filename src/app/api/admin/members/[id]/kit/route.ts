import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

const schema = z.object({ received: z.boolean() });

// Mark a delegate's Youth Congress kit as handed out (or undo a mistake). Secretariat and up.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/kit">) => {
  const admin = await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Delegate not found.");
  const { received } = await readJson(req, schema);
  const { data: m } = await db().from("members").select("id, member_no, last_name, first_name, kit_received_at, kit_received_by").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "This delegate no longer exists.");
  if (!!m.kit_received_at === received) return ok({ already: true, at: m.kit_received_at, by: m.kit_received_by });

  const actor = actorOf(admin);
  const by = admin.display_name;
  const at = received ? new Date().toISOString() : null;
  const { error } = await db().from("members").update({ kit_received_at: at, kit_received_by: received ? by : null }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actor, {
    action: received ? "member.kit_received" : "member.kit_undone",
    targetType: "member",
    targetId: id,
    targetLabel: `${m.last_name}, ${m.first_name} (${m.member_no})`,
  });
  return ok({ at, by: received ? by : null });
});
