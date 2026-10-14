// Only allow redirects to our own admin pages, never to another site.
export function safeNext(next: string | null | undefined, fallback = "/admin"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(next) || next.includes("\\")) return fallback;
  try {
    const url = new URL(next, "http://local.invalid");
    if (url.origin !== "http://local.invalid") return fallback;
    if (!url.pathname.startsWith("/admin") || url.pathname.startsWith("/admin/sign-in")) return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}
