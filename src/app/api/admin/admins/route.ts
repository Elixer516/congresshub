import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { hashPin } from "@/lib/server/crypto";
import { randomPin } from "@/lib/pin-hash";

const schema = z.object({
  loginId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,32}$/, "Use 3–32 letters, numbers, dots, dashes or underscores (no spaces)."),
  name: z.string().trim().min(1, "Enter their name.").max(80),
  role: z.enum(["head_admin", "admin", "secretariat", "transportation", "committee_head"]),
  committeeId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  pin: z.string(),
}).refine((v) => v.role !== "committee_head" || !!v.committeeId, { path: ["committeeId"], message: "Choose which committee they lead." });

// Head admin adds an admin. A temporary PIN is shown once; they must change it at first sign-in.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const body = await readJson(req, schema);
  await confirmPin(admin, body.pin);

  const { data: exists } = await db().from("admins").select("id").eq("login_id", body.loginId).maybeSingle();
  if (exists) throw new HttpError(400, "That admin ID is already taken.", { loginId: "That admin ID is already taken." });

  const temp = randomPin();
  const { data, error } = await db()
    .from("admins")
    .insert({
      login_id: body.loginId,
      display_name: body.name,
      role: body.role,
      committee_id: body.role === "committee_head" ? body.committeeId : null,
      pin_hash: await hashPin(temp),
      pin_must_change: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "admin.created",
    targetType: "admin",
    targetId: data.id,
    targetLabel: `${body.name} (${body.loginId})`,
    after: { role: body.role },
  });
  return ok({ id: data.id, tempPin: temp });
});
