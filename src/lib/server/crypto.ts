import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";
import { hashPin, verifyPin } from "../pin-hash";

export { hashPin, verifyPin };

// A real hash to compare against when the ID doesn't exist, so timing doesn't reveal it.
let dummyHash: Promise<string> | null = null;
export function dummyPinHash() {
  dummyHash ??= hashPin("000000");
  return dummyHash;
}

// AES-256-GCM for secrets at rest: "v1.<iv>.<tag>.<data>".
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.encryptionKey, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1") throw new Error("Unknown encryption format");
  const decipher = createDecipheriv("aes-256-gcm", env.encryptionKey, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

// Unguessable QR token: 24 random bytes, URL-safe.
export function newQrToken(): string {
  return randomBytes(24).toString("base64url");
}

// Reference number part without look-alike characters (no 0/O, 1/I/L).
const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function randomCode(length: number): string {
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    // Reject bytes that would bias the result.
    if (bytes[i] < 256 - (256 % REF_ALPHABET.length)) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  }
  return out.length === length ? out : randomCode(length);
}
