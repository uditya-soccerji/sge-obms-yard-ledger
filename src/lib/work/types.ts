import type { WorkEvent } from "./events";
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
}

/** One measured member: NOS × SIDE × LENGTH × CF = area (m²). */
export interface Member {
  name: string;
  nos: number;
  side: number;
  length: number;
  cf: number;
}

export interface DprEntry {
  id: string;
  date: string;
  jobId: string;
  stage: Stage;
  members: Member[];
  paintSap?: string;
  litres: number;
  /** Actual DFT (microns), typed at final shade */
  dft?: number;
  supervisorId: string;
  enteredBy: "supervisor" | "admin";
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
}

/** Paint batch: in the SGE store (supervisorId null) or issued to a supervisor. */
export interface PaintBatch {
  id: string;
  sap: string;
  name: string;
  batch: string;
  qtyL: number;
  supervisorId: string | null;
  issuedOn?: string;
  mfg: string;
  expiry: string;
  siteId: string;
}

export interface WorkState {
  serviceItems: ServiceItem[];
  workOrders: WorkOrder[];
  planLines: PlanLine[];
  jobs: Job[];
  dprs: DprEntry[];
  jms: Jms[];
  paint: PaintBatch[];
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
}

export type PaymentMode = "cash" | "upi" | "bank" | "credit";
