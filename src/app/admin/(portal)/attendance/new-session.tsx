"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api-client";
import { todayLocal } from "@/lib/time";
import SessionFields, { type SessionValues } from "./session-fields";

export default function NewSession() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<SessionValues>({ title: "", type: "meeting", date: "", start: "", end_date: "", end: "", venue: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function openForm() {
    setValues((v) => ({ ...v, date: v.date || todayLocal() }));
    setErrors({});
    setError(null);
    ref.current?.showModal();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await api<{ id: string }>("/api/admin/sessions", { body: values });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setErrors(res.fields ?? {});
      return;
    }
    ref.current?.close();
    router.push(`/admin/attendance/${res.data.id}`);
  }

  return (
    <>
      <Button onClick={openForm}>New session</Button>
      <dialog ref={ref} className="m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form onSubmit={submit} className="space-y-4 p-5" noValidate>
          <h2 className="text-lg font-bold">New attendance session</h2>
          <p className="text-sm text-muted">It opens by itself at the start time. You can also open it early from its page.</p>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <SessionFields values={values} errors={errors} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => ref.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Create session
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
