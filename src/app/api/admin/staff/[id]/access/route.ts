import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, forgetAdmin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { hashPin } from "@/lib/server/crypto";
import { randomPin } from "@/lib/pin-hash";

const RANKS = ["head_admin", "admin", "secretariat", "transportation", "committee_head"] as const;

const schema = z.discriminatedUnion("action", [
  // No account yet: create one linked to this person.
  z.object({
    action: z.literal("create"),
    role: z.enum(RANKS),
    loginId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, "Use 3–32 letters, numbers, dots, dashes or underscores (no spaces)."),
    pin: z.string(),
  }),
  // Has an account: change the rank.
  z.object({ action: z.literal("rank"), role: z.enum(RANKS), pin: z.string() }),
  // Turn sign-in off or back on.
  z.object({ action: z.literal("active"), active: z.boolean(), pin: z.string() }),
]);

// Head admin gives a Working Committee member a sign-in, or changes their rank, from their profile.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]/access">) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Not found.");
  const body = await readJson(req, schema);
  await confirmPin(admin, body.pin);

  const { data: s } = await db().from("committee_staff").select("id, full_name, staff_no, committee_id").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "This person no longer exists.");
  if ("role" in body && body.role === "committee_head" && !s.committee_id) {
    throw new HttpError(400, "Put them in a committee first (Edit), then make them its head.");
  }
  const committeeId = "role" in body && body.role === "committee_head" ? s.committee_id : null;
  const { data: acct } = await db().from("admins").select("id, login_id, role, is_active, session_version").eq("staff_id", id).maybeSingle();
  const actor = actorOf(admin);

  if (body.action === "create") {
    if (acct) throw new HttpError(400, "They already have a sign-in. Change their rank instead.");
    const { data: taken } = await db().from("admins").select("id").eq("login_id", body.loginId).maybeSingle();
    if (taken) throw new HttpError(400, "That sign-in ID is already taken.", { loginId: "That sign-in ID is already taken." });
    const temp = randomPin();
    const { data, error } = await db()
      .from("admins")
      .insert({ login_id: body.loginId, display_name: s.full_name, role: body.role, committee_id: committeeId, staff_id: id, pin_hash: await hashPin(temp), pin_must_change: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (body.role === "committee_head") await db().from("committee_staff").update({ is_head: true }).eq("id", id);
    await audit(actor, { action: "admin.created", targetType: "admin", targetId: data.id, targetLabel: `${s.full_name} (${body.loginId})`, after: { role: body.role, staff_no: s.staff_no } });
    return ok({ tempPin: temp, loginId: body.loginId });
  }

  if (!acct) throw new HttpError(400, "They don't have a sign-in yet.");
  if (acct.id === admin.id) throw new HttpError(400, "You can't change your own rank here.");
  forgetAdmin(acct.id);
  const label = `${s.full_name} (${acct.login_id})`;
  const headAdminsLeft = async () =>
    (await db().from("admins").select("id", { count: "exact", head: true }).eq("role", "head_admin").eq("is_active", true).neq("id", acct.id)).count ?? 0;

  if (body.action === "rank") {
    if (acct.role === body.role) return ok();
    if (acct.role === "head_admin" && (await headAdminsLeft()) === 0) throw new HttpError(400, "There must always be at least one head admin.");
    // Changing a rank signs them out so the new access applies at once.
    await db().from("admins").update({ role: body.role, committee_id: committeeId, session_version: (acct.session_version ?? 1) + 1 }).eq("id", acct.id);
    // Committee head ↔ the HEAD mark on their staff record follow each other.
    if (body.role === "committee_head") await db().from("committee_staff").update({ is_head: true }).eq("id", id);
    else if (acct.role === "committee_head") await db().from("committee_staff").update({ is_head: false }).eq("id", id);
    await audit(actor, { action: "admin.edited", targetType: "admin", targetId: acct.id, targetLabel: label, before: { role: acct.role }, after: { role: body.role } });
    return ok();
  }

  if (acct.is_active === body.active) return ok();
  if (!body.active && acct.role === "head_admin" && (await headAdminsLeft()) === 0) throw new HttpError(400, "There must always be at least one head admin.");
  await db().from("admins").update({ is_active: body.active, session_version: (acct.session_version ?? 1) + 1 }).eq("id", acct.id);
  await audit(actor, { action: "admin.edited", targetType: "admin", targetId: acct.id, targetLabel: label, before: { is_active: acct.is_active }, after: { is_active: body.active } });
  return ok();
});
