"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { shrinkImage } from "@/lib/shrink-image";
import { MAX_FILE_BYTES } from "@/lib/config";

// Member photo with an "Add photo" / "Change photo" button. On phones the picker offers the camera.
export default function MemberPhoto({ id, hasPhoto, version }: { id: string; hasPhoto: boolean; version: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    const small = await shrinkImage(file, 1000);
    if (small.size > MAX_FILE_BYTES) {
      setBusy(false);
      setError("This photo is too big. Please use a smaller one.");
      return;
    }
    const form = new FormData();
    form.set("photo", small);
    const res = await api<{ version: string }>(`/api/admin/members/${id}/photo`, { form, timeoutMs: 60000 });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setV(res.data.version);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="group relative size-24 overflow-hidden rounded-xl bg-surface-2"
        aria-label={hasPhoto ? "Change photo" : "Add photo"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
        <img src={`/api/admin/members/${id}/photo?v=${v}`} alt="" className="size-full object-cover" />
        <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-[11px] font-semibold text-white">
          {busy ? "Uploading…" : hasPhoto ? "Change photo" : "Add photo"}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      {error ? <p className="max-w-40 text-center text-xs text-danger">{error}</p> : null}
    </div>
  );
}
