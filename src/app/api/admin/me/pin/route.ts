import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { hashPin, verifyPin } from "@/lib/server/crypto";
import { HttpError, actorOf, forgetAdmin, recordWrongPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";

const WEAK = new Set(["000000", "111111", "123456", "654321", "121212", "123123", "112233"]);

const schema = z
  .object({
    currentPin: z.string().regex(/^\d{6}$/, "Enter your current 6-digit PIN."),
    newPin: z
      .string()
      .regex(/^\d{6}$/, "Your new PIN must be exactly 6 digits.")
      .refine((p) => !WEAK.has(p) && !/^(\d)\1{5}$/.test(p), "That PIN is too easy to guess. Pick another."),
    confirmPin: z.string(),
  })
  .refine((v) => v.newPin === v.confirmPin, { path: ["confirmPin"], message: "The two new PINs don't match." })
  .refine((v) => v.newPin !== v.currentPin, { path: ["newPin"], message: "Pick a PIN different from your current one." });

// Change your own PIN (required after the head admin resets it).
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { allowPinChange: true, transportation: true });
  const { currentPin, newPin } = await readJson(req, schema);

  const { data } = await db().from("admins").select("pin_hash, failed_attempts").eq("id", admin.id).single();
  if (!data || !(await verifyPin(currentPin, data.pin_hash))) {
    await recordWrongPin(admin.id, actorOf(admin).label, data?.failed_attempts ?? 0);
    throw new HttpError(400, "Your current PIN is not correct.", { currentPin: "Your current PIN is not correct." });
  }

  await db()
    .from("admins")
    .update({ pin_hash: await hashPin(newPin), pin_must_change: false, failed_attempts: 0 })
    .eq("id", admin.id);
  forgetAdmin(admin.id);
  await audit(actorOf(admin), { action: "admin.pin_changed", targetType: "admin", targetId: admin.id, targetLabel: actorOf(admin).label });
  return ok();
});
