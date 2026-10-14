import "server-only";
import { randomUUID } from "node:crypto";
import { newQrToken } from "./crypto";
import { readableBadge } from "./qr";
import { personFolderName } from "../folder-name";
import { DIOCESES, ID_PREFIX, REGIONS, SHIRT_SIZES } from "../config";
import type { Row, Tables } from "./mock-db";

// CongressHub demo data. Every name, number and email here is invented.
// The five demo accounts keep fixed ids so a sign-in survives a server restart.

export const DEMO_PIN = "123456";
const PIN_HASH = "scrypt$YUITC9De/a4vdMPe4AjIeg==$oOXIbaSBTSAo1YSfTLsuGNFtEIgwI45RrrDMxvX4rP4=";

export const DEMO_ACCOUNTS = [
  { id: "00000000-0000-4000-8000-000000000001", login_id: "demo-head", display_name: "Maria Santos", role: "head_admin", blurb: "Everything: settings, audit log, accounts" },
  { id: "00000000-0000-4000-8000-000000000002", login_id: "demo-admin", display_name: "Jose Reyes", role: "admin", blurb: "Applications, delegates, sessions, committee" },
  { id: "00000000-0000-4000-8000-000000000003", login_id: "demo-secretariat", display_name: "Ana Cruz", role: "secretariat", blurb: "Views delegates, scans, asks to open sessions" },
  { id: "00000000-0000-4000-8000-000000000004", login_id: "demo-transport", display_name: "Mark Villanueva", role: "transportation", blurb: "Scans, trip updates, delegate travel details" },
  { id: "00000000-0000-4000-8000-000000000005", login_id: "demo-committee", display_name: "Grace Lim", role: "committee_head", blurb: "Only their committee's deliverables and duty" },
] as const;

// Small seeded random generator so the demo looks the same after every reset.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_M = ["Juan", "Miguel", "Rafael", "Carlo", "Paolo", "Jerome", "Kevin", "Mark", "John Paul", "Christian", "Adrian", "Joshua", "Daniel", "Gabriel", "Nathan", "Ivan", "Rey", "Jasper", "Lorenzo", "Vincent", "Ramon", "Bryan", "Elijah", "Noel", "Francis"];
const FIRST_F = ["Maria", "Angela", "Kristine", "Jasmine", "Patricia", "Joanna", "Bea", "Camille", "Nicole", "Andrea", "Hannah", "Trisha", "Mae", "Alyssa", "Grace", "Joy", "Rica", "Faith", "Clarisse", "Bianca", "Ella", "Sofia", "Lea", "Princess", "Danica"];
const LAST = ["Dela Cruz", "Santos", "Reyes", "Garcia", "Mendoza", "Torres", "Flores", "Gonzales", "Ramos", "Aquino", "Castillo", "Villanueva", "Bautista", "Navarro", "Salazar", "Morales", "Domingo", "Pascual", "Manalo", "Soriano", "Tolentino", "Gutierrez", "Ocampo", "Valdez", "Cabrera", "Fernandez", "Lopez", "Rivera", "Agustin", "Mercado", "Panganiban", "Sarmiento", "Alcantara", "Dizon", "Lacson", "Medina", "Vergara", "Rosales", "Ilagan", "Javier"];
const POSITIONS = ["Youth Member", "Parish Youth Coordinator", "Vicariate Youth Coordinator", "Diocesan Youth Leader", "Youth Adviser", "Secretary", "Treasurer", "Youth Ministry Volunteer", "Campus Ministry Staff"];
const HOME_PARISHES = ["St. Joseph Parish", "Holy Family Parish", "San Roque Parish", "Our Lady of Peace Parish", "Sto. Niño Parish", "St. Michael Parish", "Immaculate Conception Parish", "San Isidro Parish", "Holy Cross Parish", "St. Anthony Parish"];
const HOST_PARISH: Record<string, string> = {
  "Diocese of Iligan": "St. Jude Shrine Parish", "Diocese of Tagum": "St. Jude Shrine Parish",
  "Archdiocese of Cotabato": "St. Francis of Assisi Parish", "Archdiocese of Ozamis": "St. Francis of Assisi Parish",
  "Prelature of Marawi": "San Miguel Parish", "Diocese of Ipil": "San Miguel Parish", "Prelature of Isabela": "San Miguel Parish",
  "Diocese of Pagadian": "St. Joseph the Worker Parish", "Diocese of Prosperidad": "St. Joseph the Worker Parish", "Diocese of Surigao": "St. Joseph the Worker Parish",
  "Diocese of Dipolog": "Ascension of the Lord Parish", "Diocese of Mati": "Ascension of the Lord Parish", "Archdiocese of Davao": "Ascension of the Lord Parish", "Diocese of Digos": "Ascension of the Lord Parish",
  "Archdiocese of Cagayan de Oro": "San Antonio de Padua Parish", "Archdiocese of Zamboanga": "San Antonio de Padua Parish",
  "Diocese of Kidapawan": "San Pablo Parish", "Diocese of Marbel": "San Pablo Parish",
  "Diocese of Malaybalay": "San Isidro Labrador Parish", "Diocese of Tandag": "San Isidro Labrador Parish",
  "Apostolic Vicariate of Jolo": "Our Lady of Fatima Parish", "Diocese of Butuan": "Our Lady of Fatima Parish",
};
const IMMERSION: [string, number][] = [["Bayanihan Community Kitchen", 50], ["Coastal Fishing Village", 50], ["Hope Children's Home", 40], ["Golden Years Care Center", 25], ["Community Radio Station", 40]];
const COMMITTEES: [string, string | null, string | null][] = [
  ["Animation", "07:00:00", "17:00:00"], ["Secretariat", "07:30:00", "18:00:00"], ["Transportation", "05:00:00", "15:00:00"], ["Venue and Logistics", "06:00:00", "16:00:00"],
  ["Music", null, null], ["Health and Safety", "06:30:00", "18:00:00"], ["Media/Technical", null, null], ["Finance", "08:00:00", "17:00:00"],
];

const iso = (d: Date) => d.toISOString();
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(d);
const addH = (d: Date, h: number) => new Date(d.getTime() + h * 3600e3);

export function buildDemoData(): Tables {
  const r = rng(20261020);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric" }).format(now));
  const badge = () => readableBadge(newQrToken);
  const used = new Set<string>();
  const person = () => {
    for (;;) {
      const male = r() < 0.48;
      const first = pick(male ? FIRST_M : FIRST_F);
      const last = pick(LAST);
      if (used.has(first + last)) continue;
      used.add(first + last);
      return { male, first, last, middle: String.fromCharCode(65 + Math.floor(r() * 26)) + "." };
    }
  };
  const phone = () => `0900 ${String(Math.floor(r() * 900) + 100)} ${String(Math.floor(r() * 9000) + 1000)}`; // 0900: not a real network prefix
  const shirt = () => {
    const x = r();
    return x < 0.08 ? "XS" : x < 0.22 ? "S" : x < 0.45 ? "M" : x < 0.75 ? "L" : x < 0.88 ? "XL" : x < 0.96 ? "XXL" : pick(SHIRT_SIZES.slice(6));
  };

  // Accounts
  const admins: Row[] = DEMO_ACCOUNTS.map((a) => ({ ...a, pin_hash: PIN_HASH, pin_must_change: false, totp_enabled: true, totp_version: 1, failed_attempts: 0, session_version: 1, is_active: true, committee_id: null, staff_id: null, last_sign_in_at: iso(addH(now, -2)), created_at: iso(addH(now, -24 * 30)), updated_at: iso(now) }));

  // Committees and staff
  const committees: Row[] = COMMITTEES.map(([name, s, e]) => ({ id: randomUUID(), name, shift_start: s, shift_end: e, created_at: iso(addH(now, -24 * 30)) }));
  const staff: Row[] = [];
  let staffNo = 0;
  committees.forEach((c, ci) => {
    const n = [12, 6, 8, 10, 7, 4, 4, 3][ci];
    for (let i = 0; i < n; i++) {
      const p = person();
      const { token, mask } = badge();
      staff.push({ id: randomUUID(), staff_no: `${ID_PREFIX}-WC-${String(++staffNo).padStart(3, "0")}`, full_name: `${p.first} ${p.middle} ${p.last}`, committee_id: c.id, is_head: i === 0, diocese: "Archdiocese of Davao", contact_number: phone(), shirt_size: shirt(), status: "active", qr_token: token, qr_mask: mask, source: "manual", created_at: iso(addH(now, -24 * 20)), updated_at: iso(now) });
    }
  });
  const animation = committees[0];
  const grace = staff.find((s) => s.committee_id === animation.id && s.is_head)!;
  grace.full_name = "Grace M. Lim";
  Object.assign(admins[4], { committee_id: animation.id, staff_id: grace.id });

  // Delegates
  const counts: Record<string, number> = {};
  for (const d of DIOCESES) counts[d] = d === "Diocese of Digos" ? 4 : d === "Diocese of Tagum" ? 14 : d === "Diocese of Prosperidad" ? 5 : 8 + Math.floor(r() * 5);
  const members: Row[] = [];
  let no = 0;
  for (const d of DIOCESES) {
    for (let i = 0; i < counts[d]; i++) {
      const p = person();
      const clergy = i === 0 && r() < 0.8;
      const title = clergy ? (p.male ? "Fr." : "Sr.") : p.male ? "Mr." : "Ms.";
      const memberNo = `${ID_PREFIX}-${year}-${String(++no).padStart(4, "0")}`;
      const { token, mask } = badge();
      const age = clergy ? 30 + Math.floor(r() * 20) : 17 + Math.floor(r() * 14);
      const bday = `${year - age}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
      const mode = pick(["Private Vehicle", "Public Utility Vehicle", "Aircraft", "Public Utility Vehicle"]);
      members.push({
        id: randomUUID(), member_no: memberNo, application_id: null, qr_token: token, qr_mask: mask, status: "active", source: "import",
        title, last_name: p.last, first_name: p.first, middle_name: p.middle, nickname: p.first.split(" ")[0], sex: p.male ? "Male" : "Female", birthday: bday,
        contact_number: phone(), email: `${p.first.toLowerCase().replace(/\s/g, "")}.${p.last.toLowerCase().replace(/\s/g, "")}@example.com`, address: `Poblacion, ${d.replace(/^.* of /, "")}`,
        diocese: d, parish: pick(HOME_PARISHES), position: clergy ? "Diocesan Youth Director" : pick(POSITIONS), school_or_work: null, year_level_or_occupation: null,
        guardian_name: null, guardian_contact: null, emergency_name: `${pick(FIRST_F)} ${p.last}`, emergency_relation: pick(["Mother", "Father", "Sister", "Brother", "Aunt"]), emergency_contact: phone(),
        shirt_size: shirt(), medical_condition: r() < 0.05 ? "Asthma" : null, allergies: r() < 0.08 ? pick(["Seafood", "Peanuts", "Penicillin", "Shrimp and crab"]) : null,
        transport_mode: mode, arrival_eta: `October ${20 + Math.floor(r() * 2)}, ${pick(["8:00 AM", "10:00 AM", "12:00 NN", "3:00 PM"])}`, departure_eta: "October 24, 2026",
        has_driver: mode === "Private Vehicle" ? r() < 0.6 : null, driver_name: null, driver_contact: null,
        folder_name: personFolderName(p.last, p.first, memberNo), drive_folder_id: null, joined_at: iso(addH(now, -24 * (10 + Math.floor(r() * 20)))), created_at: iso(addH(now, -24 * 25)), updated_at: iso(now),
        parish_assignment: HOST_PARISH[d] ?? null, dynamic_group: null, community_immersion: null,
        kit_received_at: r() < 0.35 ? iso(addH(now, -Math.floor(r() * 30))) : null, kit_received_by: null, remarks: null,
      });
    }
  }
  for (const m of members) if (m.kit_received_at) m.kit_received_by = pick(["Ana Cruz", "Jose Reyes"]);
  for (const m of members.slice(-3)) Object.assign(m, { status: "inactive" });
  // Dynamic groups (11–12 each, dioceses mixed) and community immersion (random, by place size).
  const active = members.filter((m) => m.status === "active");
  const groups = Math.ceil(active.length / 12);
  active.forEach((m, i) => (m.dynamic_group = String((i % groups) + 1)));
  const shuffled = [...active].sort(() => r() - 0.5);
  const slots = IMMERSION.flatMap(([name, k]) => Array<string>(k).fill(name));
  shuffled.forEach((m, i) => (m.community_immersion = slots[i] ?? null));

  // Applications waiting for review
  const applications: Row[] = [];
  for (let i = 0; i < 7; i++) {
    const p = person();
    const d = pick(DIOCESES);
    const ref = `${ID_PREFIX}-${ymd(now).replace(/-/g, "")}-${String.fromCharCode(65 + i)}${Math.floor(r() * 900 + 100)}`;
    applications.push({
      id: randomUUID(), reference_no: ref, status: i < 5 ? "pending" : "incomplete", title: p.male ? "Mr." : "Ms.", last_name: p.last, first_name: p.first, middle_name: p.middle, nickname: p.first.split(" ")[0],
      sex: p.male ? "Male" : "Female", birthday: `${year - 20 - i}-0${1 + i}-1${i}`, contact_number: phone(), email: `${p.first.toLowerCase().replace(/\s/g, "")}${i}@example.com`, address: "Poblacion",
      diocese: d, parish: pick(HOME_PARISHES), position: pick(POSITIONS), emergency_name: `${pick(FIRST_F)} ${p.last}`, emergency_relation: "Mother", emergency_contact: phone(), shirt_size: shirt(),
      transport_mode: "Public Utility Vehicle", arrival_eta: "2026-10-21T09:00", departure_eta: "2026-10-24T15:00", folder_name: personFolderName(p.last, p.first, ref),
      admin_note: i >= 5 ? "Please send a clearer 2x2 photo." : null, created_at: iso(addH(now, -(i + 1) * 9)), updated_at: iso(addH(now, -(i + 1) * 9)),
    });
  }

  // Sessions and attendance
  const head = admins[0];
  const s1 = { id: randomUUID(), title: "Opening Mass", type: "worship", venue: "Cathedral", starts_at: iso(addH(now, -26)), ends_at: iso(addH(now, -24)), status: "closed", closed_at: iso(addH(now, -23)), created_at: iso(addH(now, -72)), updated_at: iso(now) };
  const s2 = { id: randomUUID(), title: "Plenary Session 1: Called to Serve", type: "meeting", venue: "Main Hall", starts_at: iso(addH(now, -1)), ends_at: iso(addH(now, 2)), status: "open", closed_at: null, created_at: iso(addH(now, -72)), updated_at: iso(now) };
  const s3 = { id: randomUUID(), title: "Community Immersion Send-off", type: "activity", venue: "Parish Grounds", starts_at: iso(addH(now, 20)), ends_at: null, status: "scheduled", closed_at: null, created_at: iso(addH(now, -72)), updated_at: iso(now) };
  const s4 = { id: randomUUID(), title: "Diocesan Night", type: "camp", venue: "Covered Court", starts_at: iso(addH(now, 30)), ends_at: iso(addH(now, 34)), status: "scheduled", closed_at: null, created_at: iso(addH(now, -72)), updated_at: iso(now) };
  const records: Row[] = [];
  const by = [admins[2], admins[1], admins[3]];
  active.forEach((m, i) => {
    if (r() < 0.9) {
      const sc = by[i % 3];
      records.push({ id: randomUUID(), session_id: s1.id, member_id: m.id, stage: "in", scanned_at: iso(addH(new Date(s1.starts_at), -0.4 + r() * 0.6)), method: r() < 0.95 ? "qr" : "manual", was_offline: false, scanned_by: sc.id, scanned_by_label: `${sc.display_name} (${sc.login_id})`, recorded_at: iso(now) });
      if (r() < 0.85) records.push({ id: randomUUID(), session_id: s1.id, member_id: m.id, stage: "out", scanned_at: iso(addH(new Date(s1.starts_at), 2 + r() * 0.5)), method: "qr", was_offline: false, scanned_by: sc.id, scanned_by_label: `${sc.display_name} (${sc.login_id})`, recorded_at: iso(now) });
    }
    if (r() < 0.6) {
      const sc = by[(i + 1) % 3];
      records.push({ id: randomUUID(), session_id: s2.id, member_id: m.id, stage: "in", scanned_at: iso(addH(now, -0.9 + r() * 0.8)), method: "qr", was_offline: false, scanned_by: sc.id, scanned_by_label: `${sc.display_name} (${sc.login_id})`, recorded_at: iso(now) });
    }
  });

  // Deliverables
  const dl = ["ID Cards", "ID Lanyards", "Congress Kits", "Program Booklet", "Welcome Banner", "Stage Backdrop", "Certificates", "Theme Song Recording", "Photo Wall", "Foster Family Tokens"];
  const deliverables: Row[] = dl.map((name, i) => ({
    id: randomUUID(), name, status: i < 3 ? "done" : i < 7 ? "ongoing" : "not_started", deadline: iso(addH(now, (i - 2) * 30)), link: i % 2 ? "https://example.com/design" : null,
    committee_id: committees[i % 4 === 0 ? 0 : i % 4].id, staff_id: null, notes: null, sort_order: i, source: "manual", updated_by_label: "Maria Santos (demo-head)", created_at: iso(addH(now, -24 * 15)), updated_at: iso(addH(now, -i * 5)),
  }));
  const deliverableUpdates: Row[] = deliverables.map((d, i) => ({ id: 100 + i, deliverable_id: d.id, actor_id: head.id, actor_label: "Maria Santos (demo-head)", summary: d.status === "done" ? "Status: Done" : "Added", created_at: d.updated_at }));

  // Duty days and records
  const today = ymd(now);
  const yesterday = ymd(addH(now, -24));
  const dutyDays: Row[] = [
    { duty_date: yesterday, label: "Arrival day", starts_at: "06:00:00", ends_at: "18:00:00", created_at: iso(now) },
    { duty_date: today, label: "Congress day 1", starts_at: "06:00:00", ends_at: "20:00:00", created_at: iso(now) },
  ];
  const dutyRecords: Row[] = [];
  for (const s of staff) {
    if (r() < 0.85) dutyRecords.push({ id: randomUUID(), staff_id: s.id, duty_date: yesterday, time_in: `${yesterday}T${String(5 + Math.floor(r() * 3)).padStart(2, "0")}:${String(Math.floor(r() * 60)).padStart(2, "0")}:00+08:00`, time_out: `${yesterday}T17:${String(Math.floor(r() * 60)).padStart(2, "0")}:00+08:00`, in_method: "qr", out_method: "qr", in_by_label: "Ana Cruz (demo-secretariat)", out_by_label: "Ana Cruz (demo-secretariat)", created_at: iso(now), updated_at: iso(now) });
    if (r() < 0.6) dutyRecords.push({ id: randomUUID(), staff_id: s.id, duty_date: today, time_in: iso(addH(now, -3 - r() * 3)), time_out: null, in_method: "qr", in_by_label: "Ana Cruz (demo-secretariat)", created_at: iso(now), updated_at: iso(now) });
  }

  // Trips
  const trips: Row[] = [
    { id: randomUUID(), name: "Bus 1 — CABUSTAMPRO delegates", origin: "Cagayan de Oro", destination: "Congress venue", passengers: 45, driver: "Mang Ruben", status: "on_the_way", last_location: "Bukidnon–Davao Road", last_note: "ETA around 2 PM", updated_by_label: "Mark Villanueva (demo-transport)" },
    { id: randomUUID(), name: "Van 2 — Zamboanga group", origin: "Airport", destination: "San Antonio de Padua Parish", passengers: 12, driver: "Kuya Dodong", status: "arrived", last_location: "Parish grounds", last_note: null, updated_by_label: "Mark Villanueva (demo-transport)" },
    { id: randomUUID(), name: "Van 3 — Mati delegates", origin: "Mati", destination: "Congress venue", passengers: 13, driver: "Mang Boy", status: "delayed", last_location: "Lupon", last_note: "Flat tire, about 30 minutes", updated_by_label: "Mark Villanueva (demo-transport)" },
  ].map((t, i) => ({ ...t, last_lat: null, last_lng: null, created_by: admins[3].id, created_at: iso(addH(now, -8)), updated_at: iso(addH(now, -i * 0.7)) }));
  const tripUpdates: Row[] = trips.flatMap((t, i) => [
    { id: 200 + i * 2, trip_id: t.id, status: "departed", location: t.origin, note: null, actor_label: t.updated_by_label, created_at: iso(addH(now, -5)) },
    { id: 201 + i * 2, trip_id: t.id, status: t.status, location: t.last_location, note: t.last_note, actor_label: t.updated_by_label, created_at: t.updated_at },
  ]);

  // Notifications for the head admin
  const notifications: Row[] = [
    { id: randomUUID(), admin_id: head.id, kind: "application.new", title: `New application: ${applications[0].first_name} ${applications[0].last_name}`, body: String(applications[0].diocese), link: `/admin/applications/${applications[0].id}`, read_at: null, request_id: null, created_at: iso(addH(now, -1)) },
    { id: randomUUID(), admin_id: head.id, kind: "trip.delayed", title: "⚠️ Van 3 — Mati delegates: Delayed", body: "📍 Lupon · Flat tire, about 30 minutes — Mark Villanueva", link: `/admin/transport#t-${trips[2].id}`, read_at: null, request_id: null, created_at: iso(addH(now, -1.4)) },
    { id: randomUUID(), admin_id: head.id, kind: "deliverable.done", title: "🎉 Done: ID Cards", body: "Marked done by Grace Lim", link: "/admin/committee/deliverables", read_at: iso(addH(now, -5)), request_id: null, created_at: iso(addH(now, -6)) },
  ];

  const audit: Row[] = [
    { id: 1, actor_id: head.id, actor_label: "Maria Santos (demo-head)", action: "admin.signed_in", target_type: null, target_id: null, target_label: null, before: null, after: null, reason: null, created_at: iso(addH(now, -2)) },
    { id: 2, actor_id: admins[1].id, actor_label: "Jose Reyes (demo-admin)", action: "session.opened", target_type: "session", target_id: s2.id, target_label: s2.title, before: { status: "scheduled" }, after: { status: "open" }, reason: null, created_at: iso(addH(now, -1)) },
  ];

  return {
    admins, committees, committee_staff: staff, members, applications, files: [],
    attendance_sessions: [s1, s2, s3, s4], attendance_records: records, session_requests: [], notifications, audit_log: audit,
    deliverables, deliverable_updates: deliverableUpdates, duty_days: dutyDays, duty_records: dutyRecords, trips, trip_updates: tripUpdates,
    settings: [], rate_limits: [], member_no_counters: [{ year, last_no: no }], staff_no_counter: [{ id: true, last_no: staffNo }],
  };
}

// For the sign-in page: which regions exist (used in the blurb).
export const DEMO_REGION_COUNT = REGIONS.length;
