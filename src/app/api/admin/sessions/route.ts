import { db } from "@/lib/server/supabase";
import { actorOf, requireAdminApi } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { audit } from "@/lib/server/audit";
import { sessionSchema } from "@/lib/session-form";

// Create an attendance session. It opens itself at its start time.
export const POST = handle(async (req: Request) => {
  const admin = await requireAdminApi(req, { min: "admin" });
  const s = await readJson(req, sessionSchema);
  const { data, error } = await db()
    .from("attendance_sessions")
    .insert({ ...s, status: "scheduled", created_by: admin.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(actorOf(admin), { action: "session.created", targetType: "session", targetId: data.id, targetLabel: s.title, after: s });
  await db().rpc("auto_open_sessions");
  return ok({ id: data.id });
});
