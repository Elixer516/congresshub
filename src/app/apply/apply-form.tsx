"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PersonFields, { EMPTY_PERSON, type PersonValues } from "@/components/person-fields";
import { Alert, Button, Card } from "@/components/ui";
import { api } from "@/lib/api-client";
import { applicationSchema } from "@/lib/schemas";
import ErrorSummary, { goToFirstError } from "@/components/error-summary";
import { DOCUMENTS, MAX_FILE_BYTES, MAX_REQUEST_BYTES, ORG_FULL_NAME } from "@/lib/config";
import { formatBytes, shrinkImage } from "@/lib/shrink-image";

const DRAFT_KEY = "ch-apply-draft";

function firstErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = i.path.map(String).join(".");
    if (k && !out[k]) out[k] = i.message;
  }
  return out;
}

export default function ApplyForm() {
  const [values, setValues] = useState<PersonValues>(EMPTY_PERSON);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [preparing, setPreparing] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  // Keep an unsent draft on this device only (never the photo).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a saved draft once on load
      if (saved) setValues({ ...EMPTY_PERSON, ...JSON.parse(saved) });
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {}
  }, [values]);

  function change(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  }

  async function pickFile(kind: string, file: File | null) {
    setErrors((e) => ({ ...e, [kind]: "" }));
    if (previews[kind]) URL.revokeObjectURL(previews[kind]);
    if (!file) {
      setFiles((f) => ({ ...f, [kind]: null }));
      setPreviews((p) => ({ ...p, [kind]: "" }));
      return;
    }
    setPreparing(kind);
    const small = await shrinkImage(file);
    setPreparing(null);
    if (small.size > MAX_FILE_BYTES) {
      setErrors((e) => ({ ...e, [kind]: `This file is ${formatBytes(small.size)}. Please use one under ${formatBytes(MAX_FILE_BYTES)}.` }));
      return;
    }
    setFiles((f) => ({ ...f, [kind]: small }));
    setPreviews((p) => ({ ...p, [kind]: small.type.startsWith("image/") ? URL.createObjectURL(small) : "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const result = applicationSchema.safeParse({ ...values, consent });
    const found = result.success ? {} : firstErrors(result.error.issues);
    for (const doc of DOCUMENTS) if (doc.required && !files[doc.kind]) found[doc.kind] = `Please add your ${doc.label.toLowerCase()}.`;
    const total = Object.values(files).reduce((n, f) => n + (f?.size ?? 0), 0);
    if (total > MAX_REQUEST_BYTES) found._files = `Your files add up to ${formatBytes(total)}. Please keep them under ${formatBytes(MAX_REQUEST_BYTES)} in total.`;

    if (Object.keys(found).length) {
      setErrors(found);
      setMessage(null);
      goToFirstError(found._files ? { ...found, [DOCUMENTS[0].kind]: found._files } : found);
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.set("data", JSON.stringify({ ...values, consent }));
    for (const [kind, file] of Object.entries(files)) if (file) form.set(kind, file);
    const res = await api<{ reference: string }>("/api/apply", { form, timeoutMs: 90000 });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      if (res.fields && Object.keys(res.fields).length) goToFirstError(res.fields);
      else setMessage(res.error);
      return;
    }
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    setReference(res.data.reference);
    window.scrollTo({ top: 0 });
  }

  if (reference) {
    return (
      <Card className="mt-6 text-center">
        <p className="text-lg font-bold text-ok">Application sent. Thank you!</p>
        <p className="mt-4 text-sm text-muted">Your reference number</p>
        <p className="mt-1 select-all font-mono text-2xl font-bold tracking-wider sm:text-3xl">{reference}</p>
        <Alert tone="warn" className="mt-5 text-left">
          <strong>Keep this number.</strong> Take a screenshot or write it down. You&apos;ll need it with your birthday to check your application status.
        </Alert>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link href="/status" className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-fg">
            Check my status
          </Link>
          <Link href="/" className="flex min-h-11 items-center justify-center rounded-lg border border-border px-4 font-semibold">
            Back to home
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 space-y-6">
      <PersonFields values={values} errors={errors} onChange={change} />

      <fieldset className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <legend className="px-1 text-lg font-bold text-primary">Photo</legend>
        {DOCUMENTS.map((doc) => (
          <div key={doc.kind} className="space-y-2">
            <label htmlFor={doc.kind} className="block text-sm font-medium">
              {doc.label} {doc.required ? <span className="text-danger">*</span> : null}
            </label>
            <p className="text-sm text-muted">{doc.hint}</p>
            <div className="flex items-center gap-4">
              {previews[doc.kind] ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen photo
                <img src={previews[doc.kind]} alt="Your photo" className="size-24 rounded-lg border border-border object-cover" />
              ) : (
                <div className="grid size-24 place-items-center rounded-lg border border-dashed border-border text-xs text-muted">No photo</div>
              )}
              <div className="min-w-0 flex-1">
                <input
                  id={doc.kind}
                  type="file"
                  accept={doc.imagesOnly ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
                  onChange={(e) => pickFile(doc.kind, e.target.files?.[0] ?? null)}
                  aria-invalid={!!errors[doc.kind]}
                  className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:font-semibold file:text-primary"
                />
                {preparing === doc.kind ? <p className="mt-1 text-sm text-muted">Preparing photo…</p> : null}
                {files[doc.kind] ? <p className="mt-1 text-sm text-muted">Ready · {formatBytes(files[doc.kind]!.size)}</p> : null}
              </div>
            </div>
            {errors[doc.kind] ? <p className="text-sm text-danger">{errors[doc.kind]}</p> : null}
          </div>
        ))}
        {errors._files ? <p className="mt-2 text-sm text-danger">{errors._files}</p> : null}
      </fieldset>

      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <label className="flex items-start gap-3 text-sm">
          <input
            id="consent"
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setErrors((x) => ({ ...x, consent: "" }));
            }}
            className="mt-0.5 size-5 shrink-0"
            aria-invalid={!!errors.consent}
          />
          <span>
            I confirm the details above are true, and I agree that the {ORG_FULL_NAME} may keep and use them, and my photo, for membership records,
            ID cards and attendance, in line with the Data Privacy Act of 2012. (Demo: nothing you type here is kept for long or shared.)
          </span>
        </label>
        {errors.consent ? <p className="mt-2 text-sm text-danger">{errors.consent}</p> : null}
      </div>

      <ErrorSummary errors={errors} labels={{ consent: "Agreement", ...Object.fromEntries(DOCUMENTS.map((d) => [d.kind, d.label])) }} />
      {message ? <Alert tone="danger">{message}</Alert> : null}

      <Button type="submit" busy={busy} disabled={!!preparing} className="w-full text-base">
        {busy ? "Sending…" : "Send application"}
      </Button>
    </form>
  );
}
