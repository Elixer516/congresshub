import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, confirmPin, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { newQrToken } from "@/lib/server/crypto";
import { readableBadge } from "@/lib/server/qr";

// Replace the QR code: the old badge stops working at once.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/qr">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  const { pin } = await readJson(req, z.object({ pin: z.string() }));
  await confirmPin(admin, pin);

  const { data: m } = await db().from("members").select("id, member_no, last_name, first_name").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "This member no longer exists.");

  const { token, mask } = readableBadge(newQrToken);
  const { error } = await db().from("members").update({ qr_token: token, qr_mask: mask }).eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), {
    action: "member.qr_replaced",
    targetType: "member",
    targetId: id,
    targetLabel: `${m.last_name}, ${m.first_name} (${m.member_no})`,
  });
  return ok();
});
