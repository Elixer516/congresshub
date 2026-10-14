import { NextResponse } from "next/server";
import { db } from "@/lib/server/supabase";
import { safeNext } from "@/lib/safe-redirect";
import { DEMO_ACCOUNTS } from "@/lib/server/demo-seed";
import { SESSION_COOKIE, SESSION_IDLE_SECONDS, cookieBase, signSession } from "@/lib/session-token";

// CongressHub demo: signs the visitor in as one of the demo accounts (no PIN or two-step code).
export async function POST(req: Request) {
  const form = await req.formData();
  const account = DEMO_ACCOUNTS.find((a) => a.login_id === form.get("account"));
  const url = new URL(req.url);
  if (!account) return NextResponse.redirect(new URL("/admin/sign-in", url), 303);
  await db().from("admins").update({ last_sign_in_at: new Date().toISOString() }).eq("id", account.id);
  const home = account.role === "committee_head" ? "/admin/committee" : account.role === "transportation" ? "/admin/attendance" : "/admin";
  const next = safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : null);
  const res = NextResponse.redirect(new URL(next === "/admin" ? home : next, url), 303);
  const now = Math.floor(Date.now() / 1000);
  res.cookies.set(SESSION_COOKIE, await signSession({ sub: account.id, sv: 1, started: now }), { ...cookieBase, maxAge: SESSION_IDLE_SECONDS });
  return res;
}
