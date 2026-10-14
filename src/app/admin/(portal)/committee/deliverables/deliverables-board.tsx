"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Empty } from "@/components/list-controls";
import { Alert, Button, Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";
import { api } from "@/lib/api-client";
import { DELIVERABLE_STATUS, type DeliverableStatus } from "@/lib/config";
import { formatDateTime } from "@/lib/time";

export type DeliverableItem = {
  id: string;
  name: string;
  status: string;
  deadline: string | null;
  deadlineLocal: string;
  link: string | null;
  notes: string | null;
  committeeId: string | null;
  committeeName: string | null;
  staffId: string | null;
  staffName: string | null;
  updatedBy: string | null;
  updatedAt: string;
  editable: boolean;
  history: { by: string; summary: string; at: string }[];
};

const STATUS_STYLE: Record<DeliverableStatus, string> = {
  not_started: "border-border bg-surface-2 text-muted",
  ongoing: "border-warn/40 bg-warn-soft text-warn",
  done: "border-ok/40 bg-ok-soft text-ok",
};

type Form = { name: string; deadline: string; link: string; status: string; committee_id: string; staff_id: string; notes: string };
const EMPTY: Form = { name: "", deadline: "", link: "", status: "not_started", committee_id: "", staff_id: "", notes: "" };

export default function DeliverablesBoard({
  now,
  items,
  canManage,
  committees,
  staff,
}: {
  now: number;
  items: DeliverableItem[];
  canManage: boolean;
  committees: { id: string; name: string }[];
  staff: { id: string; full_name: string; committee_id: string | null }[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [noteFor, setNoteFor] = useState<DeliverableItem | null>(null);
  const [deleting, setDeleting] = useState<DeliverableItem | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(
      (d) => (!status || d.status === status) && words.every((w) => `${d.name} ${d.committeeName ?? ""} ${d.staffName ?? ""}`.toLowerCase().includes(w)),
    );
  }, [items, q, status]);

  async function setItemStatus(d: DeliverableItem, s: string) {
    setBusy(d.id);
    setError(null);
    const res = await api(`/api/admin/deliverables/${d.id}`, { method: "PATCH", body: { action: "status", status: s } });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  function openForm(d: DeliverableItem | null) {
    setFormErrors({});
    setEditing({
      id: d?.id ?? null,
      form: d
        ? { name: d.name, deadline: d.deadlineLocal, link: d.link ?? "", status: d.status, committee_id: d.committeeId ?? "", staff_id: d.staffId ?? "", notes: d.notes ?? "" }
        : EMPTY,
    });
    setTimeout(() => dialog.current?.showModal());
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy("form");
    const res = editing.id
      ? await api(`/api/admin/deliverables/${editing.id}`, { method: "PATCH", body: { action: "edit", details: editing.form } })
      : await api("/api/admin/deliverables", { body: editing.form });
    setBusy(null);
    if (!res.ok) {
      setFormErrors(res.fields ?? {});
      setError(res.error);
      return;
    }
    dialog.current?.close();
    setEditing(null);
    router.refresh();
  }

  const set = (k: keyof Form, v: string) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deliverables" aria-label="Search deliverables" className={cx(inputClass, "min-w-0 sm:flex-1")} />
        <div className="flex gap-2">
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(DELIVERABLE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          {canManage ? (
            <Button onClick={() => openForm(null)} className="shrink-0">
              + Add
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!shown.length ? (
        <Empty>{items.length ? "Nothing matches." : "No deliverables yet."}</Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((d) => {
            const overdue = d.status !== "done" && d.deadline && new Date(d.deadline).getTime() < now;
            const soon = !overdue && d.status !== "done" && d.deadline && new Date(d.deadline).getTime() < now + 3 * 86400000;
            return (
              <li key={d.id} id={`d-${d.id}`} className="scroll-mt-20 rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 sm:flex-1">
                    <p className="font-bold">{d.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      In charge: {d.staffName ?? d.committeeName ?? <span className="italic">not assigned</span>}
                      {d.staffName && d.committeeName ? ` · ${d.committeeName}` : ""}
                    </p>
                    <p className={cx("mt-0.5 text-sm", overdue ? "font-semibold text-danger" : soon ? "font-semibold text-warn" : "text-muted")}>
                      {d.deadline ? `${overdue ? "Overdue — was due" : "Due"} ${formatDateTime(d.deadline)}` : "No deadline"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    {d.link ? (
                      <a href={d.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-primary">
                        Open link ↗
                      </a>
                    ) : null}
                    {d.editable ? (
                      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
                        <Select
                          value={d.status}
                          disabled={busy === d.id}
                          onChange={(e) => setItemStatus(d, e.target.value)}
                          aria-label={`Status of ${d.name}`}
                          className={cx("min-h-10 border font-semibold", STATUS_STYLE[d.status as DeliverableStatus])}
                        >
                          {Object.entries(DELIVERABLE_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <span className={cx("rounded-full border px-3 py-1 text-sm font-semibold", STATUS_STYLE[d.status as DeliverableStatus])}>{DELIVERABLE_STATUS[d.status as DeliverableStatus]}</span>
                    )}
                  </div>
                </div>
                {d.notes ? <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-sm">{d.notes}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  {d.updatedBy ? <span className="basis-full">Last update by {d.updatedBy} · {formatDateTime(d.updatedAt)}</span> : null}
                  {d.history.length ? (
                    <details>
                      <summary className="cursor-pointer underline">History</summary>
                      <ul className="mt-1 space-y-0.5">
                        {d.history.map((h, i) => (
                          <li key={i}>
                            {formatDateTime(h.at)} — {h.by}: {h.summary}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {d.editable && !canManage ? (
                    <button className="font-semibold text-primary underline" onClick={() => setNoteFor(d)}>
                      Update link or notes
                    </button>
                  ) : null}
                  {canManage ? (
                    <>
                      <button className="font-semibold text-primary underline" onClick={() => openForm(d)}>
                        Edit
                      </button>
                      <button className="font-semibold text-danger underline" onClick={() => setDeleting(d)}>
                        Remove
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <dialog ref={dialog} onClose={() => setEditing(null)} className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        {editing ? (
          <form onSubmit={save} className="space-y-4 p-5" noValidate>
            <h2 className="text-lg font-bold">{editing.id ? "Edit deliverable" : "Add deliverable"}</h2>
            <Field label="Deliverable" htmlFor="dv-name" required error={formErrors.name}>
              <Input id="dv-name" value={editing.form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Welcome Banner" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Deadline" htmlFor="dv-deadline" error={formErrors.deadline}>
                <Input id="dv-deadline" type="datetime-local" value={editing.form.deadline} onChange={(e) => set("deadline", e.target.value)} />
              </Field>
              <Field label="Status" htmlFor="dv-status" required>
                <Select id="dv-status" value={editing.form.status} onChange={(e) => set("status", e.target.value)}>
                  {Object.entries(DELIVERABLE_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Link" htmlFor="dv-link" error={formErrors.link} hint="Any link: Canva, Google Drive, Docs, and so on.">
              <Input id="dv-link" type="url" value={editing.form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Committee in charge" htmlFor="dv-committee">
                <Select id="dv-committee" value={editing.form.committee_id} onChange={(e) => set("committee_id", e.target.value)}>
                  <option value="">None</option>
                  {committees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Person in charge" htmlFor="dv-staff">
                <Select id="dv-staff" value={editing.form.staff_id} onChange={(e) => set("staff_id", e.target.value)}>
                  <option value="">None</option>
                  {staff
                    .filter((s) => !editing.form.committee_id || s.committee_id === editing.form.committee_id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes" htmlFor="dv-notes">
              <Textarea id="dv-notes" value={editing.form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" busy={busy === "form"}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </dialog>

      {noteFor ? <LinkNotesDialog item={noteFor} onDone={() => { setNoteFor(null); router.refresh(); }} onCancel={() => setNoteFor(null)} /> : null}

      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Remove “${deleting.name}”?` : ""}
        confirmLabel="Remove"
        danger
        askPin
        onCancel={() => setDeleting(null)}
        onConfirm={async ({ pin }) => {
          const res = await api(`/api/admin/deliverables/${deleting!.id}`, { method: "DELETE", body: { pin } });
          if (!res.ok) return { error: res.error, fields: res.fields };
          setDeleting(null);
          router.refresh();
        }}
      >
        It will disappear from the checklist. This is kept in the audit log.
      </ConfirmDialog>
    </div>
  );
}

// Committee heads: update the link and notes of their own deliverables.
function LinkNotesDialog({ item, onDone, onCancel }: { item: DeliverableItem; onDone: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState(item.link ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      onCancel={onCancel}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form
        className="space-y-4 p-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await api(`/api/admin/deliverables/${item.id}`, { method: "PATCH", body: { action: "update", link, notes } });
          setBusy(false);
          if (!res.ok) {
            setErrors(res.fields ?? { link: res.error });
            return;
          }
          ref.current?.close();
          onDone();
        }}
      >
        <h2 className="text-lg font-bold">{item.name}</h2>
        <Field label="Link" htmlFor="ln-link" error={errors.link}>
          <Input id="ln-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Notes" htmlFor="ln-notes" error={errors.notes}>
          <Textarea id="ln-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { ref.current?.close(); onCancel(); }}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save
          </Button>
        </div>
      </form>
    </dialog>
  );
}
