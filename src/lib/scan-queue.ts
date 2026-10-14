// Scans saved on this phone while offline, sent automatically when the connection returns.
// Stored in localStorage with the time each badge was scanned.

export type QueuedScan = {
  id: string;
  sessionId: string;
  stage: "in" | "out";
  token?: string;
  memberId?: string;
  scannedAt: string;
};

const KEY = "ch-scan-queue";

export function readQueue(): QueuedScan[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as QueuedScan[]) : [];
    // The server only accepts offline scans from the last 24 hours.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return list.filter((s) => new Date(s.scannedAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

function write(list: QueuedScan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: nothing more we can do on this device */
  }
}

export function enqueue(scan: QueuedScan) {
  const list = readQueue();
  // Same badge, same stage, same session: keep only the first (earliest) one.
  if (list.some((s) => s.sessionId === scan.sessionId && s.stage === scan.stage && (s.token ?? s.memberId) === (scan.token ?? scan.memberId))) return;
  list.push(scan);
  write(list);
}

export function removeFromQueue(id: string) {
  write(readQueue().filter((s) => s.id !== id));
}
