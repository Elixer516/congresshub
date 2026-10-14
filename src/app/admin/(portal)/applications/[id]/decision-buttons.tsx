"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Button } from "@/components/ui";
import { api } from "@/lib/api-client";

type Kind = "approve" | "incomplete" | "reject";

export default function DecisionButtons({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<Kind | null>(null);

  async function decide(decision: Kind, v: { pin: string; note: string }) {
    const res = await api<{ memberId?: string }>(`/api/admin/applications/${id}/decision`, {
      body: { decision, note: v.note || undefined, pin: v.pin || undefined },
    });
    if (!res.ok) return { error: res.error, fields: res.fields };
    setOpen(null);
    if (decision === "approve" && res.data.memberId) router.push(`/admin/members/${res.data.memberId}?approved=1`);
    else router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setOpen("approve")}>Approve</Button>
      <Button variant="secondary" onClick={() => setOpen("incomplete")}>
        {status === "incomplete" ? "Update what's missing" : "Mark incomplete"}
      </Button>
      <Button variant="danger" onClick={() => setOpen("reject")}>
        Reject
      </Button>

      <ConfirmDialog
        open={open === "approve"}
        title={`Approve ${name}?`}
        confirmLabel="Approve and create delegate"
        noteLabel="Note for the applicant"
        onCancel={() => setOpen(null)}
        onConfirm={(v) => decide("approve", v)}
      >
        This creates their delegate record with a delegate ID and a QR badge.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === "incomplete"}
        title="Mark as incomplete"
        confirmLabel="Save"
        noteLabel="What's missing or needs fixing?"
        noteRequired
        notePlaceholder="e.g. The photo is blurry. Please send a clear 2x2 photo to your diocesan coordinator."
        onCancel={() => setOpen(null)}
        onConfirm={(v) => decide("incomplete", v)}
      >
        The applicant will see this note when they check their status.
      </ConfirmDialog>
      <ConfirmDialog
        open={open === "reject"}
        title={`Reject ${name}?`}
        confirmLabel="Reject application"
        danger
        askPin
        noteLabel="Reason"
        noteRequired
        onCancel={() => setOpen(null)}
        onConfirm={(v) => decide("reject", v)}
      >
        The applicant will see the reason when they check their status.
      </ConfirmDialog>
    </div>
  );
}
