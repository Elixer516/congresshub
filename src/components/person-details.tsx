import { FIELD_LABELS } from "@/lib/schemas";
import { ageOn, formatPlainDate, formatLocalDateTime } from "@/lib/time";

export const DETAIL_GROUPS: { title: string; fields: string[] }[] = [
  { title: "About", fields: ["title", "last_name", "first_name", "middle_name", "nickname", "sex", "birthday", "shirt_size"] },
  { title: "Contact", fields: ["contact_number", "email", "address"] },
  { title: "Church", fields: ["diocese", "parish", "position"] },
  { title: "School or work", fields: ["school_or_work", "year_level_or_occupation"] },
  { title: "Parent or guardian", fields: ["guardian_name", "guardian_contact"] },
  { title: "Emergency contact", fields: ["emergency_name", "emergency_relation", "emergency_contact"] },
  { title: "Travel to the event", fields: ["transport_mode", "arrival_eta", "departure_eta", "has_driver", "driver_name", "driver_contact"] },
  { title: "Health", fields: ["medical_condition", "allergies"] },
  { title: "Youth Congress assignment", fields: ["parish_assignment", "dynamic_group", "community_immersion", "remarks"] },
];

const EXTRA_LABELS: Record<string, string> = {
  parish_assignment: "Parish assignment",
  dynamic_group: "Dynamic group",
  community_immersion: "Community immersion",
  remarks: "Remarks",
};

export default function PersonDetails({ person, groups = DETAIL_GROUPS }: { person: Record<string, unknown>; groups?: { title: string; fields: string[] }[] }) {
  return (
    <div className="@container">
      <div className="grid gap-4 @3xl:grid-cols-2">
      {groups.map((g) => (
        <section key={g.title} className="@container rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-primary">{g.title}</h3>
          <dl className="space-y-2.5 text-sm @xs:space-y-1.5">
            {g.fields.map((f) => {
              const v = person[f];
              let shown = v === null || v === undefined || v === "" ? "—" : String(v);
              if (f === "birthday" && typeof v === "string") shown = `${formatPlainDate(v)} (age ${ageOn(v)})`;
              if ((f === "arrival_eta" || f === "departure_eta") && typeof v === "string" && v) shown = formatLocalDateTime(v);
              if (f === "has_driver") shown = v === true ? "Yes" : v === false ? "No" : "—";
              return (
                <div key={f} className="@xs:grid @xs:grid-cols-[9rem_minmax(0,1fr)] @xs:gap-3">
                  <dt className="text-xs text-muted @xs:text-sm">{FIELD_LABELS[f] ?? EXTRA_LABELS[f] ?? f}</dt>
                  <dd className="min-w-0 break-words font-medium @xs:font-normal">{shown}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
      </div>
    </div>
  );
}
