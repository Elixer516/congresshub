import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";

const choice = z.string().trim().max(120).nullable();
const schema = z.object({
  parish_assignment: choice,
  dynamic_group: choice,
  community_immersion: choice,
  remarks: z.string().trim().max(500).nullable(),
  reason: z.string().trim().max(300).optional(),
});

// Move a delegate to another dynamic group, community immersion place or host parish (Admin and up).
// Only existing groups / places / parishes can be chosen (plus one new group number), so typos can't create new ones.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/assignment">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Delegate not found.");
  const body = await readJson(req, schema);
  const empty = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const next = {
    parish_assignment: empty(body.parish_assignment),
    dynamic_group: empty(body.dynamic_group),
    community_immersion: empty(body.community_immersion),
    remarks: empty(body.remarks),
  };

  const [{ data: m }, { data: all }] = await Promise.all([
    db().from("members").select("id, member_no, first_name, last_name, parish_assignment, dynamic_group, community_immersion, remarks").eq("id", id).maybeSingle(),
    db().from("members").select("parish_assignment, dynamic_group, community_immersion").limit(5000),
  ]);
  if (!m) throw new HttpError(404, "This delegate no longer exists.");
  const known = (f: "parish_assignment" | "dynamic_group" | "community_immersion") => new Set((all ?? []).map((x) => x[f]).filter(Boolean) as string[]);
  const fields: Record<string, string> = {};
  if (next.parish_assignment && !known("parish_assignment").has(next.parish_assignment)) fields.parish_assignment = "Choose a parish from the list.";
  if (next.community_immersion && !known("community_immersion").has(next.community_immersion)) fields.community_immersion = "Choose a place from the list.";
  if (next.dynamic_group) {
    const groups = [...known("dynamic_group")].map(Number).filter(Number.isFinite);
    const n = Number(next.dynamic_group);
    if (!Number.isInteger(n) || n < 1 || n > Math.max(0, ...groups) + 1) fields.dynamic_group = "Choose a group from the list.";
  }
  if (Object.keys(fields).length) throw new HttpError(400, "Please check the choices.", fields);

  const changes = diff(m, next);
  if (!Object.keys(changes.after ?? {}).length) return ok({ changed: 0 });
  const { error } = await db().from("members").update(next).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "member.reassigned",
    targetType: "member",
    targetId: id,
    targetLabel: `${m.last_name}, ${m.first_name} (${m.member_no})`,
    before: changes.before,
    after: changes.after,
    reason: body.reason || null,
  });
  return ok({ changed: Object.keys(changes.after ?? {}).length });
});
