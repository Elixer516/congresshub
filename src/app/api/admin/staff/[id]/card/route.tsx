import { db } from "@/lib/server/supabase";
import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { readStored } from "@/lib/server/storage";
import { renderIdCard } from "@/lib/server/id-card";

// Working Committee ID card picture (crimson and gold).
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]/card">) => {
  await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Not found.");
  const { data: s } = await db().from("committee_staff").select("staff_no, full_name, is_head, diocese, qr_token, qr_mask, committees(name)").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "This person is no longer on the list.");
  const { data: photo } = await db().from("files").select("backend, storage_key, mime").eq("staff_id", id).eq("kind", "photo").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const bytes = photo ? await readStored({ backend: photo.backend, key: photo.storage_key }) : null;
  const committee = (s.committees as unknown as { name: string } | null)?.name;

  return renderIdCard({
    theme: "staff",
    name: s.full_name,
    highlight: committee ? `${committee}${s.is_head ? " · Head" : ""}` : null,
    lines: [s.diocese],
    code: s.staff_no,
    qrToken: s.qr_token,
    qrMask: s.qr_mask ?? 0,
    photo: bytes ? { bytes, mime: photo!.mime } : null,
    download: new URL(req.url).searchParams.get("download") === "1",
  });
});
