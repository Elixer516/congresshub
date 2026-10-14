"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api-client";
import SessionFields, { type SessionValues } from "../session-fields";

export type PendingRequest = { id: string; by: string; note: string | null; mine: boolean };

export default function SessionControls({
  id,
  status,
  values: initial,
  canManage,
  pending,
}: {
  id: string;
  status: string;
  values: SessionValues;
  // Head admin / Admin: open, close, edit. Secretariat: can only ask for the session to be opened.
  canManage: boolean;
  pending: PendingRequest | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function act(action: "open" | "close") {
    setBusy(true);
    setError(null);
    const res = await api(`/api/admin/sessions/${id}`, { method: "PATCH", body: { action } });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function requestOpen() {
    setBusy(true);
    setError(null);
    const res = await api<{ already?: boolean; by?: string }>(`/api/admin/sessions/${id}/request-open`, { body: {} });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function answer(action: "approve" | "decline") {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const res = await api(`/api/admin/session-requests/${pending.id}`, { body: { action } });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api(`/api/admin/sessions/${id}`, { method: "PATCH", body: { action: "edit", details: values } });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.error);
      return;
    }
    dialog.current?.close();
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {pending && status !== "open" ? (
        canManage ? (
          <Alert tone="warn">
            <strong>{pending.by}</strong> asked to open this session{pending.note ? `: “${pending.note}”` : "."}
            <span className="mt-2 flex gap-2">
              <Button busy={busy} onClick={() => answer("approve")} className="min-h-9 px-3 text-xs">
                Open now
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => answer("decline")} className="min-h-9 px-3 text-xs">
                Decline
              </Button>
            </span>
          </Alert>
        ) : (
          <Alert tone="info">
            {pending.mine ? "You asked" : `${pending.by} asked`} the admins to open this session. You&apos;ll get a notification when it&apos;s open.
          </Alert>
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        {status === "open" ? (
          <Link href={`/admin/scan/${id}`} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-fg">
            Open scanner
          </Link>
        ) : null}
        {!canManage ? (
          status !== "open" && !pending ? (
            <Button busy={busy} onClick={requestOpen}>
              Ask an admin to open
            </Button>
          ) : null
        ) : status === "open" ? (
          <Button variant="secondary" busy={busy} onClick={() => act("close")}>
            Close session
          </Button>
        ) : (
          <Button busy={busy} onClick={() => act("open")}>
            {status === "closed" ? "Reopen session" : "Open now"}
          </Button>
        )}
        {canManage ? (
          <Button variant="secondary" onClick={() => { setErrors({}); setError(null); dialog.current?.showModal(); }}>
            Edit details
          </Button>
        ) : null}
        <a href={`/api/admin/sessions/${id}/export`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold">
          Download CSV
        </a>
      </div>
      <dialog ref={dialog} className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form onSubmit={saveEdit} className="space-y-4 p-5" noValidate>
          <h2 className="text-lg font-bold">Edit session</h2>
          <SessionFields values={values} errors={errors} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} />
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
    </div>
  );
}
