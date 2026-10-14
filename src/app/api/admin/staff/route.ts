import { db } from "@/lib/server/supabase";
import { actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { newStaffBadge } from "@/lib/server/committee";
import { staffSchema } from "@/lib/committee-forms";

// Add a Working Committee member (gets a staff number and QR badge).
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const v = await readJson(req, staffSchema);
  const { staffNo, token, mask } = await newStaffBadge();
  const { data, error } = await db()
    .from("committee_staff")
    .insert({ ...v, staff_no: staffNo, qr_token: token, qr_mask: mask })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), { action: "staff.created", targetType: "staff", targetId: data.id, targetLabel: `${v.full_name} (${staffNo})` });
  return ok({ id: data.id, staffNo });
});
