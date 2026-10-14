import "server-only";
import { randomUUID } from "node:crypto";

// CongressHub demo: an in-memory stand-in for the Supabase client.
// It understands the subset of the query builder this app uses (filters, "or" strings,
// embedded many-to-one tables, counts, ranges, insert/update/upsert/delete, rpc, storage),
// so the pages and API routes run unchanged with no real database behind them.

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

// Embedded table name → the column on this table that points to it (all embeds here are many-to-one).
const EMBED_FK: Record<string, string> = {
  committees: "committee_id",
  members: "member_id",
  attendance_sessions: "session_id",
  committee_staff: "staff_id",
  session_requests: "request_id",
  admins: "decided_by",
};

// Tables whose id is a running number instead of a uuid.
const NUMERIC_ID = new Set(["audit_log", "deliverable_updates", "trip_updates"]);
// Primary key for upserts / lookups when it isn't "id".
const PRIMARY: Record<string, string[]> = { settings: ["key"], rate_limits: ["key"], member_no_counters: ["year"] };
// Unique keys checked on insert.
const UNIQUE: Record<string, string[][]> = {
  members: [["member_no"], ["qr_token"]],
  admins: [["login_id"]],
  committee_staff: [["staff_no"], ["qr_token"]],
  attendance_records: [["session_id", "member_id", "stage"]],
  duty_records: [["staff_id", "duty_date"]],
  duty_days: [["duty_date"]],
  applications: [["reference_no"]],
};
// Rows removed together with their parent (ON DELETE CASCADE).
const CASCADE: Record<string, [string, string][]> = {
  members: [["attendance_records", "member_id"], ["files", "member_id"]],
  attendance_sessions: [["attendance_records", "session_id"], ["session_requests", "session_id"]],
  trips: [["trip_updates", "trip_id"]],
  committee_staff: [["duty_records", "staff_id"], ["files", "staff_id"]],
  deliverables: [["deliverable_updates", "deliverable_id"]],
  applications: [["files", "application_id"]],
};
const DEFAULTS: Record<string, Row> = {
  admins: { pin_must_change: false, totp_enabled: true, totp_version: 1, failed_attempts: 0, session_version: 1, is_active: true },
  applications: { status: "pending" },
  members: { status: "active", source: "application" },
  attendance_sessions: { status: "scheduled" },
  attendance_records: { was_offline: false },
  session_requests: { status: "pending" },
  committee_staff: { is_head: false, status: "active", source: "manual" },
  deliverables: { status: "not_started", sort_order: 0, source: "manual" },
  trips: { status: "preparing" },
};

let numericIds = 1000;

// ---- helpers -----------------------------------------------------------------------------

function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

const cmp = (a: unknown, b: unknown) => {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
};
const likeRe = (pattern: string, flags: string) =>
  new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$", flags);

function parseValue(v: string): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

// One condition of a PostgREST "or" string, e.g. last_name.ilike.*ana* or and(a.eq.1,b.lte.2)
function orCondition(c: string): (r: Row) => boolean {
  const and = c.match(/^and\((.*)\)$/);
  if (and) {
    const parts = splitTop(and[1]).map(orCondition);
    return (r) => parts.every((p) => p(r));
  }
  const or = c.match(/^or\((.*)\)$/);
  if (or) {
    const parts = splitTop(or[1]).map(orCondition);
    return (r) => parts.some((p) => p(r));
  }
  const m = c.match(/^([a-z_]+)\.(eq|neq|gt|gte|lt|lte|ilike|like|is)\.(.*)$/);
  if (!m) return () => false;
  const [, col, op, raw] = m;
  const val = parseValue(raw);
  return (r) => test(r[col], op, val);
}

function test(v: unknown, op: string, val: unknown): boolean {
  switch (op) {
    case "eq":
      return v !== null && v !== undefined && String(v) === String(val);
    case "neq":
      return v !== null && v !== undefined && String(v) !== String(val);
    case "gt":
      return v !== null && v !== undefined && cmp(v, val) > 0;
    case "gte":
      return v !== null && v !== undefined && cmp(v, val) >= 0;
    case "lt":
      return v !== null && v !== undefined && cmp(v, val) < 0;
    case "lte":
      return v !== null && v !== undefined && cmp(v, val) <= 0;
    case "ilike":
      return typeof v === "string" && likeRe(String(val), "i").test(v);
    case "like":
      return typeof v === "string" && likeRe(String(val), "").test(v);
    case "is":
      return val === null ? v === null || v === undefined : v === val;
    default:
      return false;
  }
}

// ---- query builder -----------------------------------------------------------------------

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private cols = "*";
  private returning = false;
  private countMode = false;
  private head = false;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from_: number | null = null;
  private to_: number | null = null;
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private payload: Row | Row[] | null = null;
  private conflict: string[] | null = null;

  constructor(
    private store: Store,
    private table: string,
  ) {}

  select(cols = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") this.cols = cols;
    else {
      this.returning = true;
      this.cols = cols;
    }
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = rows;
    this.conflict = opts?.onConflict ? opts.onConflict.split(",").map((x) => x.trim()) : null;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "eq", v));
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "neq", v));
    return this;
  }
  gt(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "gt", v));
    return this;
  }
  gte(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "gte", v));
    return this;
  }
  lt(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "lt", v));
    return this;
  }
  lte(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "lte", v));
    return this;
  }
  like(col: string, v: string) {
    this.filters.push((r) => test(r[col], "like", v));
    return this;
  }
  ilike(col: string, v: string) {
    this.filters.push((r) => test(r[col], "ilike", v));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => test(r[col], "is", v));
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals.map(String));
    this.filters.push((r) => r[col] !== null && r[col] !== undefined && set.has(String(r[col])));
    return this;
  }
  not(col: string, op: string, v: unknown) {
    this.filters.push((r) => !test(r[col], op, v));
    return this;
  }
  or(expr: string) {
    const parts = splitTop(expr).map(orCondition);
    this.filters.push((r) => parts.some((p) => p(r)));
    return this;
  }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.eq(k, v);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): Promise<A | B> {
    return Promise.resolve()
      .then(() => this.run())
      .then(ok, bad);
  }

  private rows() {
    return this.store.tables[this.table] ?? (this.store.tables[this.table] = []);
  }

  private project(rows: Row[]): Row[] {
    const items = splitTop(this.cols);
    if (!items.length) return rows.map((r) => ({ ...r }));
    return rows.map((r) => {
      const out: Row = {};
      for (const item of items) {
        if (item === "*") Object.assign(out, r);
        else {
          const emb = item.match(/^([a-z_]+)\((.*)\)$/);
          if (emb) {
            const [, name, sub] = emb;
            const fk = EMBED_FK[name] ?? `${name.replace(/s$/, "")}_id`;
            const target = (this.store.tables[name] ?? []).find((x) => x.id === r[fk]);
            out[name] = target ? new Query(this.store, name).select(sub).projectOne(target) : null;
          } else {
            const col = item.split("::")[0].trim();
            out[col] = r[col] ?? null;
          }
        }
      }
      return out;
    });
  }
  projectOne(r: Row) {
    return this.project([r])[0];
  }

  private finish(rows: Row[], count?: number): Result {
    const data = this.project(rows);
    if (this.mode === "single") {
      if (data.length !== 1) return { data: null, error: { message: `Expected one row, got ${data.length}`, code: "PGRST116" } };
      return { data: data[0], error: null };
    }
    if (this.mode === "maybe") {
      if (data.length > 1) return { data: null, error: { message: "More than one row", code: "PGRST116" } };
      return { data: data[0] ?? null, error: null };
    }
    return { data, error: null, count: count ?? null };
  }

  private violates(row: Row, except?: Row): string | null {
    for (const keys of UNIQUE[this.table] ?? []) {
      if (keys.some((k) => row[k] === null || row[k] === undefined)) continue;
      if (this.rows().some((x) => x !== except && keys.every((k) => String(x[k]) === String(row[k])))) return keys.join(", ");
    }
    return null;
  }

  private fill(row: Row): Row {
    const now = new Date().toISOString();
    const out: Row = { ...(DEFAULTS[this.table] ?? {}), ...row };
    if (!PRIMARY[this.table] && out.id === undefined) out.id = NUMERIC_ID.has(this.table) ? ++numericIds : randomUUID();
    if (out.created_at === undefined) out.created_at = now;
    if (["admins", "applications", "members", "attendance_sessions", "committee_staff", "duty_records", "deliverables", "trips", "settings"].includes(this.table) && out.updated_at === undefined)
      out.updated_at = now;
    if (this.table === "members" && out.joined_at === undefined) out.joined_at = now;
    if (this.table === "attendance_records" && out.recorded_at === undefined) out.recorded_at = now;
    return out;
  }

  private run(): Result {
    const all = this.rows();
    if (this.op === "select") {
      let rows = all.filter((r) => this.filters.every((f) => f(r)));
      const count = rows.length;
      if (this.head) return { data: null, error: null, count };
      for (const o of [...this.orders].reverse()) rows = [...rows].sort((a, b) => (o.asc ? cmp(a[o.col], b[o.col]) : -cmp(a[o.col], b[o.col])));
      if (this.from_ !== null) rows = rows.slice(this.from_, (this.to_ ?? rows.length) + 1);
      if (this.limitN !== null) rows = rows.slice(0, this.limitN);
      return this.finish(rows, this.countMode ? count : undefined);
    }
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => this.fill(r));
      for (const r of list) {
        const bad = this.violates(r);
        if (bad) return { data: null, error: { message: `duplicate key value violates unique constraint (${bad})`, code: "23505" } };
        all.push(r);
      }
      return this.returning ? this.finish(list) : { data: null, error: null };
    }
    if (this.op === "upsert") {
      const keys = this.conflict ?? PRIMARY[this.table] ?? ["id"];
      const out: Row[] = [];
      for (const raw of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
        const hit = all.find((x) => keys.every((k) => raw[k] !== undefined && String(x[k]) === String(raw[k])));
        if (hit) {
          Object.assign(hit, raw, hit.updated_at !== undefined ? { updated_at: new Date().toISOString() } : {});
          out.push(hit);
        } else {
          const r = this.fill(raw);
          all.push(r);
          out.push(r);
        }
      }
      return this.returning ? this.finish(out) : { data: null, error: null };
    }
    const hits = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of hits) {
        const next = { ...r, ...(this.payload as Row) };
        const bad = this.violates(next, r);
        if (bad) return { data: null, error: { message: `duplicate key value violates unique constraint (${bad})`, code: "23505" } };
      }
      for (const r of hits) Object.assign(r, this.payload, r.updated_at !== undefined && !("updated_at" in (this.payload as Row)) ? { updated_at: new Date().toISOString() } : {});
      return this.returning ? this.finish(hits) : { data: null, error: null };
    }
    // delete
    for (const r of hits) this.store.remove(this.table, r);
    return this.returning ? this.finish(hits) : { data: null, error: null };
  }
}

// ---- store, rpc and storage --------------------------------------------------------------

export class Store {
  files = new Map<string, { bytes: Uint8Array; type: string }>();
  constructor(public tables: Tables) {
    for (const rows of Object.values(tables)) for (const r of rows) if (typeof r.id === "number") numericIds = Math.max(numericIds, r.id);
  }
  remove(table: string, row: Row) {
    const list = this.tables[table] ?? [];
    const i = list.indexOf(row);
    if (i >= 0) list.splice(i, 1);
    for (const [child, fk] of CASCADE[table] ?? []) for (const c of (this.tables[child] ?? []).filter((x) => x[fk] === row.id)) this.remove(child, c);
  }
  t(name: string) {
    return this.tables[name] ?? (this.tables[name] = []);
  }
}

const now = () => new Date().toISOString();

function audit(s: Store, e: Row) {
  s.t("audit_log").push({ id: ++numericIds, created_at: now(), actor_id: null, before: null, after: null, reason: null, ...e });
}

function nextMemberNo(s: Store, prefix: string, year: number) {
  const c = s.t("member_no_counters");
  let row = c.find((x) => x.year === year);
  if (!row) c.push((row = { year, last_no: 0 }));
  row.last_no = Number(row.last_no) + 1;
  return `${prefix}-${year}-${String(row.last_no).padStart(4, "0")}`;
}

function autoOpen(s: Store) {
  let n = 0;
  for (const x of s.t("attendance_sessions")) {
    if (x.status === "scheduled" && String(x.starts_at) <= now()) {
      x.status = "open";
      audit(s, { actor_label: "System", action: "session.opened", target_type: "session", target_id: x.id, target_label: x.title, before: { status: "scheduled" }, after: { status: "open", automatic: true } });
      n++;
    }
  }
  return n;
}

type Args = Record<string, unknown>;
const RPC: Record<string, (s: Store, a: Args) => unknown> = {
  rate_limit_hit: () => true,
  auto_open_sessions: (s) => autoOpen(s),
  next_member_no: (s, a) => nextMemberNo(s, String(a.p_prefix), Number(a.p_year)),
  next_staff_no: (s, a) => {
    const c = s.t("staff_no_counter");
    if (!c[0]) c.push({ id: true, last_no: 0 });
    c[0].last_no = Number(c[0].last_no) + 1;
    return `${a.p_prefix}-WC-${String(c[0].last_no).padStart(3, "0")}`;
  },
  approve_application: (s, a) => {
    const app = s.t("applications").find((x) => x.id === a.p_application_id);
    if (!app) return { error: "not_found" };
    if (!["pending", "incomplete"].includes(String(app.status))) return { error: "already_decided", status: app.status };
    const memberNo = nextMemberNo(s, String(a.p_prefix), Number(a.p_year));
    const id = randomUUID();
    const copy = ["title", "last_name", "first_name", "middle_name", "nickname", "sex", "birthday", "contact_number", "email", "address", "diocese", "parish", "position", "school_or_work", "year_level_or_occupation", "guardian_name", "guardian_contact", "emergency_name", "emergency_relation", "emergency_contact", "shirt_size", "medical_condition", "allergies", "transport_mode", "arrival_eta", "departure_eta", "has_driver", "driver_name", "driver_contact", "folder_name", "drive_folder_id"];
    const m: Row = { id, member_no: memberNo, application_id: app.id, qr_token: a.p_qr_token, qr_mask: a.p_qr_mask, status: "active", source: "application", joined_at: now(), created_at: now(), updated_at: now() };
    for (const k of copy) m[k] = app[k] ?? null;
    s.t("members").push(m);
    for (const f of s.t("files")) if (f.application_id === app.id) f.member_id = id;
    Object.assign(app, { status: "approved", decided_by: a.p_admin_id, decided_at: now(), admin_note: a.p_note, updated_at: now() });
    audit(s, { actor_id: a.p_admin_id, actor_label: a.p_admin_label, action: "application.approved", target_type: "application", target_id: app.id, target_label: `${app.last_name}, ${app.first_name} (${app.reference_no})`, before: { status: "pending" }, after: { status: "approved", member_no: memberNo } });
    audit(s, { actor_id: a.p_admin_id, actor_label: a.p_admin_label, action: "member.created", target_type: "member", target_id: id, target_label: `${app.last_name}, ${app.first_name} (${memberNo})`, after: { member_no: memberNo } });
    return { member_id: id, member_no: memberNo };
  },
  record_scan: (s, a) => {
    const ses = s.t("attendance_sessions").find((x) => x.id === a.p_session_id);
    if (!ses) return { result: "no_session" };
    if (ses.status === "scheduled" && String(ses.starts_at) <= now()) autoOpen(s);
    if (ses.status !== "open") {
      const late = a.p_was_offline && ses.status === "closed" && ses.closed_at && String(a.p_scanned_at) <= String(ses.closed_at);
      if (!late) return { result: "session_closed", status: ses.status };
    }
    const m = a.p_member_id ? s.t("members").find((x) => x.id === a.p_member_id) : s.t("members").find((x) => x.qr_token === a.p_qr_token);
    if (!m) return { result: "unknown" };
    const who = { id: m.id, member_no: m.member_no, name: `${m.first_name} ${m.last_name}` };
    if (m.status !== "active") return { result: "inactive", member: { ...who, status: m.status } };
    const recs = s.t("attendance_records");
    let result = "ok";
    if (a.p_stage === "out" && !recs.some((r) => r.session_id === ses.id && r.member_id === m.id && r.stage === "in")) {
      if (!a.p_allow_out_without_in) return { result: "not_timed_in", member: who };
      result = "ok_without_in";
    }
    const existing = recs.find((r) => r.session_id === ses.id && r.member_id === m.id && r.stage === a.p_stage);
    if (existing) result = "already";
    else
      recs.push({ id: randomUUID(), session_id: ses.id, member_id: m.id, stage: a.p_stage, scanned_at: a.p_scanned_at, method: a.p_member_id ? "manual" : "qr", was_offline: !!a.p_was_offline, scanned_by: a.p_admin_id, scanned_by_label: a.p_admin_label, recorded_at: now() });
    const mine = recs.filter((r) => r.session_id === ses.id);
    return { result, time: existing ? existing.scanned_at : a.p_scanned_at, counts: { in: mine.filter((r) => r.stage === "in").length, out: mine.filter((r) => r.stage === "out").length }, member: who };
  },
  record_duty: (s, a) => {
    const st = a.p_staff_id ? s.t("committee_staff").find((x) => x.id === a.p_staff_id) : s.t("committee_staff").find((x) => x.qr_token === a.p_qr_token);
    if (!st) return { result: "unknown" };
    const who = { id: st.id, member_no: st.staff_no, name: st.full_name };
    if (st.status !== "active") return { result: "inactive", member: { ...who, status: st.status } };
    const recs = s.t("duty_records");
    let r = recs.find((x) => x.staff_id === st.id && x.duty_date === a.p_date);
    if (!r) recs.push((r = { id: randomUUID(), staff_id: st.id, duty_date: a.p_date, time_in: null, time_out: null, created_at: now(), updated_at: now() }));
    let result = "ok";
    if (a.p_stage === "in") {
      if (r.time_in) result = "already";
      else Object.assign(r, { time_in: a.p_at, in_by: a.p_admin_id, in_by_label: a.p_admin_label, in_method: a.p_method });
    } else {
      if (!r.time_in) return { result: "not_timed_in", member: who };
      if (r.time_out) result = "already";
      else if (String(a.p_at) <= String(r.time_in)) return { result: "too_soon", member: who };
      else Object.assign(r, { time_out: a.p_at, out_by: a.p_admin_id, out_by_label: a.p_admin_label, out_method: a.p_method });
    }
    const day = recs.filter((x) => x.duty_date === a.p_date);
    return { result, time: a.p_stage === "in" ? r.time_in : r.time_out, counts: { in: day.filter((x) => x.time_in).length, out: day.filter((x) => x.time_out).length }, member: who };
  },
  delete_member_forever: (s, a) => {
    const m = s.t("members").find((x) => x.id === a.p_member_id);
    if (!m) return { error: "not_found" };
    const files = s.t("files").filter((f) => f.member_id === m.id || (m.application_id && f.application_id === m.application_id));
    for (const f of files) s.remove("files", f);
    s.remove("members", m);
    const app = s.t("applications").find((x) => x.id === m.application_id);
    if (app) s.remove("applications", app);
    audit(s, { actor_id: a.p_admin_id, actor_label: a.p_admin_label, action: "member.deleted", target_type: "member", target_id: m.id, target_label: `${m.last_name}, ${m.first_name} (${m.member_no})`, before: { member_no: m.member_no, status: m.status, diocese: m.diocese }, reason: a.p_reason });
    return { files: files.map((f) => ({ backend: f.backend, storage_key: f.storage_key })), folder_name: m.folder_name, drive_folder_id: null };
  },
};

export function mockClient(store: Store) {
  return {
    from: (table: string) => new Query(store, table),
    rpc: async (name: string, args: Args = {}) => {
      const fn = RPC[name];
      if (!fn) return { data: null, error: { message: `Unknown function ${name}` } };
      return { data: fn(store, args), error: null };
    },
    storage: {
      from: () => ({
        upload: async (key: string, bytes: Uint8Array, opts?: { contentType?: string }) => {
          store.files.set(key, { bytes, type: opts?.contentType ?? "application/octet-stream" });
          return { data: { path: key }, error: null };
        },
        download: async (key: string) => {
          const f = store.files.get(key);
          if (!f) return { data: null, error: { message: "Not found" } };
          return { data: new Blob([f.bytes as BlobPart], { type: f.type }), error: null };
        },
        remove: async (keys: string[]) => {
          for (const k of keys) store.files.delete(k);
          return { data: null, error: null };
        },
      }),
    },
  };
}
