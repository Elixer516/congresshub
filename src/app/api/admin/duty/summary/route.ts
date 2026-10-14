import { db } from "@/lib/server/supabase";
import { requireAdminApi } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { cleanSearch, wordFilters } from "@/lib/server/list-helpers";
import { dutyDateOf } from "@/lib/server/committee";

type Row = { staff_id: string; time_in: string | null; time_out: string | null; in_by: string | null; out_by: string | null; in_method: string | null; out_method: string | null };

// Today's duty counts and this admin's own scans; ?q= searches staff for manual entry; ?mine=1 lists my scans.
export const GET = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "secretariat" });
  const params = new URL(req.url).searchParams;
  const today = dutyDateOf(new Date());
  const q = cleanSearch(params.get("q"));

  if (q) {
    let query = db().from("committee_staff").select("id, staff_no, full_name, committees(name)").eq("status", "active");
    for (const f of wordFilters(q, ["full_name", "staff_no"])) query = query.or(f);
    const { data: staff } = await query.order("full_name").limit(15);
    const ids = (staff ?? []).map((s) => s.id);
    const { data: recs } = ids.length ? await db().from("duty_records").select("staff_id, time_in, time_out").eq("duty_date", today).in("staff_id", ids) : { data: [] };
    return ok({
      members: (staff ?? []).map((s) => {
        const r = recs?.find((x) => x.staff_id === s.id);
        const c = s.committees as unknown as { name: string } | null;
        return { id: s.id, member_no: s.staff_no, first_name: s.full_name, last_name: "", parish: c?.name ?? "No committee", in: r?.time_in ?? null, out: r?.time_out ?? null };
      }),
    });
  }

  const { data: recs } = await db()
    .from("duty_records")
    .select("staff_id, time_in, time_out, in_by, out_by, in_method, out_method, committee_staff(id, staff_no, full_name)")
    .eq("duty_date", today);
  const rows = (recs ?? []) as unknown as (Row & { committee_staff: { id: string; staff_no: string; full_name: string } })[];

  // This admin's scans today, newest first.
  const mine = rows
    .flatMap((r) => [
      r.in_by === admin.id && r.time_in ? { stage: "in", time: r.time_in, manual: r.in_method === "manual", s: r.committee_staff } : null,
      r.out_by === admin.id && r.time_out ? { stage: "out", time: r.time_out, manual: r.out_method === "manual", s: r.committee_staff } : null,
    ])
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.time.localeCompare(a.time))
    .map((x) => ({ stage: x.stage, time: x.time, manual: x.manual, member: { id: x.s.id, member_no: x.s.staff_no, name: x.s.full_name } }));

  if (params.get("mine") === "1") return ok({ scans: mine });

  return ok({
    session: { id: "duty", title: "Working Committee duty", status: "open" },
    counts: { in: rows.filter((r) => r.time_in).length, out: rows.filter((r) => r.time_out).length },
    mine: mine.length,
    recent: mine.slice(0, 6),
  });
});
