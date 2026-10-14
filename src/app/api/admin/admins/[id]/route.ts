import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, forgetAdmin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { hashPin } from "@/lib/server/crypto";
import { randomPin } from "@/lib/pin-hash";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("role"), role: z.enum(["head_admin", "admin", "secretariat", "transportation"]), pin: z.string() }),
  z.object({ action: z.literal("committee"), committeeId: z.uuid({ error: "Choose a committee." }), pin: z.string() }),
  z.object({ action: z.literal("active"), active: z.boolean(), pin: z.string() }),
  z.object({ action: z.literal("reset_pin"), pin: z.string() }),
  z.object({ action: z.literal("reset_two_step"), pin: z.string() }),
]);

async function target(id: string) {
  const { data } = await db().from("admins").select("id, login_id, display_name, role, is_active").eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "This admin no longer exists.");
  return data;
}

async function headAdminsLeft(exceptId: string) {
  const { count } = await db().from("admins").select("id", { count: "exact", head: true }).eq("role", "head_admin").eq("is_active", true).neq("id", exceptId);
  return count ?? 0;
}

export const PATCH = handle(async (req: Request, ctx: RouteContext<"/api/admin/admins/[id]">) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, schema);
  await confirmPin(admin, body.pin);
  const t = await target(id);
  forgetAdmin(id);
  const label = `${t.display_name} (${t.login_id})`;
  const actor = actorOf(admin);

  if (id === admin.id && body.action !== "reset_two_step") {
    throw new HttpError(400, "You can't change your own role, access or PIN here. Use Change my PIN, or ask another head admin.");
  }

  if (body.action === "committee") {
    // Make (or keep) them a committee head of this committee.
    const { data: cur } = await db().from("admins").select("session_version, committee_id").eq("id", id).single();
    if (t.role === "head_admin" && (await headAdminsLeft(id)) === 0) throw new HttpError(400, "There must always be at least one head admin.");
    await db().from("admins").update({ role: "committee_head", committee_id: body.committeeId, session_version: (cur?.session_version ?? 1) + 1 }).eq("id", id);
    await audit(actor, { action: "admin.edited", targetType: "admin", targetId: id, targetLabel: label, before: { role: t.role }, after: { role: "committee_head" } });
    return ok();
  }

  if (body.action === "role") {
    if (t.role === body.role) return ok();
    if (t.role === "head_admin" && (await headAdminsLeft(id)) === 0) throw new HttpError(400, "There must always be at least one head admin.");
    // Changing a role signs them out so the new access applies at once.
    const { data: cur } = await db().from("admins").select("session_version").eq("id", id).single();
    await db().from("admins").update({ role: body.role, committee_id: null, session_version: (cur?.session_version ?? 1) + 1 }).eq("id", id);
    await audit(actor, { action: "admin.edited", targetType: "admin", targetId: id, targetLabel: label, before: { role: t.role }, after: { role: body.role } });
    return ok();
  }

  if (body.action === "active") {
    if (t.is_active === body.active) return ok();
    if (!body.active && t.role === "head_admin" && (await headAdminsLeft(id)) === 0) throw new HttpError(400, "There must always be at least one head admin.");
    const { data: cur } = await db().from("admins").select("session_version").eq("id", id).single();
    await db().from("admins").update({ is_active: body.active, session_version: (cur?.session_version ?? 1) + 1 }).eq("id", id);
    await audit(actor, { action: "admin.edited", targetType: "admin", targetId: id, targetLabel: label, before: { is_active: t.is_active }, after: { is_active: body.active } });
    return ok();
  }

  if (body.action === "reset_pin") {
    const temp = randomPin();
    const { data: cur } = await db().from("admins").select("session_version").eq("id", id).single();
    await db()
      .from("admins")
      .update({ pin_hash: await hashPin(temp), pin_must_change: true, failed_attempts: 0, locked_until: null, session_version: (cur?.session_version ?? 1) + 1 })
      .eq("id", id);
    await audit(actor, { action: "admin.pin_reset", targetType: "admin", targetId: id, targetLabel: label });
    return ok({ tempPin: temp });
  }

  // reset_two_step: they set up the authenticator app again at next sign-in; trusted devices are forgotten.
  const { data: cur } = await db().from("admins").select("session_version, totp_version").eq("id", id).single();
  await db()
    .from("admins")
    .update({
      totp_enabled: false,
      totp_secret: null,
      totp_last_step: null,
      totp_version: (cur?.totp_version ?? 1) + 1,
      session_version: (cur?.session_version ?? 1) + 1,
    })
    .eq("id", id);
  await audit(actor, { action: "admin.two_step_reset", targetType: "admin", targetId: id, targetLabel: label });
  return ok();
});

export const DELETE = handle(async (req: Request, ctx: RouteContext<"/api/admin/admins/[id]">) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const { id } = await ctx.params;
  const body = await readJson(req, z.object({ pin: z.string(), reason: z.string().trim().min(3, "Write why this admin is being removed.").max(300) }));
  if (id === admin.id) throw new HttpError(400, "You can't delete your own account.");
  await confirmPin(admin, body.pin);
  const t = await target(id);
  if (t.role === "head_admin" && (await headAdminsLeft(id)) === 0) throw new HttpError(400, "There must always be at least one head admin.");
  forgetAdmin(id);
  const { error } = await db().from("admins").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "admin.deleted",
    targetType: "admin",
    targetId: id,
    targetLabel: `${t.display_name} (${t.login_id})`,
    before: { role: t.role },
    reason: body.reason,
  });
  return ok();
});
