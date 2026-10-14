"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import { Empty } from "@/components/list-controls";
import { Alert, Badge, Button, Field, Input, Textarea, cx } from "@/components/ui";
import { api } from "@/lib/api-client";
import { TRIP_DONE, TRIP_STATUS, type TripStatus } from "@/lib/config";
import { formatDateTime } from "@/lib/time";
import { mapLink } from "@/lib/trip-forms";

type Update = { status: string; location: string | null; lat: number | null; lng: number | null; note: string | null; passengers: number | null; by: string; at: string };

export type TripItem = {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  driver: string | null;
  passengers: number | null;
  status: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  updatedAt: string;
  updatedBy: string | null;
  history: Update[];
};

const st = (s: string) => TRIP_STATUS[s as TripStatus] ?? TRIP_STATUS.preparing;
// Choices when posting an update ("Getting ready" is only the starting state).
const UPDATE_CHOICES = (Object.keys(TRIP_STATUS) as TripStatus[]).filter((s) => s !== "preparing");

export default function TripBoard({ items, canPost, canRemove }: { items: TripItem[]; canPost: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [updating, setUpdating] = useState<TripItem | null>(null);
  const [editing, setEditing] = useState<TripItem | "new" | null>(null);
  const [removing, setRemoving] = useState<TripItem | null>(null);
  const busy = !!(updating || editing || removing);

  // Keep the board fresh while it's open (skipped while a form is open).
  useEffect(() => {
    if (busy) return;
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30000);
    return () => clearInterval(t);
  }, [busy, router]);

  const active = items.filter((t) => !TRIP_DONE.includes(t.status as TripStatus));
  const done = items.filter((t) => TRIP_DONE.includes(t.status as TripStatus));
  const onRoad = active.filter((t) => t.status !== "preparing").length;
  const delayed = active.filter((t) => t.status === "delayed").length;
  const arrived = items.filter((t) => t.status === "arrived").length;

  const card = (t: TripItem) => (
    <TripCard
      key={t.id}
      t={t}
      canPost={canPost}
      canRemove={canRemove}
      onUpdate={() => setUpdating(t)}
      onEdit={() => setEditing(t)}
      onRemove={() => setRemoving(t)}
    />
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="On the road" value={onRoad} />
        <Stat label="Delayed" value={delayed} tone={delayed ? "text-danger" : undefined} />
        <Stat label="Arrived" value={arrived} tone="text-ok" />
      </div>

      {canPost ? (
        <Button onClick={() => setEditing("new")} className="w-full sm:w-auto">
          + Add a trip
        </Button>
      ) : null}

      <section>
        <h2 className="mb-2 font-bold text-primary">Current trips</h2>
        {active.length ? <ul className="space-y-3">{active.map(card)}</ul> : <Empty>{canPost ? "No trips yet. Add one for each vehicle or group." : "No trips on the road right now."}</Empty>}
      </section>

      {done.length ? (
        <section>
          <h2 className="mb-2 font-bold text-primary">Finished</h2>
          <ul className="space-y-3">{done.map(card)}</ul>
        </section>
      ) : null}

      {updating ? (
        <UpdateDialog
          trip={updating}
          onCancel={() => setUpdating(null)}
          onDone={() => {
            setUpdating(null);
            router.refresh();
          }}
        />
      ) : null}
      {editing ? (
        <TripDialog
          trip={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!removing}
        title={`Remove “${removing?.name ?? ""}”?`}
        confirmLabel="Remove trip"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const res = await api(`/api/admin/trips/${removing!.id}`, { method: "DELETE" });
          if (!res.ok) return { error: res.error };
          setRemoving(null);
          router.refresh();
        }}
      >
        <p className="text-sm text-muted">The trip and all its updates will be removed.</p>
      </ConfirmDialog>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-center">
      <p className={cx("text-2xl font-bold", tone ?? "text-primary")}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function TripCard({
  t,
  canPost,
  canRemove,
  onUpdate,
  onEdit,
  onRemove,
}: {
  t: TripItem;
  canPost: boolean;
  canRemove: boolean;
  onUpdate: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const s = st(t.status);
  const route = [t.origin, t.destination].filter(Boolean).join(" → ");
  return (
    <li id={`t-${t.id}`} className="scroll-mt-20 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">{t.name}</p>
          {route ? <p className="text-sm text-muted">{route}</p> : null}
          <p className="text-sm text-muted">
            {[t.driver ? `Driver: ${t.driver}` : null, t.passengers !== null ? `${t.passengers} on board` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="shrink-0 whitespace-nowrap">
          <Badge status={s.tone}>
            <span className="mr-1" aria-hidden>
              {s.icon}
            </span>
            {s.label}
          </Badge>
        </span>
      </div>

      {t.location || t.note || t.lat !== null ? (
        <div className="mt-3 space-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          {t.location || t.lat !== null ? (
            <p className="flex flex-wrap items-center gap-x-2">
              <span>📍 {t.location ?? "Shared location"}</span>
              {t.lat !== null && t.lng !== null ? (
                <a href={mapLink(t.lat, t.lng)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
                  Open map ↗
                </a>
              ) : null}
            </p>
          ) : null}
          {t.note ? <p className="whitespace-pre-line">{t.note}</p> : null}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted">
        Last update {formatDateTime(t.updatedAt)}
        {t.updatedBy ? ` by ${t.updatedBy}` : ""}
      </p>

      {canPost ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button onClick={onUpdate} className="min-h-10">
            Post update
          </Button>
          <button className="text-sm font-semibold text-primary underline" onClick={onEdit}>
            Edit trip
          </button>
          {canRemove ? (
            <button className="text-sm font-semibold text-danger underline" onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      {t.history.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted underline">Trip timeline ({t.history.length})</summary>
          <ol className="mt-2 space-y-2 border-l-2 border-border pl-3">
            {t.history.map((h, i) => (
              <li key={i}>
                <p className="font-semibold">
                  {st(h.status).icon} {st(h.status).label}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {formatDateTime(h.at)} · {h.by}
                  </span>
                </p>
                {h.location || h.lat !== null ? (
                  <p className="text-muted">
                    📍 {h.location ?? "Shared location"}
                    {h.lat !== null && h.lng !== null ? (
                      <>
                        {" "}
                        <a href={mapLink(h.lat, h.lng)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          map
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {h.passengers !== null ? <p className="text-muted">{h.passengers} on board</p> : null}
                {h.note ? <p className="whitespace-pre-line text-muted">{h.note}</p> : null}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

function Modal({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      onCancel={onCancel}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/50"
    >
      {children}
    </dialog>
  );
}

// "Where are you now?" — status, place, optional GPS location, note, people on board.
function UpdateDialog({ trip, onDone, onCancel }: { trip: TripItem; onDone: () => void; onCancel: () => void }) {
  const [status, setStatus] = useState<TripStatus | "">("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [passengers, setPassengers] = useState(trip.passengers !== null ? String(trip.passengers) : "");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsState, setGpsState] = useState<"idle" | "busy" | "error">("idle");
  const [gpsError, setGpsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const sending = useRef(false);

  function locate() {
    if (!navigator.geolocation) {
      setGpsState("error");
      setGpsError("This phone can't share its location.");
      return;
    }
    setGpsState("busy");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGps({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGpsState("idle");
      },
      (e) => {
        setGpsState("error");
        setGpsError(e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow it in the browser settings, or type the place instead." : "Couldn't get the location. Type the place instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    if (!status) {
      setErrors({ status: "Choose where the trip is." });
      return;
    }
    sending.current = true;
    setBusy(true);
    const res = await api(`/api/admin/trips/${trip.id}`, {
      body: { action: "update", status, location, note, passengers, lat: gps?.lat ?? null, lng: gps?.lng ?? null },
    });
    setBusy(false);
    sending.current = false;
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.fields ? "" : res.error);
      return;
    }
    onDone();
  }

  return (
    <Modal onCancel={onCancel}>
      <form onSubmit={send} className="space-y-4 p-5" noValidate>
        <div>
          <h2 className="text-lg font-bold">Post update</h2>
          <p className="text-sm text-muted">{trip.name}</p>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Where is the trip now?</legend>
          <div className="grid grid-cols-2 gap-2">
            {UPDATE_CHOICES.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setStatus(k);
                  setErrors((x) => ({ ...x, status: "" }));
                }}
                aria-pressed={status === k}
                className={cx(
                  "flex min-h-12 items-center gap-2 rounded-lg border px-3 text-left text-sm font-semibold",
                  status === k ? "border-primary bg-primary-soft text-primary ring-2 ring-primary" : "border-border bg-surface",
                )}
              >
                <span aria-hidden>{TRIP_STATUS[k].icon}</span>
                {TRIP_STATUS[k].label}
              </button>
            ))}
          </div>
          {errors.status ? <p className="mt-1 text-sm text-danger">{errors.status}</p> : null}
        </fieldset>

        <Field label="Where (place or landmark)" htmlFor="tu-loc" error={errors.location} hint="e.g. Panabo City, Shell station in Tagum">
          <Input id="tu-loc" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </Field>
        <div className="rounded-lg border border-dashed border-border p-3 text-sm">
          {gps ? (
            <p className="flex flex-wrap items-center gap-x-3">
              <span className="font-semibold text-ok">✓ Location added</span>
              <a href={mapLink(gps.lat, gps.lng)} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                check on map
              </a>
              <button type="button" className="text-danger underline" onClick={() => setGps(null)}>
                remove
              </button>
            </p>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={locate} busy={gpsState === "busy"} className="min-h-10">
                📍 Add my current location
              </Button>
              <p className="mt-1 text-xs text-muted">Optional. Lets admins open the spot on a map.</p>
              {gpsState === "error" ? <p className="mt-1 text-xs text-danger">{gpsError}</p> : null}
            </>
          )}
        </div>
        <Field label="People on board" htmlFor="tu-pax" error={errors.passengers}>
          <Input id="tu-pax" inputMode="numeric" value={passengers} onChange={(e) => setPassengers(e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        <Field label="Note" htmlFor="tu-note" error={errors.note} hint="e.g. ETA 30 minutes, flat tire, waiting for 2 delegates">
          <Textarea id="tu-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <p className="text-xs text-muted">The Secretariat, Admins and Head admin get a notification.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            Send update
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TripDialog({ trip, onDone, onCancel }: { trip: TripItem | null; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    name: trip?.name ?? "",
    origin: trip?.origin ?? "",
    destination: trip?.destination ?? "",
    driver: trip?.driver ?? "",
    passengers: trip?.passengers !== null && trip?.passengers !== undefined ? String(trip.passengers) : "",
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = trip ? await api(`/api/admin/trips/${trip.id}`, { body: { action: "edit", ...form } }) : await api("/api/admin/trips", { body: form });
    setBusy(false);
    if (!res.ok) {
      setErrors(res.fields ?? {});
      setError(res.fields ? "" : res.error);
      return;
    }
    onDone();
  }

  return (
    <Modal onCancel={onCancel}>
      <form onSubmit={save} className="space-y-4 p-5" noValidate>
        <h2 className="text-lg font-bold">{trip ? "Edit trip" : "Add a trip"}</h2>
        <Field label="Trip name" htmlFor="tr-name" required error={errors.name} hint="One per vehicle or group, e.g. “Van 1 — Tagum delegates”">
          <Input id="tr-name" value={form.name} onChange={set("name")} maxLength={120} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="tr-from" error={errors.origin}>
            <Input id="tr-from" value={form.origin} onChange={set("origin")} maxLength={120} />
          </Field>
          <Field label="To (destination)" htmlFor="tr-to" error={errors.destination}>
            <Input id="tr-to" value={form.destination} onChange={set("destination")} maxLength={120} />
          </Field>
          <Field label="Driver" htmlFor="tr-driver" error={errors.driver}>
            <Input id="tr-driver" value={form.driver} onChange={set("driver")} maxLength={120} />
          </Field>
          <Field label="People on board" htmlFor="tr-pax" error={errors.passengers}>
            <Input id="tr-pax" inputMode="numeric" value={form.passengers} onChange={(e) => setForm((f) => ({ ...f, passengers: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
          </Field>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {trip ? "Save" : "Add trip"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
