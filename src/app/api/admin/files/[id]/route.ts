import { db } from "@/lib/server/supabase";
import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { readStored } from "@/lib/server/storage";
import { fileResponse } from "@/lib/server/file-response";

// Serves one uploaded file. Permission is checked on every request; the file is
// never public and the response is sandboxed so it can't run anything.
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/files/[id]">) => {
  await requireAdminApi(req, { min: "secretariat" });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "File not found.");

  const { data: file } = await db().from("files").select("backend, storage_key, mime, label").eq("id", id).maybeSingle();
  if (!file) throw new HttpError(404, "File not found.");

  const bytes = await readStored({ backend: file.backend, key: file.storage_key });
  if (!bytes) throw new HttpError(404, "The file is missing from storage.");

  return fileResponse(bytes, file.mime, file.label);
});
