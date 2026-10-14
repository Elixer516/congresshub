import { db } from "@/lib/server/supabase";
import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { renderDelegateCard } from "@/lib/server/id-card";
import { regionOf } from "@/lib/config";

// Delegate ID card picture (Youth Congress 2026 design, coloured by region).
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/card">) => {
  await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Delegate not found.");

  const { data: m } = await db()
    .from("members")
    .select("id, member_no, first_name, last_name, diocese, parish_assignment, dynamic_group, community_immersion, qr_token, qr_mask")
    .eq("id", id)
    .maybeSingle();
  if (!m) throw new HttpError(404, "Delegate not found.");


  return renderDelegateCard({
    region: regionOf(m.diocese)?.key ?? null,
    name: `${m.first_name} ${m.last_name}`,
    memberNo: m.member_no,
    diocese: m.diocese,
    parishAssignment: m.parish_assignment,
    dynamicGroup: m.dynamic_group,
    communityImmersion: m.community_immersion,
    qrToken: m.qr_token,
    qrMask: m.qr_mask ?? 0,
    download: new URL(req.url).searchParams.get("download") === "1",
  });
});
