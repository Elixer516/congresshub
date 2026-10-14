import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { env } from "@/lib/server/env";
import { audit } from "@/lib/server/audit";
import { clearDriveTokenCache, ensureRootFolder, saveDriveSetting } from "@/lib/server/gdrive";

// Google sends the admin back here after they allow access.
export const GET = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { role: "head_admin" });
  const url = new URL(req.url);
  const back = (result: string) => NextResponse.redirect(new URL(`/admin/settings?drive=${result}`, env.appUrl));

  const jar = await cookies();
  const expected = jar.get("mspc_drive_state")?.value ?? "";
  jar.delete("mspc_drive_state");
  const state = url.searchParams.get("state") ?? "";
  if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return back("failed");
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: `${env.appUrl}/api/admin/drive/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return back("failed");
  const tokens = (await res.json()) as { refresh_token?: string; id_token?: string };
  if (!tokens.refresh_token) return back("failed");

  // The account email, from the ID token Google just gave us over a direct server connection.
  let email = "Google account";
  try {
    const payload = JSON.parse(Buffer.from(String(tokens.id_token).split(".")[1], "base64url").toString("utf8"));
    if (typeof payload.email === "string") email = payload.email;
  } catch {}

  clearDriveTokenCache();
  await saveDriveSetting({ refresh_token: tokens.refresh_token, email, root_folder_id: null });
  await ensureRootFolder();
  await audit(actorOf(admin), { action: "drive.connected", targetType: "setting", targetLabel: "Google Drive", after: { account: email } });
  return back("connected");
});
