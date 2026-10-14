"use client";

import { useRouter } from "next/navigation";

// How many rows per page; changing it goes back to page 1.
export default function PageSizeSelect({ value, sizes, links }: { value: number; sizes: number[]; links: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span>Per page</span>
      <select
        value={value}
        onChange={(e) => router.push(links[e.target.value])}
        className="min-h-11 rounded-xl border-0 bg-surface-2 px-3 text-base font-semibold text-text"
      >
        {sizes.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
