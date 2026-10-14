import { db } from "@/lib/server/supabase";
import { HttpError, requireAdminApi } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { cleanSearch, wordFilters } from "@/lib/server/list-helpers";

type Rec = { stage: string; scanned_at: string; method: string; members: unknown };
const shape = (r: Rec) => {
  const m = r.members as { id: string; member_no: string; first_name: string; last_name: string };
  return { stage: r.stage, time: r.scanned_at, manual: r.method === "manual", member: { id: m.id, member_no: m.member_no, name: `${m.first_name} ${m.last_name}` } };
};

// Counts, the signed-in admin's own scans, and (with ?q=) active members matching a search for manual entry.
// With ?mine=1: every scan this admin made in this session, newest first.
export const GET = handle(async (req: Request, ctx: RouteContext<"/api/admin/sessions/[id]/summary">) => {
  const admin = await requireAdminApi(req, { min: "secretariat", transportation: true });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, "Session not found.");
  const params = new URL(req.url).searchParams;
  const q = cleanSearch(params.get("q"));

  if (params.get("mine") === "1") {
    const { data } = await db()
      .from("attendance_records")
      .select("stage, scanned_at, method, members(id, member_no, first_name, last_name)")
      .eq("session_id", id)
      .eq("scanned_by", admin.id)
      .order("recorded_at", { ascending: false })
      .limit(2000);
    return ok({ scans: (data ?? []).map(shape) });
  }

  if (q) {
    let query = db().from("members").select("id, member_no, first_name, last_name, parish").eq("status", "active");
    for (const f of wordFilters(q, ["last_name", "first_name", "member_no", "nickname"])) query = query.or(f);
    const { data: members } = await query.order("last_name").limit(15);
    const ids = (members ?? []).map((m) => m.id);
    const { data: recs } = ids.length
      ? await db().from("attendance_records").select("member_id, stage, scanned_at").eq("session_id", id).in("member_id", ids)
      : { data: [] };
    return ok({
      members: (members ?? []).map((m) => ({
        ...m,
        in: recs?.find((r) => r.member_id === m.id && r.stage === "in")?.scanned_at ?? null,
        out: recs?.find((r) => r.member_id === m.id && r.stage === "out")?.scanned_at ?? null,
      })),
    });
  }

  const [{ data: s }, inCount, outCount, mine, { data: recent }] = await Promise.all([
    db().from("attendance_sessions").select("id, title, status, starts_at, ends_at").eq("id", id).maybeSingle(),
    db().from("attendance_records").select("id", { count: "exact", head: true }).eq("session_id", id).eq("stage", "in"),
    db().from("attendance_records").select("id", { count: "exact", head: true }).eq("session_id", id).eq("stage", "out"),
    db().from("attendance_records").select("id", { count: "exact", head: true }).eq("session_id", id).eq("scanned_by", admin.id),
    db()
      .from("attendance_records")
      .select("stage, scanned_at, method, members(id, member_no, first_name, last_name)")
      .eq("session_id", id)
      .eq("scanned_by", admin.id)
      .order("recorded_at", { ascending: false })
      .limit(6),
  ]);
  if (!s) throw new HttpError(404, "This session no longer exists.");
  return ok({
    session: s,
    counts: { in: inCount.count ?? 0, out: outCount.count ?? 0 },
    mine: mine.count ?? 0,
    recent: (recent ?? []).map(shape),
  });
});
