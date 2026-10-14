"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import { api } from "@/lib/api-client";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/config";
import { formatDate } from "@/lib/time";

type Result = {
  status: ApplicationStatus;
  note: string | null;
  firstName: string;
  submittedAt: string;
  decidedAt: string | null;
  memberNo: string | null;
};

const EXPLAIN: Record<ApplicationStatus, string> = {
  pending: "We received your application and it's waiting to be reviewed.",
  incomplete: "Something is missing or needs fixing. Please read the note below and contact your diocesan youth coordinator.",
  approved: "Welcome! You're now a delegate.",
  rejected: "Your application was not approved.",
};

export default function StatusForm() {
  const [reference, setReference] = useState("");
  const [birthday, setBirthday] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    const res = await api<Result>("/api/status", { body: { reference, birthday } });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    setResult(res.data);
  }

  if (result) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-muted">Hi {result.firstName}, your application is</p>
        <div className="mt-2">
          <Badge status={result.status}>
            <span className="text-base">{APPLICATION_STATUS_LABELS[result.status]}</span>
          </Badge>
        </div>
        <p className="mt-3">{EXPLAIN[result.status]}</p>
        {result.memberNo ? (
          <p className="mt-3 text-sm">
            Your delegate ID: <span className="font-mono font-bold">{result.memberNo}</span>
          </p>
        ) : null}
        {result.note ? (
          <Alert tone={result.status === "rejected" ? "danger" : result.status === "incomplete" ? "warn" : "info"} className="mt-4">
            <strong>Note from the organizers:</strong> {result.note}
          </Alert>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          Sent {formatDate(result.submittedAt)}
          {result.decidedAt ? ` · Updated ${formatDate(result.decidedAt)}` : ""}
        </p>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={() => setResult(null)}>
            Check another
          </Button>
          <Link href="/" className="flex min-h-11 items-center px-2 text-sm underline">
            Home
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Reference number" htmlFor="reference" required error={fields.reference}>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="CH-20261020-AB7K"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono"
            aria-invalid={!!fields.reference}
          />
        </Field>
        <Field label="Birthday" htmlFor="birthday" required error={fields.birthday}>
          <Input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} aria-invalid={!!fields.birthday} />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Check status
        </Button>
      </form>
    </Card>
  );
}
