import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/lib/config";
import { formatDateTime } from "@/lib/time";
import { Alert, Badge, Card } from "@/components/ui";
import PersonDetails from "@/components/person-details";
import FileViewer from "@/components/file-viewer";
import DecisionButtons from "./decision-buttons";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/admin/applications/[id]">) {
  await requireAdmin({ min: "admin" });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [{ data: app }, { data: files }, { data: member }] = await Promise.all([
    db().from("applications").select("*, admins(display_name)").eq("id", id).maybeSingle(),
    db().from("files").select("id, label, mime").eq("application_id", id).order("created_at"),
    db().from("members").select("id, member_no").eq("application_id", id).maybeSingle(),
  ]);
  if (!app) notFound();
  const decider = app.admins as { display_name: string } | null;
  const open = app.status === "pending" || app.status === "incomplete";

  return (
    <>
      <BackLink href={`/admin/applications?status=${app.status}`} label="Back to Applications" />
      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {app.title} {app.first_name} {app.last_name}
          </h1>
          <p className="mt-1 font-mono text-sm text-muted">{app.reference_no}</p>
          <p className="mt-1 text-sm text-muted">Applied {formatDateTime(app.created_at)}</p>
        </div>
        <Badge status={app.status}>{APPLICATION_STATUS_LABELS[app.status as ApplicationStatus]}</Badge>
      </div>

      {app.admin_note ? (
        <Alert tone={app.status === "rejected" ? "danger" : app.status === "incomplete" ? "warn" : "info"} className="mb-4">
          <strong>{app.status === "rejected" ? "Reason" : "Note"}:</strong> {app.admin_note}
          {app.decided_at ? (
            <span className="block text-xs text-muted">
              {decider?.display_name ?? "An admin"} · {formatDateTime(app.decided_at)}
            </span>
          ) : null}
        </Alert>
      ) : null}

      {member ? (
        <Alert tone="ok" className="mb-4">
          Approved as delegate{" "}
          <Link href={`/admin/members/${member.id}`} className="font-mono font-semibold underline">
            {member.member_no}
          </Link>
          .
        </Alert>
      ) : null}

      {open ? <DecisionButtons id={app.id} name={`${app.first_name} ${app.last_name}`} status={app.status} /> : null}

      <Card className="mb-4 mt-4">
        <h2 className="mb-3 font-bold">Documents</h2>
        <FileViewer files={files ?? []} />
      </Card>

      <PersonDetails person={app} />
    </>
  );
}
