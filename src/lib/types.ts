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
  | "master"
  /** Supervisor crews: who works under whom (docs §20) */
  | "crew";

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

export type EquipmentRequestStatus =
  | "open"
  | "fulfilling"
  | "fulfilled"
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

export type DprStatus =
  | "draft"
  | "submitted"
  | "sic_approved"
  | "sic_rejected"
  | "locked";

export type AcplMatchFlag =
  | "match"
  | "dpr_only"
  | "acpl_only"
  /** Absent / leave / off on the DPR, but punched in at the gate */
  | "punched_but_absent"
  | "time_mismatch";

export type AcplResolveStatus = "open" | "resolved_dpr" | "resolved_acpl" | "dismissed";

export type JmsPackageStatus =
  | "draft"
  | "uploaded"
  | "sic_review"
  | "sic_approved"
  | "sic_rejected";

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
  /**
   * Per-plant RP and locations (B02), keyed by plant name. A plant with no
   * entry has no locations and takes the site's RP when the site has one.
   */
  plantDetails?: PlantDetail[];
}

export interface PlantLocation {
  name: string;
  /** Unset = same RP as its plant */
  rp?: string;
}

export interface PlantDetail {
  /** Matches a name in `Site.plants` (ignoring case) */
  name: string;
  rp?: string;
  locations: PlantLocation[];
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
  gatePass: string;
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
  /** Set when derived from a submitted DPR (docs §20: attendance counts on submit) */
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
}

/** Legacy thin DPR line kept for paint-variance gist rollups */
export interface DprEntry {
  id: string;
  date: string;
  type: "painting" | "blasting" | "scaffolding";
  supervisorId: string;
  siteId: string;
  plant: string;
  location: string;
  mpsScheme?: number;
  areaM2?: number;
  volumeM3?: number;
  paintLitres?: number;
  crewCount: number;
  note: string;
  permitOk: boolean;
  tbtDone: boolean;
}

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

export interface DprPaintWorkLine {
  id: string;
  plant: string;
  bay: string;
  activity: "painting" | "blasting";
  areaM2: number;
  mpsScheme?: number;
  /** Total litres; kept equal to the sum of `paints` when those are entered */
  paintLitres?: number;
  /** Litres per paint type used on this line (docs §5, B07) */
  paints?: DprPaintUse[];
  note?: string;
}

export interface DprPaintUse {
  id: string;
  /** Paint type, e.g. "Type 17 : HB epoxy surface tolerant" or "Thinner" */
  type: string;
  /** RIL SAP material code when known */
  sap?: string;
  litres: number;
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

/** Full shared DPR document (v2 verification model) */
export interface DprDocument {
  id: string;
  date: string;
  siteId: string;
  plant: string;
  submitterId: string;
  submitterType: DprSubmitterType;
  status: DprStatus;
  labourMarks: DprLabourMark[];
  equipmentMarks: DprEquipmentMark[];
  requests: DprRequest[];
  nextDayPlan: string;
  note: string;
  telegramDraftLines: string[];
  paintWork?: DprPaintWorkLine[];
  scaffoldWork?: DprScaffoldWorkLine[];
  safetyBody?: DprSafetyBody;
  storeBody?: DprStoreBody;
  /** Work permit seen and in force (docs §5: required before submitting) */
  permitOk?: boolean;
  /** Toolbox talk held with the crew (docs §5: required before submitting) */
  tbtDone?: boolean;
  /** Why the DPR reports no quantity, when it reports none (docs §5) */
  zeroReason?: string;
  /** Owner / Super Admin unlocks of an approved DPR, with the reason (docs §5) */
  unlocks?: { by: string; at: string; reason: string }[];
  sicNote?: string;
  sicReviewedBy?: string;
  sicReviewedAt?: string;
  /** Capacity of the reviewer; "admin_for_sic" = Admin approving on the SIC's behalf (docs §5, B04) */
  reviewedAs?: "sic" | "admin_for_sic" | "owner" | "super_admin";
  /** The site's SIC (staff id) when Admin reviewed on their behalf */
  reviewedOnBehalfOf?: string;
  createdAt: string;
  updatedAt: string;
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
}

export interface TelegramDraft {
  id: string;
  createdAt: string;
  role: RoleId;
  messageType: MessageType;
  content: string;
  mappedEntity: DraftEntityKind;
  entityId?: string;
  status: "draft" | "applied";
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

export interface BillingSnapshot {
  id: string;
  label: string;
  amount: number;
  status: "draft" | "submitted" | "approved" | "paid";
  period: string;
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

export interface JmsLine {
  id: string;
  description: string;
  plant: string;
  activity: "painting" | "blasting" | "scaffolding";
  qty: number;
  unit: "m2" | "m3";
  rateInr: number;
  amountInr: number;
  /** First matched DPR (rating is credited to its submitter) */
  matchedDprId?: string;
  matchedWorkLineId?: string;
  /** Every DPR work line summed into dprClaimedQty */
  matchedWorkLineIds?: string[];
  /** No rate given and none in the site's rate book: amount left at 0 until a rate is added */
  rateMissing?: boolean;
  dprClaimedQty?: number;
  matchRatio?: number;
}

export interface JmsPackage {
  id: string;
  label: string;
  period: string;
  uploadedAt: string;
  uploadedBy: string;
  status: JmsPackageStatus;
  lines: JmsLine[];
  sicNote?: string;
  financeNotified: boolean;
  expectedIncome: number;
  paymentReceived: boolean;
  paymentReceivedAt?: string;
  /** Amount actually received (may differ from expectedIncome) */
  paymentAmount?: number;
  paymentNote?: string;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface WorkRating {
  id: string;
  supervisorId: string;
  period: string;
  jmsPackageId: string;
  score: number;
  jmsAcceptedQty: number;
  dprClaimedQty: number;
  qualityFlags: string[];
  attendanceIntegrity: number;
  equipmentCare: number;
  requestHygiene: number;
  suggestedSupervisorIncentive: number;
  suggestedLabourIncentive: number;
  note?: string;
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
  /** Incentive drafted from this JMS package's ratings (re-running ratings replaces it) */
  jmsPackageId?: string;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
}

export interface FinanceAlert {
  id: string;
  createdAt: string;
  kind: "jms_uploaded" | "jms_approved" | "payment_due" | "wage_anomaly";
  title: string;
  detail: string;
  jmsPackageId?: string;
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
  /** Legacy thin DPR lines (paint gist); prefer dprDocuments for verification */
  dprs: DprEntry[];
  dprDocuments: DprDocument[];
  workPlans: WorkPlanItem[];
  safetyDays: SafetyChecklistDay[];
  finance: FinanceEntry[];
  telegramDrafts: TelegramDraft[];
  predictions: PredictionAlert[];
  billing: BillingSnapshot[];
  compliance: ComplianceDoc[];
  transfers: MaterialTransfer[];
  vendors: { id: string; name: string; category: string; status: string }[];
  acplPunches: AcplPunchRow[];
  acplMatches: AcplMatchRow[];
  jmsPackages: JmsPackage[];
  workRatings: WorkRating[];
  rateCards: RateCard[];
  /** Versioned PO / work-order rate book (history kept; latest wins). */
  rateLines: RateLine[];
  /** Labour trade catalogue (trade → optional subcategories). */
  tradeCatalogue: TradeDefinition[];
  wageLedger: WageLedgerEntry[];
  financeAlerts: FinanceAlert[];
  auditLog: AuditEntry[];
  equipmentRequests: EquipmentRequest[];
  /** Supervisor requests to take a labourer onto their crew (docs §20) */
  crewRequests: CrewRequest[];
  /** One master store — load once, resolve site-then-company in memory. */
  masterCatalog: MasterCatalog;
}

export type CrewRequestStatus = "requested" | "released" | "approved" | "rejected" | "cancelled";

/**
 * A supervisor asking for a labourer (docs §20). Needs SIC approval; when the
 * labourer is on another crew, that supervisor is told and must release them first.
 */
export interface CrewRequest {
  id: string;
  siteId: string;
  labourerId: string;
  /** Supervisor (staff id) who wants the labourer */
  toSupervisorId: string;
  /** Supervisor the labourer is with when asked; null = unassigned */
  fromSupervisorId: string | null;
  requestedBy: string;
  requestedAt: string;
  status: CrewRequestStatus;
  releasedAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

