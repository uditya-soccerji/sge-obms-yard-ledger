/**
 * Notifications, approvals and activity log (docs §19).
 * Every Work action writes one WorkEvent. Who sees it is decided here, from
 * the event and the viewer, so the rules live in one place.
 */
import type { RoleId } from "../types";

export type EventKind =
  | "dpr_added"
  | "dpr_mismatch"
  | "dpr_submitted"
  | "dpr_approved"
  | "dpr_sent_back"
  | "dpr_unlocked"
  | "job_started"
  | "job_closed"
  | "jms_confirmed"
  | "job_sent_back"
  | "plan_added"
  | "month_closed"
  | "paint_issued"
  | "paint_received"
  | "paint_stage"
  | "paint_step"
  | "paint_variance"
  | "payment_recorded"
  | "payment_cleared"
  | "expense_added"
  | "expense_voided"
  | "expense_edited"
  | "jms_status"
  | "jms_submitted"
  | "jms_linked"
  | "jms_difference"
  | "wo_warning"
  // Crews (docs §23)
  | "crew_changed"
  | "crew_requested"
  | "crew_released"
  | "crew_decided"
  // RIL gate pass (docs §24)
  | "pass_expiring"
  // Store requests (docs §24)
  | "request_raised"
  | "request_rejected"
  | "request_overridden"
  | "request_done"
  | "dpr_issue"
  // Job plan → JMS → Admin (docs §24)
  | "job_plan"
  | "job_plan_decided"
  | "jms_admin_pending"
  | "jms_admin_approved"
  | "jms_returned"
  | "pay_uploaded"
  // Admin reviewed a DPR for the SIC (§27)
  | "dpr_for_sic"
  // HR changed a submitted DPR's attendance mark (§27)
  | "attendance_corrected"
  // Safety (§27)
  | "observation_raised"
  | "observation_fixed"
  | "observation_closed"
  | "stop_work"
  // Equipment returns (§27)
  | "return_raised"
  | "return_scrap"
  | "return_decided"
  // Admin's daily-wage changes (2026-10-24)
  | "wage_change_requested"
  | "wage_change_decided";

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
export const INSTANT: EventKind[] = ["job_closed", "jms_confirmed", "job_sent_back", "dpr_submitted", "dpr_approved", "dpr_sent_back", "crew_requested", "crew_released", "crew_decided", "pass_expiring", "request_rejected", "request_overridden", "dpr_issue", "job_plan", "job_plan_decided", "jms_admin_pending", "jms_admin_approved", "jms_returned", "observation_raised", "stop_work", "wage_change_requested", "wage_change_decided"];

export const KIND_LABEL: Record<EventKind, string> = {
  dpr_added: "DPR entry",
  dpr_mismatch: "Admin vs supervisor DPR differs",
  dpr_submitted: "DPR submitted — needs SIC",
  dpr_approved: "DPR approved",
  dpr_sent_back: "DPR sent back",
  dpr_unlocked: "DPR unlocked",
  job_started: "Job started",
  job_closed: "Job closed — needs SIC",
  jms_confirmed: "JMS confirmed",
  job_sent_back: "Job sent back",
  plan_added: "Plan updated",
  month_closed: "Month closed",
  paint_issued: "Paint issued",
  paint_received: "Paint received",
  paint_stage: "Paint stage moved",
  paint_step: "Paint 942 / 261 / RIL ref",
  paint_variance: "Paint variance over tolerance",
  payment_recorded: "Payment recorded",
  payment_cleared: "Payment cleared",
  expense_added: "Cost added",
  expense_voided: "Cost voided",
  expense_edited: "Cost edited",
  jms_status: "JMS status",
  jms_submitted: "JMS uploaded (submitted to RIL)",
  jms_linked: "JMS linked",
  jms_difference: "Internal vs submitted JMS differ",
  wo_warning: "Work order warning",
  crew_changed: "Crew changed",
  crew_requested: "Crew request",
  crew_released: "Labourer released",
  crew_decided: "Crew request decided",
  pass_expiring: "Gate pass expiring",
  request_raised: "Store request",
  request_rejected: "Store rejected a request",
  request_overridden: "SIC overrode the store",
  request_done: "Request fulfilled",
  dpr_issue: "Issue on site",
  job_plan: "Job plan to approve",
  job_plan_decided: "Job plan decided",
  jms_admin_pending: "JMS for Admin",
  jms_admin_approved: "JMS approved by Admin",
  jms_returned: "JMS sent back",
  pay_uploaded: "Monthly pay uploaded",
  dpr_for_sic: "DPR reviewed by Admin for SIC",
  attendance_corrected: "Attendance corrected by HR",
  observation_raised: "Safety observation",
  observation_fixed: "Observation fixed",
  observation_closed: "Observation closed",
  stop_work: "STOP WORK",
  return_raised: "Equipment returned",
  return_scrap: "Scrap to confirm",
  return_decided: "Return decided",
  wage_change_requested: "Wage change to approve",
  wage_change_decided: "Wage change decided",
};

// Company-wide events (no site, e.g. the monthly pay upload) reach every viewer of the right role
const onSite = (v: Viewer, siteId: string) => !siteId || v.siteIds.length === 0 || v.siteIds.includes(siteId);

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
    case "dpr_submitted":
      return v.role === "sic";
    case "dpr_approved":
      return mine || v.role === "hr";
    case "dpr_sent_back":
      return mine;
    case "dpr_unlocked":
      return mine || v.role === "sic" || v.role === "hr";
    case "dpr_mismatch":
      // The supervisor is told of each difference; SIC and Admin see them for the monthly review (docs §5b)
      return mine || v.role === "sic" || v.role === "admin";
    case "jms_confirmed":
      return mine || v.role === "finance";
    case "job_sent_back":
      // The supervisor who has to fix it; money isn't involved yet
      return mine;
    case "jms_status":
    case "jms_submitted":
    case "jms_linked":
      return v.role === "finance" || v.role === "sic";
    case "jms_difference":
      return v.role === "sic" || v.role === "admin" || v.role === "finance";
    case "wo_warning":
      return v.role === "sic" || v.role === "finance";
    case "plan_added":
    case "month_closed":
      return v.role === "supervisor" ? mine || e.kind === "month_closed" : v.role === "sic" || v.role === "admin";
    case "paint_issued":
      return mine || v.role === "store";
    case "paint_received":
    case "paint_stage":
    case "paint_step":
      return v.role === "store";
    case "paint_variance":
      return v.role === "store" || v.role === "sic";
    case "payment_recorded":
    case "payment_cleared":
    case "expense_added":
    case "expense_voided":
    case "expense_edited":
      return v.role === "finance";
    // docs §23: SIC hears every crew change and request on the site; the supervisors
    // involved are told; Owner / SA get everything (moves off a crew are problems)
    case "crew_changed":
    case "crew_requested":
    case "crew_released":
    case "crew_decided":
      // docs §24: moves between crews (flagged as problems) also go to Admin and HR
      return mine || v.role === "sic" || (!!e.problem && (v.role === "admin" || v.role === "hr"));
    // docs §24: HR renews; Admin and the labourer's supervisor are told too
    case "pass_expiring":
      return mine || v.role === "hr" || v.role === "admin";
    // docs §24: requests go straight to the store and the SIC is told; a rejection is urgent
    // for the SIC; an override goes back to the store; the requester hears the outcome
    case "request_raised":
      return v.role === "store" || v.role === "sic";
    case "request_rejected":
      return mine || v.role === "sic";
    case "request_overridden":
      return mine || v.role === "store";
    case "request_done":
      return mine;
    case "dpr_issue":
      return v.role === "sic";
    // docs §24: the SIC approves job plans; the Admin finishes the JMS; Finance hears when it's ready
    case "job_plan":
      return v.role === "sic";
    case "job_plan_decided":
      return mine;
    case "jms_admin_pending":
      return v.role === "admin";
    case "jms_admin_approved":
      return mine || v.role === "finance" || v.role === "sic";
    case "jms_returned":
      return mine || v.role === "sic";
    // docs §24: Admin / HR upload the month's pay; Finance is told
    case "pay_uploaded":
      return v.role === "finance";
    case "dpr_for_sic":
      return v.role === "sic";
    case "attendance_corrected":
      return mine || v.role === "sic";
    // Safety (§27): the tagged supervisor and the SIC hear of an observation; Safety hears it's fixed;
    // stop work is urgent for the SIC, Owner (boss sees all) and the supervisor
    case "observation_raised":
    case "observation_closed":
    case "stop_work":
      return mine || v.role === "sic";
    case "observation_fixed":
      return v.role === "safety" || v.role === "sic";
    // Returns (§27): the store confirms; a scrap goes on to the SIC; the supervisor hears the outcome
    case "return_raised":
      return v.role === "store";
    case "return_scrap":
      return v.role === "sic";
    case "return_decided":
      return mine;
    // Owner / SA see every event already; the Admin hears the decision
    case "wage_change_requested":
      return false;
    case "wage_change_decided":
      return mine || v.role === "admin";
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
