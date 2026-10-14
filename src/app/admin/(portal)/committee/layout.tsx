import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import { Alert, PageTitle } from "@/components/ui";
import CommitteeTabs from "./committee-tabs";

// Working Committee area. Committee heads see only their own committee.
export default async function CommitteeLayout({ children }: LayoutProps<"/admin/committee">) {
  const admin = await requireAdmin();
  if (admin.role === "committee_head" && !admin.committee_id) {
    return (
      <>
        <PageTitle title="Working Committee" />
        <Alert tone="warn">Your account isn&apos;t linked to a committee yet. Ask the head admin to link it in Settings → Admin accounts.</Alert>
      </>
    );
  }
  const { data: mine } = admin.committee_id ? await db().from("committees").select("name").eq("id", admin.committee_id).maybeSingle() : { data: null };
  return (
    <>
      <PageTitle
        title={admin.role === "committee_head" && mine ? `${mine.name} Committee` : "Working Committee"}
        subtitle={admin.role === "committee_head" ? "Your committee's deliverables and duty attendance." : "Deliverables, duty time-in and time-out, and staff."}
      />
      <CommitteeTabs />
      {children}
    </>
  );
}
