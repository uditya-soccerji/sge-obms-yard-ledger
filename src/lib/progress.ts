/**
 * Progress dashboard and report (owner, 2026-11-19): what was done, by whom, where and when,
 * worked out from DPRs (painting work lines, scaffold lines, attendance), the plan and the JMS.
 *
 * - Job types: painting & blasting, scaffolding, rope access (the supervisor's type). Rope access
 *   is split into blasting and painting like painting & blasting (owner).
 * - Blasting = "Blasting / surface prep" stage; painting = 1st / 2nd coat + final shade.
 * - Actual against the plan = JMS m² where the job has a JMS, else the DPR final-shade m² (owner).
 * - Only submitted DPRs count (drafts and sent-back ones don't); work lines imported as history
 *   (no DPR) count too.
 * - Weeks start Monday (owner).
 */
import type { StaffMember } from "./types";
import type { DprEntry, DprReport, Jms, Job, PlanLine } from "./work/types";
import { effectiveEntries, entryArea, entryPlanLineId } from "./work/logic";

export type JobKind = "pb" | "scaf" | "rope";
/** The job-type filter: "blast" / "paint" are the painting kinds narrowed to one side */
export type TypeFilter = "all" | JobKind | "blast" | "paint";

export const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "all", label: "All work" },
  { id: "pb", label: "Painting & blasting" },
  { id: "blast", label: "Blasting only" },
  { id: "paint", label: "Painting only" },
  { id: "scaf", label: "Scaffolding" },
  { id: "rope", label: "Rope access" },
];
export const KIND_LABEL: Record<JobKind, string> = { pb: "Painting & blasting", scaf: "Scaffolding", rope: "Rope access" };

export interface Fact {
  date: string;
  siteId: string;
  plant: string;
  supervisorId: string;
  kind: JobKind;
  blast: number;
  coat: number;
  final: number;
  litres: number;
  erect: number;
  dism: number;
  mandays: number;
  ppe: number;
}

export interface Filters {
  from: string;
  to: string;
  /** Empty = every site */
  siteIds: string[];
  plant: string;
  supervisorId: string;
  type: TypeFilter;
  /** Only these supervisors (a sub-contractor login: his own people) */
  supervisorIds?: string[];
}

export interface WorkData {
  reports: DprReport[];
  dprs: DprEntry[];
  jobs: Job[];
  planLines: PlanLine[];
  jms: Jms[];
}

const counts = (r: DprReport | undefined) => !r || r.status === "submitted" || r.status === "sic_approved";
const P = (s: string) => s.trim().toUpperCase();

export function kindOf(staff: StaffMember | undefined, fallback?: DprReport["submitterType"]): JobKind {
  const t = staff?.supervisorType;
  if (t === "scaffolding") return "scaf";
  if (t === "rope_access") return "rope";
  if (t === "painting_blasting") return "pb";
  return fallback === "scaffolding" ? "scaf" : "pb";
}

const MAN_DAY: Record<string, number> = { present: 1, overtime: 1, half: 0.5 };

/** Every counted thing in the date range, one row per work line / scaffold line / DPR */
export function buildFacts(w: WorkData, staff: StaffMember[], from: string, to: string): Fact[] {
  const out: Fact[] = [];
  const reportById = new Map(w.reports.map((r) => [r.id, r]));
  const lineById = new Map(w.planLines.map((l) => [l.id, l]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const blank = { blast: 0, coat: 0, final: 0, litres: 0, erect: 0, dism: 0, mandays: 0, ppe: 0 };

  for (const e of effectiveEntries(w.dprs)) {
    if (e.date < from || e.date > to) continue;
    const rep = e.reportId ? reportById.get(e.reportId) : undefined;
    if (e.reportId && !counts(rep)) continue;
    const line = lineById.get(entryPlanLineId(e, w.jobs) ?? "");
    const area = entryArea(e);
    out.push({
      ...blank,
      date: e.date,
      siteId: line?.siteId ?? rep?.siteId ?? "",
      plant: P(line?.plant ?? rep?.plant ?? ""),
      supervisorId: e.supervisorId,
      kind: kindOf(staffById.get(e.supervisorId), rep?.submitterType) === "rope" ? "rope" : "pb",
      blast: e.stage === "prep" ? area : 0,
      coat: e.stage === "coat1" || e.stage === "coat2" ? area : 0,
      final: e.stage === "final" ? area : 0,
      litres: e.litres || 0,
    });
  }

  for (const r of w.reports) {
    if (r.date < from || r.date > to || !counts(r)) continue;
    const kind = kindOf(staffById.get(r.submitterId), r.submitterType);
    if (r.submitterType === "safety" || r.submitterType === "store") continue;
    for (const s of r.scaffoldWork ?? []) {
      out.push({ ...blank, date: r.date, siteId: r.siteId, plant: P(s.plant || r.plant), supervisorId: r.submitterId, kind: "scaf", erect: s.erectM3 || 0, dism: s.dismantleM3 || 0 });
    }
    // Imported sheets give a headcount instead of named crew (owner, 2026-11-21)
    const marked = r.labourMarks.reduce((n, m) => n + (MAN_DAY[m.status] ?? 0), 0);
    const mandays = r.labourMarks.length ? marked : (r.headcount ?? []).reduce((n, h) => n + (h.count || 0), 0);
    const ppe = r.labourMarks.filter((m) => m.ppe === "damaged" || m.ppe === "due" || m.ppe === "urgent").length;
    if (mandays || ppe) out.push({ ...blank, date: r.date, siteId: r.siteId, plant: P(r.plant), supervisorId: r.submitterId, kind, mandays, ppe });
  }
  return out;
}

export function matches(f: Fact, x: Filters): boolean {
  if (x.siteIds.length && !x.siteIds.includes(f.siteId)) return false;
  if (x.plant && f.plant !== P(x.plant)) return false;
  if (x.supervisorId && f.supervisorId !== x.supervisorId) return false;
  if (x.supervisorIds && !x.supervisorIds.includes(f.supervisorId)) return false;
  if (x.type === "all") return true;
  if (x.type === "blast" || x.type === "paint") return f.kind !== "scaf";
  return f.kind === x.type;
}

export interface Measures {
  blast: number;
  coat: number;
  final: number;
  litres: number;
  erect: number;
  dism: number;
  mandays: number;
  ppe: number;
}

export function measure(facts: Fact[], type: TypeFilter): Measures {
  const m: Measures = { blast: 0, coat: 0, final: 0, litres: 0, erect: 0, dism: 0, mandays: 0, ppe: 0 };
  for (const f of facts) {
    if (type !== "paint") m.blast += f.blast;
    if (type !== "blast") {
      m.coat += f.coat;
      m.final += f.final;
      m.litres += f.litres;
    }
    m.erect += f.erect;
    m.dism += f.dism;
    m.mandays += f.mandays;
    m.ppe += f.ppe;
  }
  return m;
}

export const shows = (type: TypeFilter) => ({
  blast: type !== "scaf" && type !== "paint",
  paint: type !== "scaf" && type !== "blast",
  scaf: type === "all" || type === "scaf",
});

/* ---------- dates ---------- */

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5) + 1;
/** Monday of that day's week (owner: weeks start Monday) */
export function weekStart(day: string): string {
  const dow = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}
export function previousRange(from: string, to: string): [string, string] {
  const n = spanDays(from, to);
  return [addDays(from, -n), addDays(from, -1)];
}

export interface Bucket {
  key: string;
  label: string;
  from: string;
  to: string;
}
/** Days for up to 16 days, else Monday weeks */
export function buckets(from: string, to: string): Bucket[] {
  const out: Bucket[] = [];
  if (spanDays(from, to) <= 16) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ key: d, label: d.slice(8), from: d, to: d });
    return out;
  }
  for (let d = weekStart(from); d <= to; d = addDays(d, 7)) {
    const end = addDays(d, 6);
    out.push({ key: d, label: `${d.slice(8)}/${d.slice(5, 7)}`, from: d < from ? from : d, to: end > to ? to : end });
  }
  return out;
}

/* ---------- DPRs sent on time ---------- */

export interface DprPunctuality {
  sent: number;
  late: number;
  missing: number;
  /** supervisorId → counts */
  bySupervisor: Map<string, { sent: number; late: number; missing: number }>;
}

/**
 * Expected: one DPR a day, Monday to Saturday, from each supervisor who has a crew on that site
 * (the people they report for). Late = sent after the day it is for.
 */
export function punctuality(
  reports: DprReport[],
  supervisors: { id: string; siteIds: string[] }[],
  x: Filters,
  today: string
): DprPunctuality {
  const bySupervisor = new Map<string, { sent: number; late: number; missing: number }>();
  const row = (id: string) => bySupervisor.get(id) ?? (bySupervisor.set(id, { sent: 0, late: 0, missing: 0 }), bySupervisor.get(id)!);
  const to = x.to > today ? today : x.to;
  for (const s of supervisors) {
    if (x.supervisorId && s.id !== x.supervisorId) continue;
    const sites = x.siteIds.length ? s.siteIds.filter((id) => x.siteIds.includes(id)) : s.siteIds;
    if (!sites.length) continue;
    for (let d = x.from; d <= to; d = addDays(d, 1)) {
      if (new Date(`${d}T00:00:00Z`).getUTCDay() === 0) continue;
      const mine = reports.filter((r) => r.submitterId === s.id && r.date === d && sites.includes(r.siteId) && counts(r) && (!x.plant || P(r.plant) === P(x.plant)));
      const c = row(s.id);
      if (!mine.length) {
        if (!x.plant) c.missing++;
        continue;
      }
      c.sent++;
      if (mine.every((r) => (r.submittedAt ?? "").slice(0, 10) > d)) c.late++;
    }
  }
  let sent = 0, late = 0, missing = 0;
  for (const c of bySupervisor.values()) {
    sent += c.sent;
    late += c.late;
    missing += c.missing;
  }
  return { sent, late, missing, bySupervisor };
}

/* ---------- plan vs actual ---------- */

export interface PlanRow {
  supervisorId: string;
  plan: number;
  /** JMS m² where the job has one, else DPR final-shade m² (owner, 2026-11-19) */
  actual: number;
  fromJms: number;
}

export function planVsActual(w: WorkData, month: string, x: Pick<Filters, "siteIds" | "plant" | "supervisorId" | "supervisorIds">): PlanRow[] {
  const lines = w.planLines.filter(
    (l) =>
      l.month === month &&
      (!x.siteIds.length || x.siteIds.includes(l.siteId)) &&
      (!x.plant || P(l.plant) === P(x.plant)) &&
      (!x.supervisorId || l.supervisorId === x.supervisorId) &&
      (!x.supervisorIds || x.supervisorIds.includes(l.supervisorId))
  );
  const entries = effectiveEntries(w.dprs).filter((e) => e.stage === "final");
  const bySup = new Map<string, PlanRow>();
  for (const l of lines) {
    const row = bySup.get(l.supervisorId) ?? { supervisorId: l.supervisorId, plan: 0, actual: 0, fromJms: 0 };
    row.plan += (l.planM2 || 0) + (l.carriedM2 || 0);
    for (const j of w.jobs.filter((jb) => jb.planLineId === l.id)) {
      const jms = j.jmsId ? w.jms.find((m) => m.id === j.jmsId) : undefined;
      if (jms) {
        row.actual += jms.qty || 0;
        row.fromJms += jms.qty || 0;
      } else {
        row.actual += entries.filter((e) => e.jobId === j.id).reduce((n, e) => n + entryArea(e), 0);
      }
    }
    // Work lines straight from the plan (no job)
    row.actual += entries.filter((e) => !e.jobId && e.planLineId === l.id).reduce((n, e) => n + entryArea(e), 0);
    bySup.set(l.supervisorId, row);
  }
  return [...bySup.values()];
}
