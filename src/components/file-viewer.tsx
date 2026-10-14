"use client";

import { useState } from "react";
import { Button } from "./ui";

// Documents are fetched only when the admin asks to see them.
export default function FileViewer({ files }: { files: { id: string; label: string; mime: string }[] }) {
  const [shown, setShown] = useState<Record<string, boolean>>({});
  if (!files.length) return <p className="text-sm text-muted">No documents uploaded.</p>;
  return (
    <ul className="space-y-3">
      {files.map((f) => (
        <li key={f.id} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{f.label}</span>
            <div className="flex gap-2">
              {f.mime.startsWith("image/") ? (
                <Button variant="secondary" onClick={() => setShown((s) => ({ ...s, [f.id]: !s[f.id] }))}>
                  {shown[f.id] ? "Hide" : "View"}
                </Button>
              ) : null}
              <a href={`/api/admin/files/${f.id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold">
                Open
              </a>
            </div>
          </div>
          {shown[f.id] ? (
            // eslint-disable-next-line @next/next/no-img-element -- permission-checked file route, not a static asset
            <img src={`/api/admin/files/${f.id}`} alt={f.label} className="mt-3 max-h-80 rounded-lg border border-border object-contain" />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
