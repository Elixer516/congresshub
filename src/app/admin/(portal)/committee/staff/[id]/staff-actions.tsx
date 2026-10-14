"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Alert, Button } from "@/components/ui";
import { api } from "@/lib/api-client";
import { shrinkImage } from "@/lib/shrink-image";
import StaffFields, { type StaffValues } from "../staff-form";

export default function StaffActions({
  id,
  name,
  status,
  values,
  committees,
}: {
  id: string;
  name: string;
  status: string;
  values: StaffValues;
  committees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const editRef = useRef<HTMLDialogElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"qr" | "delete" | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("edit");
    const res = await api<{ changed: number }>(`/api/admin/staff/${id}`, { method: "PATCH", body: { action: "edit", details: v } });
    setBusy(null);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      return;
    }
    editRef.current?.close();
    setNotice(res.data.changed ? "Saved." : "Nothing was changed.");
    router.refresh();
  }

  async function toggleStatus() {
    setBusy("status");
    const res = await api(`/api/admin/staff/${id}`, { method: "PATCH", body: { action: "status", status: status === "active" ? "inactive" : "active" } });
    setBusy(null);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    setError(null);
    const form = new FormData();
    form.set("photo", await shrinkImage(file, 1000));
    const res = await api(`/api/admin/staff/${id}/photo`, { form, timeoutMs: 60000 });
    setBusy(null);
    if (photoInput.current) photoInput.current.value = "";
    if (!res.ok) setError(res.error);
    else {
      setNotice("Photo saved.");
      router.refresh();
    }
  }

  return (
    <>
      {notice ? <Alert tone="ok" className="mb-3">{notice}</Alert> : null}
      {error ? <Alert tone="danger" className="mb-3">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setErrors({}); setV(values); editRef.current?.showModal(); }}>
          Edit details
        </Button>
        <Button variant="secondary" busy={busy === "photo"} onClick={() => photoInput.current?.click()}>
          Add or change photo
        </Button>
        <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <Button variant="secondary" busy={busy === "status"} onClick={toggleStatus}>
          {status === "active" ? "Mark inactive" : "Mark active"}
        </Button>
        <Button variant="secondary" onClick={() => setDialog("qr")}>
          Replace QR code
        </Button>
        <Button variant="danger" onClick={() => setDialog("delete")}>
          Remove for good
        </Button>
      </div>

      <dialog ref={editRef} className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form onSubmit={save} className="space-y-4 p-5" noValidate>
          <h2 className="text-lg font-bold">Edit {name}</h2>
          <StaffFields v={v} set={(k, val) => setV((x) => ({ ...x, [k]: val }))} errors={errors} committees={committees} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => editRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" busy={busy === "edit"}>
              Save
            </Button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={dialog === "qr"}
        title="Replace QR code?"
        confirmLabel="Make new QR code"
        askPin
        onCancel={() => setDialog(null)}
        onConfirm={async ({ pin }) => {
          const res = await api(`/api/admin/staff/${id}`, { method: "PATCH", body: { action: "replace_qr", pin } });
          if (!res.ok) return { error: res.error, fields: res.fields };
          setDialog(null);
          setNotice("New QR code made. The old badge no longer works — print a new ID card.");
          router.refresh();
        }}
      >
        Use this if a badge was lost or copied. The old badge stops working immediately.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        title={`Remove ${name} for good?`}
        confirmLabel="Remove for good"
        danger
        askPin
        noteLabel="Reason"
        noteRequired
        onCancel={() => setDialog(null)}
        onConfirm={async ({ pin, note }) => {
          const res = await api(`/api/admin/staff/${id}`, { method: "DELETE", body: { pin, reason: note } });
          if (!res.ok) return { error: res.error, fields: res.fields };
          router.replace("/admin/committee/staff");
          router.refresh();
        }}
      >
        Removes them and their duty records. It stays in the audit log.
      </ConfirmDialog>
    </>
  );
}
