import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_IDLE_SECONDS, cookieBase, signSession, verifySession } from "./lib/session-token";

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by React for small layout values.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isAdminPage = pathname.startsWith("/admin") && !pathname.startsWith("/admin/sign-in");
  const isAdminApi = pathname.startsWith("/api/admin");

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (isAdminPage && !session) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/sign-in";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname + search);
  let response: NextResponse;

  if (pathname.startsWith("/api/")) {
    // Server routes set their own headers (files get a sandbox policy); don't overwrite them.
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = contentSecurityPolicy(nonce);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
    response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Content-Security-Policy", csp);
  }

  // Sliding idle timeout: any admin activity pushes the sign-out time back.
  if (session && (isAdminPage || isAdminApi)) {
    const token = await signSession({ sub: session.sub, sv: session.sv, started: session.started });
    response.cookies.set(SESSION_COOKIE, token, { ...cookieBase, maxAge: SESSION_IDLE_SECONDS });
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
