// Browser helper for calling our own server routes.

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; fields?: Record<string, string> };

export async function api<T = unknown>(
  url: string,
  opts: { method?: string; body?: unknown; form?: FormData; timeoutMs?: number } = {},
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers: opts.form ? undefined : opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: controller.signal,
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && url.startsWith("/api/admin")) {
        // Full reload on purpose: clears everything held in memory after sign-out.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/admin/sign-in?next=${encodeURIComponent(window.location.pathname)}`;
      }
      return {
        ok: false,
        status: res.status,
        error: data.error ?? (res.status === 413 ? "The files are too big to send. Please use smaller photos." : "Something went wrong. Please try again."),
        fields: data.fields,
      };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      status: 0,
      error: aborted ? "The connection is too slow. Please try again." : "Can't reach the server. Check your internet connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}
