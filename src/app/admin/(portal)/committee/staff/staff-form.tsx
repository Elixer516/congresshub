"use client";

import { DIOCESES, SHIRT_SIZES } from "@/lib/config";
import { Field, Input, Select } from "@/components/ui";

export type StaffValues = { full_name: string; committee_id: string; is_head: boolean; diocese: string; contact_number: string; shirt_size: string };
export const EMPTY_STAFF: StaffValues = { full_name: "", committee_id: "", is_head: false, diocese: "Archdiocese of Davao", contact_number: "", shirt_size: "" };

export default function StaffFields({
  v,
  set,
  errors,
  committees,
}: {
  v: StaffValues;
  set: (k: keyof StaffValues, value: string | boolean) => void;
  errors: Record<string, string>;
  committees: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="st-name" required error={errors.full_name} className="sm:col-span-2">
        <Input id="st-name" value={v.full_name} onChange={(e) => set("full_name", e.target.value)} placeholder="e.g. Juan C. Dela Cruz" />
      </Field>
      <Field label="Committee" htmlFor="st-committee" error={errors.committee_id}>
        <Select id="st-committee" value={v.committee_id} onChange={(e) => set("committee_id", e.target.value)}>
          <option value="">None</option>
          {committees.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 self-end pb-3 text-sm">
        <input type="checkbox" checked={v.is_head} onChange={(e) => set("is_head", e.target.checked)} className="size-4" />
        Committee head
      </label>
      <Field label="Arch/Diocese" htmlFor="st-diocese" error={errors.diocese}>
        <Select id="st-diocese" value={v.diocese} onChange={(e) => set("diocese", e.target.value)}>
          <option value="">Not set</option>
          {DIOCESES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Contact #" htmlFor="st-contact" error={errors.contact_number}>
        <Input id="st-contact" type="tel" inputMode="tel" value={v.contact_number} onChange={(e) => set("contact_number", e.target.value)} />
      </Field>
      <Field label="T-shirt size" htmlFor="st-shirt" error={errors.shirt_size}>
        <Select id="st-shirt" value={v.shirt_size} onChange={(e) => set("shirt_size", e.target.value)}>
          <option value="">Not set</option>
          {SHIRT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
