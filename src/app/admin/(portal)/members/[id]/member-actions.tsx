"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import PersonFields, { type PersonValues } from "@/components/person-fields";
import ErrorSummary, { goToFirstError } from "@/components/error-summary";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import { memberEditSchema } from "@/lib/schemas";

type Dialog = "save" | "qr" | "delete" | "inactive" | "active" | "suspended" | null;

export default function MemberActions({
  id,
  name,
  status,
  details,
}: {
  id: string;
  name: string;
  status: string;
  details: PersonValues;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<PersonValues>(details);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function startSave() {
    const r = memberEditSchema.safeParse(values);
    if (!r.success) {
      const e: Record<string, string> = {};
      for (const i of r.error.issues) e[i.path.join(".")] ??= i.message;
      setErrors(e);
      goToFirstError(e);
      return;
    }
    setErrors({});
    setDialog("save");
  }

  async function save(pin: string) {
    const res = await api<{ changed: number }>(`/api/admin/members/${id}`, { method: "PATCH", body: { details: values, pin } });
    if (!res.ok) {
      if (res.fields && !res.fields.pin) {
        setErrors(res.fields);
        setDialog(null);
        goToFirstError(res.fields);
      }
      return { error: res.error, fields: res.fields };
    }
    setDialog(null);
    setEditing(false);
    setNotice(res.data.changed ? `Saved ${res.data.changed} change${res.data.changed === 1 ? "" : "s"}.` : "Nothing was changed.");
    router.refresh();
  }

  async function setStatus(next: string, reason: string) {
    const res = await api(`/api/admin/members/${id}/status`, { body: { status: next, reason } });
    if (!res.ok) return { error: res.error };
    setDialog(null);
    setNotice(`Marked as ${next}.`);
    router.refresh();
  }

  async function replaceQr(pin: string) {
    const res = await api(`/api/admin/members/${id}/qr`, { body: { pin } });
    if (!res.ok) return { error: res.error, fields: res.fields };
    setDialog(null);
    setNotice("New QR code made. The old badge no longer works — print a new ID card.");
    router.refresh();
  }

  async function remove(pin: string, reason: string) {
    const res = await api(`/api/admin/members/${id}`, { method: "DELETE", body: { pin, reason } });
    if (!res.ok) return { error: res.error, fields: res.fields };
    router.replace("/admin/members");
    router.refresh();
  }

  if (editing) {
    return (
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Edit details</h2>
          <Button variant="ghost" onClick={() => { setEditing(false); setValues(details); setErrors({}); }}>
            Cancel
          </Button>
        </div>
        <PersonFields strict={false} values={values} errors={errors} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} />
        <ErrorSummary errors={errors} />
        <div className="mt-4 flex justify-end">
          <Button onClick={startSave}>Save changes</Button>
        </div>
        <ConfirmDialog
          open={dialog === "save"}
          title="Save changes?"
          confirmLabel="Save"
          askPin
          onCancel={() => setDialog(null)}
          onConfirm={(v) => save(v.pin)}
        >
          Only the fields you changed will be saved and logged.
        </ConfirmDialog>
      </Card>
    );
  }

  return (
    <>
      {notice ? (
        <Alert tone="ok" className="mb-3">
          {notice}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setNotice(null); setEditing(true); }}>
          Edit details
        </Button>
        {status !== "active" ? (
          <Button variant="secondary" onClick={() => setDialog("active")}>
            Mark active
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setDialog("inactive")}>
            Mark inactive
          </Button>
        )}
        {status !== "suspended" ? (
          <Button variant="secondary" onClick={() => setDialog("suspended")}>
            Suspend
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setDialog("qr")}>
          Replace QR code
        </Button>
        <Button variant="danger" onClick={() => setDialog("delete")}>
          Delete for good
        </Button>
      </div>

      {(["active", "inactive", "suspended"] as const).map((s) => (
        <ConfirmDialog
          key={s}
          open={dialog === s}
          title={s === "active" ? `Mark ${name} as active?` : s === "inactive" ? `Mark ${name} as inactive?` : `Suspend ${name}?`}
          confirmLabel={s === "active" ? "Mark active" : s === "inactive" ? "Mark inactive" : "Suspend"}
          danger={s === "suspended"}
          noteLabel="Reason"
          onCancel={() => setDialog(null)}
          onConfirm={(v) => setStatus(s, v.note)}
        >
          {s === "active" ? "Their QR badge will work again." : "Their QR badge won't be accepted until they're marked active."}
        </ConfirmDialog>
      ))}
      <ConfirmDialog
        open={dialog === "qr"}
        title="Replace QR code?"
        confirmLabel="Make new QR code"
        askPin
        onCancel={() => setDialog(null)}
        onConfirm={(v) => replaceQr(v.pin)}
      >
        Use this if a badge was lost or copied. The old badge stops working immediately.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "delete"}
        title={`Delete ${name} for good?`}
        confirmLabel="Delete for good"
        danger
        askPin
        noteLabel="Reason"
        noteRequired
        onCancel={() => setDialog(null)}
        onConfirm={(v) => remove(v.pin, v.note)}
      >
        This removes the delegate, their application, attendance and all their files. It can&apos;t be undone. It will still appear in the audit log.
      </ConfirmDialog>
    </>
  );
}
