import type { WorkEvent } from "./events";
import type {
  DprEquipmentMark,
  DprLabourMark,
  DprRequest,
  DprSafetyBody,
  DprScaffoldWorkLine,
  DprStoreBody,
  DprSubmitterType,
  RequestStep,
} from "../types";
/**
 * Work tracking: Work Order → monthly Plan → Jobs → DPR entries → JMS.
 * See docs/rules-decisions.md §5, §10, §15, §17.
 */

/** Job stages in order. The last stage a job requires is its "final shade". */
export type Stage = "prep" | "coat1" | "coat2" | "final";

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: "prep", label: "Blasting / surface prep", short: "Prep" },
  { id: "coat1", label: "1st coat", short: "1st" },
  { id: "coat2", label: "2nd coat", short: "2nd" },
  { id: "final", label: "Final shade", short: "Final" },
];

export interface PaintNorm {
  sap: string;
  name: string;
  /** Litres per m² as per the work order */
  normL: number;
}

/** One ARC / WO service item, e.g. 3378150 MPS-1 handtool brush, ₹169.78/m². */
export interface ServiceItem {
  code: string;
  mps: string;
  description: string;
  uom: "M2";
  rate: number;
  /** Rate not yet taken from the ARC list — placeholder for the demo */
  ratePending?: boolean;
  /** Paint list / norms not yet received for this item (litres recorded against a placeholder) */
  paintsPending?: boolean;
  paints: PaintNorm[];
  /** Stages a new job starts with (supervisor can change at job start) */
  defaultStages: Stage[];
}

export interface WorkOrder {
  id: string;
  woNo: string;
  foNo: string;
  siteId: string;
  validFrom: string;
  validTo: string;
  capInr: number;
  /** Scope quantity (m²) per service code */
  scope: Record<string, number>;
}

/** A month's plan line: plant + service item + planned m². */
export interface PlanLine {
  id: string;
  /** YYYY-MM */
  month: string;
  siteId: string;
  plant: string;
  serviceCode: string;
  jobType: string;
  /** New quantity planned this month */
  planM2: number;
  /** Unfinished quantity carried in from the previous plan */
  carriedM2: number;
  carriedFromId?: string;
  supervisorId: string;
}

/** The Admin's plan line, final only when the SIC / Owner / Super Admin approve it (2026-10-24) */
export interface PlanLineRequest {
  id: string;
  siteId: string;
  input: Omit<PlanLine, "id" | "carriedM2" | "month"> & { month?: string };
  summary: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  decidedBy?: string;
  decidedAt?: string;
  decidedNote?: string;
  notified?: boolean;
  seenByRequester?: boolean;
  thread: RequestStep[];
}

export type JobStatus = "open" | "awaiting_sic" | "closed";

export interface Job {
  id: string;
  jobNo: string;
  planLineId: string;
  location: string;
  startDate: string;
  stages: Stage[];
  status: JobStatus;
  closedAt?: string;
  /** ISO timestamp (date-only on older rows) — approvals escalate after 24 h */
  closeRequestedAt?: string;
  /** Account that asked to close, so they can't confirm their own JMS */
  closeRequestedBy?: string;
  /** Latest send-back by SIC, shown to the supervisor until they close the job again */
  sentBack?: { by: string; at: string; reason: string };
  jmsId?: string;
  supervisorId: string;
  /** Jobs imported as history (no DPR crew): labour-days and cost brought in */
  importedLabour?: { days: number; cost: number };
  /** The supervisor's plan for the job, approved by the SIC; progress is measured against it (docs §24) */
  plannedM2?: number;
  plannedEnd?: string;
  planStatus?: "pending" | "approved" | "sent_back";
  planNote?: string;
  planDecidedBy?: string;
  /** Set when the supervisor ends the job at final shade (docs §24) */
  endDate?: string;
}

/** One measured member: NOS × SIDE × LENGTH × CF = area (m²). */
export interface Member {
  name: string;
  nos: number;
  side: number;
  length: number;
  cf: number;
}

/** Report status (docs §5): draft → submitted → SIC approved, or sent back with a reason. */
export type ReportStatus = "draft" | "submitted" | "sic_approved" | "sic_rejected";

/**
 * The daily report — the one DPR (merge plan §1). One per submitter · site ·
 * plant · date · type (any number a day). It carries the day's attendance,
 * permit / TBT, equipment, requests, scaffold / safety / store bodies and the
 * SIC review. Painting & blasting quantities are the job entries (DprEntry)
 * that point at it with `reportId`.
 */
export interface DprReport {
  id: string;
  date: string;
  siteId: string;
  plant: string;
  submitterId: string;
  submitterType: DprSubmitterType;
  /** Admin (data operator) double entry for a supervisor's day (docs §5b) */
  enteredBy?: DprEntry["enteredBy"];
  enteredByName?: string;
  status: ReportStatus;
  /** Every crew member's attendance for the day (docs §4, §5) */
  labourMarks: DprLabourMark[];
  equipmentMarks: DprEquipmentMark[];
  requests: DprRequest[];
  nextDayPlan: string;
  note: string;
  /** Problems on site today; the SIC is alerted when the DPR is submitted (docs §24) */
  issues?: string;
  telegramDraftLines: string[];
  scaffoldWork?: DprScaffoldWorkLine[];
  safetyBody?: DprSafetyBody;
  storeBody?: DprStoreBody;
  permitNos?: string[];
  permitOk?: boolean;
  tbtDone?: boolean;
  zeroReason?: string;
  submittedAt?: string;
  /** Owner / Super Admin unlocks of an approved report, with the reason (docs §5) */
  unlocks?: { by: string; at: string; reason: string }[];
  sicNote?: string;
  sicReviewedBy?: string;
  sicReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DprEntry {
  id: string;
  date: string;
  jobId: string;
  /** The day's report this line belongs to (history imported before reports has none) */
  reportId?: string;
  stage: Stage;
  members: Member[];
  paintSap?: string;
  litres: number;
  /** Actual DFT (microns), typed at final shade */
  dft?: number;
  supervisorId: string;
  /**
   * Who keyed it in. "admin" is the data operator's double entry (docs §5b):
   * when present it wins over the supervisor's entry for that job · date · stage.
   */
  enteredBy: "supervisor" | "admin" | "sic" | "owner" | "super_admin";
  enteredByName?: string;
  note?: string;
  /** Labourer ids who worked on this job this day (labour cost, docs §18) */
  crew?: string[];
}

export type JmsStatus =
  | "JMS SUBMITTED"
  | "QSD APR"
  | "A1 APR"
  | "A2 APR"
  | "A3 APR"
  | "INVOICE UPLOADED"
  | "PAID";

export interface Jms {
  id: string;
  jmsNo: string;
  jobId: string;
  planLineId: string;
  serviceCode: string;
  qty: number;
  rate: number;
  amount: number;
  periodFrom: string;
  periodTo: string;
  status: JmsStatus;
  woId: string;
  /** When SIC confirmed it (approved value fixed here) */
  confirmedOn: string;
  payment?: JmsPayment;
  /** Valued at a placeholder rate (service item rate pending the ARC list) */
  ratePending?: boolean;
  /** Every status change: who, when, from → to */
  statusLog?: { at: string; by: string; from: JmsStatus; to: JmsStatus; note?: string }[];
  /** The JMS submitted to RIL this internal JMS is compared with (docs §10) */
  submissionId?: string;
  /**
   * docs §24: after the SIC confirms, the Admin enters the JMS no. and amount and submits;
   * only then does Finance see it. Unset on older rows (treated as approved).
   */
  adminStatus?: "pending_admin" | "approved";
  rilJmsNo?: string;
  /** The amount worked out from the DPRs, kept when the Admin enters a different one */
  computedAmount?: number;
  adminBy?: string;
  adminAt?: string;
}

/** RIL's status flow for a submitted JMS (docs §14) — the internal flow plus a reject at A1. */
export type SubmissionStatus = JmsStatus | "A1 REJECT";

export interface JmsSubmissionItem {
  serviceCode: string;
  description: string;
  qty: number;
  uom: "M2" | "M3";
  rate: number;
  amount: number;
}

/**
 * The JMS pack submitted to RIL, uploaded by Admin (Excel figures, PDF proof).
 * Compared with the internal JMS, never merged (Owner decision 2). Re-uploading
 * the same RIL JMS no. updates it (docs §14).
 */
export interface JmsSubmission {
  id: string;
  /** RIL's JMS no., 7 digits, unique */
  rilJmsNo: string;
  siteId: string;
  plant: string;
  woNo: string;
  foNo?: string;
  periodFrom: string;
  periodTo: string;
  items: JmsSubmissionItem[];
  qty: number;
  amount: number;
  status: SubmissionStatus;
  statusLog: { status: SubmissionStatus; at: string; by: string }[];
  invoiceNo?: string;
  /** File names until bills / packs are kept in Supabase Storage */
  files: { excelName?: string; pdfName?: string };
  uploadedBy: string;
  uploadedAt: string;
  /** The internal JMS it is linked to */
  jmsId?: string;
}

/** Stages before the paint is ours to issue (docs §6). */
export type PaintLifecycle = "pr" | "po" | "ril_receive" | "sge_receive";

/** Paint batch: on order, in the SGE store (supervisorId null) or issued to a supervisor. */
export interface PaintBatch {
  id: string;
  sap: string;
  name: string;
  batch: string;
  qtyL: number;
  supervisorId: string | null;
  issuedOn?: string;
  /** "" when not known (FIM "NEW - LOC" rows have no dates) */
  mfg: string;
  expiry: string;
  siteId: string;
  /** Unset = in the SGE store (older rows) */
  lifecycle?: PaintLifecycle;
  prNo?: string;
  poNo?: string;
  /** e.g. "MPS-1": variance tolerance per paint system (§6) */
  mps?: string;
  updatedAt?: string;
}

/**
 * Our own consumption steps (Owner decision 3): 941 = issued to a supervisor,
 * 942 = month reco (litres = our DPR use), 261 = posted / closed. RIL's
 * numbers are typed against them for reference only.
 */
export interface PaintStep {
  id: string;
  step: "941" | "942" | "261";
  /** 941: the issued batch */
  batchId?: string;
  /** 261: the 942 it posts */
  recoId?: string;
  supervisorId: string;
  sap: string;
  /** YYYY-MM */
  month: string;
  litres: number;
  date: string;
  by: string;
  rilRef?: string;
  rilRefBy?: string;
  rilRefAt?: string;
  /** RIL's litres, only when they give a figure (feeds the variance alert) */
  rilLitres?: number;
}

export interface WorkState {
  serviceItems: ServiceItem[];
  workOrders: WorkOrder[];
  planLines: PlanLine[];
  jobs: Job[];
  /** Daily reports (the one DPR); job entries point at them */
  reports: DprReport[];
  dprs: DprEntry[];
  jms: Jms[];
  /** JMS submitted to RIL (uploaded), compared with the internal JMS */
  submissions: JmsSubmission[];
  paint: PaintBatch[];
  /** 941 / 942 / 261 steps (merge plan Step 8) */
  paintSteps: PaintStep[];
  planRequests: PlanLineRequest[];
  expenses: Expense[];
  /** Activity log + notifications (docs §19), newest last */
  events: WorkEvent[];
  /** Last event seq each account has seen (keyed by account id) */
  lastSeen: Record<string, number>;
  /**
   * Plan months per site (docs §15): each site closes and carries forward its
   * own month. A site with no entry is on `defaultMonth` with nothing closed.
   */
  siteMonths: Record<string, SiteMonths>;
  /** Current month for sites that have never closed a month */
  defaultMonth: string;
}

export interface SiteMonths {
  /** The month new plan lines and jobs go into (YYYY-MM) */
  current: string;
  /** Months whose plan is closed and carried forward */
  closed: string[];
}

/** Money actually received against a JMS (docs §18: income counts when paid). */
export interface JmsPayment {
  receivedOn: string;
  amount: number;
  /** Why the received amount differs from the approved value, if it does */
  reason?: "deduction" | "recovery" | "short_paid" | "rate_change" | "other";
  note?: string;
}

export type ExpenseKind = "direct" | "fixed";

/**
 * A cost line. Direct = tagged to one job. Fixed = site overhead for a month,
 * shared over that site's jobs by labour-days (docs §18).
 */
export interface Expense {
  id: string;
  date: string;
  /** YYYY-MM the cost belongs to */
  month: string;
  siteId: string;
  kind: ExpenseKind;
  category: string;
  amount: number;
  jobId?: string;
  /** Remark (docs §8: required on new entries) */
  note?: string;
  /** HH:MM the money went out (docs §8) */
  time?: string;
  /** Who was paid, from the vendor list (docs §8) */
  vendor?: string;
  paymentMode?: PaymentMode;
  /**
   * Bill / receipt (docs §8). Only the file name is kept until bills are stored
   * in Supabase Storage; `billPending` marks an entry whose bill is still to come.
   */
  billFile?: string;
  billPending?: boolean;
  enteredBy?: string;
  enteredByName?: string;
  enteredAt?: string;
  /** Voided entries stay on record (docs §8: all edits logged) but leave the P&L */
  voided?: { by: string; at: string; reason: string };
  /** Every edit after entry: who, when, what changed (docs §8) */
  edits?: { by: string; at: string; changes: string }[];
}

export type PaymentMode = "cash" | "upi" | "bank" | "credit";
