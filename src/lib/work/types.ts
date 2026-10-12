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
  closeRequestedAt?: string;
  jmsId?: string;
  supervisorId: string;
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
  /** Months whose plan is closed and carried forward (YYYY-MM) */
  closedMonths: string[];
  /** The month new plan lines and jobs go into */
  currentMonth: string;
}
