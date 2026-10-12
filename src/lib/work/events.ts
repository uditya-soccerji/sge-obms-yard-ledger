/**
 * Notifications, approvals and activity log (docs §19).
 * Every Work action writes one WorkEvent. Who sees it is decided here, from
 * the event and the viewer, so the rules live in one place.
 */
import type { RoleId } from "../types";

export type EventKind =
  | "dpr_added"
  | "job_started"
  | "job_closed"
  | "jms_confirmed"
  | "job_sent_back"
  | "plan_added"
  | "month_closed"
  | "paint_issued"
  | "payment_recorded"
  | "expense_added";

export interface WorkEvent {
  id: string;
  seq: number;
  /** ISO timestamp */
  at: string;
  /** Business date (YYYY-MM-DD) for daily summaries */
  day: string;
  kind: EventKind;
  actorName: string;
  actorRole: RoleId | null;
  siteId: string;
  /** Staff id the event is about (job's supervisor), for "tell the submitter" */
  subjectStaffId?: string;
  title: string;
  detail: string;
  /** Problems are highlighted and pass the "Problems only" filter */
  problem?: boolean;
  /** Work tab to open (e.g. "jobs", "payments") */
  tab: string;
  refId?: string;
}

export interface Viewer {
  role: RoleId | null;
  staffId: string | null;
  /** Sites the viewer works on; empty = all */
  siteIds: string[];
}

/** Events that need someone to act, or tell the submitter the outcome: instant. */
export const INSTANT: EventKind[] = ["job_closed", "jms_confirmed", "job_sent_back"];

export const KIND_LABEL: Record<EventKind, string> = {
  dpr_added: "DPR entry",
  job_started: "Job started",
  job_closed: "Job closed — needs SIC",
  jms_confirmed: "JMS confirmed",
  job_sent_back: "Job sent back",
  plan_added: "Plan updated",
  month_closed: "Month closed",
  paint_issued: "Paint issued",
  payment_recorded: "Payment recorded",
  expense_added: "Cost added",
};

const onSite = (v: Viewer, siteId: string) => v.siteIds.length === 0 || v.siteIds.includes(siteId);

/** Does this viewer get a notification for this event? (docs §19) */
export function isFor(e: WorkEvent, v: Viewer): boolean {
  if (v.role === "owner" || v.role === "super_admin") return true;
  if (!onSite(v, e.siteId)) return false;
  const mine = !!v.staffId && e.subjectStaffId === v.staffId;
  switch (e.kind) {
    case "dpr_added":
    case "job_started":
      return v.role === "sic";
    case "job_closed":
      return v.role === "sic";
    case "jms_confirmed":
    case "job_sent_back":
      return mine || v.role === "finance";
    case "plan_added":
    case "month_closed":
      return v.role === "supervisor" ? mine || e.kind === "month_closed" : v.role === "sic" || v.role === "admin";
    case "paint_issued":
      return mine || v.role === "store";
    case "payment_recorded":
    case "expense_added":
      return v.role === "finance";
  }
}

export function isInstant(e: WorkEvent) {
  return INSTANT.includes(e.kind) || !!e.problem;
}

const REASON_TEXT: Record<string, string> = {
  deduction: "deduction",
  recovery: "recovery",
  short_paid: "short-paid",
  rate_change: "rate change",
  other: "other",
};
export const reasonText = (r?: string) => (r ? REASON_TEXT[r] ?? r : "no reason");
