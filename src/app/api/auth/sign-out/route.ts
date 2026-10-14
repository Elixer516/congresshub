import { cookies } from "next/headers";
import { assertSameOrigin } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { PENDING_COOKIE, SESSION_COOKIE } from "@/lib/session-token";

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_COOKIE);
  return ok();
});
