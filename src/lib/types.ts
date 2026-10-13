import type { MasterCatalog } from "./master/types";

export type RoleId =
  | "super_admin"
  | "owner"
  | "sic"
  | "hr"
  | "admin"
  | "finance"
  | "supervisor"
  | "store"
  | "safety"
  | "labourer";

export type ModuleId =
  | "owner"
  | "sic"
  | "admin"
  | "hr"
  | "finance"
  | "supervisor"
  | "store"
  | "safety"
  | "labourer"
  | "dpr"
  | "approvals"
  | "acpl"
  | "jms"
  | "calculators"
  | "telegram"
  | "users"
  | "audit"
  | "requests"
  | "submissions"
  | "trades"
  | "rates"
  | "master";

export type PermissionAction =
  | "view"
  | "create"
  | "update"
  | "upload"
  | "submit"
  | "approve"
  | "export"
  | "admin";

export interface PermissionOverride {
  module: ModuleId;
  action: PermissionAction;
  allow: boolean;
}

export interface UserAccount {
  id: string;
  username: string;
  password: string;
  name: string;
  roles: RoleId[];
  siteIds: string[];
  /** Empty = all plants at site (SIC / Owner / SA). Supervisors: one plant. */
  plantIds: string[];
  staffId?: string;
  labourerId?: string;
  permissionOverrides: PermissionOverride[];
  active: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string | null;
  username: string;
  role: RoleId | null;
  siteId: string | null;
  plant: string | null;
  module: ModuleId | string;
  action: string;
  detail: string;
  /** Set when the effective actor is an impersonated login */
  impersonatedBy?: string | null;
}

/** docs §9: Open → SIC approves → store fulfils (in full or part) → requester confirms received */
export type EquipmentRequestStatus =
  | "open"
  | "sic_approved"
  | "fulfilling"
  | "fulfilled"
  | "part_filled"
  | "received"
  | "cancelled";

export interface EquipmentRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  siteId: string;
  plant: string;
  kind: "spare" | "equipment" | "material" | "other";
  description: string;
  qty?: number;
  urgent?: boolean;
  status: EquipmentRequestStatus;
  fulfilledBy?: string;
  fulfilledAt?: string;
  fulfillNote?: string;
  sourceDprId?: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedAt?: string;
  /** Why it was cancelled or only part-filled (required for those, docs §9) */
  cancelNote?: string;
}

export type SupervisorType =
  | "painting_blasting"
  | "scaffolding"
  | "safety";

/** Legacy trade codes — prefer TradeDefinition.id from catalogue. */
export type Trade =
  | "blaster"
  | "painter"
  | "scaffolder"
  | "rigger"
  | "helper"
  | "fitter"
  | "foreman"
  | "compressor_operator"
  | "driver"
  | "scaffold_fitter"
  | "store_helper"
  | "safety_steward"
  | string;

export interface TradeSubcategory {
  id: string;
  label: string;
}

export interface TradeDefinition {
  id: string;
  label: string;
  subcategories: TradeSubcategory[];
  active: boolean;
  /** null = company-wide */
  siteId?: string | null;
}

export interface RateLine {
  id: string;
  poNumber: string;
  siteIds: string[];
  /** Stable key for latest-rate lookup (service code or slug). */
  itemKey: string;
  description: string;
  uom: string;
  rateInr: number;
  effectiveFrom: string;
  sourceFile: string;
  /** When a newer line supersedes this one for the same site+itemKey+uom. */
  superseded: boolean;
  note?: string;
}

/** docs §4: Present, Half day, Absent, Leave, Weekly off, Overtime ("off" from older data reads as weekly_off) */
export type AttendanceStatus = "present" | "absent" | "half" | "leave" | "weekly_off" | "overtime";

/**
 * Paint FIM kanban (8 stages).
 * 941 / 942 / 261 are RIL movement document refs — not SAP material codes.
 */
export type PaintLifecycleStage =
  | "pr"
  | "po"
  | "ril_receive"
  | "sge_receive"
  | "issued"
  | "consumed"
  | "reco"
  | "posted";

export type MessageType = "text" | "image" | "doc" | "audio";

export type DraftEntityKind =
  | "attendance"
  | "dpr_note"
  | "expense"
  | "stock_receipt"
  | "safety_obs"
  | "query";

export type DprSubmitterType =
  | "painting_blasting"
  | "scaffolding"
  | "safety"
  | "store";

export type AcplMatchFlag =
  | "match"
  | "dpr_only"
  | "acpl_only"
  /** Absent / leave / off on the DPR, but punched in at the gate */
  | "punched_but_absent"
  | "time_mismatch";

export type AcplResolveStatus = "open" | "resolved_dpr" | "resolved_acpl" | "dismissed";

export type RateCardKind =
  | "pipeline"
  | "structures"
  | "tanks"
  | "scaffolding";

export interface Site {
  id: string;
  code: string;
  name: string;
  client: string;
  enabled: boolean;
  /** Rate package / commercial tags e.g. RP2, RP5 */
  rpTags: string[];
  /** Plants / work areas within the site */
  plants: string[];
}

export interface StaffMember {
  id: string;
  name: string;
  role: RoleId;
  siteId: string;
  phone?: string;
  designation?: string;
  supervisorType?: SupervisorType;
}

export interface Labourer {
  id: string;
  name: string;
  /** Trade catalogue id (or legacy Trade code). */
  trade: Trade;
  /** Optional subcategory id when the trade has subcategories. */
  tradeSubcategory?: string;
  epNumber: string;
  /** Legacy — no longer shown or asked for (docs §1); kept until the data migration */
  gatePass: string;
  /** 12 digits; shown only to Owner, Super Admin and HR (docs §1) */
  aadhaar?: string;
  /** 10 digits starting 6–9 */
  mobile?: string;
  siteId: string;
  supervisorId: string;
  contractorId?: string;
  wageDaily: number;
  equipmentIds: string[];
  active: boolean;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  labourerId: string;
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
  markedBy: string;
  siteId: string;
  note?: string;
  /** Set when derived from an SIC-approved DPR */
  sourceDprId?: string;
  reconciled?: boolean;
  /** HR correction of a DPR-derived mark: what it was before (the DPR link stays) */
  correctedFrom?: AttendanceStatus;
}

export interface PaintStockLine {
  id: string;
  sapCode: string;
  description: string;
  mpsScheme: number;
  batch: string;
  stage: PaintLifecycleStage;
  qtyLitres: number;
  issuedTo?: string;
  /** SGE used litres (DPR × MPS) */
  sgeUsed?: number;
  /** RIL posted litres after 942/261 consumption receipt */
  rilPosted?: number;
  /** RIL movement 941 — paint issue to supervisor (editable when issued) */
  movement941?: string;
  /** RIL movement 942 — consumption after reco (editable when posted) */
  movement942?: string;
  /** Related RIL posting 261 (editable when posted) */
  movement261?: string;
  siteId: string;
  updatedAt: string;
}

export interface EquipmentItem {
  id: string;
  type: "hopper" | "compressor" | "airless" | "harness";
  tag: string;
  status: "ok" | "due" | "fault";
  assignedTo?: string;
  lastCheck: string;
  /** ISO date — inspection / certification expiry */
  expiryDate?: string;
  checklist: { item: string; ok: boolean }[];
  siteId: string;
  /** Latest fault reported by a supervisor, cleared when the store marks it repaired (docs §7) */
  faultNote?: string;
}

/** Legacy thin DPR line kept for paint-variance gist rollups */
export interface DprLabourMark {
  labourerId: string;
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
  note?: string;
}

export interface DprEquipmentMark {
  equipmentId: string;
  status: "ok" | "due" | "fault";
  expiryDate?: string;
  note?: string;
}

export interface DprRequest {
  id: string;
  kind: "spare" | "equipment" | "material" | "other";
  description: string;
  qty?: number;
  urgent?: boolean;
}

export interface DprScaffoldWorkLine {
  id: string;
  plant: string;
  location: string;
  erectM3: number;
  dismantleM3: number;
  standingM3: number;
  /** Lifting & shifting, counted in trips / loads (docs §5) */
  liftingTrips?: number;
  note?: string;
}

export type SafetyShift = "Gen" | "A" | "B" | "C";

export type SafetyObsType = "SAFE" | "UA" | "UC";

export type SafetyObsSource = "R" | "J" | "N" | "S";

export type SafetyRiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type SafetyObsStatus = "OPEN" | "CLOSED";

export type SafetyChecklistAnswer = "pass" | "fail" | "na";

export type SafetyPermitType =
  | "hot_work"
  | "cold_work"
  | "confined_space"
  | "work_at_height"
  | "other";

export type SafetyNearMissType =
  | "fall"
  | "struck_by"
  | "caught_in"
  | "electrical"
  | "fire"
  | "other";

export interface SafetyGlanceNumbers {
  sgeWorkers: number;
  subContractor: number;
  manHours: number;
  tbtPeople: number;
  hurtNearMiss: number;
  safeObs: number;
  unsafeObs: number;
  closed: number;
  stillOpen: number;
  lateOver10Days: number;
}

export interface SafetyObservation {
  id: string;
  obsNo: string;
  type: SafetyObsType;
  from: SafetyObsSource;
  risk?: SafetyRiskLevel;
  status: SafetyObsStatus;
  checkedBy: SafetyObsSource;
  whereWhat: string;
  actionTaken: string;
  whoWillFix: string;
  firstFoundOn: string;
  fixByDate: string;
}

export interface SafetyChecklistItem {
  id: number;
  group: string;
  label: string;
  answer: SafetyChecklistAnswer | null;
  /** Required when answer is fail — links to Section A Obs No. */
  linkedObsNo?: string;
}

export interface SafetyPermitRow {
  id: string;
  permitType: SafetyPermitType;
  count: number;
  permitNos: string;
  manpower: number;
  gasTestOk: boolean;
  allClosedOk: boolean;
}

export interface DprSafetyBody {
  shift: SafetyShift;
  safetyOfficer: string;
  rilEic: string;
  siteInCharge: string;
  glance: SafetyGlanceNumbers;
  observations: SafetyObservation[];
  checklist: SafetyChecklistItem[];
  permits: SafetyPermitRow[];
  talks: {
    tbtCount: number;
    inductionCount: number;
    rilSessionCount: number;
    ppeGivenNote: string;
    tomorrowRiskyJobs: SafetyPermitType[];
    tomorrowTopic: string;
  };
  metRilNote: string;
  nearMissType: SafetyNearMissType;
  nearMissNote: string;
  incidentCounts: {
    lti: number;
    mtc: number;
    firstAid: number;
    nearMiss: number;
    damageFire: number;
  };
  signOff: {
    safetyOfficerName: string;
    safetyOfficerTime: string;
    sicName: string;
    sicTime: string;
    rilName: string;
    rilTime: string;
  };
}

export interface DprStoreBody {
  stockByPlant: { plant: string; paintLitres: number; note?: string }[];
  issues: { toSupervisorId: string; sapCode: string; qtyLitres: number; note?: string }[];
  receipts: { sapCode: string; qtyLitres: number; note?: string }[];
  sparesMovement: { item: string; direction: "in" | "out"; qty: number; note?: string }[];
}

export interface WorkPlanItem {
  id: string;
  date: string;
  supervisorId: string;
  plant: string;
  task: string;
  targetM2?: number;
  status: "planned" | "in_progress" | "done";
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface SafetyChecklistDay {
  id: string;
  date: string;
  officerId: string;
  siteId: string;
  items: { id: number; label: string; checked: boolean }[];
  observations: string;
  incidents: string;
  photoMock?: string;
  signed: boolean;
}

export interface FinanceEntry {
  id: string;
  date: string;
  kind: "expense" | "income";
  category: string;
  amount: number;
  description: string;
  siteId: string;
  enteredBy: string;
  /** docs §8 fields (required on new entries) */
  time?: string;
  vendor?: string;
  paymentMode?: "cash" | "upi" | "bank" | "credit";
}

export interface TelegramDraft {
  id: string;
  createdAt: string;
  role: RoleId;
  messageType: MessageType;
  content: string;
  mappedEntity: DraftEntityKind;
  entityId?: string;
  /** needs_review: the message couldn't be read reliably, so nothing was posted */
  status: "draft" | "applied" | "needs_review";
}

export interface PredictionAlert {
  id: string;
  kind: "low_stock" | "high_variance" | "scope_slip";
  severity: "warn" | "crit";
  title: string;
  detail: string;
  value: number;
  threshold: number;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface ComplianceDoc {
  id: string;
  title: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  status: "pending" | "filed";
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface MaterialTransfer {
  id: string;
  date: string;
  fromLoc: string;
  toLoc: string;
  sapCode: string;
  qty: number;
  note: string;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface AcplPunchRow {
  id: string;
  date: string;
  epNumber: string;
  labourerName?: string;
  inTime?: string;
  outTime?: string;
  source: "upload" | "paste" | "seed";
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface AcplMatchRow {
  id: string;
  date: string;
  labourerId?: string;
  epNumber: string;
  flag: AcplMatchFlag;
  dprStatus?: AttendanceStatus;
  dprInTime?: string;
  dprOutTime?: string;
  /** How the punch was tied to the labourer: EP, or name when the EP was unknown (docs §12) */
  matchedBy?: "ep" | "name";
  acplInTime?: string;
  acplOutTime?: string;
  resolveStatus: AcplResolveStatus;
  resolveNote?: string;
  resolvedBy?: string;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface RateCard {
  id: string;
  kind: RateCardKind;
  label: string;
  unit: "m2" | "m3";
  rateInr: number;
  paintLitresPerUnit?: number;
  manpowerDaysPerUnit: number;
  materialNote?: string;
  editable: boolean;
}

export interface WageLedgerEntry {
  id: string;
  labourerId?: string;
  staffId?: string;
  date: string;
  kind: "salary" | "bonus" | "advance" | "ot" | "incentive";
  amount: number;
  note: string;
  flaggedToSic?: boolean;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface FinanceAlert {
  id: string;
  createdAt: string;
  /** JMS alerts moved to Work events (merge plan Step 7); wage anomalies stay here */
  kind: "wage_anomaly";
  title: string;
  detail: string;
  acknowledged: boolean;
  flaggedToSic: boolean;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface AppState {
  currentRole: RoleId | null;
  /** Operational staff or labourer id (legacy identity for DPR submitter etc.) */
  currentUserId: string | null;
  /** Login account id */
  currentAccountId: string | null;
  /**
   * When set, Super Admin is viewing as another account.
   * Real session stays on this id; currentAccountId/role are the target.
   */
  impersonatorAccountId: string | null;
  /** Snapshot to restore Super Admin site/role/op-id on exit */
  impersonatorSnapshot: {
    role: RoleId;
    userId: string | null;
    siteId: string;
  } | null;
  /** Active site id, or "all" (Owner / Super Admin) for every site. */
  currentSiteId: string;
  /** In All sites: the site new records are written to. */
  entrySiteId?: string;
  sites: Site[];
  staff: StaffMember[];
  users: UserAccount[];
  labourers: Labourer[];
  attendance: AttendanceRecord[];
  paintStock: PaintStockLine[];
  equipment: EquipmentItem[];
  workPlans: WorkPlanItem[];
  safetyDays: SafetyChecklistDay[];
  finance: FinanceEntry[];
  telegramDrafts: TelegramDraft[];
  predictions: PredictionAlert[];
  compliance: ComplianceDoc[];
  transfers: MaterialTransfer[];
  vendors: { id: string; name: string; category: string; status: string }[];
  acplPunches: AcplPunchRow[];
  acplMatches: AcplMatchRow[];
  rateCards: RateCard[];
  /** Versioned PO / work-order rate book (history kept; latest wins). */
  rateLines: RateLine[];
  /** Labour trade catalogue (trade → optional subcategories). */
  tradeCatalogue: TradeDefinition[];
  wageLedger: WageLedgerEntry[];
  financeAlerts: FinanceAlert[];
  auditLog: AuditEntry[];
  equipmentRequests: EquipmentRequest[];
  /** One master store — load once, resolve site-then-company in memory. */
  masterCatalog: MasterCatalog;
}
