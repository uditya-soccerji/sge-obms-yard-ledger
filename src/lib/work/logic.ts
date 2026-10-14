import type {
  Expense,
  Jms,
  JmsStatus,
  DprEntry,
  Job,
  Member,
  PaintBatch,
  PlanLine,
  Stage,
  WorkOrder,
  WorkState,
} from "./types";
import { STAGES } from "./types";

/** Plan tolerance (docs §15): up to 5 % over or 2 % under is fine. */
export const OVER_TOLERANCE = 0.05;
export const UNDER_TOLERANCE = 0.02;
/** Work-order warnings (docs §17) */
export const WO_WARN = [0.8, 0.95];
/** Paint expiry warning window (docs §17) */
export const EXPIRY_WARN_DAYS = 60;

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function memberArea(m: Member): number {
  return round3(m.nos * m.side * m.length * m.cf);
}

/**
 * Area of one DPR entry. The RIL measurement sheet adds the raw NOS × SIDE ×
 * LENGTH × CF products and rounds the page total once, so this does too
 * (rounding each member first gave 193.912 for the signed 193.911 sheet).
 */
export function entryArea(e: DprEntry): number {
  return round3(e.members.reduce((s, m) => s + m.nos * m.side * m.length * m.cf, 0));
}

/** A member row is blank when it has no name, length or CF (NOS and SIDE default to 1); blank rows are ignored. */
const blankMember = (m: Member) => !m.name.trim() && !(m.length > 0) && !(m.cf > 0);

/**
 * Check measured members before saving (form and store use the same rule):
 * blank rows are dropped, a half-filled row is an error naming the row.
 */
export function validMembers(members: Member[]): { members: Member[]; error?: string } {
  const out: Member[] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (blankMember(m)) continue;
    const row = `Row ${i + 1}`;
    if (!m.name.trim()) return { members: out, error: `${row}: give the member a name` };
    for (const [k, label] of [["nos", "NOS"], ["side", "SIDE"], ["length", "LENGTH"], ["cf", "CF"]] as const) {
      if (!(m[k] > 0)) return { members: out, error: `${row}: ${label} must be above 0` };
    }
    out.push(m);
  }
  if (!out.length) return { members: out, error: "Add at least one measured member (NOS, SIDE, LENGTH, CF all above 0)" };
  return { members: out };
}

const entryKey = (e: DprEntry) => `${e.jobId}|${e.date}|${e.stage}`;

/**
 * Double entry (docs §5, §5b): Admin re-enters every DPR and Admin's figures
 * win. For each job · date · stage that Admin entered, the supervisor's
 * entries are kept for comparison only and never counted.
 */
export function effectiveEntries(dprs: DprEntry[]): DprEntry[] {
  // Only the data operator's (Admin) entry replaces the supervisor's; SIC /
  // Owner entries are ordinary entries, not a second copy
  const admin = new Set(dprs.filter((e) => e.enteredBy === "admin").map(entryKey));
  return dprs.filter((e) => e.enteredBy === "admin" || !admin.has(entryKey(e)));
}

export interface EntryDiff {
  jobId: string;
  date: string;
  stage: Stage;
  supervisorArea: number;
  adminArea: number;
  supervisorLitres: number;
  adminLitres: number;
}

/** Days where the supervisor's and Admin's entries for the same job and stage differ (docs §5b). */
export function entryDiffs(dprs: DprEntry[]): EntryDiff[] {
  const byKey = new Map<string, EntryDiff & { hasSup: boolean; hasAdmin: boolean }>();
  for (const e of dprs) {
    const k = entryKey(e);
    const d = byKey.get(k) ?? { jobId: e.jobId, date: e.date, stage: e.stage, supervisorArea: 0, adminArea: 0, supervisorLitres: 0, adminLitres: 0, hasSup: false, hasAdmin: false };
    if (e.enteredBy === "admin") {
      d.hasAdmin = true;
      d.adminArea = round3(d.adminArea + entryArea(e));
      d.adminLitres = round3(d.adminLitres + e.litres);
    } else {
      d.hasSup = true;
      d.supervisorArea = round3(d.supervisorArea + entryArea(e));
      d.supervisorLitres = round3(d.supervisorLitres + e.litres);
    }
    byKey.set(k, d);
  }
  return [...byKey.values()]
    .filter((d) => d.hasSup && d.hasAdmin && (d.supervisorArea !== d.adminArea || d.supervisorLitres !== d.adminLitres))
    .map((d) => ({ jobId: d.jobId, date: d.date, stage: d.stage, supervisorArea: d.supervisorArea, adminArea: d.adminArea, supervisorLitres: d.supervisorLitres, adminLitres: d.adminLitres }));
}

/** m² done per stage on a job (Admin's entries win, see effectiveEntries). */
export function jobStageAreas(job: Job, dprs: DprEntry[]): Record<Stage, number> {
  const out: Record<Stage, number> = { prep: 0, coat1: 0, coat2: 0, final: 0 };
  for (const e of effectiveEntries(dprs)) if (e.jobId === job.id) out[e.stage] = round3(out[e.stage] + entryArea(e));
  return out;
}

// ─── Plan months per site (docs §15) ───────────────────────────────────────

/** The month a site's new plan lines and jobs go into. */
export function currentMonthOf(w: WorkState, siteId: string): string {
  return w.siteMonths[siteId]?.current ?? w.defaultMonth;
}

export function isMonthClosed(w: WorkState, siteId: string, month: string): boolean {
  return w.siteMonths[siteId]?.closed.includes(month) ?? false;
}

/** The job's "final shade" = the last stage it requires. */
export function finalStage(job: Job): Stage {
  const order = STAGES.map((s) => s.id);
  return [...job.stages].sort((a, b) => order.indexOf(a) - order.indexOf(b)).pop() ?? "final";
}

/** A job can be closed when every stage it requires has some m² entered. */
export function canCloseJob(job: Job, dprs: DprEntry[]): { ok: boolean; missing: Stage[] } {
  const areas = jobStageAreas(job, dprs);
  const missing = job.stages.filter((s) => areas[s] <= 0);
  return { ok: job.status === "open" && missing.length === 0, missing };
}

/** Progress against the supervisor's plan (docs §24): final-shade m² and days used */
export function jobProgress(job: Job, dprs: DprEntry[], today: string) {
  const done = jobJmsQty(job, dprs);
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  const planDays = job.plannedEnd ? Math.max(1, day(job.plannedEnd) - day(job.startDate) + 1) : 0;
  const usedDays = Math.max(1, day(job.endDate ?? today) - day(job.startDate) + 1);
  return {
    done,
    pct: job.plannedM2 ? Math.round((done / job.plannedM2) * 100) : null,
    planDays,
    usedDays,
    timePct: planDays ? Math.round((usedDays / planDays) * 100) : null,
  };
}

/** JMS quantity = finished (final-shade) m² of the job. */
export function jobJmsQty(job: Job, dprs: DprEntry[]): number {
  return jobStageAreas(job, dprs)[finalStage(job)];
}

export interface LineStatus {
  plan: number;
  actual: number;
  remaining: number;
  inProgress: Record<Stage, number>;
  pct: number;
  variance: number;
  flag: "ok" | "short" | "over" | "running";
}

/**
 * Plan line figures. Actual = sum of JMS on the line. In progress = stage m²
 * on jobs not yet turned into a JMS. Flags use the −2 % / +5 % band; an open
 * month is "running" unless it is already over.
 */
export function lineStatus(line: PlanLine, w: WorkState): LineStatus {
  const plan = round3(line.planM2 + line.carriedM2);
  const actual = round3(w.jms.filter((j) => j.planLineId === line.id).reduce((s, j) => s + j.qty, 0));
  const inProgress: Record<Stage, number> = { prep: 0, coat1: 0, coat2: 0, final: 0 };
  for (const job of w.jobs) {
    if (job.planLineId !== line.id || job.status === "closed") continue;
    const a = jobStageAreas(job, w.dprs);
    for (const s of job.stages) inProgress[s] = round3(inProgress[s] + a[s]);
  }
  // A line with no plan left (carried at 0 m²) that still gets JMS is over by definition
  const variance = plan > 0 ? actual / plan - 1 : actual > 0 ? Infinity : 0;
  const closed = isMonthClosed(w, line.siteId, line.month);
  let flag: LineStatus["flag"] = "running";
  if (variance > OVER_TOLERANCE) flag = "over";
  else if (closed) flag = variance < -UNDER_TOLERANCE ? "short" : "ok";
  return {
    plan,
    actual,
    remaining: round3(Math.max(0, plan - actual)),
    inProgress,
    pct: plan > 0 ? actual / plan : 0,
    variance,
    flag,
  };
}

/** In-progress m² at the furthest stage reached (final back to prep), not the largest stage. */
export function furthestStageArea(inProgress: Record<Stage, number>): number {
  for (const s of [...STAGES].reverse()) if (inProgress[s.id] > 0) return inProgress[s.id];
  return 0;
}

/** Next job number for a site: J-<SITE>-0001, 0002… numbered per site. */
export function nextJobNo(jobs: Job[], siteCode: string): string {
  const prefix = `J-${siteCode}-`;
  const top = Math.max(0, ...jobs.filter((j) => j.jobNo.startsWith(prefix)).map((j) => Number(j.jobNo.slice(prefix.length)) || 0));
  return `${prefix}${String(top + 1).padStart(4, "0")}`;
}

/**
 * The work order a JMS bills against: same site, service code in scope, and
 * valid on the JMS date. The latest-starting one wins when several match.
 */
export function pickWorkOrder(w: WorkState, siteId: string, serviceCode: string, onDate: string): WorkOrder | null {
  const fits = w.workOrders.filter(
    (o) => o.siteId === siteId && o.scope[serviceCode] != null && o.validFrom <= onDate && onDate <= o.validTo
  );
  return fits.sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
}

/** RIL JMS stages in order (docs §14). PAID is set only by recording a payment. */
export const JMS_FLOW: JmsStatus[] = ["JMS SUBMITTED", "QSD APR", "A1 APR", "A2 APR", "A3 APR", "INVOICE UPLOADED", "PAID"];

/** Statuses a JMS may move to: the next stage; Owner / Super Admin may also step back one. */
export function nextJmsStatuses(current: JmsStatus, canStepBack: boolean): JmsStatus[] {
  const i = JMS_FLOW.indexOf(current);
  const out: JmsStatus[] = [];
  if (canStepBack && i > 0 && current !== "PAID") out.push(JMS_FLOW[i - 1]);
  const next = JMS_FLOW[i + 1];
  if (next && next !== "PAID") out.push(next);
  return out;
}

/**
 * Who may void a cost (docs §8): the person who entered it, on the same day;
 * after that only Owner / Super Admin.
 */
export function canVoidExpense(x: Expense, viewer: { accountId: string; role: string | null }, today: string): boolean {
  if (x.voided) return false;
  if (viewer.role === "owner" || viewer.role === "super_admin") return true;
  return !!x.enteredBy && x.enteredBy === viewer.accountId && (x.enteredAt ?? "").slice(0, 10) === today;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Work-order use per service code (m²) and in ₹, from all JMS on the WO. */
export function woUsage(woId: string, w: WorkState) {
  const wo = w.workOrders.find((x) => x.id === woId);
  if (!wo) return null;
  const jms = w.jms.filter((j) => j.woId === woId);
  // Part of the billed value is at placeholder rates (ARC list not in yet)
  const billedEstimate = Math.round(jms.filter((j) => j.ratePending).reduce((s, j) => s + j.amount, 0) * 100) / 100;
  const items = Object.entries(wo.scope).map(([code, scope]) => {
    const used = round3(jms.filter((j) => j.serviceCode === code).reduce((s, j) => s + j.qty, 0));
    return { code, scope, used, balance: round3(scope - used), pct: scope ? used / scope : 0 };
  });
  const billed = Math.round(jms.reduce((s, j) => s + j.amount, 0) * 100) / 100;
  const scopeM2 = items.reduce((s, i) => s + i.scope, 0);
  const usedM2 = round3(items.reduce((s, i) => s + i.used, 0));
  return {
    wo,
    items,
    billed,
    billedEstimate,
    capPct: wo.capInr ? billed / wo.capInr : 0,
    scopeM2,
    usedM2,
    m2Pct: scopeM2 ? usedM2 / scopeM2 : 0,
  };
}

/**
 * Warnings for one work order: the WO itself is judged on overall m² and ₹ cap;
 * single service items are reported separately (one item at 82% doesn't mean
 * the WO is nearly used up).
 */
export function woWarnings(u: NonNullable<ReturnType<typeof woUsage>>) {
  return {
    wo: warnLevel(Math.max(u.m2Pct, u.capPct)),
    items: u.items.map((i) => ({ code: i.code, level: warnLevel(i.pct) })).filter((i) => i.level !== "ok"),
  };
}

export function warnLevel(pct: number): "ok" | "warn" | "crit" {
  if (pct >= WO_WARN[1]) return "crit";
  if (pct >= WO_WARN[0]) return "warn";
  return "ok";
}

/** Litres a supervisor has used per paint, from their DPR entries (Admin's entries win). */
export function paintUsed(supervisorId: string, sap: string, dprs: DprEntry[]): number {
  return round3(effectiveEntries(dprs).filter((e) => e.supervisorId === supervisorId && e.paintSap === sap).reduce((s, e) => s + e.litres, 0));
}

/**
 * Remaining litres per batch: each supervisor's DPR use is taken from their
 * issued batches earliest-expiry first. Overdraw shows as a negative balance
 * on the supervisor (allowed and flagged, docs §6), batches stop at 0.
 */
export function batchBalances(w: WorkState): Map<string, number> {
  const left = new Map(w.paint.map((b) => [b.id, b.qtyL]));
  const groups = new Map<string, PaintBatch[]>();
  for (const b of w.paint) {
    if (!b.supervisorId) continue;
    const key = `${b.supervisorId}|${b.sap}`;
    groups.set(key, [...(groups.get(key) ?? []), b]);
  }
  for (const [key, batches] of groups) {
    const [sup, sap] = key.split("|");
    let need = paintUsed(sup, sap, w.dprs);
    for (const b of [...batches].sort((a, c) => a.expiry.localeCompare(c.expiry))) {
      const take = Math.min(need, left.get(b.id) ?? 0);
      left.set(b.id, round3((left.get(b.id) ?? 0) - take));
      need -= take;
      if (need <= 0) break;
    }
  }
  return left;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function expiryState(expiry: string, today: string): "expired" | "soon" | "ok" | "unknown" {
  // FIM "NEW - LOC" rows come without dates
  if (!expiry) return "unknown";
  const d = daysBetween(today, expiry);
  if (d < 0) return "expired";
  if (d <= EXPIRY_WARN_DAYS) return "soon";
  return "ok";
}

export interface SupervisorPaint {
  supervisorId: string;
  sap: string;
  name: string;
  issued: number;
  used: number;
  balance: number;
  /** Litres still needed to finish the open work on this paint */
  needed: number;
  /** none = nothing issued or needed; no_stock = needed but nothing issued (docs §6) */
  flag: "ok" | "low" | "negative" | "none" | "no_stock";
}

/**
 * Per supervisor and paint: issued, used (DPR), balance and the litres still
 * needed for their open plan lines (remaining m² × norm). Low = balance below
 * what the remaining scope needs (docs §6).
 */
export function supervisorPaint(w: WorkState): SupervisorPaint[] {
  const rows = new Map<string, SupervisorPaint>();
  for (const b of w.paint) {
    if (!b.supervisorId) continue;
    const key = `${b.supervisorId}|${b.sap}`;
    const r = rows.get(key) ?? { supervisorId: b.supervisorId, sap: b.sap, name: b.name, issued: 0, used: 0, balance: 0, needed: 0, flag: "ok" as const };
    r.issued = round3(r.issued + b.qtyL);
    rows.set(key, r);
  }
  for (const line of w.planLines.filter((l) => l.month === currentMonthOf(w, l.siteId))) {
    const item = w.serviceItems.find((s) => s.code === line.serviceCode);
    const rem = lineStatus(line, w).remaining;
    for (const p of item?.paints ?? []) {
      const key = `${line.supervisorId}|${p.sap}`;
      const r = rows.get(key) ?? { supervisorId: line.supervisorId, sap: p.sap, name: p.name, issued: 0, used: 0, balance: 0, needed: 0, flag: "ok" as const };
      r.needed = round3(r.needed + rem * p.normL);
      rows.set(key, r);
    }
  }
  for (const r of rows.values()) {
    r.used = paintUsed(r.supervisorId, r.sap, w.dprs);
    r.balance = round3(r.issued - r.used);
    r.flag =
      r.issued === 0 && r.used === 0
        ? r.needed > 0
          ? "no_stock"
          : "none"
        : r.balance < 0
          ? "negative"
          : r.balance < r.needed
            ? "low"
            : "ok";
  }
  return [...rows.values()].filter((r) => r.issued > 0 || r.used > 0 || r.needed > 0);
}

// ─── Approved vs received (docs §18) ────────────────────────────────────────

export interface PaymentRow {
  jms: Jms;
  approved: number;
  received: number | null;
  /** received − approved (negative = short), paid JMS only */
  gap: number | null;
  gapPct: number | null;
  /** Days from SIC confirm to payment (paid) */
  daysToPay: number | null;
  /** Days waiting since SIC confirm (unpaid) */
  waiting: number | null;
}

export function paymentRows(jms: Jms[], today: string): PaymentRow[] {
  return jms.map((j) => {
    const p = j.payment;
    const gap = p ? Math.round((p.amount - j.amount) * 100) / 100 : null;
    return {
      jms: j,
      approved: j.amount,
      received: p ? p.amount : null,
      gap,
      gapPct: p && j.amount ? (p.amount - j.amount) / j.amount : null,
      daysToPay: p ? daysBetween(j.confirmedOn, p.receivedOn) : null,
      waiting: p ? null : daysBetween(j.confirmedOn, today),
    };
  });
}

/** Payments to look at first: biggest shortfalls, then the longest unpaid. */
export function worstPayments(rows: PaymentRow[], limit = 4): PaymentRow[] {
  const short = rows.filter((r) => (r.gap ?? 0) <= -1).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0));
  const unpaid = rows.filter((r) => r.received == null && (r.waiting ?? 0) > 45).sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0));
  return [...short, ...unpaid].slice(0, limit);
}

export function paymentSummary(rows: PaymentRow[]) {
  const paid = rows.filter((r) => r.received != null);
  const approved = rows.reduce((s, r) => s + r.approved, 0);
  const approvedPaid = paid.reduce((s, r) => s + r.approved, 0);
  const received = paid.reduce((s, r) => s + (r.received ?? 0), 0);
  return {
    approved,
    /** Approved value that is at placeholder rates (ARC list pending) */
    approvedEstimate: rows.filter((r) => r.jms.ratePending).reduce((s, r) => s + r.approved, 0),
    received,
    /** Difference on paid JMS only (negative = got less than approved) */
    gap: Math.round((received - approvedPaid) * 100) / 100,
    unpaidValue: approved - approvedPaid,
    unpaidCount: rows.length - paid.length,
    shortCount: paid.filter((r) => (r.gap ?? 0) < -0.5).length,
    avgDays: paid.length ? Math.round(paid.reduce((s, r) => s + (r.daysToPay ?? 0), 0) / paid.length) : 0,
  };
}

// ─── Accounting / P&L (docs §18) ────────────────────────────────────────────

export const DEFAULT_WAGE = 800;

/** Cost categories (docs §8: a fixed list; moves to Master Data with the shared database). */
export const EXPENSE_CATEGORIES = [
  "Staff salaries",
  "Compressor rent",
  "Bus rent",
  "Car rent",
  "Diesel",
  "Machinery",
  "PPE items",
  "Copper slag abrasive",
  "Thinner + rollers",
  "Scaffold hire",
  "Transport",
  "Other",
] as const;

export const PAYMENT_MODES: { id: "cash" | "upi" | "bank" | "credit"; label: string }[] = [
  { id: "cash", label: "Cash" },
  { id: "upi", label: "UPI" },
  { id: "bank", label: "Bank" },
  { id: "credit", label: "Credit" },
];

export interface JobLabour {
  days: number;
  cost: number;
  /** Labour-days per month (YYYY-MM), for sharing that month's fixed costs */
  byMonth: Record<string, number>;
  costByMonth: Record<string, number>;
}

/**
 * Labour per job from DPR crews: each labourer-day is split evenly across the
 * jobs they appear on that date (split day). Imported history adds its own
 * days/cost in the plan line's month.
 */
export function labourByJob(w: WorkState, wageOf: (labourerId: string) => number): Map<string, JobLabour> {
  const out = new Map<string, JobLabour>();
  const get = (id: string) => {
    let v = out.get(id);
    if (!v) out.set(id, (v = { days: 0, cost: 0, byMonth: {}, costByMonth: {} }));
    return v;
  };
  const slots = new Map<string, Set<string>>();
  for (const e of effectiveEntries(w.dprs)) {
    for (const lab of e.crew ?? []) {
      const key = `${lab}|${e.date}`;
      slots.set(key, (slots.get(key) ?? new Set()).add(e.jobId));
    }
  }
  for (const [key, jobs] of slots) {
    const [lab, date] = key.split("|");
    const share = 1 / jobs.size;
    const month = date.slice(0, 7);
    for (const jobId of jobs) {
      const v = get(jobId);
      const c = wageOf(lab) * share;
      v.days += share;
      v.cost += c;
      v.byMonth[month] = (v.byMonth[month] ?? 0) + share;
      v.costByMonth[month] = (v.costByMonth[month] ?? 0) + c;
    }
  }
  for (const job of w.jobs) {
    if (!job.importedLabour) continue;
    const month = w.planLines.find((l) => l.id === job.planLineId)?.month ?? job.startDate.slice(0, 7);
    const v = get(job.id);
    v.days += job.importedLabour.days;
    v.cost += job.importedLabour.cost;
    v.byMonth[month] = (v.byMonth[month] ?? 0) + job.importedLabour.days;
    v.costByMonth[month] = (v.costByMonth[month] ?? 0) + job.importedLabour.cost;
  }
  return out;
}

export interface JobPnl {
  /** Job id, or `unalloc|<site>|<month>` for overhead with no crew to share it over */
  jobId: string;
  kind: "job" | "unallocated";
  siteId: string;
  supervisorId: string;
  serviceCode: string;
  month: string;
  /** m² of JMS approved (earned basis) */
  qty: number;
  /** m² of JMS paid (cash basis) */
  paidQty: number;
  /** JMS value approved by SIC (earned) */
  earned: number;
  /** Money received (cash basis income) */
  income: number;
  labour: number;
  labourDays: number;
  direct: number;
  overhead: number;
  /** Cash basis: income − all costs */
  profit: number;
  /** Earned basis: approved value − all costs (for comparison) */
  earnedProfit: number;
}

/** Labour-days per site · month, the key fixed costs are shared by. */
function siteLabourDays(w: WorkState, labour: Map<string, JobLabour>): Map<string, number> {
  const lineOf = new Map(w.planLines.map((l) => [l.id, l]));
  const out = new Map<string, number>();
  for (const job of w.jobs) {
    const site = lineOf.get(job.planLineId)?.siteId ?? "";
    for (const [m, d] of Object.entries(labour.get(job.id)?.byMonth ?? {})) {
      out.set(`${site}|${m}`, (out.get(`${site}|${m}`) ?? 0) + d);
    }
  }
  return out;
}

function fixedBySiteMonth(w: WorkState): Map<string, number> {
  const out = new Map<string, number>();
  for (const x of w.expenses) {
    if (x.kind !== "fixed" || x.voided) continue;
    out.set(`${x.siteId}|${x.month}`, (out.get(`${x.siteId}|${x.month}`) ?? 0) + x.amount);
  }
  return out;
}

const inMonth = (date: string | undefined, month: string) => month === "all" || (!!date && date.slice(0, 7) === month);

/**
 * P&L per job (docs §18) for one month, or "all". Each figure lands in the
 * month it happened: income when the money was received (cash basis), earned
 * when SIC approved the JMS, labour on the days worked, overhead in its own
 * month, direct costs in the month they were spent.
 *
 * Fixed costs of a site-month with no DPR labour-days can't be shared over
 * any job; they come back as "unallocated" rows so the totals still carry them.
 */
export function pnlRows(w: WorkState, wageOf: (labourerId: string) => number, month = "all"): JobPnl[] {
  const labour = labourByJob(w, wageOf);
  const lineOf = new Map(w.planLines.map((l) => [l.id, l]));
  const siteDays = siteLabourDays(w, labour);
  const fixed = fixedBySiteMonth(w);
  const rows: JobPnl[] = [];
  for (const job of w.jobs) {
    const line = lineOf.get(job.planLineId);
    if (!line) continue;
    const lab = labour.get(job.id) ?? { days: 0, cost: 0, byMonth: {}, costByMonth: {} };
    let overhead = 0;
    let labourCost = 0;
    let labourDays = 0;
    for (const [m, d] of Object.entries(lab.byMonth)) {
      if (!inMonth(m, month)) continue;
      labourDays += d;
      labourCost += lab.costByMonth[m] ?? 0;
      const total = siteDays.get(`${line.siteId}|${m}`) ?? 0;
      if (total > 0) overhead += (fixed.get(`${line.siteId}|${m}`) ?? 0) * (d / total);
    }
    const direct = w.expenses
      .filter((x) => x.kind === "direct" && !x.voided && x.jobId === job.id && inMonth(x.month || x.date, month))
      .reduce((s, x) => s + x.amount, 0);
    const jms = w.jms.find((j) => j.id === job.jmsId);
    const approvedNow = !!jms && inMonth(jms.confirmedOn, month);
    const paidNow = !!jms?.payment && inMonth(jms.payment.receivedOn, month);
    const earned = approvedNow ? jms!.amount : 0;
    const income = paidNow ? jms!.payment!.amount : 0;
    const cost = labourCost + direct + overhead;
    rows.push({
      jobId: job.id,
      kind: "job",
      siteId: line.siteId,
      supervisorId: job.supervisorId,
      serviceCode: line.serviceCode,
      month: month === "all" ? line.month : month,
      qty: approvedNow ? jms!.qty : 0,
      paidQty: paidNow ? jms!.qty : 0,
      earned,
      income,
      labour: labourCost,
      labourDays,
      direct,
      overhead,
      profit: income - cost,
      earnedProfit: earned - cost,
    });
  }
  for (const [key, amount] of fixed) {
    const [siteId, m] = key.split("|");
    if (!inMonth(m, month) || (siteDays.get(key) ?? 0) > 0 || amount === 0) continue;
    rows.push({
      jobId: `unalloc|${siteId}|${m}`,
      kind: "unallocated",
      siteId,
      supervisorId: "",
      serviceCode: "",
      month: m,
      qty: 0,
      paidQty: 0,
      earned: 0,
      income: 0,
      labour: 0,
      labourDays: 0,
      direct: 0,
      overhead: amount,
      profit: -amount,
      earnedProfit: -amount,
    });
  }
  return rows;
}

/** All-months P&L per job (kept for callers that want every month at once). */
export function jobPnl(w: WorkState, wageOf: (labourerId: string) => number): JobPnl[] {
  return pnlRows(w, wageOf, "all");
}

export interface PnlTotals {
  key: string;
  qty: number;
  paidQty: number;
  earned: number;
  income: number;
  labour: number;
  labourDays: number;
  direct: number;
  overhead: number;
  profit: number;
  earnedProfit: number;
}

/** Roll job P&L up by any key (supervisor, site, service item, month…). */
export function rollUp(rows: JobPnl[], keyOf: (r: JobPnl) => string): PnlTotals[] {
  const m = new Map<string, PnlTotals>();
  for (const r of rows) {
    const k = keyOf(r);
    const t = m.get(k) ?? { key: k, qty: 0, paidQty: 0, earned: 0, income: 0, labour: 0, labourDays: 0, direct: 0, overhead: 0, profit: 0, earnedProfit: 0 };
    t.qty += r.qty;
    t.paidQty += r.paidQty;
    t.earned += r.earned;
    t.income += r.income;
    t.labour += r.labour;
    t.labourDays += r.labourDays;
    t.direct += r.direct;
    t.overhead += r.overhead;
    t.profit += r.profit;
    t.earnedProfit += r.earnedProfit;
    m.set(k, t);
  }
  return [...m.values()];
}

/** Per-unit figures; null when there's nothing to divide by. */
export const perUnit = (amount: number, units: number) => (units > 0 ? amount / units : null);
