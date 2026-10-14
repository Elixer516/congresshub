import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { clearSettingsCache } from "@/lib/server/settings";
import { getDriveSetting } from "@/lib/server/gdrive";

const schema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("file_store"), value: z.enum(["supabase", "gdrive"]) }),
  z.object({ key: z.literal("allow_timeout_without_timein"), value: z.boolean() }),
]);

export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const { key, value } = await readJson(req, schema);
  if (key === "file_store" && value === "gdrive" && !(await getDriveSetting())) {
    throw new HttpError(400, "Connect Google Drive first.");
  }
  const { data: old } = await db().from("settings").select("value").eq("key", key).maybeSingle();
  if (old?.value === value) return ok();
  await db().from("settings").upsert({ key, value, updated_at: new Date().toISOString() });
  clearSettingsCache();
  await audit(actorOf(admin), { action: "settings.changed", targetType: "setting", targetLabel: key === "file_store" ? "Where files are kept" : "Time-out without time-in", before: { [key]: old?.value ?? null }, after: { [key]: value } });
  return ok();
});
