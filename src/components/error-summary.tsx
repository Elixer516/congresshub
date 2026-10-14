"use client";

import { FIELD_LABELS } from "@/lib/schemas";

// Moves the screen to a form field and puts the cursor in it.
export function goToField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => (el as HTMLElement).focus({ preventScroll: true }), 300);
}

// Goes to the first field (in page order) that has a problem.
export function goToFirstError(errors: Record<string, string>) {
  const ids = Object.keys(errors).filter((k) => document.getElementById(k));
  if (!ids.length) return;
  ids.sort((a, b) => (document.getElementById(a)!.compareDocumentPosition(document.getElementById(b)!) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  goToField(ids[0]);
}

// "Please check these fields": each one is a link that jumps to the field.
export default function ErrorSummary({ errors, labels = {} }: { errors: Record<string, string>; labels?: Record<string, string> }) {
  const entries = Object.entries(errors).filter(([k]) => !k.startsWith("_") && k !== "pin");
  if (!entries.length) return null;
  return (
    <div role="alert" className="mt-4 rounded-xl border-2 border-danger/40 bg-danger-soft p-4 text-sm">
      <p className="font-bold text-danger">
        {entries.length === 1 ? "1 field needs attention" : `${entries.length} fields need attention`}:
      </p>
      <ul className="mt-2 space-y-1">
        {entries.map(([k, msg]) => (
          <li key={k}>
            <button type="button" onClick={() => goToField(k)} className="text-left underline decoration-danger/40 underline-offset-2 hover:decoration-danger">
              <b>{labels[k] ?? FIELD_LABELS[k] ?? k.replace(/_/g, " ")}</b>: {msg}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
