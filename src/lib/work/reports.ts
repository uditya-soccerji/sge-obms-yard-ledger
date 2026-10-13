/**
 * Daily reports — the one DPR (merge plan §1). Pure helpers: create a blank
 * report, find a job line's report, the 10:00 next-day deadline, and what
 * still stops a job's cycle from closing.
 */
import { blankSafetyBody } from "../safety-dpr";
import { nowTime, today } from "../today";
import type { DprSubmitterType } from "../types";
import type { DprEntry, DprReport, Job, WorkState } from "./types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function blankReport(opts: {
  submitterId: string;
  submitterType: DprSubmitterType;
  siteId: string;
  plant?: string;
  date?: string;
}): DprReport {
  const now = new Date().toISOString();
  return {
    id: uid("dprd"),
    date: opts.date ?? today(),
    siteId: opts.siteId,
    // Picked from the site's plant list (docs §3), never assumed
    plant: opts.plant ?? "",
    submitterId: opts.submitterId,
    submitterType: opts.submitterType,
    status: "draft",
    labourMarks: [],
    equipmentMarks: [],
    requests: [],
    nextDayPlan: "",
    note: "",
    telegramDraftLines: [],
    scaffoldWork:
      opts.submitterType === "scaffolding"
        ? [{ id: uid("sw"), plant: opts.plant ?? "", location: "", erectM3: 0, dismantleM3: 0, standingM3: 0 }]
        : undefined,
    safetyBody: opts.submitterType === "safety" ? blankSafetyBody() : undefined,
    storeBody:
      opts.submitterType === "store"
        ? { stockByPlant: [{ plant: "", paintLitres: 0 }], issues: [], receipts: [], sparesMovement: [] }
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** Can lines still be added to / changed on this report? */
export const reportOpen = (r: Pick<DprReport, "status">) => r.status === "draft" || r.status === "sic_rejected";

/** The job lines filed under a report. */
export const entriesOf = (w: Pick<WorkState, "dprs">, reportId: string): DprEntry[] =>
  w.dprs.filter((d) => d.reportId === reportId);

/** A report must reach SIC by 10:00 the next day (docs §5). */
export function deadlineOf(r: Pick<DprReport, "date">): string {
  const d = new Date(`${r.date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.toISOString().slice(0, 10)}T10:00:00+05:30`;
}

export function isLate(r: Pick<DprReport, "date" | "submittedAt" | "status">): boolean {
  if (r.submittedAt) return Date.parse(r.submittedAt) > Date.parse(deadlineOf(r));
  if (r.status !== "draft" && r.status !== "sic_rejected") return false;
  // Not sent yet: judged on the app date (the demo date when one is set) and the time now
  const dueDay = deadlineOf(r).slice(0, 10);
  return today() > dueDay || (today() === dueDay && nowTime() >= "10:00");
}

/**
 * Reports behind a job's lines that aren't approved yet (merge plan Step 3).
 * Lines with no report (history from before reports) count as approved.
 */
export function pendingReports(job: Pick<Job, "id">, w: Pick<WorkState, "dprs" | "reports">): DprReport[] {
  const ids = new Set(w.dprs.filter((d) => d.jobId === job.id && d.reportId).map((d) => d.reportId!));
  return w.reports.filter((r) => ids.has(r.id) && r.status !== "sic_approved");
}

/** Report lookup key: one draft per submitter · site · plant · date · type · who keyed it. */
export function sameDay(r: DprReport, k: { submitterId: string; siteId: string; plant: string; date: string; submitterType: DprSubmitterType; admin: boolean }) {
  return (
    r.submitterId === k.submitterId &&
    r.siteId === k.siteId &&
    r.plant === k.plant &&
    r.date === k.date &&
    r.submitterType === k.submitterType &&
    (r.enteredBy === "admin") === k.admin
  );
}

/** m² on a report's job lines (painting only = every stage after blasting / prep). */
export function reportArea(w: Pick<WorkState, "dprs">, reportId: string, paintingOnly = false): number {
  const area = entriesOf(w, reportId)
    .filter((e) => !paintingOnly || e.stage !== "prep")
    .reduce((t, e) => t + e.members.reduce((s, m) => s + m.nos * m.side * m.length * m.cf, 0), 0);
  return Math.round(area * 1000) / 1000;
}
