"use client";

import { SESSION_TYPES } from "@/lib/config";
import { Field, Input, Select } from "@/components/ui";

export type SessionValues = { title: string; type: string; date: string; start: string; end_date: string; end: string; venue: string };

export default function SessionFields({
  values,
  errors,
  onChange,
}: {
  values: SessionValues;
  errors: Record<string, string>;
  onChange: (k: keyof SessionValues, v: string) => void;
}) {
  const input = (k: keyof SessionValues, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={`s-${k}`} value={values[k]} onChange={(e) => onChange(k, e.target.value)} aria-invalid={!!errors[k]} {...extra} />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" htmlFor="s-title" required error={errors.title} className="sm:col-span-2">
        {input("title", { placeholder: "e.g. Diocesan Youth Day 2026" })}
      </Field>
      <Field label="Type" htmlFor="s-type" required error={errors.type}>
        <Select id="s-type" value={values.type} onChange={(e) => onChange("type", e.target.value)}>
          {Object.entries(SESSION_TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Venue" htmlFor="s-venue" error={errors.venue}>
        {input("venue")}
      </Field>
      <Field label="Date" htmlFor="s-date" required error={errors.date}>
        {input("date", { type: "date" })}
      </Field>
      <Field label="Start time" htmlFor="s-start" required error={errors.start}>
        {input("start", { type: "time" })}
      </Field>
      <Field label="End date" htmlFor="s-end_date" error={errors.end_date} hint="Only for sessions that run over several days.">
        {input("end_date", { type: "date" })}
      </Field>
      <Field label="End time" htmlFor="s-end" error={errors.end} hint="Leave blank if there is no set end time.">
        {input("end", { type: "time" })}
      </Field>
    </div>
  );
}
