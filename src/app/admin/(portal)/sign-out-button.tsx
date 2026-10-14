"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { signOut } from "./idle-sign-out";

// Red outlined "Sign out" button with an exit icon.
export default function SignOutButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        signOut();
      }}
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger/40 bg-danger-soft px-4 text-sm font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-60",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
      </svg>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
