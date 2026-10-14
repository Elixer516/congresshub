"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

// Chooses what the diocese chart counts: all active members, or who timed in at one session.
export default function ChartPicker({ value, sessions }: { value: string; sessions: { id: string; label: string }[] }) {
  const router = useRouter();
  return (
    <Select
      aria-label="Show"
      value={value}
      className="w-auto max-w-full sm:max-w-72"
      onChange={(e) => router.replace(e.target.value ? `/admin?chart=${e.target.value}` : "/admin", { scroll: false })}
    >
      <option value="">All active delegates</option>
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          Participants: {s.label}
        </option>
      ))}
    </Select>
  );
}
