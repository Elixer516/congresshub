import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { requireAdminApi } from "@/lib/server/auth";
import { atLeast } from "@/lib/config";
import { handle, ok, readJson } from "@/lib/server/http";

// The signed-in admin's notifications (newest first) and unread count.
export const GET = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { allowPinChange: true, transportation: true });
  const [{ data: items }, { count }] = await Promise.all([
    db()
      .from("notifications")
      .select("id, kind, title, body, link, created_at, read_at, request_id, session_requests(status, handled_by_label)")
      .eq("admin_id", admin.id)
      .order("created_at", { ascending: false })
      .limit(30),
    db().from("notifications").select("id", { count: "exact", head: true }).eq("admin_id", admin.id).is("read_at", null),
  ]);
  return ok({
    unread: count ?? 0,
    canAnswer: atLeast(admin.role, "admin"),
    items: (items ?? []).map((n) => {
      const r = n.session_requests as unknown as { status: string; handled_by_label: string | null } | null;
      return {
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        link: n.link,
        createdAt: n.created_at,
        read: !!n.read_at,
        request: n.request_id && r ? { id: n.request_id, status: r.status, handledBy: r.handled_by_label?.replace(/ \(.*\)$/, "") ?? null } : null,
      };
    }),
  });
});

// Mark one notification (id) or all of them as read.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { allowPinChange: true, transportation: true });
  const { id } = await readJson(req, z.object({ id: z.uuid().optional() }));
  let q = db().from("notifications").update({ read_at: new Date().toISOString() }).eq("admin_id", admin.id).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
  return ok();
});
