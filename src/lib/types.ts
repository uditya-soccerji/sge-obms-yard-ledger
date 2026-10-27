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
  /** Supervisor crews: who works under whom (docs §23) */
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

/** docs §9: Open → SIC approves → store fulfils (in full or part) → requester confirms received */
export type EquipmentRequestStatus =
  | "open"
  | "sic_approved"
  | "fulfilling"
  | "fulfilled"
  | "part_filled"
  | "received"
  | "cancelled"
  /** Store said no; the SIC is alerted and may override (docs §24) */
  | "rejected";

/** Why a supervisor asks the store (docs §24) */
export type RequestReason = "urgent" | "damaged" | "required" | "replacement" | "scrapped" | "expired";

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
  reason?: RequestReason;
  /** Store rejection, and the SIC's override of it (docs §24) */
  rejectedBy?: string;
  rejectedAt?: string;
  rejectNote?: string;
  overriddenBy?: string;
  overriddenAt?: string;
  overrideNote?: string;
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

/** A safety officer's observation, tagged to a supervisor (round 2, §27) */
export interface SiteObservation {
  id: string;
  siteId: string;
  plant?: string;
  location: string;
  text: string;
  risk: "low" | "medium" | "high";
  /** Unsafe condition: work stops until cleared — urgent to SIC, Owner, supervisor */
  stopWork?: boolean;
  supervisorId: string;
  /** open → fixed (supervisor) → closed (Safety); Safety may reopen */
  status: "open" | "fixed" | "closed";
  raisedBy: string;
  raisedAt: string;
  fixNote?: string;
  fixedAt?: string;
  closedBy?: string;
  closedAt?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: RoleId;
  siteId: string;
  phone?: string;
  designation?: string;
  supervisorType?: SupervisorType;
  /** HR's staff record (round 2, §27) */
  employeeCode?: string;
  joinedOn?: string;
  /** false = left / deactivated; unset = active */
  active?: boolean;
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
  /** Skill level (B09, owner 2026-10-13); RIL "CATEGORY" */
  skill?: SkillLevel;
  /** Experience band for the wage table (docs §1); wageDaily may still be overridden */
  experience?: ExperienceLevel;
  /** Old EP numbers, newest last; the current one is `epNumber` (docs §1) */
  epHistory?: { ep: string; until: string }[];
  /** RIL Engineer-in-Charge: reference contact at RIL, shown on the profile (owner 2026-10-14) */
  eic?: string;
  /** RIL workman (pass) status, e.g. Valid, Expired, Hibernated (from the RIL export) */
  rilStatus?: string;
  /** RIL "Area Of Movement", e.g. "Refining - DTA-ISBL" */
  rilArea?: string;
  /** RIL pass validity from the RIL export (YYYY-MM-DD); HR / Admin / supervisor alerted before expiry (docs §24) */
  passValidFrom?: string;
  passExpiry?: string;
  /** Last upload that added or changed this row: shown when the same data is uploaded again (docs §24) */
  upload?: UploadStamp;
}

/** Who uploaded a row, when and from which file (every upload checks for duplicates, docs §24) */
export interface UploadStamp {
  by: string;
  at: string;
  file: string;
}

export type SkillLevel = "highly_skilled" | "skilled" | "semi_skilled" | "unskilled";

/** Experience band used with skill on the daily wage table (docs §1). */
export type ExperienceLevel = "junior" | "experienced" | "senior";

/**
 * One default daily wage: trade × skill × experience.
 * Owner / Super Admin / Admin maintain the table; the labourer's wageDaily
 * is what attendance and P&L actually use (may be overridden).
 */
/** Master Data sheets where the Admin's edits are requests for Owner / Super Admin (2026-10-24) */
export type MasterRequestSheet = "trades" | "rateBook" | "materials" | "units";
/** The store action that runs when the request is approved */
export type MasterRequestOp = "updateTrade" | "addTrade" | "upsertRateLine" | "upsertMaterial" | "setCatalogActive" | "upsertCatalogItem";

/** Admin's change on Trades / Rate book / Materials / Units, waiting for Owner / Super Admin (2026-10-24) */
export interface MasterChangeRequest {
  id: string;
  sheet: MasterRequestSheet;
  op: MasterRequestOp;
  /** The exact arguments the Admin's edit used; approval replays them */
  args: unknown[];
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
}

/** Store ledger (2026-10-27, docs/store process): one item list for everything the store holds */
/** Groups the store keeper adds items under (2026-10-27); tagged machinery stays in the equipment register */
export type StoreGroup = "paint" | "material" | "equipment" | "ppe" | "fuel" | "other";
export interface StoreItem {
  id: string;
  group: StoreGroup;
  category: string;
  name: string;
  /** SAP / item code, when it has one */
  code?: string;
  unit: string;
  /** Batches + expiry are recorded (paint, some PPE) */
  trackExpiry: boolean;
  /** Reorder level per site id — set by Owner / Super Admin (stage 4) */
  reorder: Record<string, number>;
  active: boolean;
}

/** One in / out line of the store ledger; stock is the sum of these */
export type StoreMoveKind = "opening" | "receive" | "issue" | "adjust";
export interface StoreMoveStep {
  at: string;
  byName: string;
  action: "created" | "edited";
  note?: string;
}
export interface StoreMove {
  id: string;
  kind: StoreMoveKind;
  /** Business date */
  date: string;
  itemId: string;
  /** Positive, except an adjust (± after a count) */
  qty: number;
  /** The store (site) the line belongs to */
  siteId: string;
  /** Issue: who received it */
  supervisorId?: string;
  batch?: string;
  expiry?: string;
  pr?: string;
  po?: string;
  billNo?: string;
  vendor?: string;
  /** Vehicle that brought a receipt (2026-10-27) */
  vehicleNo?: string;
  note?: string;
  /** Issued while he still held unused stock of this item — flagged for Owner / SA */
  extraIssue?: { heldBefore: number };
  enteredBy: string;
  enteredByName: string;
  enteredAt: string;
  history: StoreMoveStep[];
}

/** Admin's change to a daily wage rate, waiting for Owner / Super Admin (owner, 2026-10-24) */
export interface WageChangeRequest {
  id: string;
  /** The rate being changed; unset for a new trade × skill × experience rate */
  bandId?: string;
  tradeId: string;
  skill: SkillLevel;
  experience: ExperienceLevel;
  fromWage?: number;
  toWage?: number;
  /** Switch the rate on / off instead of changing the amount */
  active?: boolean;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  /** withdrawn = the Admin pressed Undo (2026-10-24) */
  status: "pending" | "approved" | "rejected" | "withdrawn";
  decidedBy?: string;
  decidedAt?: string;
  decidedNote?: string;
  /** Owner / SA were alerted (after the Undo window) */
  notified?: boolean;
  /** The Admin who asked has seen the decision (2026-10-24) */
  seenByRequester?: boolean;
}

export interface WageBand {
  id: string;
  tradeId: string;
  skill: SkillLevel;
  experience: ExperienceLevel;
  dailyWage: number;
  active: boolean;
  note?: string;
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
  /** Set when derived from a submitted DPR (docs §23: attendance counts on submit) */
  sourceDprId?: string;
  reconciled?: boolean;
  /** HR correction of a DPR-derived mark: what it was before (the DPR link stays) */
  correctedFrom?: AttendanceStatus;
}


export interface EquipmentItem {
  id: string;
  /** Round 2 (§27) adds IFR body suit and rope access to the tagged items */
  type: "hopper" | "compressor" | "airless" | "harness" | "ifr" | "rope_access";
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
  /** Round 2 (§27): supervisor holding it (staff id); unset = in the store */
  issuedTo?: string;
  issuedOn?: string;
  /** Value in ₹ (e.g. IFR body suit 5,000) */
  value?: number;
  /** Left the books after a confirmed scrap */
  scrapped?: boolean;
}

/** A supplier's bill to pay — paint, scaffold hire, transport… (round 2, §27) */
export interface VendorBill {
  id: string;
  siteId: string;
  vendor: string;
  billNo: string;
  billDate: string;
  category: "paint" | "scaffold_hire" | "transport" | "consumables" | "other";
  amount: number;
  dueDate?: string;
  note?: string;
  status: "unpaid" | "paid";
  paidOn?: string;
  paidMode?: string;
  enteredBy: string;
}

/** Cash advance given to a labourer; recovered through the monthly pay upload's Advance line (§27) */
export interface AdvanceGiven {
  id: string;
  labourerId: string;
  date: string;
  amount: number;
  note?: string;
  givenBy: string;
}

/** A labourer's leave (round 2, §27) — HR records and approves */
export interface LeaveEntry {
  id: string;
  labourerId: string;
  from: string;
  to: string;
  kind: "casual" | "sick" | "unpaid" | "other";
  reason: string;
  status: "requested" | "approved" | "rejected";
  enteredBy: string;
  enteredAt: string;
  decidedBy?: string;
  decidedNote?: string;
}

/** Counted items (gloves, PPE kit, helmet) received in lots with an expiry (§27) */
export interface KitLot {
  id: string;
  siteId: string;
  item: "gloves" | "ppe_kit" | "helmet";
  /** Still in the store */
  qty: number;
  receivedOn: string;
  expiryDate?: string;
  note?: string;
}

/** Counted items issued to a supervisor's crew, taken oldest expiry first (§27) */
export interface KitIssue {
  id: string;
  siteId: string;
  item: KitLot["item"];
  qty: number;
  supervisorId: string;
  lots: { lotId: string; qty: number; expiryDate?: string }[];
  issuedOn: string;
  issuedBy: string;
  /** How many have come back */
  returned?: number;
}

/** A supervisor's return: store confirms; scrapped also needs the SIC (§27) */
export interface EquipmentReturn {
  id: string;
  siteId: string;
  /** Tagged item id, or a kit issue id */
  equipmentId?: string;
  kitIssueId?: string;
  qty: number;
  condition: "ok" | "damaged" | "expired" | "scrapped";
  note: string;
  by: string;
  at: string;
  status: "with_store" | "with_sic" | "done" | "rejected";
  storeBy?: string;
  sicBy?: string;
  decidedNote?: string;
}

/** Legacy thin DPR line kept for paint-variance gist rollups */
export interface DprLabourMark {
  labourerId: string;
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
  note?: string;
  /** PPE on the day (Admin DPR, 2026-10-27); damaged / urgent go to the store keeper on submit */
  ppe?: "ok" | "damaged" | "urgent";
  /** The store dealt with it (issued / replaced) */
  ppeHandledBy?: string;
  ppeHandledAt?: string;
}

export interface DprEquipmentMark {
  equipmentId: string;
  status: "ok" | "due" | "fault";
  expiryDate?: string;
  note?: string;
  /** Machinery run for the day (2026-10-27): start / end time (HH:MM) and the meter reading */
  startTime?: string;
  endTime?: string;
  meterReading?: number;
  /** Diesel used, litres — compressors only */
  dieselL?: number;
}

export interface DprRequest {
  id: string;
  kind: "spare" | "equipment" | "material" | "other";
  /** Picked from the store list (lib/store-catalogue, 2026-10-27); the item name also fills the description */
  category?: string;
  item?: string;
  description: string;
  qty?: number;
  urgent?: boolean;
  reason?: RequestReason;
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
  /** Pay lines; pf … deduction come from the monthly pay upload (docs §24) */
  kind: "salary" | "bonus" | "advance" | "ot" | "incentive" | "pf" | "room_rent" | "travel" | "food" | "deduction";
  amount: number;
  note: string;
  flaggedToSic?: boolean;
  /** Site this row belongs to (unset = company-wide). */
  siteId?: string;
  /** Set when the line came from the monthly pay upload (docs §24) */
  upload?: UploadStamp;
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
  equipment: EquipmentItem[];
  workPlans: WorkPlanItem[];
  safetyDays: SafetyChecklistDay[];
  telegramDrafts: TelegramDraft[];
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
  /** Default daily wages by trade × skill × experience (docs §1). */
  wageBands: WageBand[];
  wageLedger: WageLedgerEntry[];
  financeAlerts: FinanceAlert[];
  auditLog: AuditEntry[];
  equipmentRequests: EquipmentRequest[];
  /** Supervisor requests to take a labourer onto their crew (docs §23) */
  crewRequests: CrewRequest[];
  /** Safety observations and stop-work calls (round 2, §27) */
  safetyObservations: SiteObservation[];
  /** Store equipment register (round 2, §27) */
  kitLots: KitLot[];
  kitIssues: KitIssue[];
  equipmentReturns: EquipmentReturn[];
  /** Finance (round 2, §27) */
  vendorBills: VendorBill[];
  advances: AdvanceGiven[];
  /** HR (round 2, §27) */
  leaves: LeaveEntry[];
  /** Admin's daily-wage changes waiting for Owner / SA (2026-10-24) */
  wageChangeRequests: WageChangeRequest[];
  /** Store ledger (2026-10-27): items the store adds itself (paint comes from Master Data → Materials) */
  storeItems: StoreItem[];
  storeMoves: StoreMove[];
  masterChangeRequests: MasterChangeRequest[];
  /** One master store — load once, resolve site-then-company in memory. */
  masterCatalog: MasterCatalog;
}

export type CrewRequestStatus = "requested" | "released" | "approved" | "rejected" | "cancelled";

/**
 * A supervisor asking for a labourer (docs §23). Needs SIC approval; when the
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

