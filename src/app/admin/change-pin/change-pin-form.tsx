"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

const FIELDS = [
  { id: "currentPin", label: "Current PIN", autoComplete: "current-password" },
  { id: "newPin", label: "New PIN", autoComplete: "new-password" },
  { id: "confirmPin", label: "Type the new PIN again", autoComplete: "new-password" },
] as const;

export default function ChangePinForm() {
  const [values, setValues] = useState({ currentPin: "", newPin: "", confirmPin: "" });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const res = await api("/api/admin/me/pin", { body: values });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    window.location.replace("/admin");
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {FIELDS.map((f) => (
          <Field key={f.id} label={f.label} htmlFor={f.id} required error={fields[f.id]}>
            <Input
              id={f.id}
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete={f.autoComplete}
              value={values[f.id]}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value.replace(/\D/g, "") }))}
              aria-invalid={!!fields[f.id]}
              className="tracking-[0.4em]"
            />
          </Field>
        ))}
        <Button type="submit" busy={busy} className="w-full">
          Save new PIN
        </Button>
      </form>
    </Card>
  );
}
