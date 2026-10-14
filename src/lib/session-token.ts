// Signed cookies for admin sign-in. Used by the proxy and by server code.
import { SignJWT, jwtVerify } from "jose";
import { IDLE_MINUTES } from "./config";

export const SESSION_COOKIE = "ch_session";
export const PENDING_COOKIE = "ch_pending";   // PIN accepted, two-step code still needed
export const TRUST_COOKIE = "ch_trusted";     // devices that may skip the two-step code

export const SESSION_IDLE_SECONDS = IDLE_MINUTES * 60;
export const SESSION_MAX_SECONDS = 12 * 60 * 60; // sign in again at least every 12 hours
export const PENDING_SECONDS = 10 * 60;
export const TRUST_SECONDS = 30 * 24 * 60 * 60;

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export type SessionClaims = { sub: string; sv: number; started: number };
export type PendingClaims = { sub: string; sv: number; step: "verify" | "enroll" };
// One cookie can remember several admins who share a phone; each has its own 30-day limit.
export type TrustClaims = { devices: { sub: string; tv: number; until: number }[] };

async function sign(kind: string, payload: Record<string, unknown>, seconds: number) {
  return new SignJWT({ ...payload, kind })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .sign(key());
}

async function verify<T>(kind: string, token: string | undefined): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.kind !== kind) return null;
    return payload as T;
  } catch {
    return null;
  }
}

export function signSession(c: SessionClaims) {
  const left = c.started + SESSION_MAX_SECONDS - Math.floor(Date.now() / 1000);
  return sign("session", c, Math.max(0, Math.min(SESSION_IDLE_SECONDS, left)));
}
export const verifySession = (t?: string) => verify<SessionClaims>("session", t);

export const signPending = (c: PendingClaims) => sign("pending", c, PENDING_SECONDS);
export const verifyPending = (t?: string) => verify<PendingClaims>("pending", t);

export const signTrust = (c: TrustClaims) => sign("trust", c, TRUST_SECONDS);
export const verifyTrust = (t?: string) => verify<TrustClaims>("trust", t);

export const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
