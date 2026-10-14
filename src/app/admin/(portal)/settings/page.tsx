import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { getDriveSetting } from "@/lib/server/gdrive";
import { env } from "@/lib/server/env";
import { ROLE_LABELS } from "@/lib/config";
import { formatDateTime } from "@/lib/time";
import { Alert, Card, PageTitle } from "@/components/ui";
import { AdminAccounts, AttendanceSetting, DriveSettings } from "./settings-forms";

import SignOutButton from "../sign-out-button";

export const metadata: Metadata = { title: "Settings" };

const DRIVE_MESSAGES: Record<string, { tone: "ok" | "warn" | "danger"; text: string }> = {
  connected: { tone: "ok", text: "Google Drive is connected." },
  cancelled: { tone: "warn", text: "Google Drive was not connected (cancelled)." },
  failed: { tone: "danger", text: "Google Drive couldn't be connected. Please try again." },
  not_configured: { tone: "warn", text: "Google Drive isn't set up for this app yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the README)." },
};

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  const admin = await requireAdmin({ transportation: true });
  const { drive: driveMsg } = await searchParams;
  const isHead = admin.role === "head_admin";

  const [settings, drive, admins] = isHead
    ? await Promise.all([
        db().from("settings").select("key, value").neq("key", "gdrive").then((r) => Object.fromEntries((r.data ?? []).map((x) => [x.key, x.value]))),
        getDriveSetting().catch(() => null),
        db().from("admins").select("id, login_id, display_name, role, committee_id, is_active, totp_enabled, last_sign_in_at, locked_until").order("display_name").then((r) => r.data ?? []),
      ])
    : [{}, null, []];
  const { data: committees } = isHead ? await db().from("committees").select("id, name").order("name") : { data: [] };

  const msg = typeof driveMsg === "string" ? DRIVE_MESSAGES[driveMsg] : undefined;

  return (
    <>
      <PageTitle title="Settings" />
      {msg ? (
        <Alert tone={msg.tone} className="mb-4">
          {msg.text}
        </Alert>
      ) : null}

      <div className="space-y-4">
        <Card>
          <h2 className="font-bold text-primary">My account</h2>
          <p className="mt-1 text-sm text-muted">
            {admin.display_name} · {admin.login_id} · {ROLE_LABELS[admin.role]}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/change-pin" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold">
              Change my PIN
            </Link>
            <SignOutButton />
          </div>
        </Card>

        {isHead ? (
          <>
            <Card>
              <h2 className="font-bold text-primary">Attendance</h2>
              <AttendanceSetting allow={(settings as Record<string, unknown>).allow_timeout_without_timein === true} />
            </Card>

            <Card>
              <h2 className="font-bold text-primary">Where files are kept</h2>
              <DriveSettings
                store={(settings as Record<string, unknown>).file_store === "gdrive" && drive ? "gdrive" : "supabase"}
                driveEmail={drive?.email ?? null}
                configured={!!env.googleClientId && !!env.googleClientSecret}
              />
            </Card>

            <Card>
              <h2 className="font-bold text-primary">Admin accounts</h2>
              <AdminAccounts
                selfId={admin.id}
                committees={committees ?? []}
                admins={admins.map((a) => ({
                  id: a.id,
                  loginId: a.login_id,
                  name: a.display_name,
                  role: a.role,
                  committeeId: a.committee_id,
                  active: a.is_active,
                  twoStep: a.totp_enabled,
                  lastSignIn: a.last_sign_in_at ? formatDateTime(a.last_sign_in_at) : null,
                  locked: !!a.locked_until && new Date(a.locked_until) > new Date(),
                }))}
              />
            </Card>
          </>
        ) : (
          <p className="text-sm text-muted">Other settings are managed by the head admin.</p>
        )}
      </div>
    </>
  );
}
