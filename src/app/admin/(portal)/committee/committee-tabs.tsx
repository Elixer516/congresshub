"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin/committee", label: "Overview" },
  { href: "/admin/committee/deliverables", label: "Deliverables" },
  { href: "/admin/committee/duty", label: "Duty" },
  { href: "/admin/committee/staff", label: "Staff" },
];

export default function CommitteeTabs() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin/committee" ? path === href : path.startsWith(href));
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 rounded-lg bg-surface-2 p-1">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={cx("flex min-h-10 items-center rounded-md px-4 text-sm font-semibold", active(t.href) ? "bg-surface text-primary shadow-sm" : "text-muted hover:text-text")}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
