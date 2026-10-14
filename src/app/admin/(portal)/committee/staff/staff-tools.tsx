"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import StaffFields, { EMPTY_STAFF, type StaffValues } from "./staff-form";

type Committee = { id: string; name: string; shift_start: string; shift_end: string };

// Head admin / Admin: add people, and manage committees and their usual duty hours.
export default function StaffTools({ committees }: { committees: Committee[] }) {
  const router = useRouter();
  const addRef = useRef<HTMLDialogElement>(null);
  const [v, setV] = useState<StaffValues>(EMPTY_STAFF);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>("/api/admin/staff", { body: v });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.error);
      return;
    }
    addRef.current?.close();
    router.push(`/admin/committee/staff/${res.data.id}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setV(EMPTY_STAFF);
            setErrors({});
            setError(null);
            addRef.current?.showModal();
          }}
        >
          Add person
        </Button>
      </div>

      <details className="rounded-xl border border-border bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Committees and usual duty hours</summary>
        <p className="mt-1 text-sm text-muted">Usual hours flag late arrivals and early leaving. Leave blank to use each day&apos;s schedule instead.</p>
        <ul className="mt-3 space-y-2">
          {committees.map((c) => (
            <CommitteeRow key={c.id} c={c} />
          ))}
          <CommitteeRow c={null} />
        </ul>
      </details>

      <dialog ref={addRef} className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form onSubmit={add} className="space-y-4 p-5" noValidate>
          <h2 className="text-lg font-bold">Add Working Committee member</h2>
          <p className="text-sm text-muted">They get a staff number and a QR badge for duty time in and time out.</p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <StaffFields v={v} set={(k, val) => setV((x) => ({ ...x, [k]: val }))} errors={errors} committees={committees} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => addRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Add
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function CommitteeRow({ c }: { c: Committee | null }) {
  const router = useRouter();
  const [v, setV] = useState({ name: c?.name ?? "", shift_start: c?.shift_start ?? "", shift_end: c?.shift_end ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = !c || v.name !== c.name || v.shift_start !== c.shift_start || v.shift_end !== c.shift_end;

  return (
    <li>
      <form
        className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_8rem_auto]"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await api("/api/admin/committees", { body: { id: c?.id, details: v } });
          setBusy(false);
          if (!res.ok) {
            setErrors(res.fields ?? { name: res.error });
            return;
          }
          setErrors({});
          setSaved(true);
          if (!c) setV({ name: "", shift_start: "", shift_end: "" });
          router.refresh();
        }}
      >
        <Field label={c ? "Committee" : "New committee"} htmlFor={`cm-${c?.id ?? "new"}`} error={errors.name}>
          <Input id={`cm-${c?.id ?? "new"}`} value={v.name} onChange={(e) => { setSaved(false); setV({ ...v, name: e.target.value }); }} placeholder={c ? "" : "e.g. Medical"} />
        </Field>
        <Field label="Usual start" htmlFor={`cs-${c?.id ?? "new"}`} error={errors.shift_start}>
          <Input id={`cs-${c?.id ?? "new"}`} type="time" value={v.shift_start} onChange={(e) => { setSaved(false); setV({ ...v, shift_start: e.target.value }); }} />
        </Field>
        <Field label="Usual end" htmlFor={`ce-${c?.id ?? "new"}`} error={errors.shift_end}>
          <Input id={`ce-${c?.id ?? "new"}`} type="time" value={v.shift_end} onChange={(e) => { setSaved(false); setV({ ...v, shift_end: e.target.value }); }} />
        </Field>
        <Button type="submit" variant={c ? "secondary" : "primary"} busy={busy} disabled={!changed || !v.name.trim()} className="min-h-11">
          {saved && !changed ? "Saved" : c ? "Save" : "Add"}
        </Button>
      </form>
    </li>
  );
}
