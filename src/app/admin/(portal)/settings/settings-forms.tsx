"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Alert, Badge, Button, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api-client";
import { ROLE_LABELS } from "@/lib/config";

export function AttendanceSetting({ allow }: { allow: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    setBusy(true);
    const res = await api("/api/admin/settings", { body: { key: "allow_timeout_without_timein", value: !allow } });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p>
        When someone is timed out but never timed in:{" "}
        <strong>{allow ? "record it, with a warning on the scanner" : "refuse it, and ask to time them in first"}</strong>.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button variant="secondary" busy={busy} onClick={toggle}>
        {allow ? "Refuse instead" : "Allow with a warning instead"}
      </Button>
    </div>
  );
}

export function DriveSettings({ store, driveEmail, configured }: { store: "supabase" | "gdrive"; driveEmail: string | null; configured: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setStore(value: "supabase" | "gdrive") {
    setBusy(true);
    const res = await api("/api/admin/settings", { body: { key: "file_store", value } });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="mt-2 space-y-3 text-sm">
      <p>
        New uploads go to: <strong>{store === "gdrive" ? `Google Drive (${driveEmail})` : "Supabase Storage (private)"}</strong>
      </p>
      <p className="text-muted">Each person&apos;s files are kept in one folder named &quot;LASTNAME, Firstname — reference number&quot;.</p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {driveEmail ? (
        <div className="space-y-2">
          <p>
            Google Drive connected: <strong>{driveEmail}</strong>, folder <strong>MSPC Youth — Member Files</strong>.
          </p>
          <div className="flex flex-wrap gap-2">
            {store === "gdrive" ? (
              <Button variant="secondary" busy={busy} onClick={() => setStore("supabase")}>
                Keep new files in Supabase instead
              </Button>
            ) : (
              <Button busy={busy} onClick={() => setStore("gdrive")}>
                Keep new files in Google Drive
              </Button>
            )}
            <Button variant="danger" onClick={() => setDialog(true)}>
              Disconnect Google Drive
            </Button>
          </div>
        </div>
      ) : configured ? (
        <a href="/api/admin/drive/connect" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-fg">
          Connect Google Drive
        </a>
      ) : (
        <p className="text-muted">Google Drive isn&apos;t set up for this app yet (see the README). Files are kept safely in Supabase Storage.</p>
      )}
      <ConfirmDialog
        open={dialog}
        title="Disconnect Google Drive?"
        confirmLabel="Disconnect"
        danger
        askPin
        onCancel={() => setDialog(false)}
        onConfirm={async ({ pin }) => {
          const res = await api("/api/admin/drive/disconnect", { body: { pin } });
          if (!res.ok) return { error: res.error, fields: res.fields };
          setDialog(false);
          router.refresh();
        }}
      >
        New files will go to Supabase Storage. Files already in Drive stay there, but can&apos;t be opened from this app until Drive is connected again.
      </ConfirmDialog>
    </div>
  );
}

type AdminRow = { id: string; loginId: string; name: string; role: string; committeeId: string | null; active: boolean; twoStep: boolean; lastSignIn: string | null; locked: boolean };
type Pending =
  | { kind: "role"; a: AdminRow; role: string }
  | { kind: "active"; a: AdminRow; active: boolean }
  | { kind: "reset_pin"; a: AdminRow }
  | { kind: "reset_two_step"; a: AdminRow }
  | { kind: "delete"; a: AdminRow }
  | { kind: "committee"; a: AdminRow; committeeId: string }
  | { kind: "create" };

export function AdminAccounts({ admins, selfId, committees }: { admins: AdminRow[]; selfId: string; committees: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [tempPin, setTempPin] = useState<{ name: string; pin: string } | null>(null);
  const [form, setForm] = useState({ loginId: "", name: "", role: "admin", committeeId: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const addRef = useRef<HTMLDialogElement>(null);

  async function run(pin: string, note: string) {
    if (!pending) return;
    let res;
    if (pending.kind === "create") {
      res = await api<{ tempPin: string }>("/api/admin/admins", { body: { ...form, pin } });
      if (!res.ok) {
        if (res.fields && !res.fields.pin) {
          setFormErrors(res.fields);
          setPending(null);
          addRef.current?.showModal();
        }
        return { error: res.error, fields: res.fields };
      }
      setTempPin({ name: form.name, pin: res.data.tempPin });
      setForm({ loginId: "", name: "", role: "admin", committeeId: "" });
    } else if (pending.kind === "delete") {
      res = await api(`/api/admin/admins/${pending.a.id}`, { method: "DELETE", body: { pin, reason: note } });
      if (!res.ok) return { error: res.error, fields: res.fields };
    } else {
      const body =
        pending.kind === "role"
          ? { action: "role", role: pending.role, pin }
          : pending.kind === "committee"
            ? { action: "committee", committeeId: pending.committeeId, pin }
            : pending.kind === "active"
            ? { action: "active", active: pending.active, pin }
            : { action: pending.kind, pin };
      res = await api<{ tempPin?: string }>(`/api/admin/admins/${pending.a.id}`, { method: "PATCH", body });
      if (!res.ok) return { error: res.error, fields: res.fields };
      if (pending.kind === "reset_pin" && res.data.tempPin) setTempPin({ name: pending.a.name, pin: res.data.tempPin });
    }
    setPending(null);
    router.refresh();
  }

  const titles: Record<string, (p: Pending) => string> = {
    role: (p) => (p.kind === "role" ? `Make ${p.a.name} ${ROLE_LABELS[p.role as keyof typeof ROLE_LABELS].toLowerCase()}?` : ""),
    active: (p) => (p.kind === "active" ? (p.active ? `Turn ${p.a.name}'s access back on?` : `Turn off ${p.a.name}'s access?`) : ""),
    reset_pin: (p) => (p.kind === "reset_pin" ? `Reset ${p.a.name}'s PIN?` : ""),
    reset_two_step: (p) => (p.kind === "reset_two_step" ? `Reset ${p.a.name}'s two-step sign-in?` : ""),
    delete: (p) => (p.kind === "delete" ? `Remove ${p.a.name}?` : ""),
    committee: (p) => (p.kind === "committee" ? `Make ${p.a.name} head of ${committees.find((c) => c.id === p.committeeId)?.name ?? "this committee"}?` : ""),
    create: () => "Add this admin?",
  };
  const explain: Record<string, string> = {
    role: "They'll be signed out so the change applies right away.",
    active: "They'll be signed out. Their name stays on past records.",
    reset_pin: "You'll see a temporary PIN once. They must change it when they sign in.",
    reset_two_step: "Use this if they lost their phone. They'll set up the authenticator app again at next sign-in.",
    delete: "Their account is removed. Their name stays on past records and in the audit log.",
    committee: "They'll only see their committee's deliverables and duty attendance. They'll be signed out so the change applies right away.",
    create: "You'll see a temporary PIN once. Give it to them privately.",
  };

  return (
    <div className="mt-3 space-y-3">
      {tempPin ? (
        <Alert tone="warn">
          Temporary PIN for <strong>{tempPin.name}</strong>: <span className="select-all font-mono text-lg font-bold tracking-widest">{tempPin.pin}</span>
          <span className="block text-xs">Give it to them privately. It won&apos;t be shown again. They must change it at first sign-in.</span>
          <button onClick={() => setTempPin(null)} className="mt-1 text-xs underline">
            I&apos;ve noted it — hide
          </button>
        </Alert>
      ) : null}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {admins.map((a) => (
          <li key={a.id} className="space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                {a.name} <span className="font-normal text-muted">· {a.loginId}</span>
              </p>
              <Badge status={a.role === "head_admin" ? "approved" : a.role === "admin" ? "pending" : "incomplete"}>{ROLE_LABELS[a.role as keyof typeof ROLE_LABELS]}</Badge>
              {!a.active ? <Badge status="inactive">No access</Badge> : null}
              {a.locked ? <Badge status="rejected">Locked</Badge> : null}
              {!a.twoStep ? <Badge status="incomplete">Two-step not set up</Badge> : null}
              {a.id === selfId ? <span className="text-xs text-muted">(you)</span> : null}
            </div>
            {a.role === "committee_head" ? (
              <p className="text-xs text-muted">Leads: {committees.find((c) => c.id === a.committeeId)?.name ?? "no committee yet"}</p>
            ) : null}
            <p className="text-xs text-muted">Last sign-in: {a.lastSignIn ?? "never"}</p>
            {a.id !== selfId ? (
              <div className="flex flex-wrap gap-2">
                {(["head_admin", "admin", "secretariat", "transportation"] as const)
                  .filter((r) => r !== a.role)
                  .map((r) => (
                    <Button key={r} variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setPending({ kind: "role", a, role: r })}>
                      Make {ROLE_LABELS[r].toLowerCase()}
                    </Button>
                  ))}
                {committees.length ? (
                  <select
                    value=""
                    onChange={(e) => e.target.value && setPending({ kind: "committee", a, committeeId: e.target.value })}
                    className="min-h-9 rounded-lg border border-border bg-surface px-2 text-xs font-semibold"
                    aria-label={`Make ${a.name} a committee head`}
                  >
                    <option value="">{a.role === "committee_head" ? "Change committee…" : "Make committee head of…"}</option>
                    {committees.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setPending({ kind: "reset_pin", a })}>
                  Reset PIN
                </Button>
                <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setPending({ kind: "reset_two_step", a })}>
                  Reset two-step
                </Button>
                <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setPending({ kind: "active", a, active: !a.active })}>
                  {a.active ? "Turn off access" : "Turn access on"}
                </Button>
                <Button variant="danger" className="min-h-9 px-3 text-xs" onClick={() => setPending({ kind: "delete", a })}>
                  Remove
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Button onClick={() => { setFormErrors({}); addRef.current?.showModal(); }}>Add admin</Button>

      <dialog ref={addRef} className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50">
        <form
          className="space-y-4 p-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            addRef.current?.close();
            setPending({ kind: "create" });
          }}
        >
          <h2 className="text-lg font-bold">Add admin</h2>
          <Field label="Admin ID (used to sign in)" htmlFor="new-login" required error={formErrors.loginId} hint="e.g. maria.santos">
            <Input id="new-login" value={form.loginId} onChange={(e) => setForm((f) => ({ ...f, loginId: e.target.value.toLowerCase() }))} autoCapitalize="none" />
          </Field>
          <Field label="Full name" htmlFor="new-name" required error={formErrors.name}>
            <Input id="new-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Role" htmlFor="new-role" required>
            <Select id="new-role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin — applications, delegates, attendance</option>
              <option value="head_admin">Head admin — everything, including settings and audit log</option>
              <option value="secretariat">Secretariat — view delegates and attendance, scan, ask to open sessions</option>
              <option value="transportation">Transportation — scan attendance, post trip updates, basic delegate list with travel details</option>
              <option value="committee_head">Committee head — only their committee&apos;s deliverables and duty</option>
            </Select>
          </Field>
          {form.role === "committee_head" ? (
            <Field label="Committee they lead" htmlFor="new-committee" required error={formErrors.committeeId}>
              <Select id="new-committee" value={form.committeeId} onChange={(e) => setForm((f) => ({ ...f, committeeId: e.target.value }))}>
                <option value="">Choose…</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => addRef.current?.close()}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </dialog>

      <ConfirmDialog
        open={!!pending}
        title={pending ? titles[pending.kind](pending) : ""}
        confirmLabel="Confirm"
        danger={pending?.kind === "delete" || (pending?.kind === "active" && !pending.active)}
        askPin
        noteLabel={pending?.kind === "delete" ? "Reason" : undefined}
        noteRequired={pending?.kind === "delete"}
        onCancel={() => setPending(null)}
        onConfirm={(v) => run(v.pin, v.note)}
      >
        {pending ? explain[pending.kind] : null}
      </ConfirmDialog>
    </div>
  );
}
