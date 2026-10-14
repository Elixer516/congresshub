"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Empty } from "@/components/list-controls";
import { Alert, Button, Field, Input, Textarea, cx, inputClass } from "@/components/ui";
import { api } from "@/lib/api-client";
import { formatTime, utcToLocalParts } from "@/lib/time";

type Row = {
  staffId: string;
  staffNo: string;
  name: string;
  committee: string | null;
  isHead: boolean;
  timeIn: string | null;
  timeOut: string | null;
  inBy: string | null;
  outBy: string | null;
  corrected: boolean;
  note: string | null;
  flags: { late: boolean; leftEarly: boolean; forgotOut: boolean; noShow: boolean; minutes: number | null };
};

const hours = (m: number | null) => (!m || m <= 0 ? "—" : `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${(m % 60).toString().padStart(Math.floor(m / 60) ? 2 : 1, "0")}m`);

function Flag({ tone, children }: { tone: "warn" | "danger" | "muted"; children: React.ReactNode }) {
  return (
    <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", tone === "warn" ? "bg-warn-soft text-warn" : tone === "danger" ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted")}>
      {children}
    </span>
  );
}

export default function DutyTable({ date, rows, canCorrect }: { date: string; rows: Row[]; canCorrect: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "issues">("all");
  const [fixing, setFixing] = useState<Row | null>(null);

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (!words.every((w) => `${r.name} ${r.staffNo} ${r.committee ?? ""}`.toLowerCase().includes(w))) return false;
      if (filter === "on") return !!r.timeIn && !r.timeOut;
      if (filter === "issues") return r.flags.late || r.flags.leftEarly || r.flags.forgotOut || r.flags.noShow;
      return true;
    });
  }, [rows, q, filter]);

  if (!rows.length) return <Empty>No Working Committee members yet. Add them in the Staff tab.</Empty>;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, staff no. or committee" className={cx(inputClass, "min-w-0 flex-1 basis-56")} />
        {(["all", "on", "issues"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cx("min-h-11 rounded-lg border px-3 text-sm font-semibold", filter === f ? "border-primary bg-primary-soft text-primary" : "border-border bg-surface")}
          >
            {f === "all" ? "Everyone" : f === "on" ? "On duty now" : "Late / missing"}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-surface-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Time in</th>
              <th className="px-3 py-2 font-medium">Time out</th>
              <th className="px-3 py-2 font-medium">Hours</th>
              {canCorrect ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((r) => (
              <tr key={r.staffId} className="align-top">
                <td className="px-3 py-2">
                  <Link href={`/admin/committee/staff/${r.staffId}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {r.committee ?? "No committee"}
                    {r.isHead ? " · Head" : ""}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.flags.noShow ? <Flag tone="danger">No-show</Flag> : null}
                    {r.flags.late ? <Flag tone="warn">Late</Flag> : null}
                    {r.flags.leftEarly ? <Flag tone="warn">Left early</Flag> : null}
                    {r.flags.forgotOut ? <Flag tone="danger">No time out</Flag> : null}
                    {r.corrected ? <Flag tone="muted">Corrected</Flag> : null}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.timeIn ? formatTime(r.timeIn) : "—"}
                  {r.inBy ? <span className="block text-xs text-muted">by {r.inBy}</span> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.timeOut ? formatTime(r.timeOut) : "—"}
                  {r.outBy ? <span className="block text-xs text-muted">by {r.outBy}</span> : null}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold">{hours(r.flags.minutes)}</td>
                {canCorrect ? (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setFixing(r)} className="text-xs font-semibold text-primary underline">
                      Correct
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Showing {shown.length} of {rows.length}
      </p>
      {fixing ? (
        <CorrectDialog
          date={date}
          row={fixing}
          onClose={(changed) => {
            setFixing(null);
            if (changed) router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

// Fix a forgotten or wrong time (Head admin / Admin). A reason is required and logged.
function CorrectDialog({ date, row, onClose }: { date: string; row: Row; onClose: (changed: boolean) => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [tin, setTin] = useState(row.timeIn ? utcToLocalParts(row.timeIn).time : "");
  const [tout, setTout] = useState(row.timeOut ? utcToLocalParts(row.timeOut).time : "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <dialog
      ref={(el) => {
        ref.current = el;
        if (el && !el.open) el.showModal();
      }}
      onCancel={() => onClose(false)}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      <form
        className="space-y-4 p-5"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const res = await api("/api/admin/duty/records", { body: { staff_id: row.staffId, duty_date: date, time_in: tin, time_out: tout, reason } });
          setBusy(false);
          if (!res.ok) {
            setErrors(res.fields ?? {});
            setError(res.error);
            return;
          }
          ref.current?.close();
          onClose(true);
        }}
      >
        <h2 className="text-lg font-bold">Correct {row.name}&apos;s duty time</h2>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time in" htmlFor="cx-in" error={errors.time_in}>
            <Input id="cx-in" type="time" value={tin} onChange={(e) => setTin(e.target.value)} />
          </Field>
          <Field label="Time out" htmlFor="cx-out" error={errors.time_out}>
            <Input id="cx-out" type="time" value={tout} onChange={(e) => setTout(e.target.value)} />
          </Field>
        </div>
        <Field label="Reason" htmlFor="cx-reason" required error={errors.reason}>
          <Textarea id="cx-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to scan out at 9 PM" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { ref.current?.close(); onClose(false); }}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Save correction
          </Button>
        </div>
      </form>
    </dialog>
  );
}
