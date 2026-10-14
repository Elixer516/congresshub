// Fixed choices used across the app. Safe to import in the browser.

export const ORG_NAME = "CongressHub";
export const ORG_FULL_NAME = "CongressHub — Youth Congress Management (Demo)";
export const ID_PREFIX = "CH";
export const TIMEZONE = "Asia/Manila";
export const IDLE_MINUTES = 15;

// Ecclesiastical jurisdictions of MSPC (from the Youth Congress sign-up sheet).
export const DIOCESES = [
  "Archdiocese of Cagayan de Oro",
  "Archdiocese of Cotabato",
  "Archdiocese of Davao",
  "Archdiocese of Ozamis",
  "Archdiocese of Zamboanga",
  "Diocese of Butuan",
  "Diocese of Digos",
  "Diocese of Dipolog",
  "Diocese of Iligan",
  "Diocese of Ipil",
  "Diocese of Kidapawan",
  "Diocese of Malaybalay",
  "Diocese of Marbel",
  "Diocese of Mati",
  "Diocese of Pagadian",
  "Diocese of Prosperidad",
  "Diocese of Surigao",
  "Diocese of Tagum",
  "Diocese of Tandag",
  "Apostolic Vicariate of Jolo",
  "Prelature of Isabela",
  "Prelature of Marawi",
] as const;

// MSPC regions. Delegate ID cards are colour-coded by the region of their diocese.
// color: card header; text: writing on the header; ink: the same colour dark enough to read on cream.
export const REGIONS = [
  { key: "DADITAMA", color: "#1d4fa3", text: "#ffffff", ink: "#1d4fa3", colorName: "Blue", dioceses: ["Archdiocese of Davao", "Diocese of Digos", "Diocese of Tagum", "Diocese of Mati"] },
  {
    key: "CABUSTAMPRO",
    color: "#1e6b45",
    text: "#ffffff",
    ink: "#1e6b45",
    colorName: "Green",
    dioceses: ["Archdiocese of Cagayan de Oro", "Diocese of Butuan", "Diocese of Surigao", "Diocese of Tandag", "Diocese of Malaybalay", "Diocese of Prosperidad"],
  },
  { key: "DOPIM", color: "#e0561b", text: "#ffffff", ink: "#b8420f", colorName: "Orange", dioceses: ["Diocese of Dipolog", "Archdiocese of Ozamis", "Diocese of Pagadian", "Diocese of Iligan", "Prelature of Marawi"] },
  { key: "ZAMBASULI", color: "#c62828", text: "#ffffff", ink: "#c62828", colorName: "Red", dioceses: ["Archdiocese of Zamboanga", "Prelature of Isabela", "Apostolic Vicariate of Jolo", "Diocese of Ipil"] },
  { key: "KIDMACO", color: "#f2c200", text: "#2b2100", ink: "#7a5c00", colorName: "Yellow", dioceses: ["Diocese of Kidapawan", "Diocese of Marbel", "Archdiocese of Cotabato"] },
] as const;
export type Region = (typeof REGIONS)[number];
export const regionOf = (diocese: string | null | undefined): Region | null =>
  REGIONS.find((r) => (r.dioceses as readonly string[]).includes(diocese ?? "")) ?? null;

export const TITLES =["Mr.", "Ms.", "Fr.", "Sr.", "Br."] as const;
export const SEXES = ["Male", "Female"] as const;
// From the Youth Congress sign-up sheet.
export const TRANSPORT_MODES = ["Private Vehicle", "Public Utility Vehicle", "Aircraft", "Ship"] as const;
export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL"] as const;

// Common positions, offered as suggestions (free text is still allowed).
export const POSITION_SUGGESTIONS = [
  "Youth Member",
  "Parish Youth Leader",
  "Parish Youth Coordinator",
  "Vicariate Youth Coordinator",
  "Diocesan Youth Leader",
  "Diocesan Youth Coordinator",
  "Diocesan Youth Director",
  "Youth Minister",
  "Secretary",
  "Treasurer",
  "Auditor",
] as const;

export const SESSION_TYPES = {
  meeting: "Meeting",
  worship: "Spiritual activity",
  camp: "Camp / conference",
  activity: "Activity / outreach",
} as const;
export type SessionType = keyof typeof SESSION_TYPES;

export const APPLICATION_STATUS_LABELS = {
  pending: "Pending",
  incomplete: "Incomplete",
  approved: "Approved",
  rejected: "Rejected",
} as const;
export type ApplicationStatus = keyof typeof APPLICATION_STATUS_LABELS;

export const MEMBER_STATUS_LABELS = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
} as const;
export type MemberStatus = keyof typeof MEMBER_STATUS_LABELS;

export const ROLE_LABELS = {
  head_admin: "Head admin",
  admin: "Admin",
  secretariat: "Secretariat",
  transportation: "Transportation",
  committee_head: "Committee head",
} as const;
export type AdminRole = keyof typeof ROLE_LABELS;

// Higher number = more access. Secretariat: view members and attendance, scan, request sessions.
// Committee head: only their own committee's area (deliverables and duty attendance).
// Transportation: scan session attendance, post trip updates, and see a basic member list
// with travel details. Kept out of everything else (see requireAdmin's `transportation` option).
export const ROLE_RANK: Record<AdminRole, number> = { committee_head: 0, transportation: 0, secretariat: 1, admin: 2, head_admin: 3 };

// Trip updates (Transportation). "open" trips are still on the road.
export const TRIP_STATUS = {
  preparing: { label: "Getting ready", icon: "🕒", tone: "closed" },
  departed: { label: "Departed", icon: "🚐", tone: "pending" },
  on_the_way: { label: "On the way", icon: "🛣️", tone: "pending" },
  stopover: { label: "Stopover", icon: "⛽", tone: "incomplete" },
  delayed: { label: "Delayed", icon: "⚠️", tone: "rejected" },
  arrived: { label: "Arrived", icon: "✅", tone: "approved" },
  cancelled: { label: "Cancelled", icon: "✖️", tone: "inactive" },
} as const;
export type TripStatus = keyof typeof TRIP_STATUS;
export const TRIP_DONE: TripStatus[] = ["arrived", "cancelled"];

export const DELIVERABLE_STATUS = { not_started: "Not yet started", ongoing: "Ongoing", done: "Done" } as const;
export type DeliverableStatus = keyof typeof DELIVERABLE_STATUS;
export const atLeast = (role: AdminRole, min: AdminRole) => ROLE_RANK[role] >= ROLE_RANK[min];

// Uploads
export const MAX_FILE_BYTES = 3 * 1024 * 1024;       // per file, after shrinking
export const MAX_REQUEST_BYTES = 4 * 1024 * 1024;    // Vercel refuses bodies over 4.5 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

// Documents the application form asks for.
export const DOCUMENTS = [
  { kind: "photo", label: "ID Photo", hint: "A clear 2x2 photo of your face, plain background.", required: true, imagesOnly: true },
] as const;
