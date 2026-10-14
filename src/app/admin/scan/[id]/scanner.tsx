"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { createDecoder } from "@/lib/qr-decoder";
import { enqueue, readQueue, removeFromQueue, type QueuedScan } from "@/lib/scan-queue";
import { formatTime } from "@/lib/time";

type Stage = "in" | "out";
type Member = { id: string; member_no: string; name: string };
type ScanResult = {
  result: "ok" | "ok_without_in" | "already" | "not_timed_in" | "unknown" | "inactive" | "session_closed" | "no_session" | "bad_time" | "too_soon";
  time?: string;
  counts?: { in: number; out: number };
  member?: Member & { status?: string };
};
type Card = { tone: "ok" | "warn" | "bad" | "info"; title: string; line: string; member?: Member; key: number };
type Recent = { key: number; name: string; memberNo: string; stage: Stage; time: string; tone: Card["tone"] };

const SAME_BADGE_COOLDOWN = 5000;
const CARD_MS = 2500;
const REQUEST_TIMEOUT = 8000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

// ---------------------------------------------------------------------------
// Sound and vibration
let audio: AudioContext | null = null;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch {}
}
function feedback(tone: Card["tone"]) {
  try {
    if (audio) {
      const beeps = tone === "ok" ? [[880, 0.09]] : tone === "warn" ? [[520, 0.12]] : [[220, 0.15], [220, 0.15]];
      let t = audio.currentTime;
      for (const [freq, len] of beeps) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = freq;
        o.type = "sine";
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + len);
        o.connect(g).connect(audio.destination);
        o.start(t);
        o.stop(t + len);
        t += len + 0.06;
      }
    }
    navigator.vibrate?.(tone === "ok" ? 60 : tone === "warn" ? [60, 60, 60] : [150, 80, 150]);
  } catch {}
}

function describe(r: ScanResult, stage: Stage): Omit<Card, "key"> {
  const when = r.time ? formatTime(r.time) : "";
  switch (r.result) {
    case "ok":
      return { tone: "ok", title: stage === "in" ? `Timed in at ${when}` : `Timed out at ${when}`, line: "", member: r.member };
    case "ok_without_in":
      return { tone: "warn", title: `Timed out at ${when}`, line: "Note: they never timed in.", member: r.member };
    case "already":
      return { tone: "warn", title: stage === "in" ? `Already timed in at ${when}` : `Already timed out at ${when}`, line: "No need to scan again.", member: r.member };
    case "not_timed_in":
      return { tone: "warn", title: "Not timed in yet", line: "Switch to Time in and scan first.", member: r.member };
    case "unknown":
      return { tone: "bad", title: "Unknown or replaced QR code", line: "This badge isn't valid. Use manual entry and check their ID card." };
    case "inactive":
      return { tone: "bad", title: `Delegate is ${r.member?.status ?? "inactive"}`, line: "Their badge isn't accepted right now.", member: r.member };
    case "session_closed":
      return { tone: "bad", title: "Session is closed", line: "Open the session again to keep scanning." };
    case "no_session":
      return { tone: "bad", title: "Session not found", line: "It may have been deleted." };
    case "too_soon":
      return { tone: "warn", title: "Just timed in", line: "Time out must be after the time in.", member: r.member };
    case "bad_time":
      return { tone: "bad", title: "Scan is too old", line: "Offline scans older than 24 hours can't be sent." };
  }
}

// The scanner serves two kinds of attendance: a session (sessionId = its id) and Working Committee
// staff duty (sessionId = "duty"), which use their own server addresses and photos.
export const DUTY = "duty";
const apiBase = (key: string) => (key === DUTY ? "/api/admin/duty" : `/api/admin/sessions/${key}`);
const photoUrl = (key: string, id: string) => (key === DUTY ? `/api/admin/staff/${id}/photo` : `/api/admin/members/${id}/photo`);

async function post(sessionId: string, body: object): Promise<{ status: number; data?: ScanResult }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(`${apiBase(sessionId)}/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctl.signal,
      credentials: "same-origin",
    });
    return { status: res.status, data: res.ok ? await res.json() : undefined };
  } catch {
    return { status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
export default function Scanner({ sessionId, title, status, adminName, canRequest = true }: { sessionId: string; title: string; status: string; adminName: string; canRequest?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const lastSeen = useRef(new Map<string, number>());
  const stageRef = useRef<Stage>("in");
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);
  const flushing = useRef(false);

  const [stage, setStageState] = useState<Stage>("in");
  const [camera, setCamera] = useState<"starting" | "on" | "denied" | "missing" | "error">("starting");
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [card, setCard] = useState<Card | null>(null);
  const [counts, setCounts] = useState({ in: 0, out: 0 });
  const [recent, setRecent] = useState<Recent[]>([]);
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [decoderKind, setDecoderKind] = useState("");
  const [checking, setChecking] = useState(0);
  // Camera can be switched off (manual entry still works). Remembered on this phone.
  const [cameraOn, setCameraOn] = useState(true);
  const cameraOnRef = useRef(true);
  // "continuous": keeps reading badges. "single": reads one badge, then waits for "Scan next".
  const [mode, setModeState] = useState<"continuous" | "single">("continuous");
  const modeRef = useRef<"continuous" | "single">("continuous");
  const [paused, setPausedState] = useState(false);
  const pausedRef = useRef(false);
  const [mine, setMine] = useState(0);
  const [mineOpen, setMineOpen] = useState(false);

  const setPaused = (v: boolean) => {
    pausedRef.current = v;
    setPausedState(v);
  };
  const setMode = (m: "continuous" | "single") => {
    modeRef.current = m;
    setModeState(m);
    setPaused(m === "single");
    try {
      localStorage.setItem("ch-scan-mode", m);
    } catch {}
  };

  const setStage = (s: Stage) => {
    stageRef.current = s;
    setStageState(s);
    try {
      sessionStorage.setItem(`ch-stage-${sessionId}`, s);
    } catch {}
  };

  const show = useCallback((c: Omit<Card, "key">, stageForRecent?: Stage) => {
    const key = ++keyRef.current;
    setCard({ ...c, key });
    feedback(c.tone);
    if (c.member && stageForRecent) {
      setRecent((r) => [{ key, name: c.member!.name, memberNo: c.member!.member_no, stage: stageForRecent, time: new Date().toISOString(), tone: c.tone }, ...r].slice(0, 6));
    }
    if (cardTimer.current) clearTimeout(cardTimer.current);
    // One-at-a-time mode keeps the pop-up until the admin taps it; continuous mode hides it by itself.
    if (modeRef.current === "continuous") {
      cardTimer.current = setTimeout(() => setCard((cur) => (cur?.key === key ? null : cur)), CARD_MS);
    }
  }, []);

  // Tapping the pop-up closes it; in one-at-a-time mode that also starts the next scan.
  const dismissCard = () => {
    unlockAudio();
    setCard(null);
    if (modeRef.current === "single") setPaused(false);
  };

  // Send saved offline scans, oldest first.
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const item of readQueue()) {
        const { status: code, data } = await post(item.sessionId, {
          token: item.token,
          memberId: item.memberId,
          stage: item.stage,
          scannedAt: item.scannedAt,
          offline: true,
        });
        if (code === 401) {
          setSignedOut(true);
          break;
        }
        if (code === 0 || code >= 500) break; // still offline; try later
        removeFromQueue(item.id); // accepted, or refused for good (e.g. unknown badge)
        if (data?.counts && item.sessionId === sessionId) setCounts(data.counts);
      }
    } finally {
      flushing.current = false;
      setPending(readQueue().length);
    }
  }, [sessionId]);

  const record = useCallback(
    async (body: { token?: string; memberId?: string }) => {
      const s = stageRef.current;
      const scannedAt = new Date().toISOString();
      setChecking((n) => n + 1);
      const { status: code, data } = await post(sessionId, { ...body, stage: s }).finally(() => setChecking((n) => n - 1));
      if (code === 200 && data) {
        setOnline(true);
        setSignedOut(false);
        if (data.counts) setCounts(data.counts);
        const added = data.result === "ok" || data.result === "ok_without_in";
        if (added) setMine((n) => n + 1);
        show(describe(data, s), added ? s : undefined);
        if (readQueue().length) void flush();
        return;
      }
      if (code === 400 || code === 404) {
        show({ tone: "bad", title: "Couldn't record this scan", line: "Please try again or use manual entry." });
        return;
      }
      // No connection, timeout, server trouble or signed out: keep it on this phone.
      enqueue({ id: crypto.randomUUID(), sessionId, stage: s, ...body, scannedAt } satisfies QueuedScan);
      setPending(readQueue().length);
      if (code === 401) setSignedOut(true);
      else setOnline(false);
      show({ tone: "info", title: "Saved offline", line: "Will send when back online." }, s);
    },
    [flush, sessionId, show],
  );

  const onCode = useCallback(
    (text: string) => {
      const now = Date.now();
      const key = `${stageRef.current}:${text}`;
      const last = lastSeen.current.get(key) ?? 0;
      if (now - last < SAME_BADGE_COOLDOWN) return; // same badge held in front of the camera
      lastSeen.current.set(key, now);
      if (modeRef.current === "single") setPaused(true); // one person at a time
      if (!TOKEN_RE.test(text)) {
        show({ tone: "bad", title: "Not a CongressHub badge", line: "This QR code isn't a delegate badge." });
        return;
      }
      void record({ token: text });
    },
    [record, show],
  );

  // Camera --------------------------------------------------------------------
  // Every start/stop bumps this number. A start that finishes after a newer start or a stop
  // (e.g. "camera off" was restored while the camera was still opening) closes its own camera.
  const cameraGen = useRef(0);

  const stopCamera = useCallback(() => {
    cameraGen.current++;
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    const gen = ++cameraGen.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("missing");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (gen !== cameraGen.current || !cameraOnRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (gen !== cameraGen.current) return; // stopped or restarted meanwhile; that call cleaned up
      setCamera("on");
      const decoder = await createDecoder();
      if (gen !== cameraGen.current) return;
      setDecoderKind(decoder.kind === "native" ? "built-in reader" : "ZXing reader");
      runningRef.current = true;
      const loop = async () => {
        if (!runningRef.current) return;
        if (video.readyState >= 2 && !pausedRef.current) {
          try {
            const text = await decoder.decode(video);
            if (text) onCode(text);
          } catch {}
        }
        setTimeout(loop, decoder.kind === "native" ? 80 : 120);
      };
      void loop();
    } catch (err) {
      const name = (err as DOMException)?.name;
      setCamera(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" ? "missing" : "error");
    }
  }, [facing, onCode, stopCamera]);

  useEffect(() => {
    if (!cameraOn) {
      stopCamera();
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the camera when the page opens
    void startCamera();
    return stopCamera;
  }, [cameraOn, startCamera, stopCamera]);

  const toggleCamera = () => {
    const next = !cameraOnRef.current;
    cameraOnRef.current = next;
    setCameraOn(next);
    try {
      localStorage.setItem("ch-camera-on", next ? "1" : "0");
    } catch {}
  };

  // Restart the camera when the phone wakes up or the tab comes back; keep the screen on.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
      } catch {}
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        if (cameraOnRef.current) void startCamera();
        void wake();
        void flush();
      } else stopCamera();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onVis);
    void wake();
    document.body.dataset.keepAwake = "1";
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onVis);
      void lock?.release().catch(() => {});
      delete document.body.dataset.keepAwake;
    };
  }, [flush, startCamera, stopCamera]);

  // Initial counts, saved stage, offline queue.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`ch-stage-${sessionId}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the last chosen stage
      if (saved === "in" || saved === "out") setStage(saved);
      if (localStorage.getItem("ch-camera-on") === "0") {
        cameraOnRef.current = false;
        setCameraOn(false);
      }
      if (localStorage.getItem("ch-scan-mode") === "single") setMode("single");
    } catch {}
    setPending(readQueue().length);
    fetch(`${apiBase(sessionId)}/summary`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setCounts(d.counts);
        setMine(d.mine ?? 0);
        setRecent(
          (d.recent as { stage: Stage; time: string; member: { name: string; member_no: string } }[]).map((r, i) => ({
            key: -i - 1,
            name: r.member.name,
            memberNo: r.member.member_no,
            stage: r.stage,
            time: r.time,
            tone: "ok" as const,
          })),
        );
      })
      .catch(() => {});
    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    const timer = setInterval(() => {
      if (readQueue().length) void flush();
    }, 15000);
    void flush();
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const toneClass: Record<Card["tone"], string> = {
    ok: "bg-ok text-white",
    warn: "bg-warn text-white",
    bad: "bg-danger text-white",
    info: "bg-[#334155] text-white",
  };

  return (
    <div className="flex min-h-dvh flex-col bg-black text-white" onPointerDown={unlockAudio}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <Link href={sessionId === DUTY ? "/admin/committee/duty" : `/admin/attendance/${sessionId}`} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label="Back">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-white/60">Scanning as {adminName}</p>
        </div>
        {cameraOn ? (
          <button
            onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
            className="rounded-full bg-white/10 px-3 py-2 text-xs"
            aria-label="Switch between front and back camera"
          >
            Flip
          </button>
        ) : null}
        <button onClick={toggleCamera} className={cx("rounded-full px-3 py-2 text-xs font-semibold", cameraOn ? "bg-white/10" : "bg-white text-black")}>
          {cameraOn ? "Camera off" : "Camera on"}
        </button>
      </div>

      {/* Continuous / one at a time */}
      <div className="mx-3 mb-2 flex items-center gap-2 text-xs">
        <span className="text-white/60">Scanning:</span>
        <div className="grid flex-1 grid-cols-2 gap-1 rounded-lg bg-white/10 p-0.5">
          {(
            [
              ["continuous", "Continuous"],
              ["single", "One at a time"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cx("min-h-9 rounded-md font-semibold", mode === m ? "bg-white text-black" : "text-white/70")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Time in / Time out switch */}
      <div className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
        {(["in", "out"] as const).map((s) => (
          <button
            key={s}
            onClick={() => {
              unlockAudio();
              setStage(s);
            }}
            className={cx("min-h-12 rounded-lg text-base font-bold transition", stage === s ? (s === "in" ? "bg-ok text-white" : "bg-accent text-white") : "text-white/70")}
            aria-pressed={stage === s}
          >
            Time {s}
          </button>
        ))}
      </div>

      {status !== "open" ? (
        <div className="mx-3 mb-2 rounded-lg bg-warn px-3 py-2 text-sm">
          <p>This session is {status}. Scans won&apos;t be accepted until it&apos;s opened.</p>
          {sessionId === DUTY || !canRequest ? null : <RequestOpenButton sessionId={sessionId} />}
        </div>
      ) : null}
      {signedOut ? (
        <Link href={`/admin/sign-in?next=${sessionId === DUTY ? "/admin/duty-scan" : `/admin/scan/${sessionId}`}`} className="mx-3 mb-2 block rounded-lg bg-danger px-3 py-2 text-sm">
          You were signed out. Tap here to sign in again — {pending} saved scan{pending === 1 ? "" : "s"} will be sent after.
        </Link>
      ) : null}
      {!online || pending ? (
        <div className="mx-3 mb-2 rounded-lg bg-[#334155] px-3 py-2 text-sm">
          {!online ? "No connection — keep scanning. " : ""}
          {pending ? `${pending} scan${pending === 1 ? "" : "s"} waiting to be sent.` : ""}
        </div>
      ) : null}

      {/* Camera */}
      <div className="relative mx-auto aspect-square w-full max-w-xl overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        {camera === "on" ? (
          <div className="pointer-events-none absolute inset-[8%] rounded-2xl border-4 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
        ) : null}
        {!cameraOn ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm">
            <div className="space-y-2">
              <p className="text-base font-bold">Camera is off</p>
              <p className="text-white/80">Use manual entry below, or turn the camera back on.</p>
              <button onClick={toggleCamera} className="mt-2 rounded-lg bg-white px-4 py-2 font-semibold text-black">
                Turn camera on
              </button>
            </div>
          </div>
        ) : camera !== "on" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm">
            {camera === "starting" ? (
              <p>Starting camera…</p>
            ) : camera === "denied" ? (
              <div className="space-y-2">
                <p className="text-base font-bold">Camera is blocked</p>
                <p className="text-white/80">
                  Allow the camera for this site: tap the lock or settings icon next to the address, choose <b>Camera → Allow</b>, then tap Try again. On iPhone: Settings → Safari → Camera → Allow.
                </p>
                <button onClick={() => void startCamera()} className="mt-2 rounded-lg bg-white px-4 py-2 font-semibold text-black">
                  Try again
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-base font-bold">{camera === "missing" ? "No camera found" : "The camera didn't start"}</p>
                <p className="text-white/80">Use manual entry below, or try again.</p>
                <button onClick={() => void startCamera()} className="mt-2 rounded-lg bg-white px-4 py-2 font-semibold text-black">
                  Try again
                </button>
              </div>
            )}
          </div>
        ) : null}

        {cameraOn && camera === "on" && mode === "single" && paused && !card && checking === 0 ? (
          <button
            onClick={() => {
              unlockAudio();
              setPaused(false);
            }}
            className="absolute inset-0 grid place-items-center bg-black/55"
          >
            <span className="rounded-2xl bg-white px-6 py-4 text-lg font-bold text-black shadow-2xl">Tap to scan next person</span>
          </button>
        ) : null}

        {checking > 0 && !card ? (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-2xl bg-white/90 p-3 text-black shadow-2xl" aria-live="polite">
            <span className="size-5 animate-spin rounded-full border-2 border-black border-t-transparent" aria-hidden />
            <p className="font-semibold">Checking…</p>
          </div>
        ) : null}

        {/* Result card */}
        {card ? (
          // Big pop-up with who was scanned: photo, full name and member ID.
          <button
            key={card.key}
            onClick={dismissCard}
            className="absolute inset-0 grid place-items-center bg-black/40 p-4"
            aria-label="Close and continue scanning"
          >
            <div role="status" aria-live="assertive" className={cx("w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl", toneClass[card.tone])}>
              {card.member ? (
                // eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route
                <img src={photoUrl(sessionId, card.member.id)} alt="" className="mx-auto size-28 rounded-2xl bg-white/20 object-cover ring-4 ring-white/40" />
              ) : (
                <div className="mx-auto grid size-20 place-items-center rounded-full bg-white/20 text-4xl">{card.tone === "info" ? "⇪" : "!"}</div>
              )}
              {card.member ? (
                <>
                  <p className="mt-3 text-2xl font-extrabold leading-tight">{card.member.name}</p>
                  <p className="mt-1 font-mono text-lg font-bold tracking-wide opacity-95">{card.member.member_no}</p>
                </>
              ) : null}
              <p className="mt-3 text-lg font-bold leading-tight">
                {card.tone === "ok" ? "✓ " : ""}
                {card.title}
              </p>
              {card.line ? <p className="mt-1 text-sm opacity-90">{card.line}</p> : null}
              <p className="mt-3 text-xs opacity-75">{mode === "single" ? "Tap to scan the next person" : "Tap to close"}</p>
            </div>
          </button>
        ) : null}
      </div>

      {/* Counts and recent */}
      <div className="flex-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">
              <span className="text-[#6ee7a8]">{counts.in} in</span> · <span className="text-[#fdba74]">{counts.out} out</span>
            </p>
            <button onClick={() => setMineOpen(true)} className="text-xs text-white/70 underline">
              You scanned {mine} · see list
            </button>
          </div>
          <button onClick={() => setManualOpen(true)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black">
            Manual entry
          </button>
        </div>
        {recent.length ? <p className="mt-3 text-xs text-white/50">Your latest scans</p> : null}
        <ul className="mt-1.5 space-y-1.5">
          {recent.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className={cx("shrink-0 text-xs", r.stage === "in" ? "text-[#6ee7a8]" : "text-[#fdba74]")}>
                {r.tone === "info" ? "saved offline" : `${r.stage === "in" ? "in" : "out"} ${formatTime(r.time)}`}
              </span>
            </li>
          ))}
        </ul>
        {decoderKind ? <p className="mt-3 text-center text-[11px] text-white/40">Using the {decoderKind}</p> : null}
      </div>

      {mineOpen ? <MyScans sessionId={sessionId} adminName={adminName} onClose={() => setMineOpen(false)} /> : null}

      {manualOpen ? (
        <ManualEntry
          sessionId={sessionId}
          stage={stage}
          onClose={() => setManualOpen(false)}
          onPick={(memberId) => {
            setManualOpen(false);
            void record({ memberId });
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
type Found = { id: string; member_no: string; first_name: string; last_name: string; parish: string; in: string | null; out: string | null };

function ManualEntry({ sessionId, stage, onClose, onPick }: { sessionId: string; stage: Stage; onClose: () => void; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase(sessionId)}/summary?q=${encodeURIComponent(q)}`, { signal: ctl.signal, credentials: "same-origin" });
        const d = await res.json();
        setFound(d.members ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Can't search without a connection.");
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div className="mt-auto max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-surface p-4 text-text" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Manual entry · Time {stage}</h2>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted">
            Close
          </button>
        </div>
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a name or delegate ID"
          className="block min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-base"
        />
        {busy ? <p className="mt-3 text-sm text-muted">Searching…</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <ul className="mt-3 divide-y divide-border">
          {(q.trim().length >= 2 ? found : []).map((m) => {
            const done = stage === "in" ? m.in : m.out;
            return (
              <li key={m.id}>
                <button onClick={() => onPick(m.id)} className="flex w-full items-center gap-3 py-3 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
                  <img src={photoUrl(sessionId, m.id)} alt="" loading="lazy" className="size-11 rounded-full bg-surface-2 object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {m.last_name ? `${m.last_name}, ${m.first_name}` : m.first_name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {m.member_no} · {m.parish}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{done ? `Already ${stage} ${formatTime(done)}` : `Time ${stage}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {q.trim().length >= 2 && !busy && !found.length && !error ? <p className="mt-3 text-sm text-muted">No active delegate matches.</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
type MyScan = { stage: Stage; time: string; manual: boolean; member: { id: string; member_no: string; name: string } };

// Everyone this admin scanned in this session (from the server, so it includes other devices).
function MyScans({ sessionId, adminName, onClose }: { sessionId: string; adminName: string; onClose: () => void }) {
  const [scans, setScans] = useState<MyScan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch(`${apiBase(sessionId)}/summary?mine=1`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setScans(d.scans))
      .catch(() => setError("Can't load your scans without a connection."));
  }, [sessionId]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (scans ?? []).filter((s) => words.every((w) => `${s.member.name} ${s.member.member_no}`.toLowerCase().includes(w)));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div className="mt-auto flex max-h-[85dvh] flex-col rounded-t-2xl bg-surface p-4 text-text" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">People you scanned</h2>
            <p className="text-xs text-muted">
              {adminName} · {scans ? `${scans.length} scan${scans.length === 1 ? "" : "s"}` : "loading…"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-muted">
            Close
          </button>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a name or delegate ID"
          className="block min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base"
        />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <ul className="mt-2 flex-1 divide-y divide-border overflow-y-auto">
          {shown.map((s, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.member.name}</p>
                <p className="truncate font-mono text-xs text-muted">{s.member.member_no}</p>
              </div>
              <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", s.stage === "in" ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
                {s.stage === "in" ? "In" : "Out"} {formatTime(s.time)}
              </span>
              {s.manual ? <span className="shrink-0 text-[10px] font-semibold text-muted">MANUAL</span> : null}
            </li>
          ))}
        </ul>
        {scans && !shown.length ? <p className="py-6 text-center text-sm text-muted">{q ? "No match." : "You haven't scanned anyone in this session yet."}</p> : null}
      </div>
    </div>
  );
}

// Ask the Admins / Head admins to open this session (they get a notification).
function RequestOpenButton({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  async function ask() {
    setState("busy");
    try {
      const res = await fetch(`/api/admin/sessions/${sessionId}/request-open`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        credentials: "same-origin",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(d.error ?? "Couldn't send the request.");
        return;
      }
      setState("sent");
      setMessage(d.already ? `${d.by ?? "Someone"} already asked. You'll be notified when it opens.` : "Request sent. You'll be notified when it opens.");
    } catch {
      setState("error");
      setMessage("No connection. Try again.");
    }
  }
  if (state === "sent") return <p className="mt-1 font-semibold">✓ {message}</p>;
  return (
    <div className="mt-2">
      <button onClick={ask} disabled={state === "busy"} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-60">
        {state === "busy" ? "Sending…" : "Ask an admin to open"}
      </button>
      {state === "error" ? <p className="mt-1">{message}</p> : null}
    </div>
  );
}
