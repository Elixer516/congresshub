"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";

export type Assignment = { parish_assignment: string | null; dynamic_group: string | null; community_immersion: string | null; remarks: string | null };
type Option = { value: string; count: number };

// Youth Congress assignment on a delegate's profile, with a dialog to move them (Admin and up).
export default function AssignmentEditor({
  id,
  name,
  current,
  canEdit,
  options,
}: {
  id: string;
  name: string;
  current: Assignment;
  canEdit: boolean;
  options: { parish_assignment: Option[]; dynamic_group: Option[]; community_immersion: Option[] };
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState(current);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function open() {
    setForm(current);
    setReason("");
    setErrors({});
    setError("");
    dialog.current?.showModal();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ changed: number }>(`/api/admin/members/${id}/assignment`, { body: { ...form, reason } });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.fields ? "" : res.error);
      return;
    }
    dialog.current?.close();
    setNotice(res.data.changed ? "Assignment saved. The ID card shows the new details." : "Nothing was changed.");
    router.refresh();
  }

  const rows: [keyof Assignment, string][] = [
    ["parish_assignment", "Parish"],
    ["dynamic_group", "Dynamic group"],
    ["community_immersion", "Community immersion"],
  ];
  const select = (f: "parish_assignment" | "dynamic_group" | "community_immersion", label: string) => (
    <Field label={label} htmlFor={`as-${f}`} error={errors[f]}>
      <Select id={`as-${f}`} value={form[f] ?? ""} onChange={(e) => setForm((x) => ({ ...x, [f]: e.target.value || null }))}>
        <option value="">— Not assigned —</option>
        {options[f].map((o) => (
          <option key={o.value} value={o.value}>
            {f === "dynamic_group" ? `Group ${o.value}` : o.value} ({o.count === 0 ? "new" : `${o.count} now`})
            {o.value === current[f] ? " · current" : ""}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">Youth Congress assignment</h2>
        {canEdit ? (
          <Button variant="secondary" className="min-h-9 px-3 text-sm" onClick={open}>
            Reassign
          </Button>
        ) : null}
      </div>
      {notice ? (
        <Alert tone="ok" className="mb-3">
          {notice}
        </Alert>
      ) : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map(([f, label]) => (
          <div key={f} className="rounded-lg bg-surface-2 px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
            <dd className="text-lg font-bold">{current[f] ? (f === "dynamic_group" ? `Group ${current[f]}` : current[f]) : "—"}</dd>
          </div>
        ))}
      </dl>
      {current.remarks ? <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm">📝 {current.remarks}</p> : null}

      <dialog ref={dialog} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form onSubmit={save} className="space-y-4 p-5" noValidate>
          <div>
            <h2 className="text-lg font-bold">Reassign {name}</h2>
            <p className="text-sm text-muted">The number after each choice is how many delegates are there now.</p>
          </div>
          {select("parish_assignment", "Parish")}
          {select("dynamic_group", "Dynamic group")}
          {select("community_immersion", "Community immersion")}
          <Field label="Remarks" htmlFor="as-remarks" error={errors.remarks} hint="Shown on their profile and in Assignments.">
            <Textarea id="as-remarks" value={form.remarks ?? ""} maxLength={500} onChange={(e) => setForm((x) => ({ ...x, remarks: e.target.value || null }))} />
          </Field>
          <Field label="Reason for the change (for the audit log)" htmlFor="as-reason" error={errors.reason}>
            <Input id="as-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. asked to be with their diocese mate" />
          </Field>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Save
            </Button>
          </div>
        </form>
      </dialog>
    </Card>
  );
}
