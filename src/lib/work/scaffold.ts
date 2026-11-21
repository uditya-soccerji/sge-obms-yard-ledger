/**
 * Scaffolding jobs (owner, 2026-11-21): progress comes from DPR scaffold lines that point at the
 * job (scaffoldJobId). Status follows the work: Erection until the scope is up, Standing until
 * removal starts, Removal until it's closed by hand.
 */
import type { DprReport, ScaffoldJob, ScaffoldPlanLine, ScaffoldType } from "./types";

export const SCAFFOLD_TYPES: { id: ScaffoldType; label: string }[] = [
  { id: "standing", label: "Standing" },
  { id: "hanging", label: "Hanging" },
];
export const SCAFFOLD_PURPOSES = ["Blasting & painting", "Insulation", "CUI inspection", "Maintenance / mechanical", "Other"];

export type ScaffoldStatus = "pending" | "rejected" | "erection" | "standing" | "removal" | "closed";
export const STATUS_LABEL: Record<ScaffoldStatus, string> = {
  pending: "Waiting for SIC",
  rejected: "Rejected",
  erection: "Erection",
  standing: "Standing",
  removal: "Removal",
  closed: "Closed",
};

/** Erected and removed m³ on this job, and the days with work, from submitted / approved DPRs */
export function scaffoldProgress(job: ScaffoldJob, reports: DprReport[]) {
  let erected = 0;
  let removed = 0;
  let last = "";
  for (const r of reports) {
    if (r.status !== "submitted" && r.status !== "sic_approved") continue;
    for (const l of r.scaffoldWork ?? []) {
      if (l.scaffoldJobId !== job.id) continue;
      erected += l.erectM3 || 0;
      removed += l.dismantleM3 || 0;
      if (r.date > last) last = r.date;
    }
  }
  return { erected, removed, last };
}

export function scaffoldStatus(job: ScaffoldJob, p: { erected: number; removed: number }): ScaffoldStatus {
  if (job.approval === "pending") return "pending";
  if (job.approval === "rejected") return "rejected";
  if (job.closedAt) return "closed";
  if (p.removed > 0) return "removal";
  if (p.erected >= job.scopeM3) return "standing";
  return "erection";
}

/** J-DTA-SC-0001: one series per site */
export function nextScaffoldJobNo(jobs: ScaffoldJob[], siteCode: string): string {
  const prefix = `J-${siteCode}-SC-`;
  const n = jobs.filter((j) => j.jobNo.startsWith(prefix)).reduce((m, j) => Math.max(m, Number(j.jobNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(n + 1).padStart(4, "0")}`;
}

/** The month's line for this plant · type · supervisor (one line each, like painting) */
export function findScaffoldLine(lines: ScaffoldPlanLine[], k: Pick<ScaffoldPlanLine, "month" | "siteId" | "plant" | "type" | "supervisorId">) {
  return lines.find((l) => l.month === k.month && l.siteId === k.siteId && l.plant === k.plant && l.type === k.type && l.supervisorId === k.supervisorId);
}
