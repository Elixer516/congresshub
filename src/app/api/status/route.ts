import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { HttpError, assertSameOrigin } from "@/lib/server/auth";
import { handle, ok, readJson } from "@/lib/server/http";
import { clientIp, rateLimit } from "@/lib/server/rate-limit";
import { referenceSchema } from "@/lib/schemas";

const schema = z.object({
  reference: referenceSchema,
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your birthday."),
});

const NOT_FOUND = "We couldn't find an application with that reference number and birthday. Check both and try again.";

// Public "Check my status". Needs both the reference number and the birthday,
// and is rate-limited so reference numbers can't be guessed.
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const ip = clientIp(req.headers);
  if (!(await rateLimit(`status-ip:${ip}`, 10, 15 * 60))) {
    throw new HttpError(429, "Too many tries. Please wait 15 minutes and try again.");
  }
  const { reference, birthday } = await readJson(req, schema);
  if (!(await rateLimit(`status-ref:${reference}`, 8, 60 * 60))) {
    throw new HttpError(429, "Too many tries for this reference number. Please wait an hour.");
  }

  const { data } = await db()
    .from("applications")
    .select("id, status, admin_note, birthday, first_name, created_at, decided_at")
    .eq("reference_no", reference)
    .maybeSingle();
  if (!data || data.birthday !== birthday) throw new HttpError(404, NOT_FOUND);

  let memberNo: string | null = null;
  if (data.status === "approved") {
    const { data: m } = await db().from("members").select("member_no").eq("application_id", data.id).maybeSingle();
    memberNo = m?.member_no ?? null;
  }

  return ok({
    status: data.status,
    note: data.admin_note,
    firstName: data.first_name,
    submittedAt: data.created_at,
    decidedAt: data.decided_at,
    memberNo,
  });
});
