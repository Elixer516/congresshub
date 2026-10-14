"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
  request: { id: string; status: string; handledBy: string | null } | null;
};

function ago(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const ICON: Record<string, string> = {
  "request.open_session": "🙋",
  "request.approved": "✅",
  "request.declined": "✋",
  "session.opened": "📣",
  "application.new": "📝",
  "security.locked": "🔒",
  "deliverable.assigned": "📌",
  "deliverable.done": "🎉",
  "trip.departed": "🚐",
  "trip.on_the_way": "🛣️",
  "trip.stopover": "⛽",
  "trip.delayed": "⚠️",
  "trip.arrived": "✅",
  "trip.cancelled": "✖️",
};

// Bell with unread count. Checks for new notices every 30 seconds and when the app comes back into view.
export default function NotificationBell({ align = "left" }: { align?: "left" | "right" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [canAnswer, setCanAnswer] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications", { credentials: "same-origin" });
      if (!res.ok) return;
      const d = await res.json();
      setItems(d.items);
      setUnread(d.unread);
      setCanAnswer(d.canAnswer);
    } catch {
      /* offline: try again later */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load of the inbox
    void load();
    const timer = setInterval(load, 30_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  // Close when tapping outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  async function post(url: string, body: unknown) {
    return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  }

  async function markAll() {
    await post("/api/admin/notifications", {});
    void load();
  }

  async function go(n: Item) {
    if (!n.read) await post("/api/admin/notifications", { id: n.id });
    setOpen(false);
    void load();
    if (n.link) router.push(n.link);
  }

  async function answer(n: Item, action: "approve" | "decline") {
    if (!n.request) return;
    setBusy(n.id);
    setError(null);
    const res = await post(`/api/admin/session-requests/${n.request.id}`, { action });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't do that. Please try again.");
      return;
    }
    await post("/api/admin/notifications", { id: n.id });
    void load();
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          void load();
        }}
        className="relative grid size-10 place-items-center rounded-full text-text hover:bg-surface-2"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold leading-5 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className={cx(
            "absolute z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-surface text-text shadow-xl",
            align === "right" ? "right-0" : "left-0",
          )}
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-bold">Notifications</p>
            {unread ? (
              <button onClick={markAll} className="text-xs font-semibold text-primary underline">
                Mark all as read
              </button>
            ) : null}
          </div>
          {error ? <p className="bg-danger-soft px-4 py-2 text-sm text-danger">{error}</p> : null}
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {items.length ? (
              items.map((n) => (
                <li key={n.id} className={cx("px-4 py-3", !n.read && "bg-primary-soft/50")}>
                  <button onClick={() => go(n)} className="flex w-full gap-3 text-left">
                    <span className="text-lg leading-6" aria-hidden>
                      {ICON[n.kind] ?? "🔔"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
                      {n.body ? <span className="mt-0.5 block text-xs text-muted">{n.body}</span> : null}
                      <span className="mt-1 block text-[11px] text-muted">{ago(n.createdAt)}</span>
                    </span>
                    {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                  </button>
                  {n.request && canAnswer ? (
                    n.request.status === "pending" ? (
                      <div className="mt-2 flex gap-2 pl-8">
                        <button
                          onClick={() => answer(n, "approve")}
                          disabled={busy === n.id}
                          className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-fg disabled:opacity-60"
                        >
                          {busy === n.id ? "Opening…" : "Open now"}
                        </button>
                        <button
                          onClick={() => answer(n, "decline")}
                          disabled={busy === n.id}
                          className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 pl-8 text-xs text-muted">
                        {n.request.status === "approved" ? "Opened" : "Declined"}
                        {n.request.handledBy ? ` by ${n.request.handledBy}` : ""}
                      </p>
                    )
                  ) : null}
                </li>
              ))
            ) : (
              <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
