import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { clearDriveTokenCache, getDriveSetting, removeDriveSetting } from "@/lib/server/gdrive";
import { clearSettingsCache } from "@/lib/server/settings";

// Disconnect Google Drive. Files already in Drive stay there; new files go to Supabase Storage.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const { pin } = await readJson(req, z.object({ pin: z.string() }));
  await confirmPin(admin, pin);
  const s = await getDriveSetting();
  if (s) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(s.refresh_token)}`, { method: "POST" }).catch(() => {});
  }
  await removeDriveSetting();
  await db().from("settings").upsert({ key: "file_store", value: "supabase", updated_at: new Date().toISOString() });
  clearDriveTokenCache();
  clearSettingsCache();
  await audit(actorOf(admin), { action: "drive.disconnected", targetType: "setting", targetLabel: "Google Drive", before: { account: s?.email ?? null } });
  return ok();
});
