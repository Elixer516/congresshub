import Link from "next/link";
import type { ReactNode } from "react";
import { cx, inputClass } from "./ui";
import AutoSubmitForm from "./auto-submit-form";

// Server-rendered list controls: plain links and GET forms, so they work without extra scripts.

export function Tabs({ tabs }: { tabs: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 rounded-lg bg-surface-2 p-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cx(
              "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold",
              t.active ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className="rounded-full bg-surface-2 px-2 text-xs text-muted">{t.count}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SearchForm({
  action,
  q,
  placeholder,
  hidden = {},
  clearHref,
  children,
}: {
  action: string;
  q: string;
  placeholder: string;
  hidden?: Record<string, string>;
  clearHref?: string | null; // shown as "Clear filters" when set
  children?: ReactNode;
}) {
  return (
    <AutoSubmitForm action={action} className="mb-4 rounded-xl border border-border bg-surface p-3 sm:p-4">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder} className={cx(inputClass, "pl-10")} type="search" />
        </div>
        <button className="min-h-11 shrink-0 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-fg">Search</button>
      </div>
      {children ? <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">{children}</div> : null}
      {clearHref ? (
        <div className="mt-3 flex justify-end">
          <Link href={clearHref} className="text-sm font-semibold text-primary underline">
            Clear filters
          </Link>
        </div>
      ) : null}
    </AutoSubmitForm>
  );
}

// A labelled filter inside SearchForm. Picked filters are highlighted.
export function Filter({ label, active, children }: { label: string; active?: boolean; children: ReactNode }) {
  return (
    <label className={cx("block min-w-0", active && "[&_select]:border-primary [&_select]:bg-primary-soft [&_select]:font-semibold [&_select]:text-primary")}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted">{children}</div>;
}
