"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Empty } from "@/components/list-controls";
import { inputClass } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";

type Scan = { id: string; time: string; by: string; manual: boolean; offline: boolean };
export type AttendanceRow = { memberId: string; memberNo: string; name: string; parish: string; in?: Scan; out?: Scan };

function ScanCell({ scan, onRemove }: { scan?: Scan; onRemove?: () => void }) {
  if (!scan) return <span className="text-muted">—</span>;
  return (
    <div>
      <span className="font-medium">{formatTime(scan.time)}</span>
      {scan.manual ? <span className="ml-1 rounded bg-warn-soft px-1 text-[10px] font-semibold text-warn">MANUAL</span> : null}
      {scan.offline ? <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] font-semibold text-muted">OFFLINE</span> : null}
      <span className="block text-xs text-muted">by {scan.by.replace(/ \(.*\)$/, "")}</span>
      {onRemove ? (
        <button onClick={onRemove} className="text-xs text-danger underline">
          Remove
        </button>
      ) : null}
    </div>
  );
}

export default function RecordsTable({ sessionId, rows, canRemove }: { sessionId: string; rows: AttendanceRow[]; canRemove: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [removing, setRemoving] = useState<{ row: AttendanceRow; stage: "in" | "out" } | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => words.every((w) => `${r.name} ${r.memberNo} ${r.parish}`.toLowerCase().includes(w)));
  }, [q, rows]);

  async function remove(pin: string, reason: string) {
    const scan = removing!.row[removing!.stage]!;
    const res = await api(`/api/admin/sessions/${sessionId}/records/${scan.id}`, { method: "DELETE", body: { pin, reason } });
    if (!res.ok) return { error: res.error, fields: res.fields };
    setRemoving(null);
    router.refresh();
  }

  if (!rows.length) return <Empty>No one has been scanned yet.</Empty>;

  return (
    <>
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, delegate ID or parish" className={`${inputClass} mb-3`} />
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Delegate</th>
              <th className="px-3 py-2 font-medium">Time in</th>
              <th className="px-3 py-2 font-medium">Time out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => (
              <tr key={r.memberId} className="align-top">
                <td className="px-3 py-2">
                  <Link href={`/admin/members/${r.memberId}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <span className="block font-mono text-xs text-muted">{r.memberNo}</span>
                </td>
                <td className="px-3 py-2">
                  <ScanCell scan={r.in} onRemove={canRemove ? () => setRemoving({ row: r, stage: "in" }) : undefined} />
                </td>
                <td className="px-3 py-2">
                  <ScanCell scan={r.out} onRemove={canRemove ? () => setRemoving({ row: r, stage: "out" }) : undefined} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Showing {shown.length} of {rows.length}
      </p>
      <ConfirmDialog
        open={!!removing}
        title={removing ? `Remove ${removing.row.name}'s time ${removing.stage}?` : ""}
        confirmLabel="Remove scan"
        danger
        askPin
        noteLabel="Why is this scan wrong?"
        noteRequired
        onCancel={() => setRemoving(null)}
        onConfirm={(v) => remove(v.pin, v.note)}
      >
        They can be scanned again afterwards. This is kept in the audit log.
      </ConfirmDialog>
    </>
  );
}
