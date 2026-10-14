import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { env } from "@/lib/server/env";
import { DRIVE_SCOPE } from "@/lib/server/gdrive";
import { cookieBase } from "@/lib/session-token";

// Starts Google sign-in to connect a Drive account (head admin only).
export const GET = handle(async (req: Request) => {
  await requireAdminApi(req, { role: "head_admin" });
  if (!env.googleClientId || !env.googleClientSecret) {
    return NextResponse.redirect(new URL("/admin/settings?drive=not_configured", env.appUrl));
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("mspc_drive_state", state, { ...cookieBase, maxAge: 600 });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/admin/drive/callback`,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return NextResponse.redirect(url);
});
