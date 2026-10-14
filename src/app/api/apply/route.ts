import { db } from "@/lib/server/supabase";
import { HttpError, assertSameOrigin } from "@/lib/server/auth";
import { handle, ok, parse } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { randomCode } from "@/lib/server/crypto";
import { detectFileType } from "@/lib/server/file-check";
import { deleteStored, removePersonFolderIfEmpty, saveToPersonFolder } from "@/lib/server/storage";
import { applicationSchema } from "@/lib/schemas";
import { DOCUMENTS, ID_PREFIX, MAX_FILE_BYTES, MAX_REQUEST_BYTES } from "@/lib/config";
import { todayLocal } from "@/lib/time";
import { personFolderName } from "@/lib/folder-name";
import { notifyRoles } from "@/lib/server/notify";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_REQUEST_BYTES + 64 * 1024) {
    throw new HttpError(413, "Your files are too big to send. Please use a smaller photo.");
  }

  const ip = clientIp(req.headers);
  if (!(await rateLimit(`apply:${ip}`, 5, 60 * 60))) {
    throw new HttpError(429, "Too many applications from this connection. Please try again in an hour.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "The form could not be read. Please try again.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("data") ?? ""));
  } catch {
    throw new HttpError(400, "The form could not be read. Please try again.");
  }
  const person = parse(applicationSchema, raw);

  // Check each document by its real contents.
  const uploads = [];
  const fieldErrors: Record<string, string> = {};
  for (const doc of DOCUMENTS) {
    const file = form.get(doc.kind);
    if (!(file instanceof File) || file.size === 0) {
      if (doc.required) fieldErrors[doc.kind] = `Please add your ${doc.label.toLowerCase()}.`;
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      fieldErrors[doc.kind] = "This file is too big. Please use a smaller one.";
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectFileType(bytes);
    if (!type || (doc.imagesOnly && !type.mime.startsWith("image/"))) {
      fieldErrors[doc.kind] = doc.imagesOnly ? "Please use a JPG, PNG or WEBP photo." : "Please use a JPG, PNG, WEBP or PDF file.";
      continue;
    }
    uploads.push({ kind: doc.kind, label: doc.label, name: `${doc.label}.${type.ext}`, mime: type.mime, bytes });
  }
  if (Object.keys(fieldErrors).length) throw new HttpError(400, "Please check the highlighted fields.", fieldErrors);

  // Reference number: MSPCY-YYYYMMDD-XXXX (retry on the rare clash).
  const date = todayLocal().replace(/-/g, "");
  let reference = "";
  for (let i = 0; i < 5; i++) {
    const candidate = `${ID_PREFIX}-${date}-${randomCode(4)}`;
    const { data } = await db().from("applications").select("id").eq("reference_no", candidate).maybeSingle();
    if (!data) {
      reference = candidate;
      break;
    }
  }
  if (!reference) throw new Error("Could not create a reference number");

  const folderName = personFolderName(person.last_name, person.first_name, reference);
  const { consent: _consent, ...details } = person;
  void _consent;

  const stored = await saveToPersonFolder(
    folderName,
    uploads.map((u) => ({ name: u.name, mime: u.mime, bytes: u.bytes })),
  );

  let applicationId: string | null = null;
  try {
    const { data: app, error } = await db()
      .from("applications")
      .insert({
        ...details,
        reference_no: reference,
        folder_name: folderName,
        drive_folder_id: stored.driveFolderId,
        consent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !app) throw new Error(`Could not save application: ${error?.message}`);
    applicationId = app.id;

    const { error: fileError } = await db()
      .from("files")
      .insert(
        uploads.map((u, i) => ({
          application_id: app.id,
          kind: u.kind,
          label: u.label,
          backend: stored.saved[i].backend,
          storage_key: stored.saved[i].key,
          mime: u.mime,
          size_bytes: u.bytes.length,
        })),
      );
    if (fileError) throw new Error(`Could not save file records: ${fileError.message}`);
  } catch (err) {
    // Leave nothing behind.
    if (applicationId) await db().from("applications").delete().eq("id", applicationId);
    await deleteStored(stored.saved);
    await removePersonFolderIfEmpty(stored.driveFolderId);
    throw err;
  }

  await notifyRoles(["head_admin", "admin"], {
    kind: "application.new",
    title: `New application: ${details.first_name} ${details.last_name}`,
    body: `${details.diocese} · ${reference}`,
    link: `/admin/applications/${applicationId}`,
  });

  return ok({ reference });
});
