import { db } from "@/lib/server/supabase";
import { HttpError, actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { deleteStored, readStored, saveToPersonFolder } from "@/lib/server/storage";
import { fileResponse } from "@/lib/server/file-response";
import { detectFileType } from "@/lib/server/file-check";
import { audit } from "@/lib/server/audit";
import { MAX_FILE_BYTES, MAX_REQUEST_BYTES } from "@/lib/config";
import { NO_PHOTO_SVG } from "@/lib/no-photo";

function noPhoto() {
  return new Response(NO_PHOTO_SVG, {
    headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=300", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "x-content-type-options": "nosniff" },
  });
}

// A Working Committee member's photo (for their badge, ID card and the duty scanner).
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]/photo">) => {
  await requireAdminApi(req);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return noPhoto();
  const { data: file } = await db().from("files").select("backend, storage_key, mime, label").eq("staff_id", id).eq("kind", "photo").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!file) return noPhoto();
  const bytes = await readStored({ backend: file.backend, key: file.storage_key });
  if (!bytes) return noPhoto();
  const res = fileResponse(bytes, file.mime, file.label);
  res.headers.set("cache-control", "private, max-age=300");
  return res;
});

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/staff/[id]/photo">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) throw new HttpError(413, "This photo is too big. Please use a smaller one.");
  const { data: s } = await db().from("committee_staff").select("id, staff_no, full_name").eq("id", id).maybeSingle();
  if (!s) throw new HttpError(404, "This person is no longer on the list.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a photo first.");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, "This photo is too big. Please use a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(bytes);
  if (!type || !type.mime.startsWith("image/")) throw new HttpError(400, "Please use a JPG, PNG or WEBP photo.");

  const { data: old } = await db().from("files").select("id, backend, storage_key").eq("staff_id", id).eq("kind", "photo");
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const folder = `WORKING COMMITTEE - ${s.full_name.toUpperCase()} — ${s.staff_no}`;
  const stored = await saveToPersonFolder(folder, [{ name: `ID Photo ${stamp}.${type.ext}`, mime: type.mime, bytes }]);
  const { error } = await db().from("files").insert({ staff_id: id, kind: "photo", label: "ID Photo", backend: stored.saved[0].backend, storage_key: stored.saved[0].key, mime: type.mime, size_bytes: bytes.length });
  if (error) {
    await deleteStored(stored.saved);
    throw new Error(error.message);
  }
  if (old?.length) {
    await db().from("files").delete().in("id", old.map((f) => f.id));
    await deleteStored(old.map((f) => ({ backend: f.backend, key: f.storage_key })));
  }
  await audit(actorOf(admin), { action: "staff.photo_changed", targetType: "staff", targetId: id, targetLabel: `${s.full_name} (${s.staff_no})` });
  return ok({ version: stamp });
});
