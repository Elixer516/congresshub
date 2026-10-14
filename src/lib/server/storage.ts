import "server-only";
import { db } from "./supabase";
import { storageSafe } from "../folder-name";
import { driveDelete, driveDeleteFolderIfEmpty, driveDownload, driveUpload, ensurePersonFolder, getDriveSetting } from "./gdrive";

// Files live in Google Drive when it's connected and chosen in Settings, otherwise in
// Supabase Storage (private bucket). Either way they're only served through /api/admin/files.

const BUCKET = "member-files";
export type Backend = "supabase" | "gdrive";

export async function activeBackend(): Promise<Backend> {
  const { data } = await db().from("settings").select("value").eq("key", "file_store").maybeSingle();
  if (data?.value === "gdrive" && (await getDriveSetting())) return "gdrive";
  return "supabase";
}

export type StoredFile = { backend: Backend; key: string };
export type NewFile = { name: string; mime: string; bytes: Uint8Array };

// Saves all files into the person's folder. If any fails, removes the ones already saved.
export async function saveToPersonFolder(folderName: string, files: NewFile[]) {
  const backend = await activeBackend();
  const saved: StoredFile[] = [];
  let driveFolderId: string | null = null;
  try {
    if (backend === "gdrive") {
      driveFolderId = await ensurePersonFolder(folderName);
      for (const f of files) saved.push({ backend, key: await driveUpload(driveFolderId, f.name, f.mime, f.bytes) });
    } else {
      const folder = storageSafe(folderName);
      for (const f of files) {
        const key = `${folder}/${storageSafe(f.name)}`;
        const { error } = await db().storage.from(BUCKET).upload(key, f.bytes, { contentType: f.mime, upsert: false });
        if (error) throw new Error(`Storage upload failed: ${error.message}`);
        saved.push({ backend, key });
      }
    }
    return { backend, saved, driveFolderId };
  } catch (err) {
    await deleteStored(saved);
    if (driveFolderId) await driveDeleteFolderIfEmpty(driveFolderId).catch(() => {});
    throw err;
  }
}

export async function readStored(f: StoredFile): Promise<Uint8Array | null> {
  if (f.backend === "gdrive") return driveDownload(f.key);
  const { data, error } = await db().storage.from(BUCKET).download(f.key);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

// Best effort: logs anything it can't remove instead of failing the whole action.
export async function deleteStored(files: StoredFile[]) {
  const supa = files.filter((f) => f.backend === "supabase").map((f) => f.key);
  if (supa.length) {
    const { error } = await db().storage.from(BUCKET).remove(supa);
    if (error) console.error("Could not remove stored files", error.message);
  }
  for (const f of files.filter((f) => f.backend === "gdrive")) {
    await driveDelete(f.key).catch((e) => console.error("Could not remove Drive file", e));
  }
}

// Supabase folders vanish when empty; Drive folders are removed if nothing is left inside.
export async function removePersonFolderIfEmpty(driveFolderId: string | null) {
  if (driveFolderId) await driveDeleteFolderIfEmpty(driveFolderId).catch((e) => console.error("Could not remove Drive folder", e));
}
