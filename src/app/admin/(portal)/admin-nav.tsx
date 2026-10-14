"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { ORG_NAME } from "@/lib/config";
import { Mark, TribalBand } from "@/components/brand";
import NotificationBell from "@/components/notification-bell";
import type { AdminRole } from "@/lib/config";
import SignOutButton from "./sign-out-button";

// show: which ranks see the item (default: everyone).
type Item = { href: string; label: string; icon: string; show?: AdminRole[] };

// Simple inline icons (paths from a 24x24 grid).
const ICONS: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  inbox: "M4 4h16v10h-5l-1 3h-4l-1-3H4zM4 14v6h16v-6",
  people: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 21a9 9 0 0 1 18 0",
  scan: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10",
  log: "M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3",
  team: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 11a2.5 2.5 0 1 0 0-5M3 20a6 6 0 0 1 12 0M15 14.5a5 5 0 0 1 6 5.5",
  bus: "M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 17h14M5 11h14M7 20v-3M17 20v-3M8 14h.01M16 14h.01",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.3 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

const ITEMS: Item[] = [
  { href: "/admin", label: "Dashboard", icon: "home", show: ["head_admin", "admin", "secretariat"] },
  { href: "/admin/applications", label: "Applications", icon: "inbox", show: ["head_admin", "admin"] },
  { href: "/admin/members", label: "Delegates", icon: "people", show: ["head_admin", "admin", "secretariat", "transportation"] },
  { href: "/admin/attendance", label: "Attendance", icon: "scan", show: ["head_admin", "admin", "secretariat", "transportation"] },
  { href: "/admin/assignments", label: "Assignments", icon: "grid", show: ["head_admin", "admin", "secretariat", "transportation"] },
  { href: "/admin/reports", label: "Reports", icon: "chart", show: ["head_admin", "admin", "secretariat"] },
  { href: "/admin/transport", label: "Transport", icon: "bus", show: ["head_admin", "admin", "secretariat", "transportation"] },
  { href: "/admin/committee", label: "Committee", icon: "team", show: ["head_admin", "admin", "secretariat", "committee_head"] },
  { href: "/admin/audit", label: "Audit log", icon: "log", show: ["head_admin"] },
  { href: "/admin/settings", label: "Settings", icon: "gear" },
];

export default function AdminNav({ rank, name, role }: { rank: AdminRole; name: string; role: string }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.show || i.show.includes(rank));
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));
  // Phones: up to 5 tabs fit; with more, show the first 4 and put the rest under "More".
  const tabs = items.length > 5 ? items.slice(0, 4) : items;
  const extra = items.length > 5 ? items.slice(4) : [];
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = extra.some((i) => active(i.href));

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      {/* Computers: sidebar */}
      <aside className="no-print sticky top-0 z-30 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <TribalBand height={10} />
        <div className="flex items-center gap-3 px-5 py-5">
          <Mark className="size-9" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-extrabold text-primary">{ORG_NAME}</p>
            <p className="text-xs text-muted">Admin portal</p>
          </div>
          <NotificationBell align="left" />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                active(i.href) ? "bg-primary-soft text-primary" : "text-text hover:bg-surface-2",
              )}
            >
              <Icon name={i.icon} />
              {i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4 text-sm">
          <p className="font-medium">{name}</p>
          <p className="text-muted">{role}</p>
          <SignOutButton className="mt-3 w-full" />
        </div>
      </aside>

      {/* Phones: top bar with the bell */}
      <header className="no-print fixed inset-x-0 top-0 z-40 flex min-h-14 items-center gap-2 border-b border-border bg-surface px-3 md:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Mark className="size-8" />
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-primary">{ORG_NAME}</p>
        <NotificationBell align="right" />
      </header>

      {/* Phones: bottom tab bar */}
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setMoreOpen(false)}
            className={cx(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              active(i.href) && !moreOpen ? "text-primary" : "text-muted",
            )}
          >
            <Icon name={i.icon} />
            <span className="truncate">{i.label === "Applications" ? "Apps" : i.label === "Audit log" ? "Audit" : i.label}</span>
          </Link>
        ))}
        {extra.length ? (
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-controls="more-menu"
            className={cx(
              "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
              moreOpen || moreActive ? "text-primary" : "text-muted",
            )}
          >
            <Icon name="more" />
            <span>More</span>
          </button>
        ) : null}
      </nav>

      {/* Phones: the "More" sheet */}
      {moreOpen ? (
        <div className="no-print fixed inset-0 z-30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            id="more-menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 rounded-t-2xl border-t border-border bg-surface p-3 shadow-lg"
            style={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom))" }}
          >
            <nav className="space-y-1">
              {extra.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setMoreOpen(false)}
                  className={cx(
                    "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium",
                    active(i.href) ? "bg-primary-soft text-primary" : "text-text hover:bg-surface-2",
                  )}
                >
                  <Icon name={i.icon} />
                  {i.label}
                </Link>
              ))}
            </nav>
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-border px-3 pt-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="text-muted">{role}</p>
              </div>
              <SignOutButton className="shrink-0" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
