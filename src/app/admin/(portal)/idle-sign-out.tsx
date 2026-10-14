"use client";

import { useEffect } from "react";
import { IDLE_MINUTES } from "@/lib/config";

export async function signOut(reason?: "idle") {
  await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin" }).catch(() => {});
  // Full reload on purpose: clears everything held in memory after sign-out.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/admin/sign-in${reason === "idle" ? "?idle=1" : ""}`;
}

// Signs the admin out after a period with no taps, clicks or typing.
// The server's session cookie also expires on its own after the same idle time.
export default function IdleSignOut() {
  useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      // The scanner keeps the session alive while it's in use.
      if (document.body.dataset.keepAwake === "1") bump();
      if (Date.now() - last > IDLE_MINUTES * 60 * 1000) signOut("idle");
    }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, []);
  return null;
}
