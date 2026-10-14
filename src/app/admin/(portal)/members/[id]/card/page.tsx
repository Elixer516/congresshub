import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/auth";
import { db } from "@/lib/server/supabase";
import PrintButton from "./print-button";
import BackLink from "@/components/back-link";

export const metadata: Metadata = { title: "ID card" };

export default async function CardPage({ params }: PageProps<"/admin/members/[id]/card">) {
  await requireAdmin({ min: "secretariat" });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: m } = await db().from("members").select("id, member_no, first_name, last_name").eq("id", id).maybeSingle();
  if (!m) notFound();

  return (
    <>
      <div className="no-print mb-4">
        <BackLink href={`/admin/members/${m.id}`} label={`Back to ${m.first_name} ${m.last_name}`} />
        <h1 className="mt-2 text-2xl font-bold">ID card</h1>
        <p className="text-sm text-muted">Youth Congress 2026 ID, coloured by region. Prints at about 105 × 148 mm (A6, portrait). Print on thick paper, cut, and laminate if you can.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <PrintButton />
          <a
            href={`/api/admin/members/${m.id}/card?download=1`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-4 text-sm font-semibold"
          >
            Download picture
          </a>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- generated per request behind a permission check */}
      <img
        src={`/api/admin/members/${m.id}/card`}
        alt={`ID card for ${m.first_name} ${m.last_name}`}
        className="w-full max-w-sm rounded-xl border border-border shadow-sm print:w-[105mm] print:max-w-none print:rounded-none print:border-black/20 print:shadow-none"
      />
    </>
  );
}
