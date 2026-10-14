"use client";

import { useState, type ReactNode } from "react";
import { DIOCESES, POSITION_SUGGESTIONS, SEXES, SHIRT_SIZES, TITLES, TRANSPORT_MODES } from "@/lib/config";
import { ageOn } from "@/lib/time";
import { Field, Input, Select, Textarea } from "./ui";

export type PersonValues = Record<string, string>;

export const EMPTY_PERSON: PersonValues = {
  title: "",
  last_name: "",
  first_name: "",
  middle_name: "",
  nickname: "",
  sex: "",
  birthday: "",
  contact_number: "",
  email: "",
  address: "",
  diocese: "",
  parish: "",
  position: "",
  school_or_work: "",
  year_level_or_occupation: "",
  guardian_name: "",
  guardian_contact: "",
  emergency_name: "",
  emergency_relation: "",
  emergency_contact: "",
  shirt_size: "",
  medical_condition: "",
  allergies: "",
  transport_mode: "",
  arrival_eta: "",
  departure_eta: "",
  has_driver: "",
  driver_name: "",
  driver_contact: "",
};

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <legend className="px-1 text-lg font-bold text-primary">{title}</legend>
      {hint ? <p className="-mt-1 mb-4 text-sm text-muted">{hint}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function PersonFields({
  values,
  errors,
  onChange,
  strict = true,
}: {
  values: PersonValues;
  errors: Record<string, string>;
  onChange: (name: string, value: string) => void;
  // true on the public form (everything the event needs is required); false when admins edit,
  // since imported members may be missing some answers.
  strict?: boolean;
}) {
  const minor = values.birthday && /^\d{4}-\d{2}-\d{2}$/.test(values.birthday) ? ageOn(values.birthday) < 18 : false;

  const input = (name: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input
      id={name}
      name={name}
      value={values[name] ?? ""}
      onChange={(e) => onChange(name, e.target.value)}
      aria-invalid={!!errors[name]}
      aria-describedby={errors[name] ? `${name}-error` : undefined}
      {...extra}
    />
  );

  const select = (name: string, options: readonly string[], placeholder = "Choose…") => (
    <Select
      id={name}
      name={name}
      value={values[name] ?? ""}
      onChange={(e) => onChange(name, e.target.value)}
      aria-invalid={!!errors[name]}
      aria-describedby={errors[name] ? `${name}-error` : undefined}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-6">
      <Section title="About you">
        <Field label="Title" htmlFor="title" required error={errors.title}>
          {select("title", TITLES)}
        </Field>
        <Field label="Sex" htmlFor="sex" required error={errors.sex}>
          {select("sex", SEXES)}
        </Field>
        <Field label="Last name" htmlFor="last_name" required error={errors.last_name}>
          {input("last_name", { autoComplete: "family-name" })}
        </Field>
        <Field label="First name" htmlFor="first_name" required error={errors.first_name}>
          {input("first_name", { autoComplete: "given-name" })}
        </Field>
        <Field label="Middle name" htmlFor="middle_name" error={errors.middle_name}>
          {input("middle_name", { autoComplete: "additional-name" })}
        </Field>
        <Field label="Nickname" htmlFor="nickname" required={strict} error={errors.nickname}>
          {input("nickname")}
        </Field>
        <Field label="Birthday" htmlFor="birthday" required={strict} error={errors.birthday}>
          {input("birthday", { type: "date", autoComplete: "bday" })}
        </Field>
        <Field label="Shirt size" htmlFor="shirt_size" required={strict} error={errors.shirt_size}>
          {select("shirt_size", SHIRT_SIZES)}
        </Field>
      </Section>

      <Section title="How to reach you">
        <Field label="Contact number" htmlFor="contact_number" required={strict} error={errors.contact_number}>
          {input("contact_number", { type: "tel", inputMode: "tel", autoComplete: "tel", placeholder: "0917 123 4567" })}
        </Field>
        <Field label="Email" htmlFor="email" required={strict} error={errors.email}>
          {input("email", { type: "email", autoComplete: "email", autoCapitalize: "none" })}
        </Field>
        <Field label="Home address" htmlFor="address" required error={errors.address} className="sm:col-span-2">
          {input("address", { autoComplete: "street-address", placeholder: "House no., street, barangay, town or city, province" })}
        </Field>
      </Section>

      <Section title="Church">
        <Field label="Diocese" htmlFor="diocese" required error={errors.diocese} className="sm:col-span-2">
          {select("diocese", DIOCESES)}
        </Field>
        <Field label="Parish" htmlFor="parish" error={errors.parish}>
          {input("parish", { placeholder: "e.g. San Pedro Cathedral Parish" })}
        </Field>
        <PositionField value={values.position ?? ""} error={errors.position} required={strict} onChange={(v) => onChange("position", v)} />
      </Section>

      <Section title="School or work">
        <Field label="School or workplace" htmlFor="school_or_work" error={errors.school_or_work}>
          {input("school_or_work")}
        </Field>
        <Field label="Year level or occupation" htmlFor="year_level_or_occupation" error={errors.year_level_or_occupation}>
          {input("year_level_or_occupation", { placeholder: "e.g. Grade 11, 2nd year college, Teacher" })}
        </Field>
      </Section>

      <Section title="Parent or guardian" hint={minor ? "Required because you're under 18." : "Needed if you're under 18."}>
        <Field label="Parent or guardian's full name" htmlFor="guardian_name" required={minor} error={errors.guardian_name}>
          {input("guardian_name")}
        </Field>
        <Field label="Parent or guardian's number" htmlFor="guardian_contact" required={minor} error={errors.guardian_contact}>
          {input("guardian_contact", { type: "tel", inputMode: "tel" })}
        </Field>
      </Section>

      <Section title="In case of emergency">
        <Field label="Full name" htmlFor="emergency_name" required error={errors.emergency_name}>
          {input("emergency_name")}
        </Field>
        <Field label="Relationship to you" htmlFor="emergency_relation" required error={errors.emergency_relation}>
          {input("emergency_relation", { placeholder: "e.g. Mother, Brother, Aunt" })}
        </Field>
        <Field label="Contact number" htmlFor="emergency_contact" required error={errors.emergency_contact}>
          {input("emergency_contact", { type: "tel", inputMode: "tel" })}
        </Field>
      </Section>

      <Section title="Travel to the event" hint="So we can plan arrivals, parking and send-offs.">
        <Field label="Mode of transportation" htmlFor="transport_mode" required={strict} error={errors.transport_mode} className="sm:col-span-2">
          {select("transport_mode", TRANSPORT_MODES)}
        </Field>
        <Field label="Estimated date and time of arrival" htmlFor="arrival_eta" required={strict} error={errors.arrival_eta}>
          {input("arrival_eta", { type: strict || !values.arrival_eta || DATETIME.test(values.arrival_eta) ? "datetime-local" : "text" })}
        </Field>
        <Field label="Estimated date and time of departure" htmlFor="departure_eta" required={strict} error={errors.departure_eta}>
          {input("departure_eta", { type: strict || !values.departure_eta || DATETIME.test(values.departure_eta) ? "datetime-local" : "text" })}
        </Field>
        {values.transport_mode === "Private Vehicle" ? (
          <>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium">
                Will you be accompanied by a driver during the event?{strict ? <span className="text-danger"> *</span> : null}
              </legend>
              <div className="flex gap-3">
                {["Yes", "No"].map((o) => (
                  <label key={o} className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                    <input
                      type="radio"
                      name="has_driver"
                      value={o}
                      checked={values.has_driver === o}
                      onChange={() => onChange("has_driver", o)}
                      className="size-4"
                    />
                    {o}
                  </label>
                ))}
              </div>
              {errors.has_driver ? <p className="mt-1.5 text-sm text-danger">{errors.has_driver}</p> : null}
            </fieldset>
            {values.has_driver === "Yes" ? (
              <>
                <Field label="Driver's full name" htmlFor="driver_name" required={strict} error={errors.driver_name}>
                  {input("driver_name")}
                </Field>
                <Field label="Driver's contact number" htmlFor="driver_contact" required={strict} error={errors.driver_contact}>
                  {input("driver_contact", { type: "tel", inputMode: "tel" })}
                </Field>
              </>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="Health" hint="So we can help you during activities. Leave blank if none.">
        <Field label="Medical condition that needs assistance" htmlFor="medical_condition" error={errors.medical_condition} className="sm:col-span-2">
          <Textarea
            id="medical_condition"
            value={values.medical_condition ?? ""}
            onChange={(e) => onChange("medical_condition", e.target.value)}
            aria-invalid={!!errors.medical_condition}
          />
        </Field>
        <Field label="Allergies" htmlFor="allergies" error={errors.allergies} className="sm:col-span-2">
          {input("allergies", { placeholder: "e.g. Seafood, peanuts, penicillin" })}
        </Field>
      </Section>
    </div>
  );
}

const OTHER = "__other__";

// A plain dropdown (reliable on phones, unlike a typing-suggestion list), with
// "Other" for positions not in the list, which then shows a box to type it in.
function PositionField({ value, error, required, onChange }: { value: string; error?: string; required?: boolean; onChange: (v: string) => void }) {
  const known = (POSITION_SUGGESTIONS as readonly string[]).includes(value);
  const [typing, setTyping] = useState(!!value && !known);
  const selected = typing ? OTHER : value;

  return (
    <Field
      label="Position in the youth ministry"
      htmlFor="position"
      required={required}
      error={error}
      hint={typing ? "Type your position." : required ? "Choose “Youth Member” if you don't hold a position." : undefined}
    >
      <Select
        id="position"
        value={selected}
        onChange={(e) => {
          const v = e.target.value;
          if (v === OTHER) {
            setTyping(true);
            onChange("");
          } else {
            setTyping(false);
            onChange(v);
          }
        }}
        aria-invalid={!!error}
      >
        <option value="">{required ? "Choose…" : "None"}</option>
        {POSITION_SUGGESTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value={OTHER}>Other (type it in)</option>
      </Select>
      {typing ? (
        <Input
          id="position-other"
          aria-label="Your position"
          placeholder="e.g. Vicariate Secretary"
          value={value}
          maxLength={80}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2"
          autoFocus
        />
      ) : null}
    </Field>
  );
}
