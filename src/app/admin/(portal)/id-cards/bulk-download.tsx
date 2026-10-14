"use client";

import { useRef, useState } from "react";
import { zipSync } from "fflate";
import { Alert } from "@/components/ui";

export type RegionGroup = { key: string; color: string; colorName: string; people: { id: string; no: string; name: string }[] };

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
const AT_ONCE = 4; // cards drawn in parallel
const nameOf = (key: string) => (key === "OTHER" ? "No region" : key);

export default function BulkDownload({ groups }: { groups: RegionGroup[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const stop = useRef(false);

  async function download(label: string, list: { folder: string; people: RegionGroup["people"] }[]) {
    const all = list.flatMap((g) => g.people.map((p) => ({ ...p, folder: g.folder })));
    if (!all.length) return;
    stop.current = false;
    setBusy(label);
    setDone(0);
    setTotal(all.length);
    setFailed([]);
    setMessage(null);
    const files: Record<string, Uint8Array> = {};
    const bad: string[] = [];
    let signedOut = false;
    let next = 0;
    let count = 0;
    async function worker() {
      while (next < all.length && !stop.current) {
        const p = all[next++];
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok && !stop.current; attempt++) {
          try {
            const res = await fetch(`/api/admin/members/${p.id}/card`, { credentials: "same-origin" });
            if (res.status === 401) {
              signedOut = true;
              stop.current = true;
              return;
            }
            if (res.ok) {
              files[`${p.folder}${safe(`${p.no} ${p.name}`)}.png`] = new Uint8Array(await res.arrayBuffer());
              ok = true;
            }
          } catch {
            // try again
          }
        }
        if (!ok && !stop.current) bad.push(`${p.no} ${p.name}`);
        setDone(++count);
      }
    }
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
    setBusy(null);
    if (stop.current) {
      setMessage({ tone: "warn", text: signedOut ? "You were signed out. Sign in again and retry." : "Stopped. Nothing was saved." });
      return;
    }
    // PNGs are already compressed, so store them as they are (fast, same size).
    const zip = zipSync(files, { level: 0 });
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `CongressHub IDs - ${label}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const n = Object.keys(files).length;
    setFailed(bad);
    setMessage({ tone: bad.length ? "warn" : "ok", text: `Saved ${n} ID${n === 1 ? "" : "s"} in “CongressHub IDs - ${label}.zip”.` });
  }

  const everyone = groups.reduce((n, g) => n + g.people.length, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {busy ? (
        <div className="rounded-xl border border-border bg-surface p-4" aria-live="polite">
          <p className="font-semibold">
            Preparing {busy}… {done} of {total}
          </p>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button onClick={() => (stop.current = true)} className="mt-3 text-sm font-semibold text-danger underline">
            Stop
          </button>
        </div>
      ) : null}
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
      {failed.length ? (
        <Alert tone="warn">
          {failed.length} card{failed.length === 1 ? "" : "s"} couldn&apos;t be made: {failed.join(", ")}. Try again, or download them from each delegate&apos;s page.
        </Alert>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <li key={g.key} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4">
            <span className="size-10 shrink-0 rounded-full" style={{ background: g.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{nameOf(g.key)}</p>
              <p className="text-sm text-muted">
                {g.people.length} delegate{g.people.length === 1 ? "" : "s"} · {g.colorName}
              </p>
            </div>
            <button
              disabled={!!busy || !g.people.length}
              onClick={() => download(nameOf(g.key), [{ folder: "", people: g.people }])}
              className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg disabled:opacity-50"
            >
              ⬇ Zip
            </button>
          </li>
        ))}
      </ul>
      <button
        disabled={!!busy || !everyone}
        onClick={() => download("All regions", groups.map((g) => ({ folder: `${nameOf(g.key)}/`, people: g.people })))}
        className="min-h-12 w-full rounded-xl border-2 border-primary bg-surface px-4 text-base font-bold text-primary disabled:opacity-50 sm:w-auto"
      >
        ⬇ All regions in one zip ({everyone}), one folder per region
      </button>
      <p className="text-xs text-muted">Only active delegates are included. Big regions take a minute or two.</p>
    </div>
  );
}
