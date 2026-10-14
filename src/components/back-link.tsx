"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

const KEY = (path: string) => `back:${path}`;

// Remembers the search and filters of each admin page (per tab), so "Back to …" returns to the
// filtered list the person came from. Placed once in the admin layout.
function Remember() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY(pathname), search ? `${pathname}?${search}` : pathname);
    } catch {}
  }, [pathname, search]);
  return null;
}

export function RememberListFilters() {
  return (
    <Suspense fallback={null}>
      <Remember />
    </Suspense>
  );
}

// A clear back button: a rounded pill with an arrow, large enough to tap easily on a phone.
export default function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={(e) => {
        // Plain taps go back to the list as it was left (search, filters, page).
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(KEY(href));
        } catch {}
        if (saved?.startsWith(`${href}?`)) {
          e.preventDefault();
          router.push(saved);
        }
      }}
      className="no-print group mb-3 inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-2 pr-4 text-sm font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-primary-soft"
    >
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="truncate">{label}</span>
    </Link>
  );
}
