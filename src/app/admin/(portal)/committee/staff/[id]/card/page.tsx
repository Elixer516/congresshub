import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import BackLink from "@/components/back-link";
import PrintButton from "../../../../members/[id]/card/print-button";

export const metadata: Metadata = { title: "Working Committee ID card" };

export default async function StaffCardPage({ params }: PageProps<"/admin/committee/staff/[id]/card">) {
  await requireAdmin({ min: "secretariat" });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: s } = await db().from("committee_staff").select("id, staff_no, full_name").eq("id", id).maybeSingle();
  if (!s) notFound();
  return (
    <>
      <div className="no-print mb-4">
        <BackLink href={`/admin/committee/staff/${s.id}`} label={`Back to ${s.full_name}`} />
        <h1 className="mt-2 text-2xl font-bold">Working Committee ID card</h1>
        <p className="text-sm text-muted">Prints at real ID size (85.6 × 54 mm). Crimson and gold, so staff stand out from delegates.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrintButton />
          <a href={`/api/admin/staff/${s.id}/card?download=1`} className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold">
            Download picture
          </a>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per request behind a permission check */}
      <img
        src={`/api/admin/staff/${s.id}/card`}
        alt={`ID card for ${s.full_name}`}
        className="w-full max-w-xl rounded-xl border border-border shadow-sm print:w-[85.6mm] print:max-w-none print:rounded-none print:border-black/20 print:shadow-none"
      />
    </>
  );
}
