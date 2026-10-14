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
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "private, max-age=300",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
    },
  });
}

// The member's ID photo (used on the record page and the scanner result card).
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/photo">) => {
  await requireAdminApi(req, { min: "secretariat", transportation: true });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return noPhoto();
  const { data: file } = await db()
    .from("files")
    .select("backend, storage_key, mime, label")
    .eq("member_id", id)
    .eq("kind", "photo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!file) return noPhoto();
  const bytes = await readStored({ backend: file.backend, key: file.storage_key });
  if (!bytes) return noPhoto();
  const res = fileResponse(bytes, file.mime, file.label);
  // Photos rarely change; let the scanner reuse them for a few minutes on this device.
  // Pages that just changed a photo add ?v=… so they always get the new one.
  res.headers.set("cache-control", "private, max-age=300");
  return res;
});

// Add or replace a member's photo (admins). The new photo goes into the member's folder;
// the old one is removed.
export const POST = handle(async (req: Request, ctx: RouteContext<"/api/admin/members/[id]/photo">) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "This member no longer exists.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) throw new HttpError(413, "This photo is too big. Please use a smaller one.");

  const { data: m } = await db().from("members").select("id, member_no, last_name, first_name, folder_name").eq("id", id).maybeSingle();
  if (!m) throw new HttpError(404, "This member no longer exists.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, "Choose a photo first.");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(400, "This photo is too big. Please use a smaller one.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectFileType(bytes);
  if (!type || !type.mime.startsWith("image/")) throw new HttpError(400, "Please use a JPG, PNG or WEBP photo.");

  const { data: old } = await db().from("files").select("id, backend, storage_key").eq("member_id", id).eq("kind", "photo");
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const stored = await saveToPersonFolder(m.folder_name, [{ name: `ID Photo ${stamp}.${type.ext}`, mime: type.mime, bytes }]);
  const { error } = await db().from("files").insert({
    member_id: id,
    kind: "photo",
    label: "ID Photo",
    backend: stored.saved[0].backend,
    storage_key: stored.saved[0].key,
    mime: type.mime,
    size_bytes: bytes.length,
  });
  if (error) {
    await deleteStored(stored.saved);
    throw new Error(error.message);
  }
  if (stored.driveFolderId) await db().from("members").update({ drive_folder_id: stored.driveFolderId }).eq("id", id).is("drive_folder_id", null);

  // Remove the previous photo(s).
  if (old?.length) {
    await db().from("files").delete().in("id", old.map((f) => f.id));
    await deleteStored(old.map((f) => ({ backend: f.backend, key: f.storage_key })));
  }

  await audit(actorOf(admin), {
    action: old?.length ? "member.photo_changed" : "member.photo_added",
    targetType: "member",
    targetId: id,
    targetLabel: `${m.last_name}, ${m.first_name} (${m.member_no})`,
  });
  return ok({ version: stamp });
});
