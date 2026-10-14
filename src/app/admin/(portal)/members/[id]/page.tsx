import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { qrSvg } from "@/lib/server/qr";
import { MEMBER_STATUS_LABELS, SESSION_TYPES, atLeast, regionOf, type MemberStatus, type SessionType } from "@/lib/config";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";
import { PERSON_FIELDS } from "@/lib/schemas";
import { Alert, Badge, Card } from "@/components/ui";
import PersonDetails, { DETAIL_GROUPS } from "@/components/person-details";
import AssignmentEditor from "./assignment-editor";
import FileViewer from "@/components/file-viewer";
import MemberActions from "./member-actions";
import MemberPhoto from "./member-photo";
import KitPanel from "./kit-panel";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Delegate" };

export default async function MemberPage({ params, searchParams }: PageProps<"/admin/members/[id]">) {
  const admin = await requireAdmin({ min: "secretariat", transportation: true });
  const canEdit = atLeast(admin.role, "admin");
  const { id } = await params;
  const { approved, from } = await searchParams;
  // Opened from the Assignments page: "Back" returns there (to the same tab and search).
  const back = from === "assignments" ? { href: "/admin/assignments", label: "Back to Assignments" } : { href: "/admin/members", label: "Back to Delegates" };
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  if (admin.role === "transportation") return <TransportationView id={id} back={back} />;

  const [{ data: m }, { data: files }, { data: records }, { data: everyone }] = await Promise.all([
    db().from("members").select("*").eq("id", id).maybeSingle(),
    db().from("files").select("id, label, mime, kind").eq("member_id", id).order("created_at"),
    db()
      .from("attendance_records")
      .select("stage, scanned_at, session_id, attendance_sessions(title, type, starts_at)")
      .eq("member_id", id)
      .order("scanned_at", { ascending: false })
      .limit(200),
    db().from("members").select("parish_assignment, dynamic_group, community_immersion").eq("status", "active").limit(5000),
  ]);
  if (!m) notFound();
  const photoFile = (files ?? []).filter((f) => f.kind === "photo").at(-1);

  // Choices for reassigning: every group / place / parish in use, with how many are there now.
  const optionsFor = (f: "parish_assignment" | "dynamic_group" | "community_immersion") => {
    const counts = new Map<string, number>();
    for (const x of everyone ?? []) if (x[f]) counts.set(x[f], (counts.get(x[f]) ?? 0) + 1);
    const list = [...counts].map(([value, count]) => ({ value, count }));
    if (f === "dynamic_group") {
      list.sort((a, b) => Number(a.value) - Number(b.value));
      list.push({ value: String(Math.max(0, ...list.map((o) => Number(o.value) || 0)) + 1), count: 0 }); // room for one new group
    } else list.sort((a, b) => a.value.localeCompare(b.value));
    return list;
  };

  // Group time in / time out per session.
  type Row = { title: string; type: string; startsAt: string; in?: string; out?: string };
  const bySession = new Map<string, Row>();
  for (const r of records ?? []) {
    const s = r.attendance_sessions as unknown as { title: string; type: string; starts_at: string } | null;
    if (!s) continue;
    const row = bySession.get(r.session_id) ?? { title: s.title, type: s.type, startsAt: s.starts_at };
    row[r.stage as "in" | "out"] = r.scanned_at;
    bySession.set(r.session_id, row);
  }
  const history = [...bySession.values()].sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  const details = Object.fromEntries(
    PERSON_FIELDS.map((f) => [f, f === "has_driver" ? (m.has_driver === true ? "Yes" : m.has_driver === false ? "No" : "") : (m[f] ?? "")]),
  );

  return (
    <>
      <BackLink href={back.href} label={back.label} />
      {approved ? (
        <Alert tone="ok" className="mt-3">
          Application approved. {m.first_name} is now member {m.member_no}.
        </Alert>
      ) : null}

      <div className="mb-5 mt-3 flex flex-wrap items-center gap-4">
        {canEdit ? (
          <MemberPhoto id={m.id} hasPhoto={!!photoFile} version={photoFile?.id ?? "none"} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route
          <img src={`/api/admin/members/${m.id}/photo`} alt="" className="size-24 rounded-xl bg-surface-2 object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {m.title} {m.first_name} {m.last_name}
          </h1>
          <p className="font-mono text-sm text-muted">{m.member_no}</p>
          <p className="text-sm text-muted">
            {m.position ? `${m.position} · ` : ""}
            {m.diocese}
          </p>
        </div>
        <Badge status={m.status}>{MEMBER_STATUS_LABELS[m.status as MemberStatus]}</Badge>
      </div>

      <KitPanel id={m.id} receivedAt={m.kit_received_at} receivedBy={m.kit_received_by} shirtSize={m.shirt_size} />

      {canEdit ? <MemberActions id={m.id} name={`${m.first_name} ${m.last_name}`} status={m.status} details={details} /> : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <AssignmentEditor
            id={m.id}
            name={`${m.first_name} ${m.last_name}`}
            canEdit={canEdit}
            current={{ parish_assignment: m.parish_assignment, dynamic_group: m.dynamic_group, community_immersion: m.community_immersion, remarks: m.remarks }}
            options={{ parish_assignment: optionsFor("parish_assignment"), dynamic_group: optionsFor("dynamic_group"), community_immersion: optionsFor("community_immersion") }}
          />
          <PersonDetails person={m} groups={DETAIL_GROUPS.filter((g) => g.title !== "Youth Congress assignment")} />
          <Card>
            <h2 className="mb-3 font-bold">Attendance history</h2>
            {history.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Session</th>
                      <th className="py-1 pr-3 font-medium">Date</th>
                      <th className="py-1 pr-3 font-medium">In</th>
                      <th className="py-1 font-medium">Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-3">
                          {h.title}
                          <span className="block text-xs text-muted">{SESSION_TYPES[h.type as SessionType]}</span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{formatDate(h.startsAt)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{h.in ? formatTime(h.in) : "—"}</td>
                        <td className="py-2 whitespace-nowrap">{h.out ? formatTime(h.out) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No attendance yet.</p>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-bold">QR badge</h2>
            {m.status === "active" ? null : (
              <Alert tone="warn" className="mb-3">
                This badge won&apos;t be accepted while the delegate is {MEMBER_STATUS_LABELS[m.status as MemberStatus].toLowerCase()}.
              </Alert>
            )}
            <div className="qr-light mx-auto w-48 rounded-lg p-2" dangerouslySetInnerHTML={{ __html: qrSvg(m.qr_token, m.qr_mask ?? 0) }} />
            <Link
              href={`/admin/members/${m.id}/card`}
              className="mt-3 flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-fg"
            >
              ID card — print or download
            </Link>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Documents</h2>
            <FileViewer files={files ?? []} />
            <p className="mt-3 text-xs text-muted">Folder: {m.folder_name}</p>
          </Card>
          <p className="text-xs text-muted">Delegate since {formatDateTime(m.joined_at)}</p>
        </div>
      </div>
    </>
  );
}

// Transportation accounts: name, church details, region and travel only (no contact, health or family details).
const TRANSPORT_COLUMNS =
  "id, member_no, title, first_name, last_name, nickname, status, position, parish, diocese, transport_mode, arrival_eta, departure_eta, has_driver, driver_name, parish_assignment, dynamic_group, community_immersion";

async function TransportationView({ id, back }: { id: string; back: { href: string; label: string } }) {
  const { data: m } = await db().from("members").select(TRANSPORT_COLUMNS).eq("id", id).maybeSingle();
  if (!m) notFound();
  const region = regionOf(m.diocese);
  return (
    <>
      <BackLink href={back.href} label={back.label} />
      <div className="mb-5 mt-3 flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- permission-checked photo route */}
        <img src={`/api/admin/members/${m.id}/photo`} alt="" className="size-24 rounded-xl bg-surface-2 object-cover" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {m.title} {m.first_name} {m.last_name}
          </h1>
          <p className="font-mono text-sm text-muted">{m.member_no}</p>
          {region ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: region.ink }}>
              <span className="size-2.5 rounded-full" style={{ background: region.color }} aria-hidden />
              {region.key}
            </p>
          ) : null}
        </div>
        <Badge status={m.status}>{MEMBER_STATUS_LABELS[m.status as MemberStatus]}</Badge>
      </div>
      <PersonDetails
        person={m}
        groups={[
          { title: "About", fields: ["title", "last_name", "first_name", "nickname"] },
          { title: "Church", fields: ["diocese", "parish", "position"] },
          { title: "Travel to the event", fields: ["transport_mode", "arrival_eta", "departure_eta", "has_driver", "driver_name"] },
          { title: "Youth Congress assignment", fields: ["parish_assignment", "dynamic_group", "community_immersion"] },
        ]}
      />
    </>
  );
}
