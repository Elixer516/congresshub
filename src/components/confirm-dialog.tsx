"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Field, Input, Textarea } from "./ui";

// A modal that collects an optional note/reason and, for irreversible actions, the admin's PIN.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  askPin,
  noteLabel,
  noteRequired,
  notePlaceholder,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  askPin?: boolean;
  noteLabel?: string;
  noteRequired?: boolean;
  notePlaceholder?: string;
  onCancel: () => void;
  // Return an error message to keep the dialog open.
  onConfirm: (v: { pin: string; note: string }) => Promise<{ error?: string; fields?: Record<string, string> } | void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPin("");
      setNote("");
      setError(null);
      setFields({});
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (noteLabel && noteRequired && note.trim().length < 3) {
      setFields({ note: "Please write a few words." });
      return;
    }
    if (askPin && !/^\d{6}$/.test(pin)) {
      setFields({ pin: "Enter your 6-digit PIN." });
      return;
    }
    setBusy(true);
    setError(null);
    setFields({});
    const res = await onConfirm({ pin, note: note.trim() });
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      setFields(res.fields ?? {});
      setPin("");
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <h2 className="text-lg font-bold">{title}</h2>
        {children ? <div className="text-sm text-muted">{children}</div> : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {noteLabel ? (
          <Field label={noteLabel} htmlFor="confirm-note" required={noteRequired} error={fields.note}>
            <Textarea id="confirm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={notePlaceholder} maxLength={500} />
          </Field>
        ) : null}
        {askPin ? (
          <Field label="Your PIN" htmlFor="confirm-pin" required error={fields.pin} hint="Demo PIN: 123456">
            <Input
              id="confirm-pin"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="tracking-[0.4em]"
            />
          </Field>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
