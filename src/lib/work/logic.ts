import type {
  DprEntry,
  Job,
  Member,
  PaintBatch,
  PlanLine,
  Stage,
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

export function entryArea(e: DprEntry): number {
  return round3(e.members.reduce((s, m) => s + memberArea(m), 0));
}

/** m² done per stage on a job. */
export function jobStageAreas(job: Job, dprs: DprEntry[]): Record<Stage, number> {
  const out: Record<Stage, number> = { prep: 0, coat1: 0, coat2: 0, final: 0 };
  for (const e of dprs) if (e.jobId === job.id) out[e.stage] = round3(out[e.stage] + entryArea(e));
  return out;
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
  const variance = plan > 0 ? actual / plan - 1 : 0;
  const closed = w.closedMonths.includes(line.month);
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
    capPct: wo.capInr ? billed / wo.capInr : 0,
    scopeM2,
    usedM2,
    m2Pct: scopeM2 ? usedM2 / scopeM2 : 0,
  };
}

export function warnLevel(pct: number): "ok" | "warn" | "crit" {
  if (pct >= WO_WARN[1]) return "crit";
  if (pct >= WO_WARN[0]) return "warn";
  return "ok";
}

/** Litres a supervisor has used per paint, from their DPR entries. */
export function paintUsed(supervisorId: string, sap: string, dprs: DprEntry[]): number {
  return round3(dprs.filter((e) => e.supervisorId === supervisorId && e.paintSap === sap).reduce((s, e) => s + e.litres, 0));
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

export function expiryState(expiry: string, today: string): "expired" | "soon" | "ok" {
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
  flag: "ok" | "low" | "negative" | "none";
}

/**
 * Per supervisor and paint: issued, used (DPR), balance and the litres still
 * needed for their open plan lines (remaining m² × norm). Low = balance below
 * what the remaining scope needs (docs §6).
 */
export function supervisorPaint(w: WorkState, month: string): SupervisorPaint[] {
  const rows = new Map<string, SupervisorPaint>();
  for (const b of w.paint) {
    if (!b.supervisorId) continue;
    const key = `${b.supervisorId}|${b.sap}`;
    const r = rows.get(key) ?? { supervisorId: b.supervisorId, sap: b.sap, name: b.name, issued: 0, used: 0, balance: 0, needed: 0, flag: "ok" as const };
    r.issued = round3(r.issued + b.qtyL);
    rows.set(key, r);
  }
  for (const line of w.planLines.filter((l) => l.month === month)) {
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
    r.flag = r.issued === 0 && r.used === 0 ? "none" : r.balance < 0 ? "negative" : r.balance < r.needed ? "low" : "ok";
  }
  return [...rows.values()].filter((r) => r.issued > 0 || r.used > 0 || r.needed > 0);
}
