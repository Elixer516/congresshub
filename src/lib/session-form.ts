import { z } from "zod";
import { SESSION_TYPES } from "./config";
import { localToUtc } from "./time";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Choose a time.");
const blank = z.literal("").transform(() => undefined);

// Session form: dates and times are Philippine time. The end time is optional.
export const sessionSchema = z
  .object({
    title: z.string().trim().min(1, "Give the session a name.").max(120),
    type: z.enum(Object.keys(SESSION_TYPES) as [keyof typeof SESSION_TYPES], { error: "Choose a type." }),
    date,
    start: time,
    end_date: date.optional().or(blank),
    end: time.optional().or(blank),
    venue: z.string().trim().max(120).optional().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.end_date && !v.end) ctx.addIssue({ code: "custom", path: ["end"], message: "Add an end time, or clear the end date." });
  })
  .transform((v) => ({
    title: v.title,
    type: v.type,
    venue: v.venue,
    starts_at: localToUtc(v.date, v.start).toISOString(),
    ends_at: v.end ? localToUtc(v.end_date ?? v.date, v.end).toISOString() : null,
  }))
  .refine((v) => v.ends_at === null || new Date(v.ends_at) > new Date(v.starts_at), { path: ["end"], message: "The end must be after the start." });
