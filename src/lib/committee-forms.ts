// Form rules for the Working Committee area (shared by browser and server).
import { z } from "zod";
import { DIOCESES, SHIRT_SIZES } from "./config";

const blankToNull = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).optional().transform((v) => (v ? v : null));
const time = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{2}:\d{2}$/.test(v), "Choose a time.");

export const staffSchema = z.object({
  full_name: z.string().trim().min(2, "Enter their full name.").max(120),
  committee_id: z.uuid({ error: "Choose a committee." }).optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  is_head: z.boolean().default(false),
  diocese: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (DIOCESES as readonly string[]).includes(v), "Choose an arch/diocese from the list."),
  contact_number: blankToNull(40),
  shirt_size: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || (SHIRT_SIZES as readonly string[]).includes(v), "Choose a shirt size."),
});

export const committeeSchema = z
  .object({
    name: z.string().trim().min(1, "Give the committee a name.").max(80),
    shift_start: time,
    shift_end: time,
  })
  .refine((v) => !v.shift_start || !v.shift_end || v.shift_end > v.shift_start, { path: ["shift_end"], message: "The end must be after the start." });

const LINK = /^https?:\/\/\S+$/i;

export const deliverableSchema = z.object({
  name: z.string().trim().min(1, "Enter the deliverable.").max(160),
  // Philippine date and time "YYYY-MM-DDTHH:MM", optional.
  deadline: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Choose a date and time, or leave it blank."),
  link: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || LINK.test(v), "Paste a full link starting with https://"),
  status: z.enum(["not_started", "ongoing", "done"]).default("not_started"),
  committee_id: z.uuid().optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  staff_id: z.uuid().optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
  notes: blankToNull(1000),
});

export const dutyDaySchema = z
  .object({
    duty_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
    label: z.string().trim().min(1, "Say what the day is (e.g. Preparation meeting).").max(120),
    starts_at: z.string().regex(/^\d{2}:\d{2}$/, "Choose the expected start time."),
    ends_at: time,
  })
  .refine((v) => !v.ends_at || v.ends_at > v.starts_at, { path: ["ends_at"], message: "The end must be after the start." });
