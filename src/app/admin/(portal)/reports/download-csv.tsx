"use client";

// Saves a ready-made CSV (opens in Excel / Google Sheets) without another trip to the server.
export default function DownloadCsv({ name, csv, label }: { name: string; csv: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }}
      className="no-print inline-flex min-h-10 items-center rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-primary"
    >
      ⬇ {label}
    </button>
  );
}
