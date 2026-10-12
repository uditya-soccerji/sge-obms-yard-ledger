/**
 * Notifications, approvals and activity log (docs §19).
 * Every Work action writes one WorkEvent. Who sees it is decided here, from
 * the event and the viewer, so the rules live in one place.
 */
import type { RoleId } from "../types";

export type EventKind =
  | "dpr_added"
  | "dpr_mismatch"
  | "job_started"
  | "job_closed"
  | "jms_confirmed"
  | "job_sent_back"
  | "plan_added"
  | "month_closed"
  | "paint_issued"
  | "payment_recorded"
  | "payment_cleared"
  | "expense_added"
  | "expense_voided"
  | "jms_status"
  | "wo_warning"
  // Crews (docs §20)
  | "crew_changed"
  | "crew_requested"
  | "crew_released"
  | "crew_decided";

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
  /** A second staff member to tell (e.g. the other supervisor in a crew move) */
  alsoStaffId?: string;
  title: string;
  detail: string;
  /** Super Admin who did it while using "View as" */
  impersonatedBy?: string;
  /** Problems are highlighted and pass the "Problems only" filter */
  problem?: boolean;
  /** Work tab to open (e.g. "jobs", "payments"), or an app path starting with "/" */
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
export const INSTANT: EventKind[] = ["job_closed", "jms_confirmed", "job_sent_back", "crew_requested", "crew_released", "crew_decided"];

export const KIND_LABEL: Record<EventKind, string> = {
  dpr_added: "DPR entry",
  dpr_mismatch: "Admin vs supervisor DPR differs",
  job_started: "Job started",
  job_closed: "Job closed — needs SIC",
  jms_confirmed: "JMS confirmed",
  job_sent_back: "Job sent back",
  plan_added: "Plan updated",
  month_closed: "Month closed",
  paint_issued: "Paint issued",
  payment_recorded: "Payment recorded",
  payment_cleared: "Payment cleared",
  expense_added: "Cost added",
  expense_voided: "Cost voided",
  jms_status: "JMS status",
  wo_warning: "Work order warning",
  crew_changed: "Crew changed",
  crew_requested: "Crew request",
  crew_released: "Labourer released",
  crew_decided: "Crew request decided",
};

const onSite = (v: Viewer, siteId: string) => v.siteIds.length === 0 || v.siteIds.includes(siteId);

/** Does this viewer get a notification for this event? (docs §19) */
export function isFor(e: WorkEvent, v: Viewer): boolean {
  if (v.role === "owner" || v.role === "super_admin") return true;
  if (!onSite(v, e.siteId)) return false;
  const mine = !!v.staffId && (e.subjectStaffId === v.staffId || e.alsoStaffId === v.staffId);
  switch (e.kind) {
    case "dpr_added":
    case "job_started":
      return v.role === "sic";
    case "job_closed":
      return v.role === "sic";
    case "dpr_mismatch":
      // The supervisor is told of each difference; SIC and Admin see them for the monthly review (docs §5b)
      return mine || v.role === "sic" || v.role === "admin";
    case "jms_confirmed":
      return mine || v.role === "finance";
    case "job_sent_back":
      // The supervisor who has to fix it; money isn't involved yet
      return mine;
    case "jms_status":
      return v.role === "finance" || v.role === "sic";
    case "wo_warning":
      return v.role === "sic" || v.role === "finance";
    case "plan_added":
    case "month_closed":
      return v.role === "supervisor" ? mine || e.kind === "month_closed" : v.role === "sic" || v.role === "admin";
    case "paint_issued":
      return mine || v.role === "store";
    case "payment_recorded":
    case "payment_cleared":
    case "expense_added":
    case "expense_voided":
      return v.role === "finance";
    // docs §20: SIC hears about every crew change and request on the site; the
    // supervisors involved are told; Owner / SA get everything (moves off a crew are problems)
    case "crew_changed":
    case "crew_requested":
    case "crew_released":
    case "crew_decided":
      return mine || v.role === "sic";
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
