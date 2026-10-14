"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { api } from "@/lib/api-client";
import { ROLE_LABELS, type AdminRole } from "@/lib/config";

const RANKS: { role: AdminRole; hint: string }[] = [
  { role: "committee_head", hint: "Their committee's deliverables and duty" },
  { role: "transportation", hint: "Scan attendance, post trip updates, delegate list with travel details" },
  { role: "secretariat", hint: "View delegates and attendance, scan, ask to open sessions" },
  { role: "admin", hint: "Applications, delegates, attendance, Working Committee" },
  { role: "head_admin", hint: "Everything, including settings and audit log" },
];

// Suggested sign-in ID from the name: "Juan Dela Cruz" → "juan.delacruz".
function suggestId(name: string) {
  const parts = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return `${parts[0]}${parts.length > 1 ? "." + parts.slice(1).join("") : ""}`.slice(0, 32);
}

type Account = { loginId: string; role: AdminRole; active: boolean; lastSignIn: string | null } | null;
type Pending = { kind: "create" } | { kind: "rank"; role: AdminRole } | { kind: "active"; active: boolean };

// Head admin only: give this person a sign-in, or rank them up / down.
export default function StaffAccess({ id, name, hasCommittee, account }: { id: string; name: string; hasCommittee: boolean; account: Account }) {
  const router = useRouter();
  const [role, setRole] = useState<AdminRole>(account?.role ?? "committee_head");
  const [loginId, setLoginId] = useState(() => suggestId(name));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [temp, setTemp] = useState<{ loginId: string; pin: string } | null>(null);
  const choices = RANKS.filter((r) => r.role !== "committee_head" || hasCommittee);
  const hint = RANKS.find((r) => r.role === role)?.hint;

  async function run({ pin }: { pin: string }) {
    if (!pending) return;
    const body =
      pending.kind === "create"
        ? { action: "create", role, loginId, pin }
        : pending.kind === "rank"
          ? { action: "rank", role: pending.role, pin }
          : { action: "active", active: pending.active, pin };
    const res = await api<{ tempPin?: string; loginId?: string }>(`/api/admin/staff/${id}/access`, { body });
    if (!res.ok) {
      if (res.fields && !res.fields.pin) {
        setErrors(res.fields);
        setPending(null);
        return;
      }
      return { error: res.error, fields: res.fields };
    }
    if (res.data.tempPin) setTemp({ loginId: res.data.loginId ?? loginId, pin: res.data.tempPin });
    setErrors({});
    setPending(null);
    router.refresh();
  }

  return (
    <Card>
      <h2 className="font-bold">Rank &amp; sign-in</h2>
      {temp ? (
        <Alert tone="ok" className="mt-3">
          <p className="font-semibold">Sign-in created. Give these to {name.split(" ")[0]} in person:</p>
          <p className="mt-1">
            Admin ID: <span className="font-mono font-bold">{temp.loginId}</span>
          </p>
          <p>
            Temporary PIN: <span className="font-mono text-lg font-bold tracking-widest">{temp.pin}</span>
          </p>
          <p className="mt-1 text-xs">They sign in at the admin link, then set their own PIN and two-step code. This PIN is shown only once.</p>
        </Alert>
      ) : null}

      {account ? (
        <div className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">{account.loginId}</span>
            <Badge status="pending">{ROLE_LABELS[account.role]}</Badge>
            {!account.active ? <Badge status="inactive">Sign-in off</Badge> : null}
          </div>
          <p className="text-xs text-muted">Last sign-in: {account.lastSignIn ?? "never"}</p>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} aria-label="New rank">
                {choices.map((r) => (
                  <option key={r.role} value={r.role}>
                    {ROLE_LABELS[r.role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button className="shrink-0" disabled={role === account.role} onClick={() => setPending({ kind: "rank", role })}>
              Change rank
            </Button>
          </div>
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
          <button className="text-sm font-semibold text-danger underline" onClick={() => setPending({ kind: "active", active: !account.active })}>
            {account.active ? "Turn off their sign-in" : "Turn their sign-in back on"}
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted">No sign-in yet. Give them a rank to let them use the app.</p>
          <Field label="Rank" htmlFor="sa-role">
            <Select id="sa-role" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {choices.map((r) => (
                <option key={r.role} value={r.role}>
                  {ROLE_LABELS[r.role]}
                </option>
              ))}
            </Select>
          </Field>
          {hint ? <p className="-mt-2 text-xs text-muted">{hint}</p> : null}
          <Field label="Sign-in ID" htmlFor="sa-login" error={errors.loginId} hint="What they type to sign in.">
            <Input id="sa-login" value={loginId} onChange={(e) => setLoginId(e.target.value.toLowerCase())} autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Button className="w-full" onClick={() => setPending({ kind: "create" })}>
            Give sign-in
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.kind === "create"
            ? `Give ${name} a sign-in as ${ROLE_LABELS[role]}?`
            : pending?.kind === "rank"
              ? `Make ${name} ${ROLE_LABELS[pending.role]}?`
              : pending?.kind === "active" && pending.active
                ? `Turn ${name}'s sign-in back on?`
                : `Turn off ${name}'s sign-in?`
        }
        confirmLabel="Confirm"
        danger={pending?.kind === "active" && !pending.active}
        askPin
        onCancel={() => setPending(null)}
        onConfirm={run}
      >
        {pending?.kind === "rank" ? <p className="text-sm text-muted">They&apos;ll be signed out so the new rank applies right away.</p> : null}
      </ConfirmDialog>
    </Card>
  );
}
