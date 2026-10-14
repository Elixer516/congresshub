import "server-only";
import { db } from "./supabase";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";

// Google Drive storage using the "drive.file" permission: the app can only see
// files and folders it created itself.

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const ROOT_FOLDER_NAME = "MSPC Youth — Member Files";

type DriveSetting = { refresh_token: string; email: string; root_folder_id: string | null };

export async function getDriveSetting(): Promise<DriveSetting | null> {
  const { data } = await db().from("settings").select("value").eq("key", "gdrive").maybeSingle();
  if (!data?.value) return null;
  const v = data.value as DriveSetting;
  return { ...v, refresh_token: decrypt(v.refresh_token) };
}

export async function saveDriveSetting(s: DriveSetting) {
  await db()
    .from("settings")
    .upsert({ key: "gdrive", value: { ...s, refresh_token: encrypt(s.refresh_token) }, updated_at: new Date().toISOString() });
}

export async function removeDriveSetting() {
  await db().from("settings").delete().eq("key", "gdrive");
}

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const s = await getDriveSetting();
  if (!s) throw new Error("Google Drive is not connected");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      refresh_token: s.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google Drive sign-in expired (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export function clearDriveTokenCache() {
  cached = null;
}

async function drive(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`Google Drive error ${res.status}: ${await res.text()}`);
  return res;
}

function q(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name: string, parentId: string | null): Promise<string | null> {
  const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : "");
  const res = await drive(`/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`);
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const res = await drive("/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return ((await res.json()) as { id: string }).id;
}

export async function ensureRootFolder(): Promise<string> {
  const s = await getDriveSetting();
  if (!s) throw new Error("Google Drive is not connected");
  if (s.root_folder_id) return s.root_folder_id;
  const id = (await findFolder(ROOT_FOLDER_NAME, null)) ?? (await createFolder(ROOT_FOLDER_NAME, null));
  await saveDriveSetting({ ...s, root_folder_id: id });
  return id;
}

export async function ensurePersonFolder(folderName: string): Promise<string> {
  const root = await ensureRootFolder();
  return (await findFolder(folderName, root)) ?? (await createFolder(folderName, root));
}

export async function driveUpload(folderId: string, name: string, mime: string, bytes: Uint8Array): Promise<string> {
  const boundary = `mspc${crypto.randomUUID()}`;
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: ${mime}\r\n\r\n`),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await drive("/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

export async function driveDownload(fileId: string): Promise<Uint8Array | null> {
  const res = await drive(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  if (res.status === 404) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function driveDelete(fileId: string) {
  await drive(`/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

export async function driveDeleteFolderIfEmpty(folderId: string) {
  const query = `'${folderId}' in parents and trashed=false`;
  const res = await drive(`/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`);
  const json = (await res.json()) as { files?: { id: string }[] };
  if (!json.files?.length) await driveDelete(folderId);
}
