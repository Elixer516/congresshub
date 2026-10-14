"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatDateTime } from "@/lib/time";

// Big, at-a-glance kit status and shirt size at the top of a delegate's profile.
export default function KitPanel({ id, receivedAt, receivedBy, shirtSize }: { id: string; receivedAt: string | null; receivedBy: string | null; shirtSize: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmUndo, setConfirmUndo] = useState(false);
  const received = !!receivedAt;

  async function set(next: boolean) {
    setBusy(true);
    setError("");
    const res = await api(`/api/admin/members/${id}/kit`, { body: { received: next } });
    setBusy(false);
    setConfirmUndo(false);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div
        className={cx(
          "flex flex-wrap items-center gap-4 rounded-2xl border-2 p-4",
          received ? "border-ok bg-ok-soft" : "border-warn bg-warn-soft",
        )}
      >
        <span className={cx("flex size-14 shrink-0 items-center justify-center rounded-full text-3xl", received ? "bg-ok text-white" : "bg-warn text-white")} aria-hidden>
          {received ? "✓" : "🎒"}
        </span>
        <div className="min-w-[12rem] flex-1">
          <p className={cx("text-xl font-extrabold leading-tight", received ? "text-ok" : "text-warn")}>{received ? "Kit received" : "Kit not yet received"}</p>
          <p className="text-sm text-muted">
            {received ? `Given ${formatDateTime(receivedAt!)}${receivedBy ? ` by ${receivedBy}` : ""}` : "Youth Congress kit (shirt, ID and materials) not handed out yet."}
          </p>
          {error ? <p className="mt-1 text-sm font-semibold text-danger">{error}</p> : null}
        </div>
        {received ? (
          confirmUndo ? (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => set(false)} className="min-h-11 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60">
                Yes, undo
              </button>
              <button onClick={() => setConfirmUndo(false)} className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold">
                Keep
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmUndo(true)} className="text-sm font-semibold text-muted underline">
              Undo
            </button>
          )
        ) : (
          <button disabled={busy} onClick={() => set(true)} className="min-h-12 rounded-xl bg-ok px-5 text-base font-bold text-white shadow-sm disabled:opacity-60">
            {busy ? "Saving…" : "Mark kit as received"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary-soft px-5 py-3 sm:flex-col sm:justify-center sm:gap-0">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">T-shirt size</p>
        <p className="text-4xl font-black leading-none text-primary">{shirtSize ?? "—"}</p>
      </div>
    </div>
  );
}
