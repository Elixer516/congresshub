// PIN hashing (scrypt). Shared by the server and the setup scripts; never import in the browser.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// Stored as "scrypt$<salt>$<hash>".
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scryptAsync(pin, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(actual, expected);
}

// A random 6-digit PIN that isn't trivially guessable.
export function randomPin(): string {
  for (;;) {
    const pin = String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
    if (!/^(\d)\1{5}$/.test(pin) && pin !== "123456" && pin !== "654321") return pin;
  }
}
