"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";

// Set (or clear) the expected hours for this day: meetings, preparation days, event days.
export default function DutyDayForm({ date, day }: { date: string; day: { label: string; starts_at: string; ends_at: string } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(day ?? { label: "", starts_at: "", ends_at: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-2 text-sm font-semibold text-primary underline">
        {day ? "Change this day's schedule" : "Set a schedule for this day"}
      </button>
    );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api("/api/admin/duty/days", { body: { duty_date: date, ...v } });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function clear() {
    setBusy(true);
    await api("/api/admin/duty/days", { method: "DELETE", body: { duty_date: date } });
    setBusy(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-4" noValidate>
      {error ? <Alert tone="danger" className="sm:col-span-4">{error}</Alert> : null}
      <Field label="What day is it?" htmlFor="dd-label" required error={errors.label} className="sm:col-span-2">
        <Input id="dd-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="e.g. Preparation meeting, Congress Day 1" />
      </Field>
      <Field label="Expected start" htmlFor="dd-start" required error={errors.starts_at}>
        <Input id="dd-start" type="time" value={v.starts_at} onChange={(e) => setV({ ...v, starts_at: e.target.value })} />
      </Field>
      <Field label="Expected end" htmlFor="dd-end" error={errors.ends_at}>
        <Input id="dd-end" type="time" value={v.ends_at} onChange={(e) => setV({ ...v, ends_at: e.target.value })} />
      </Field>
      <div className="flex gap-2 sm:col-span-4">
        <Button type="submit" busy={busy}>
          Save schedule
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {day ? (
          <Button type="button" variant="ghost" onClick={clear} disabled={busy}>
            Remove schedule
          </Button>
        ) : null}
      </div>
    </form>
  );
}
