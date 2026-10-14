// Form rules shared by the browser and the server.
import { z } from "zod";
import { DIOCESES, SEXES, SHIRT_SIZES, TITLES, TRANSPORT_MODES } from "./config";
import { ageOn } from "./time";

const text = (label: string, max = 100) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `Keep it under ${max} characters.`);

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

const phone = (label: string) =>
  z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .regex(/^\+?[0-9][0-9 -]{6,18}[0-9]$/, "Enter a phone number using numbers only, like 0917 123 4567.");

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[0-9][0-9 -]{6,18}[0-9]$/.test(v), "Enter a phone number using numbers only, like 0917 123 4567.");

const oneOf = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.enum(values, { error: message });

export const personSchema = z.object({
  title: oneOf(TITLES, "Choose a title."),
  last_name: text("your last name", 60),
  first_name: text("your first name", 60),
  middle_name: optionalText(60),
  nickname: text("your nickname", 40),
  sex: oneOf(SEXES, "Choose male or female."),
  birthday: z
    .string({ error: "Enter your birthday." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your birthday.")
    .refine((v) => {
      const age = ageOn(v);
      return age >= 10 && age <= 100;
    }, "Check your birthday — the year looks wrong."),
  contact_number: phone("your contact number"),
  email: z
    .string({ error: "Enter your email address." })
    .trim()
    .toLowerCase()
    .min(1, "Enter your email address.")
    .max(120)
    .refine((v) => z.email().safeParse(v).success, "Enter a valid email address, like juan@gmail.com."),
  address: text("your home address", 200),
  diocese: oneOf(DIOCESES, "Choose your diocese."),
  // Optional: many delegates are assigned a host parish instead (stored as "" when blank).
  parish: z.string().trim().max(120, "Keep it under 120 characters.").optional().transform((v) => v ?? ""),
  position: text("your position (choose “Youth Member” if you don't hold one)", 80),
  school_or_work: optionalText(120),
  year_level_or_occupation: optionalText(80),
  guardian_name: optionalText(100),
  guardian_contact: optionalPhone,
  emergency_name: text("an emergency contact's name", 100),
  emergency_relation: text("how they're related to you", 40),
  emergency_contact: phone("the emergency contact's number"),
  shirt_size: oneOf(SHIRT_SIZES, "Choose your shirt size."),
  medical_condition: optionalText(300),
  allergies: optionalText(200),
  // Event travel details
  transport_mode: oneOf(TRANSPORT_MODES, "Choose how you'll travel."),
  arrival_eta: z.string({ error: "Enter when you expect to arrive." }).regex(DATETIME, "Enter when you expect to arrive (date and time)."),
  departure_eta: z.string({ error: "Enter when you expect to leave." }).regex(DATETIME, "Enter when you expect to leave (date and time)."),
  has_driver: z
    .enum(["Yes", "No", ""])
    .optional()
    .transform((v) => (v === "Yes" ? true : v === "No" ? false : null)),
  driver_name: optionalText(100),
  driver_contact: optionalPhone,
});

// Driver questions apply only to people coming in a private vehicle.
function travelRules<
  T extends { transport_mode: string | null; arrival_eta: string | null; departure_eta: string | null; has_driver: boolean | null; driver_name: string | null; driver_contact: string | null },
>(v: T, ctx: z.RefinementCtx) {
  if (v.arrival_eta && v.departure_eta && DATETIME.test(v.arrival_eta) && DATETIME.test(v.departure_eta) && v.departure_eta <= v.arrival_eta) {
    ctx.addIssue({ code: "custom", path: ["departure_eta"], message: "Leaving should be after arriving." });
  }
  if (v.transport_mode !== "Private Vehicle") return;
  if (v.has_driver === null) ctx.addIssue({ code: "custom", path: ["has_driver"], message: "Tell us if a driver is coming with you." });
  if (v.has_driver) {
    if (!v.driver_name) ctx.addIssue({ code: "custom", path: ["driver_name"], message: "Enter your driver's full name." });
    if (!v.driver_contact) ctx.addIssue({ code: "custom", path: ["driver_contact"], message: "Enter your driver's number." });
  }
}

// Under 18 needs a parent or guardian.
function requireGuardian<T extends { birthday: string | null; guardian_name: string | null; guardian_contact: string | null }>(
  v: T,
  ctx: z.RefinementCtx,
) {
  if (!v.birthday || ageOn(v.birthday) >= 18) return;
  if (!v.guardian_name) ctx.addIssue({ code: "custom", path: ["guardian_name"], message: "Applicants under 18 need a parent or guardian." });
  if (!v.guardian_contact)
    ctx.addIssue({ code: "custom", path: ["guardian_contact"], message: "Enter your parent or guardian's number." });
}

// Driver details only make sense for a private vehicle with a driver; anything else is dropped.
function tidyTravel<T extends { transport_mode: string | null; has_driver: boolean | null; driver_name: string | null; driver_contact: string | null }>(v: T): T {
  if (v.transport_mode !== "Private Vehicle") return { ...v, has_driver: null, driver_name: null, driver_contact: null };
  if (v.has_driver === false) return { ...v, driver_name: null, driver_contact: null };
  return v;
}

export const applicationSchema = personSchema
  .extend({
    consent: z.literal(true, { error: "Please tick the box to agree before sending." }),
  })
  .superRefine(requireGuardian)
  .superRefine(travelRules)
  .transform(tidyTravel);

// Admins editing a member may leave these blank: members imported from the Youth Congress
// sheet are missing some (no address or parish; a few without email). The public form requires them.
const blankable = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).optional().transform((v) => v ?? "");
const nullable = (max: number) => optionalText(max);
export const memberEditSchema = personSchema
  .extend({
    address: blankable(200),
    parish: blankable(120),
    // A few delegates were added before their birthday or number was known.
    birthday: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}$/.test(v) && ageOn(v) >= 10 && ageOn(v) <= 100), "Check the birthday — the year looks wrong."),
    contact_number: blankable(40),
    emergency_name: blankable(100),
    emergency_relation: blankable(40),
    emergency_contact: blankable(40),
    nickname: nullable(40),
    position: nullable(80),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(120)
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address, or leave it blank."),
    shirt_size: z.enum(SHIRT_SIZES).optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
    transport_mode: z.enum(TRANSPORT_MODES).optional().or(z.literal("").transform(() => undefined)).transform((v) => v ?? null),
    // Imported answers are free text (e.g. "Oct 21, morning"), so any wording is kept.
    arrival_eta: nullable(80),
    departure_eta: nullable(80),
  })
  .superRefine(requireGuardian)
  .transform(tidyTravel);

export type PersonInput = z.input<typeof personSchema>;
export type Person = z.output<typeof personSchema>;

export const PERSON_FIELDS = Object.keys(personSchema.shape) as (keyof Person)[];

// Plain labels, used on screens and in the audit log.
export const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  last_name: "Last name",
  first_name: "First name",
  middle_name: "Middle name",
  nickname: "Nickname",
  sex: "Sex",
  birthday: "Birthday",
  contact_number: "Contact number",
  email: "Email",
  address: "Home address",
  diocese: "Diocese",
  parish: "Parish",
  position: "Position",
  school_or_work: "School or workplace",
  year_level_or_occupation: "Year level or occupation",
  guardian_name: "Parent or guardian",
  guardian_contact: "Parent or guardian's number",
  emergency_name: "Emergency contact",
  emergency_relation: "Emergency contact's relationship",
  emergency_contact: "Emergency contact's number",
  shirt_size: "Shirt size",
  medical_condition: "Medical condition",
  allergies: "Allergies",
  transport_mode: "Mode of transportation",
  arrival_eta: "Estimated arrival",
  departure_eta: "Estimated departure",
  has_driver: "Coming with a driver",
  driver_name: "Driver's name",
  driver_contact: "Driver's number",
  status: "Status",
  admin_note: "Note",
  member_no: "Delegate ID",
  role: "Role",
  display_name: "Name",
  is_active: "Account active",
  title_session: "Title",
  type: "Type",
  starts_at: "Start",
  ends_at: "End",
  venue: "Venue",
  file_store: "Where files are kept",
  allow_timeout_without_timein: "Allow time-out without time-in",
  locked_until: "Locked until",
};

export const referenceSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^MSPCY-\d{8}-[A-Z0-9]{4}$/, "Enter the reference number exactly as given, like MSPCY-20260930-AB7K.");
