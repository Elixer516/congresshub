import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, parse, readJson } from "@/lib/server/http";
import { audit, diff } from "@/lib/server/audit";
import { deleteStored, removePersonFolderIfEmpty } from "@/lib/server/storage";
import { memberEditSchema } from "@/lib/schemas";

// Edit a member's details (PIN confirmed; only changed fields are logged).
export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ details: z.unknown(), pin: z.string() }));
  const details = parse(memberEditSchema, body.details);
  await confirmPin(admin, body.pin);

  const { data: member } = await db().from("members").select("*").eq("id", id).maybeSingle();
  if (!member) throw new HttpError(404, "This member no longer exists.");

  const changes = diff(member, details);
  if (!changes.changed.length) return ok({ changed: 0 });

  const { error } = await db().from("members").update(changes.after).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "member.edited",
    targetType: "member",
    targetId: id,
    targetLabel: `${details.last_name}, ${details.first_name} (${member.member_no})`,
    before: changes.before,
    after: changes.after,
  });
  return ok({ changed: changes.changed.length });
});

// Delete for good: record, application and files (PIN + reason). Kept in the audit log.
export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const body = await readJson(
    req,
    z.object({ pin: z.string(), reason: z.string().trim().min(3, "Write why this member is being deleted.").max(500) }),
  );
  await confirmPin(admin, body.pin);

  const actor = actorOf(admin);
  const { data, error } = await db().rpc("delete_member_forever", {
    p_member_id: id,
    p_admin_id: admin.id,
    p_admin_label: actor.label,
    p_reason: body.reason,
  });
  if (error) throw new Error(error.message);
  if (data?.error === "not_found") throw new HttpError(404, "This member no longer exists.");

  const files = (data.files ?? []) as { backend: "supabase" | "gdrive"; storage_key: string }[];
  await deleteStored(files.map((f) => ({ backend: f.backend, key: f.storage_key })));
  await removePersonFolderIfEmpty(data.drive_folder_id ?? null);
  return ok();
});
