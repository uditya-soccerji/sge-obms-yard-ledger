"use client";

import { today as todayDate } from "./today";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  attendanceFromApprovedDpr,
  matchAcplAgainstApproved,
  parseAcplCsv,
} from "./acpl";
import { effectivePermission } from "./permissions";
import { withSupersession } from "./rate-book";
import { roleMeta } from "./roles";
import { SAFETY_CHECKLIST_SEED } from "./safety-dpr";
import { seedMasterCatalog } from "./master/seed-catalog";
import { inStore, pickLots } from "./equipment-register";
import { supabase } from "./supabase/client";
import { partsOf, remoteLoadLabourers, remoteSaveLabourers, type LabourerParts } from "./supabase/labourers";
import {
  remoteAudit,
  remoteCreateUser,
  remoteLoadMaster,
  remoteLogin,
  remoteLogout,
  remoteSaveMaster,
  remoteSaveSite,
  remoteStillActive,
  remoteSetPassword,
  remoteUpdateUser,
} from "./supabase/remote";
import type { CatalogItem, Contractor, MasterCatalog, MaterialItem } from "./master/types";
import { createSeedState, STORAGE_KEY } from "./seed";
import type { DprReport } from "./work/types";
import { ALL_SITES, canSeeAllSites, canSwitchSites, entrySiteId, landingSite, scopeState } from "./site-scope";
import { checkPlantRps, checkSite } from "./sites";
import { approveBlock, checkCrewRequest } from "./crew";
import { normalizeEp } from "./ep";
import { checkLabourer, describeChanges } from "./labourers";
import { daysAgo } from "./today";
import { WORKING } from "./attendance";
import { canExcelTransfer } from "./excel-io";
import { opsTransferSpec, type OpsTransferId } from "./ops-transfer";
import type { TransferPreviewRow } from "./transfer-types";
import { checkSeat, checkSites, checkUserChange, MIN_PASSWORD } from "./users";
import type {
  AcplMatchRow,
  SiteObservation,
  EquipmentItem,
  KitLot,
  KitIssue,
  EquipmentReturn,
  VendorBill,
  AdvanceGiven,
  LeaveEntry,
  CrewRequest,
  AcplPunchRow,
  AcplResolveStatus,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  AuditEntry,
  DraftEntityKind,
  EquipmentRequest,
  EquipmentRequestStatus,
  Labourer,
  MessageType,
  ModuleId,
  PermissionAction,
  StaffMember,
  RateCard,
  RateLine,
  RoleId,
  TelegramDraft,
  TradeDefinition,
  UserAccount,
  WageBand,
  WageLedgerEntry,
} from "./types";
import { seedWageBands } from "./wages";

interface StoreApi {
  /** What screens read: cut to the active site (see scopeState). */
  state: AppState;
  /** Every site, unfiltered — Master Data and the audit log. */
  fullState: AppState;
  hydrated: boolean;
  currentAccount: UserAccount | null;
  /** Shared labourer register (migration 006): last save problem, null when fine */
  labourerSync: { loaded: boolean; error: string | null };
  login: (
    username: string,
    password: string
  ) => Promise<{ ok: true; role: RoleId } | { ok: false; error: string }>;
  switchRole: (role: RoleId) => void;
  logout: () => void;
  resetSeed: () => void;
  /** HR marks or corrects attendance for today or yesterday; a correction needs a note */
  markAttendance: (
    labourerId: string,
    status: AttendanceStatus,
    note?: string,
    date?: string
  ) => { ok: boolean; error?: string };
  /** siteId defaults to the entry site (active site, or the All sites pick). */
  toggleSafetyItem: (dayId: string, itemId: number) => void;
  signSafetyDay: (dayId: string) => void;
  applyTelegram: (input: {
    role: RoleId;
    messageType: MessageType;
    content: string;
    mappedEntity: DraftEntityKind;
  }) => TelegramDraft;
  /** Supervisor reports a fault; the store marks it repaired (docs §7) */
  setEquipmentStatus: (id: string, status: "ok" | "due" | "fault", note?: string) => { ok: boolean; error?: string };
  /** Request flow (docs §9): approve, start, fulfil, part_fill, cancel, receive */
  actOnRequest: (id: string, action: RequestAction, note?: string) => { ok: boolean; error?: string };
  /** An SIC-approved daily report's crew marks become that day's attendance (docs §4) */
  applyDprAttendance: (report: DprReport) => void;
  /** An unlocked report's attendance goes until it is approved again */
  clearDprAttendance: (reportId: string) => void;
  /** Requests on a submitted report go to the request desk (docs §9) */
  raiseRequestsFromDpr: (report: DprReport) => void;
  /** Today's safety checklist for a site, created from the F/HSE/008 list when missing */
  openSafetyDay: (siteId: string) => void;
  uploadAcplText: (text: string, date: string, source: "upload" | "paste") => number;
  /** Match the gate punches against the day's SIC-approved reports (passed in from Work) */
  runAcplMatch: (date: string, reports: DprReport[]) => number;
  resolveAcplFlag: (
    id: string,
    status: AcplResolveStatus,
    note?: string,
    opts?: { sicOverride?: boolean }
  ) => { ok: boolean; error?: string };
  updateRateCard: (id: string, patch: Partial<RateCard>) => void;
  /** siteId may be ALL_SITES ("all") for Owner / Super Admin. */
  switchSite: (siteId: string) => { ok: boolean; error?: string };
  /** In All sites: which site new records are written to. */
  setEntrySite: (siteId: string) => void;
  upsertRateLine: (
    input: Omit<RateLine, "id" | "superseded"> & { id?: string; superseded?: boolean }
  ) => string;
  updateTrade: (id: string, patch: Partial<TradeDefinition>) => { ok: boolean; error?: string };
  /** Crews (docs §23) */
  assignCrew: (
    labourerIds: string[],
    supervisorId: string
  ) => { ok: boolean; error?: string; moved: { labourerId: string; name: string; fromSupervisorId: string | null }[] };
  removeFromCrew: (labourerId: string) => { ok: boolean; error?: string };
  requestCrew: (labourerIds: string[], note?: string) => { ok: boolean; error?: string; created: CrewRequest[] };
  releaseCrew: (requestId: string) => { ok: boolean; error?: string };
  decideCrew: (requestId: string, approve: boolean, note: string) => { ok: boolean; error?: string };
  /** Safety observations (round 2, §27) */
  raiseObservation: (input: Omit<SiteObservation, "id" | "status" | "raisedBy" | "raisedAt">) => { ok: boolean; error?: string; id?: string };
  moveObservation: (id: string, to: "fixed" | "closed" | "open", note?: string) => { ok: boolean; error?: string };
  /** Store equipment register (round 2, §27) */
  addTagged: (input: { type: EquipmentItem["type"]; tag: string; expiryDate?: string; value?: number }) => { ok: boolean; error?: string };
  receiveKit: (input: { item: KitLot["item"]; qty: number; expiryDate?: string; note?: string }) => { ok: boolean; error?: string };
  issueTagged: (equipmentId: string, supervisorId: string) => { ok: boolean; error?: string };
  issueKit: (item: KitLot["item"], qty: number, supervisorId: string) => { ok: boolean; error?: string; lots?: KitIssue["lots"] };
  returnEquipment: (input: { equipmentId?: string; kitIssueId?: string; qty: number; condition: EquipmentReturn["condition"]; note: string }) => { ok: boolean; error?: string; id?: string };
  decideReturn: (id: string, approve: boolean, note: string) => { ok: boolean; error?: string; next?: EquipmentReturn["status"] };
  /** Finance (round 2, §27) */
  addVendorBill: (input: Omit<VendorBill, "id" | "status" | "enteredBy" | "siteId">) => { ok: boolean; error?: string };
  payVendorBill: (id: string, paidOn: string, paidMode: string) => { ok: boolean; error?: string };
  giveAdvance: (input: { labourerId: string; date: string; amount: number; note?: string }) => { ok: boolean; error?: string };
  /** HR leave register (round 2, §27) */
  addLeave: (input: Omit<LeaveEntry, "id" | "status" | "enteredBy" | "enteredAt">) => { ok: boolean; error?: string };
  decideLeave: (id: string, approve: boolean, note: string) => { ok: boolean; error?: string };
  /** Refuses a label that already exists (case-insensitive) */
  addTrade: (input: Omit<TradeDefinition, "id"> & { id?: string }) => { ok: boolean; error?: string; id?: string };
  updateLabourer: (
    id: string,
    patch: Partial<
      Pick<
        Labourer,
        | "trade"
        | "tradeSubcategory"
        | "name"
        | "wageDaily"
        | "active"
        | "siteId"
        | "contractorId"
        | "epNumber"
        | "gatePass"
        | "supervisorId"
        | "aadhaar"
        | "mobile"
        | "skill"
        | "experience"
        | "eic"
      >
    >
  ) => { ok: boolean; error?: string };
  /** Add or change a trade × skill × experience daily wage (docs §1) */
  upsertWageBand: (
    input: Omit<WageBand, "id" | "active"> & { id?: string; active?: boolean }
  ) => { ok: boolean; error?: string; id?: string };
  setWageBandActive: (id: string, active: boolean) => { ok: boolean; error?: string };
  /** Bulk add from the CSV upload, with any new trades (B09) */
  importPay: (
    rows: { labourerId: string; month: string; lines: { kind: WageLedgerEntry["kind"]; amount: number; state: "new" | "changed" | "same"; existingId?: string }[] }[],
    fileName: string
  ) => { ok: boolean; error?: string; added: number; changed: number };
  importLabourers: (
    rows: Omit<Labourer, "id">[],
    newTrades: { id: string; label: string }[],
    fileName: string,
    updates?: { id: string; patch: Partial<Labourer> }[]
  ) => { ok: boolean; error?: string; added: number; updated: number };
  /** Master Data saves go to the server first when it's configured; local state changes only on success (B5) */
  upsertContractor: (row: Contractor) => Promise<{ ok: boolean; error?: string; id?: string }>;
  setContractorActive: (id: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
  upsertCatalogItem: (
    sheet: keyof Omit<MasterCatalog, "contractors" | "materials">,
    row: CatalogItem
  ) => Promise<{ ok: boolean; error?: string; id?: string }>;
  upsertMaterial: (row: MaterialItem) => Promise<{ ok: boolean; error?: string; id?: string }>;
  setCatalogActive: (
    sheet: keyof MasterCatalog,
    id: string,
    active: boolean
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Checked with checkSite (code, uniqueness, name, plants) */
  upsertSite: (site: AppState["sites"][number]) => Promise<{ ok: boolean; error?: string }>;
  /** New staff record (to link a login to); returns its id, or "" if not allowed */
  addStaff: (input: Omit<StaffMember, "id">) => string;
  /** HR's staff list (round 2, §27): edit, deactivate / activate */
  updateStaff: (id: string, patch: Partial<Omit<StaffMember, "id">>) => { ok: boolean; error?: string };
  addLabourer: (row: Omit<Labourer, "id"> & { id?: string }) => { ok: boolean; error?: string; id?: string };
  /** Owner / Super Admin: delete a labourer with no history; otherwise deactivate */
  removeLabourer: (id: string) => { ok: boolean; error?: string };
  addWageEntry: (entry: Omit<WageLedgerEntry, "id">) => void;
  acknowledgeFinanceAlert: (id: string) => void;
  flagFinanceAlertToSic: (id: string) => void;
  createUser: (
    input: Omit<UserAccount, "id">
  ) => Promise<{ ok: boolean; error?: string; id?: string }>;
  updateUser: (
    id: string,
    patch: Partial<UserAccount>
  ) => Promise<{ ok: boolean; error?: string }>;
  setUserPassword: (
    id: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  startImpersonation: (targetAccountId: string) =>
    | { ok: true; home: string }
    | { ok: false; error: string };
  endImpersonation: () =>
    | { ok: true; home: string }
    | { ok: false; error: string };
  /** Owner / Super Admin Excel import for an Operations sheet (after duplicate preview) */
  importOpsExcel: (
    kind: OpsTransferId,
    rows: TransferPreviewRow[]
  ) => { ok: boolean; error?: string; added?: number; updated?: number };
  createEquipmentRequest: (
    input: Omit<EquipmentRequest, "id" | "createdAt" | "updatedAt" | "status" | "createdBy"> & {
      status?: EquipmentRequestStatus;
    }
  ) => string;
  updateEquipmentRequest: (
    id: string,
    patch: Partial<Pick<EquipmentRequest, "status" | "fulfillNote" | "qty" | "description" | "urgent">>
  ) => void;
}

export type RequestAction = "approve" | "start" | "fulfil" | "part_fill" | "cancel" | "receive" | "reject" | "override";

const StoreContext = createContext<StoreApi | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeAudit(
  s: AppState,
  module: ModuleId | string,
  action: string,
  detail: string,
  plant?: string | null
): AuditEntry {
  const account = s.users.find((u) => u.id === s.currentAccountId);
  const impersonator = s.impersonatorAccountId
    ? s.users.find((u) => u.id === s.impersonatorAccountId)
    : null;
  return {
    id: uid("aud"),
    at: new Date().toISOString(),
    userId: s.currentAccountId,
    username: account?.username ?? "system",
    role: s.currentRole,
    siteId: s.currentSiteId,
    plant: plant ?? null,
    module,
    action,
    detail,
    impersonatedBy: impersonator?.username ?? null,
  };
}

/**
 * Does the signed-in account's active role have this right? (lib/permissions.ts)
 * Every write action checks this, so a page or button that slips through
 * still can't change data the role isn't allowed to touch.
 */
function can(s: AppState, module: ModuleId, action: PermissionAction): boolean {
  const account = s.users.find((u) => u.id === s.currentAccountId);
  // A switched-off site is read-only; Master Data and users stay open so it can be switched back on
  const site = s.sites.find((x) => x.id === s.currentSiteId);
  if (site && !site.enabled && action !== "view" && module !== "master" && module !== "users") return false;
  return effectivePermission(account, s.currentRole, module, action);
}

const DENIED = { ok: false as const, error: "Your role can't do this" };

function migrateState(parsed: Partial<AppState>): AppState {
  const seed = createSeedState();
  const users =
    parsed.users && parsed.users.length > 0 ? parsed.users : seed.users;
  const importAudit = (parsed.auditLog ?? []).filter((a) => a.module === "labourer" && a.action === "import").sort((a, b) => a.at.localeCompare(b.at))[0];
  const firstImport = importAudit
    ? { by: (parsed.users ?? []).find((u) => u.id === importAudit.userId)?.name || importAudit.username, at: importAudit.at, file: /from (.+?)( ·|$)/.exec(importAudit.detail)?.[1] ?? "upload" }
    : null;
  return {
    ...seed,
    ...parsed,
    currentAccountId: parsed.currentAccountId ?? null,
    impersonatorAccountId: parsed.impersonatorAccountId ?? null,
    impersonatorSnapshot: parsed.impersonatorSnapshot ?? null,
    users,
    auditLog: parsed.auditLog ?? seed.auditLog,
    equipmentRequests: parsed.equipmentRequests ?? seed.equipmentRequests,
    crewRequests: parsed.crewRequests ?? [],
    safetyObservations: parsed.safetyObservations ?? [],
    kitLots: parsed.kitLots ?? [],
    kitIssues: parsed.kitIssues ?? [],
    equipmentReturns: parsed.equipmentReturns ?? [],
    vendorBills: parsed.vendorBills ?? [],
    advances: parsed.advances ?? [],
    leaves: parsed.leaves ?? [],
    attendance: (parsed.attendance ?? seed.attendance).map((a) =>
      (a.status as string) === "off" ? { ...a, status: "weekly_off" as const } : a
    ),
    acplPunches: parsed.acplPunches ?? seed.acplPunches,
    acplMatches: parsed.acplMatches ?? seed.acplMatches,
    rateCards: parsed.rateCards ?? seed.rateCards,
    rateLines:
      parsed.rateLines && parsed.rateLines.length > 0
        ? parsed.rateLines
        : seed.rateLines,
    tradeCatalogue: (() => {
      const fromSave = (parsed.tradeCatalogue ?? []).map((t) => ({ ...t, siteId: t.siteId ?? null }));
      if (!fromSave.length) return seed.tradeCatalogue;
      // Keep saved trades; add any new seed trades (e.g. Spray Painter) the browser does not have yet
      const have = new Set(fromSave.map((t) => t.id));
      const extras = seed.tradeCatalogue.filter((t) => !have.has(t.id));
      // Refresh labels for known ids when the seed renamed them (Blasting → Blaster)
      const relabel = new Map(seed.tradeCatalogue.map((t) => [t.id, t.label]));
      return [
        ...fromSave.map((t) => (relabel.has(t.id) ? { ...t, label: relabel.get(t.id)! } : t)),
        ...extras,
      ];
    })(),
    wageBands: (() => {
      const fromSave = parsed.wageBands ?? [];
      const seeded = seed.wageBands?.length ? seed.wageBands : seedWageBands();
      if (!fromSave.length) return seeded;
      const have = new Set(fromSave.map((b) => b.id));
      return [...fromSave, ...seeded.filter((b) => !have.has(b.id))];
    })(),
    masterCatalog: parsed.masterCatalog?.dprTypes?.length
      ? {
          ...seedMasterCatalog(),
          ...parsed.masterCatalog,
        }
      : seed.masterCatalog,
    labourers: (parsed.labourers ?? seed.labourers).map((l) => ({
      ...l,
      contractorId: l.contractorId ?? "con-sge",
      // Rows from the RIL upload before upload stamps existed (docs §24): credit the first import
      ...(!l.upload && l.eic && firstImport ? { upload: firstImport } : {}),
    })),
    sites:
      parsed.sites && parsed.sites.length >= 6
        ? parsed.sites.map((s) => ({
            ...s,
            rpTags: s.rpTags ?? [],
            plants: s.plants ?? [],
            plantDetails: s.plantDetails ?? [],
          }))
        : seed.sites,
    wageLedger: parsed.wageLedger ?? seed.wageLedger,
    financeAlerts: parsed.financeAlerts ?? seed.financeAlerts,
    staff: parsed.staff && parsed.staff.length > 0 ? parsed.staff : seed.staff,
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(createSeedState);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        setState(migrateState(parsed));
      }
    } catch {
      // Keep seed, but never let it overwrite saved data we failed to read: keep a copy
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) localStorage.setItem(`sge-backup-ops-${Date.now()}`, raw);
      } catch {
        /* storage full / blocked */
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Merge plan Step 10: data under older keys is never read again — clear it out
  useEffect(() => {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sge-obms-ops-") && k !== STORAGE_KEY) localStorage.removeItem(k);
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  /**
   * Merge plan Step 11: every audit line written in this browser also goes to
   * the shared Supabase audit_log (via write_audit, B1), so the trail survives
   * Reset and cleared storage and every browser sees the same one. Lines that
   * were already here when the page loaded (demo seed) are not sent.
   */
  const auditSent = React.useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!hydrated) return;
    if (auditSent.current === undefined) {
      auditSent.current = state.auditLog[0]?.id ?? null;
      return;
    }
    const fresh: AuditEntry[] = [];
    for (const a of state.auditLog) {
      if (a.id === auditSent.current) break;
      fresh.push(a);
    }
    if (!fresh.length) return;
    auditSent.current = state.auditLog[0].id;
    if (!supabase) return;
    for (const a of fresh.reverse()) {
      void remoteAudit({ userId: a.userId ?? "", username: a.username, role: a.role, siteId: a.siteId, module: String(a.module), action: a.action, detail: a.detail, plant: a.plant, impersonatedBy: a.impersonatedBy });
    }
  }, [state.auditLog, hydrated]);

  const mockLogin = useCallback((username: string, password: string) => {
    const s = stateRef.current;
    const account = s.users.find(
      (u) =>
        u.active &&
        u.username.toLowerCase() === username.trim().toLowerCase() &&
        u.password === password
    );
    if (!account || account.roles.length === 0) {
      // Recover from empty/corrupt users array in localStorage
      if (!s.users.length) {
        const fresh = createSeedState();
        const recovered = fresh.users.find(
          (u) =>
            u.active &&
            u.username.toLowerCase() === username.trim().toLowerCase() &&
            u.password === password
        );
        if (recovered && recovered.roles.length) {
          const role = recovered.roles[0];
          const opId = recovered.staffId ?? recovered.labourerId ?? null;
          const siteId = landingSite(role, recovered.siteIds, fresh.currentSiteId, recovered);
          const next: AppState = {
            ...fresh,
            currentAccountId: recovered.id,
            currentRole: role,
            currentUserId: opId,
            currentSiteId: siteId,
          };
          setState({
            ...next,
            auditLog: [
              makeAudit(
                next,
                "users",
                "login",
                `Signed in as ${recovered.username} (${role}) · recovered seed users`
              ),
              ...fresh.auditLog,
            ],
          });
          return { ok: true as const, role };
        }
      }
      return { ok: false as const, error: "Invalid username or password" };
    }
    const role = account.roles[0];
    const opId = account.staffId ?? account.labourerId ?? null;
    const siteId = landingSite(role, account.siteIds, s.currentSiteId, account);
    const next: AppState = {
      ...s,
      currentAccountId: account.id,
      currentRole: role,
      currentUserId: opId,
      currentSiteId: siteId,
      impersonatorAccountId: null,
      impersonatorSnapshot: null,
    };
    setState({
      ...next,
      auditLog: [
        makeAudit(next, "users", "login", `Signed in as ${account.username} (${role})`),
        ...s.auditLog,
      ],
    });
    return { ok: true as const, role };
  }, []);

  /** Real login against Supabase when configured, else the local mock. */
  const login = useCallback(
    async (username: string, password: string) => {
      if (!supabase) return mockLogin(username, password);
      const res = await remoteLogin(username, password);
      if (!res.ok) return { ok: false as const, error: res.error };
      const { me, users, sites } = res.session;
      const master = await remoteLoadMaster();
      const role = me.roles[0];
      const s = stateRef.current;
      const siteId = landingSite(role, me.siteIds, s.currentSiteId, me);
      const next: AppState = {
        ...s,
        masterCatalog: master ?? s.masterCatalog,
        users,
        sites: sites.length ? sites : s.sites,
        currentAccountId: me.id,
        currentRole: role,
        currentUserId: me.staffId ?? me.labourerId ?? null,
        currentSiteId: siteId,
        impersonatorAccountId: null,
        impersonatorSnapshot: null,
      };
      const entry = makeAudit(next, "users", "login", `Signed in as ${me.username} (${role})`);
      // The audit sync below sends this login line to the shared log
      setState({ ...next, auditLog: [entry, ...s.auditLog] });
      return { ok: true as const, role };
    },
    [mockLogin]
  );

  const switchRole = useCallback((role: RoleId) => {
    setState((s) => {
      const account = s.users.find((u) => u.id === s.currentAccountId);
      if (!account || !account.roles.includes(role)) return s;
      const next = {
        ...s,
        currentRole: role,
        // A role that can't see every site drops back to the entry site
        currentSiteId:
          s.currentSiteId === ALL_SITES && !canSeeAllSites(role, account)
            ? entrySiteId(s)
            : s.currentSiteId,
      };
      return {
        ...next,
        auditLog: [
          makeAudit(next, "users", "switch_role", `Active role → ${role}`),
          ...s.auditLog,
        ],
      };
    });
  }, []);

  const logout = useCallback(() => {
    void remoteLogout();
    setState((s) => {
      const entry = makeAudit(s, "users", "logout", "Signed out");
      return {
        ...s,
        currentRole: null,
        currentUserId: null,
        currentAccountId: null,
        impersonatorAccountId: null,
        impersonatorSnapshot: null,
        auditLog: [entry, ...s.auditLog],
      };
    });
  }, []);

  // B2: a deactivated user (or an ended session) is signed out within a few minutes
  const signedIn = !!state.currentAccountId;

  // ---- Labourer register in the shared database (owner, 2026-10-15) ----
  // Loaded at sign-in and every minute; every change is saved back. Until the
  // first load the local list is never pushed, so demo labourers stay out of it.
  const labSynced = React.useRef<Map<string, LabourerParts> | null>(null);
  const labBusy = React.useRef(false);
  const labAgain = React.useRef(false);
  const [labourerSync, setLabourerSync] = useState<{ loaded: boolean; error: string | null }>({ loaded: false, error: null });
  const accountId = state.currentAccountId;

  const pullLabourers = useCallback(async () => {
    if (!supabase) return;
    const rows = await remoteLoadLabourers();
    if (!rows) return setLabourerSync((x) => ({ ...x, error: "Couldn't load labourers from the shared register" }));
    // Keep local edits that haven't reached the server yet
    const cur = stateRef.current.labourers;
    const synced = labSynced.current;
    const pending = synced ? cur.filter((l) => { const was = synced.get(l.id); const now = partsOf(l); return !was || was.main !== now.main || was.priv !== now.priv || was.pay !== now.pay; }) : [];
    const pendingIds = new Set(pending.map((l) => l.id));
    const merged = [...rows.filter((r) => !pendingIds.has(r.id)), ...pending];
    labSynced.current = new Map(rows.map((l) => [l.id, partsOf(l)]));
    setState((s) => ({ ...s, labourers: merged }));
    setLabourerSync({ loaded: true, error: null });
  }, []);

  useEffect(() => {
    labSynced.current = null;
    setLabourerSync({ loaded: false, error: null });
    if (!supabase || !accountId || !hydrated) return;
    void pullLabourers();
    const t = setInterval(() => { if (!labBusy.current) void pullLabourers(); }, 60 * 1000);
    const onFocus = () => { if (!labBusy.current) void pullLabourers(); };
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [accountId, hydrated, pullLabourers]);

  const pushLabourers = useCallback(async () => {
    const synced = labSynced.current;
    if (!supabase || !synced) return;
    if (labBusy.current) { labAgain.current = true; return; }
    const cur = stateRef.current;
    const ids = new Set(cur.labourers.map((l) => l.id));
    const changed = cur.labourers
      .map((l) => { const was = synced.get(l.id); const now = partsOf(l); return { labourer: l, now, main: !was || was.main !== now.main, priv: !was ? !!(l.aadhaar || l.mobile) : was.priv !== now.priv, pay: !was ? (l.wageDaily ?? 0) > 0 : was.pay !== now.pay }; })
      .filter((c) => c.main || c.priv || c.pay);
    const removed = [...synced.keys()].filter((id) => !ids.has(id));
    if (!changed.length && !removed.length) return;
    labBusy.current = true;
    const roles = cur.users.find((u) => u.id === cur.currentAccountId)?.roles ?? [];
    const res = await remoteSaveLabourers(roles, changed, removed);
    labBusy.current = false;
    if (res.ok) {
      for (const c of changed) synced.set(c.labourer.id, c.now);
      for (const id of removed) synced.delete(id);
      setLabourerSync({ loaded: true, error: null });
    } else setLabourerSync({ loaded: true, error: res.error ?? "Labourers didn't save" });
    if (labAgain.current) { labAgain.current = false; void pushLabourers(); }
  }, []);

  useEffect(() => {
    if (labourerSync.loaded) void pushLabourers();
  }, [state.labourers, labourerSync.loaded, pushLabourers]);
  useEffect(() => {
    if (!supabase || !signedIn) return;
    const check = async () => {
      if ((await remoteStillActive()) === false) logout();
    };
    void check();
    const t = setInterval(check, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, [signedIn, logout]);

  const startImpersonation = useCallback((targetAccountId: string) => {
    let result:
      | { ok: true; home: string }
      | { ok: false; error: string } = { ok: false, error: "Unknown error" };
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      if (s.impersonatorAccountId) {
        result = {
          ok: false,
          error: "Already viewing as another user. Exit first.",
        };
        return s;
      }
      if (s.currentRole !== "super_admin") {
        result = {
          ok: false,
          error: "Only Super Admin can impersonate",
        };
        return s;
      }
      const actor = s.users.find((u) => u.id === s.currentAccountId);
      if (!actor || !actor.roles.includes("super_admin")) {
        result = {
          ok: false,
          error: "Only Super Admin can impersonate",
        };
        return s;
      }
      const target = s.users.find((u) => u.id === targetAccountId);
      if (!target || !target.active) {
        result = { ok: false, error: "Target user not found or inactive" };
        return s;
      }
      if (target.id === actor.id) {
        result = { ok: false, error: "Cannot impersonate yourself" };
        return s;
      }
      if (target.roles.includes("super_admin")) {
        result = {
          ok: false,
          error: "Cannot impersonate another Super Admin",
        };
        return s;
      }
      if (!target.roles.length) {
        result = { ok: false, error: "Target has no roles assigned" };
        return s;
      }
      const role = target.roles[0];
      const opId = target.staffId ?? target.labourerId ?? null;
      const siteId = landingSite(role, target.siteIds, s.currentSiteId, target);
      const next: AppState = {
        ...s,
        impersonatorAccountId: actor.id,
        impersonatorSnapshot: {
          role: "super_admin",
          userId: s.currentUserId,
          siteId: s.currentSiteId,
        },
        currentAccountId: target.id,
        currentRole: role,
        currentUserId: opId,
        currentSiteId: siteId,
      };
      // Audit as SA before effective identity fully replaces (keep SA actor on this event)
      const startEntry: AuditEntry = {
        id: uid("aud"),
        at: new Date().toISOString(),
        userId: actor.id,
        username: actor.username,
        role: "super_admin",
        siteId: s.currentSiteId,
        plant: null,
        module: "users",
        action: "impersonate_start",
        detail: `Viewing as ${target.name} (@${target.username}) · role ${role}`,
        impersonatedBy: null,
      };
      result = { ok: true, home: roleMeta(role).home };
      return {
        ...next,
        auditLog: [startEntry, ...s.auditLog],
      };
    };
    step(stateRef.current);
    setState(step);
    return result;
  }, []);

  const endImpersonation = useCallback(() => {
    let result:
      | { ok: true; home: string }
      | { ok: false; error: string } = { ok: false, error: "Unknown error" };
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      if (!s.impersonatorAccountId) {
        result = { ok: false, error: "Not impersonating" };
        return s;
      }
      const sa = s.users.find((u) => u.id === s.impersonatorAccountId);
      const target = s.users.find((u) => u.id === s.currentAccountId);
      if (!sa || !sa.roles.includes("super_admin")) {
        result = {
          ok: false,
          error: "Impersonator Super Admin account missing",
        };
        return s;
      }
      const snap = s.impersonatorSnapshot;
      const role = snap?.role ?? "super_admin";
      const next: AppState = {
        ...s,
        currentAccountId: sa.id,
        currentRole: role,
        currentUserId: snap?.userId ?? sa.staffId ?? null,
        currentSiteId: snap?.siteId ?? sa.siteIds[0] ?? s.currentSiteId,
        impersonatorAccountId: null,
        impersonatorSnapshot: null,
      };
      const endEntry: AuditEntry = {
        id: uid("aud"),
        at: new Date().toISOString(),
        userId: sa.id,
        username: sa.username,
        role: "super_admin",
        siteId: next.currentSiteId,
        plant: null,
        module: "users",
        action: "impersonate_end",
        detail: `Exited view-as ${target?.name ?? "user"} (@${target?.username ?? "?"})`,
        impersonatedBy: null,
      };
      result = { ok: true, home: roleMeta(role).home };
      return {
        ...next,
        auditLog: [endEntry, ...s.auditLog],
      };
    };
    step(stateRef.current);
    setState(step);
    return result;
  }, []);

  const resetSeed = useCallback(() => {
    const fresh = createSeedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setState(fresh);
  }, []);

  const markAttendance = useCallback(
    (labourerId: string, status: AttendanceStatus, note?: string, date?: string) => {
      const day = date ?? todayDate();
      const cur = stateRef.current;
      // HR keeps the register; supervisors mark attendance on their DPR, which SIC approves
      if (!can(cur, "hr", "update")) return DENIED;
      if (day > todayDate() || day < daysAgo(1)) return { ok: false, error: "Attendance can be marked for today or yesterday only (docs §4)" };
      const existing = cur.attendance.find((a) => a.labourerId === labourerId && a.date === day);
      if (existing?.sourceDprId && !note?.trim()) {
        return { ok: false, error: "This mark came from an SIC-approved DPR — add a note to correct it" };
      }
      setState((s) => {
        const prev = s.attendance.find((a) => a.labourerId === labourerId && a.date === day);
        const record: AttendanceRecord = {
          id: prev?.id ?? uid("att"),
          date: day,
          labourerId,
          status,
          inTime: WORKING.includes(status) ? prev?.inTime ?? "08:00" : undefined,
          outTime: WORKING.includes(status) ? prev?.outTime : undefined,
          markedBy: s.currentUserId ?? "system",
          siteId: s.labourers.find((l) => l.id === labourerId)?.siteId ?? entrySiteId(s),
          note: note?.trim() || prev?.note,
          // A correction keeps the DPR link and remembers what the DPR said
          sourceDprId: prev?.sourceDprId,
          correctedFrom: prev?.sourceDprId ? prev.correctedFrom ?? prev.status : undefined,
        };
        const attendance = prev ? s.attendance.map((a) => (a.id === prev.id ? record : a)) : [...s.attendance, record];
        const next = { ...s, attendance };
        const name = s.labourers.find((l) => l.id === labourerId)?.name ?? labourerId;
        return {
          ...next,
          auditLog: [
            makeAudit(next, "hr", prev ? "update" : "create", `Attendance ${name} ${day}: ${prev ? `${prev.status} → ` : ""}${status}${note?.trim() ? ` · ${note.trim()}` : ""}`),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true };
    },
    []
  );

  const toggleSafetyItem = useCallback((dayId: string, itemId: number) => {
    setState((s) => !can(s, "safety", "update") ? s : ({
      ...s,
      safetyDays: s.safetyDays.map((d) =>
        // A signed-off checklist is final
        d.id !== dayId || d.signed
          ? d
          : {
              ...d,
              items: d.items.map((it) =>
                it.id === itemId ? { ...it, checked: !it.checked } : it
              ),
            }
      ),
    }));
  }, []);

  const signSafetyDay = useCallback((dayId: string) => {
    setState((s) => !can(s, "safety", "update") ? s : ({
      ...s,
      safetyDays: s.safetyDays.map((d) =>
        d.id === dayId ? { ...d, signed: true } : d
      ),
    }));
  }, []);

  const applyDprAttendance = useCallback((report: DprReport) => {
    setState((s) => {
      const derived = attendanceFromApprovedDpr(report.id, report.date, report.siteId, report.labourMarks, s.currentUserId ?? "st-sic");
      // The submitted report replaces manual marks for those people (and its own earlier
      // marks on a resubmit), but another report's marks stay: a split day (docs §4, §23)
      const keys = new Set(derived.map((a) => `${a.date}:${a.labourerId}`));
      const attendance = [
        ...derived,
        ...s.attendance.filter((a) => a.sourceDprId !== report.id && (a.sourceDprId || !keys.has(`${a.date}:${a.labourerId}`))),
      ];
      const next = { ...s, attendance };
      return { ...next, auditLog: [makeAudit(next, "dpr", "attendance", `DPR ${report.date} · ${report.plant}: attendance recorded at submit for ${derived.length}`, report.plant), ...s.auditLog] };
    });
  }, []);

  const clearDprAttendance = useCallback((reportId: string) => {
    setState((s) => ({ ...s, attendance: s.attendance.filter((a) => a.sourceDprId !== reportId) }));
  }, []);

  const raiseRequestsFromDpr = useCallback((report: DprReport) => {
    setState((s) => {
      let equipmentRequests = s.equipmentRequests;
      for (const req of report.requests) {
        if (equipmentRequests.some((e) => e.sourceDprId === report.id && e.description === req.description)) continue;
        const now = new Date().toISOString();
        equipmentRequests = [
          { id: uid("er"), createdAt: now, updatedAt: now, createdBy: report.submitterId, siteId: report.siteId, plant: report.plant, kind: req.kind, description: req.description, qty: req.qty, urgent: req.urgent || req.reason === "urgent", reason: req.reason, status: "open", sourceDprId: report.id },
          ...equipmentRequests,
        ];
      }
      return equipmentRequests === s.equipmentRequests ? s : { ...s, equipmentRequests };
    });
  }, []);

  const openSafetyDay = useCallback((siteId: string) => {
    const day = todayDate();
    if (stateRef.current.safetyDays.some((d) => d.siteId === siteId && d.date === day)) return;
    if (!can(stateRef.current, "safety", "update")) return;
    setState((s) =>
      s.safetyDays.some((d) => d.siteId === siteId && d.date === day)
        ? s
        : {
            ...s,
            safetyDays: [
              {
                id: uid("sd"),
                date: day,
                officerId: s.currentUserId ?? "st-safety",
                siteId,
                items: SAFETY_CHECKLIST_SEED.map((row) => ({ id: row.id, label: row.label, checked: false })),
                observations: "",
                incidents: "Nil",
                signed: false,
              },
              ...s.safetyDays,
            ],
          }
    );
  }, []);

  const uploadAcplText = useCallback(
    (text: string, date: string, source: "upload" | "paste") => {
      if (!can(stateRef.current, "acpl", "upload")) return 0;
      const parsed = parseAcplCsv(text, date);
      setState((s) => {
        const punches: AcplPunchRow[] = parsed.map((p) => ({
          ...p,
          id: uid("acpl"),
          source,
        }));
        // Uploading a day again replaces that day's punches (docs §13), never duplicates them
        const dates = new Set(punches.map((p) => p.date));
        return { ...s, acplPunches: [...punches, ...s.acplPunches.filter((p) => !dates.has(p.date))] };
      });
      return parsed.length;
    },
    []
  );

  const runAcplMatch = useCallback((date: string, reports: DprReport[]) => {
    let count = 0;
    if (!can(stateRef.current, "acpl", "upload") && !can(stateRef.current, "acpl", "approve")) return 0;
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      // A flag someone already resolved stays resolved unless the data behind it changed
      const resolved = s.acplMatches.filter((m) => m.date === date && m.resolveStatus !== "open");
      const same = (a: AcplMatchRow, b: AcplMatchRow) =>
        a.epNumber === b.epNumber && a.flag === b.flag && a.dprStatus === b.dprStatus && a.acplInTime === b.acplInTime && a.acplOutTime === b.acplOutTime;
      const matches = matchAcplAgainstApproved(s, s.acplPunches, date, reports).filter((m) => !resolved.some((r) => same(r, m)));
      count = matches.length;
      // Replace open matches for that date
      const kept = s.acplMatches.filter(
        (m) => m.date !== date || m.resolveStatus !== "open"
      );
      return { ...s, acplMatches: [...matches, ...kept] };
    };
    step(stateRef.current);
    setState(step);
    return count;
  }, []);

  const resolveAcplFlag = useCallback(
    (
      id: string,
      status: AcplResolveStatus,
      note?: string,
      opts?: { sicOverride?: boolean }
    ) => {
      let result: { ok: boolean; error?: string } = { ok: true };
      // Run the update on the current state first, so the result returned is the real outcome
      // (React may apply the queued update later); then queue the same update
      const step = (s: AppState): AppState => {
        const role = s.currentRole;
        // docs §12: Admin (data operator) resolves, HR too; SIC can override with a reason
        const canResolve = role === "admin" || role === "hr" || role === "super_admin";
        const canSicOverride =
          opts?.sicOverride &&
          (role === "sic" || role === "super_admin" || role === "owner");
        if (!canResolve && !canSicOverride) {
          result = {
            ok: false,
            error: "ACPL flags: Admin or HR resolves; SIC may override.",
          };
          return s;
        }
        if ((opts?.sicOverride || status === "dismissed") && !note?.trim()) {
          result = { ok: false, error: "Give the reason (it's kept with the flag)" };
          return s;
        }
        const match = s.acplMatches.find((m) => m.id === id);
        if (!match) {
          result = { ok: false, error: "Flag not found" };
          return s;
        }
        const acplMatches = s.acplMatches.map((m) =>
          m.id === id
            ? {
                ...m,
                resolveStatus: status,
                resolveNote: opts?.sicOverride
                  ? `[SIC override] ${note ?? ""}`
                  : note,
                resolvedBy: s.currentUserId ?? "hr",
              }
            : m
        );
        let attendance = s.attendance;
        const hasRecord = s.attendance.some((a) => a.labourerId === match.labourerId && a.date === match.date);
        if (match.labourerId && status === "resolved_acpl" && !hasRecord) {
          // Gate punch with no attendance yet (acpl_only): the gate wins, so add it (docs §12)
          attendance = [
            ...attendance,
            {
              id: uid("att"),
              date: match.date,
              labourerId: match.labourerId,
              status: "present",
              inTime: match.acplInTime,
              outTime: match.acplOutTime,
              markedBy: s.currentUserId ?? "admin",
              siteId: s.labourers.find((l) => l.id === match.labourerId)?.siteId ?? entrySiteId(s),
              note: note ?? "From ACPL (resolved)",
              reconciled: true,
            },
          ];
        } else if (match.labourerId && status === "resolved_acpl") {
          attendance = attendance.map((a) =>
            a.labourerId === match.labourerId && a.date === match.date
              ? {
                  ...a,
                  inTime: match.acplInTime ?? a.inTime,
                  outTime: match.acplOutTime ?? a.outTime,
                  reconciled: true,
                  note: note ?? a.note,
                }
              : a
          );
        }
        if (match.labourerId && status === "resolved_dpr") {
          attendance = attendance.map((a) =>
            a.labourerId === match.labourerId && a.date === match.date
              ? { ...a, reconciled: true, note: note ?? a.note }
              : a
          );
        }
        const next = { ...s, acplMatches, attendance };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "acpl",
              opts?.sicOverride ? "approve" : "update",
              `Resolve ${id} → ${status}${opts?.sicOverride ? " (SIC override)" : ""}`
            ),
            ...s.auditLog,
          ],
        };
      };
      step(stateRef.current);
      setState(step);
      return result;
    },
    []
  );

  const updateRateCard = useCallback((id: string, patch: Partial<RateCard>) => {
    setState((s) => !can(s, "rates", "update") && !can(s, "master", "update") ? s : ({
      ...s,
      rateCards: s.rateCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const switchSite = useCallback((siteId: string) => {
    const s = stateRef.current;
    const account = s.users.find((u) => u.id === s.currentAccountId);
    if (!account) return { ok: false as const, error: "Not signed in" };
    if (!canSwitchSites(s.currentRole)) {
      return { ok: false as const, error: "Site switch not allowed for this role" };
    }
    if (siteId === ALL_SITES) {
      if (!canSeeAllSites(s.currentRole, account)) {
        return { ok: false as const, error: "All sites is for Owner / Super Admin" };
      }
      setState((prev) => ({
        ...prev,
        currentSiteId: ALL_SITES,
        // Keep writing to the site they were just on
        entrySiteId:
          prev.currentSiteId !== ALL_SITES ? prev.currentSiteId : prev.entrySiteId,
        auditLog: [
          makeAudit(prev, "admin", "switch_site", "Active site → All sites"),
          ...prev.auditLog,
        ],
      }));
      return { ok: true as const };
    }
    const allowed =
      account.roles.includes("super_admin") ||
      account.siteIds.includes(siteId);
    if (!allowed) {
      return { ok: false as const, error: "Site not assigned to account" };
    }
    // Switched-off sites stay reachable, read-only (M5)
    const site = s.sites.find((x) => x.id === siteId);
    if (!site) return { ok: false as const, error: "Unknown site" };
    setState((prev) => ({
      ...prev,
      currentSiteId: siteId,
      auditLog: [
        makeAudit(prev, "admin", "switch_site", `Active site → ${site.code}`),
        ...prev.auditLog,
      ],
    }));
    return { ok: true as const };
  }, []);

  const setEntrySite = useCallback((siteId: string) => {
    setState((s) =>
      s.sites.some((x) => x.id === siteId && x.enabled)
        ? { ...s, entrySiteId: siteId }
        : s
    );
  }, []);

  const upsertRateLine = useCallback(
    (
      input: Omit<RateLine, "id" | "superseded"> & {
        id?: string;
        superseded?: boolean;
      }
    ) => {
      const id = input.id ?? uid("rl");
      setState((s) => {
        if (!can(s, "rates", input.id ? "update" : "create") && !can(s, "master", "update")) return s;
        const line: RateLine = {
          ...input,
          id,
          superseded: input.superseded ?? false,
        };
        const without = s.rateLines.filter((r) => r.id !== id);
        const next = withSupersession([line, ...without], line);
        return {
          ...s,
          rateLines: next,
          auditLog: [
            makeAudit(
              s,
              "rates",
              input.id ? "update" : "create",
              `Rate ${line.itemKey} ₹${line.rateInr}/${line.uom} PO ${line.poNumber}`
            ),
            ...s.auditLog,
          ],
        };
      });
      return id;
    },
    []
  );

  const updateTrade = useCallback((id: string, patch: Partial<TradeDefinition>) => {
    const cur = stateRef.current;
    if (!can(cur, "trades", "update") && !can(cur, "master", "update")) return DENIED;
    const before = cur.tradeCatalogue.find((t) => t.id === id);
    if (!before) return { ok: false, error: "Trade not found" };
    if (patch.label !== undefined) {
      const label = patch.label.trim();
      if (!label) return { ok: false, error: "Trade name is required" };
      if (cur.tradeCatalogue.some((t) => t.id !== id && t.label.trim().toLowerCase() === label.toLowerCase())) return { ok: false, error: "Trade already exists" };
      patch = { ...patch, label };
    }
    const changes = describeChanges(before, patch);
    if (!changes) return { ok: true };
    setState((s) => {
      const next = { ...s, tradeCatalogue: s.tradeCatalogue.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
      return { ...next, auditLog: [makeAudit(next, "trades", "update", `Trade ${before.label}: ${changes}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const addTrade = useCallback(
    (input: Omit<TradeDefinition, "id"> & { id?: string }) => {
      const slug = input.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const cur = stateRef.current;
      if (!can(cur, "trades", "create") && !can(cur, "master", "update")) return DENIED;
      const label = input.label.trim();
      if (!label) return { ok: false, error: "Trade name is required" };
      if (cur.tradeCatalogue.some((t) => t.label.trim().toLowerCase() === label.toLowerCase())) return { ok: false, error: "Trade already exists" };
      // A taken slug gets -2, -3, …
      let id = input.id ?? (slug || uid("trade"));
      for (let n = 2; cur.tradeCatalogue.some((t) => t.id === id); n++) id = `${slug || "trade"}-${n}`;
      setState((s) => {
        const next = {
          ...s,
          tradeCatalogue: [
            ...s.tradeCatalogue,
            { id, label, subcategories: input.subcategories ?? [], active: input.active ?? true, siteId: input.siteId ?? null },
          ],
        };
        return { ...next, auditLog: [makeAudit(next, "trades", "create", `Trade ${label}`), ...s.auditLog] };
      });
      return { ok: true, id };
    },
    []
  );

  const upsertWageBand = useCallback(
    (input: Omit<WageBand, "id" | "active"> & { id?: string; active?: boolean }) => {
      const cur = stateRef.current;
      if (!can(cur, "trades", "update") && !can(cur, "master", "update")) return DENIED;
      const dailyWage = Number(input.dailyWage);
      if (!(dailyWage > 0)) return { ok: false, error: "Daily wage must be above zero" };
      if (!input.tradeId || !input.skill || !input.experience) {
        return { ok: false, error: "Trade, skill and experience are required" };
      }
      const clash = cur.wageBands.find(
        (b) =>
          b.id !== input.id &&
          b.tradeId === input.tradeId &&
          b.skill === input.skill &&
          b.experience === input.experience
      );
      if (clash) return { ok: false, error: "That trade × skill × experience already has a rate" };
      const id = input.id ?? uid("wb");
      const row: WageBand = {
        id,
        tradeId: input.tradeId,
        skill: input.skill,
        experience: input.experience,
        dailyWage,
        active: input.active ?? true,
        note: input.note,
      };
      setState((s) => {
        const has = s.wageBands.some((b) => b.id === id);
        const wageBands = has ? s.wageBands.map((b) => (b.id === id ? row : b)) : [...s.wageBands, row];
        const next = { ...s, wageBands };
        return {
          ...next,
          auditLog: [
            makeAudit(next, "trades", has ? "update" : "create", `Wage ${row.tradeId} · ${row.skill} · ${row.experience} → ₹${row.dailyWage}`),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true, id };
    },
    []
  );

  const setWageBandActive = useCallback((id: string, active: boolean) => {
    const cur = stateRef.current;
    if (!can(cur, "trades", "update") && !can(cur, "master", "update")) return DENIED;
    const before = cur.wageBands.find((b) => b.id === id);
    if (!before) return { ok: false, error: "Wage row not found" };
    setState((s) => {
      const next = { ...s, wageBands: s.wageBands.map((b) => (b.id === id ? { ...b, active } : b)) };
      return {
        ...next,
        auditLog: [makeAudit(next, "trades", "update", `Wage ${before.tradeId} · ${before.skill} · ${before.experience} ${active ? "on" : "off"}`), ...s.auditLog],
      };
    });
    return { ok: true };
  }, []);

  const updateLabourer = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          Labourer,
          | "trade"
          | "tradeSubcategory"
          | "name"
          | "wageDaily"
          | "active"
          | "siteId"
          | "contractorId"
          | "epNumber"
          | "gatePass"
          | "supervisorId"
          | "aadhaar"
          | "mobile"
          | "skill"
          | "experience"
          | "eic"
          | "epHistory"
        >
      >
    ) => {
      const cur = stateRef.current;
      if (!can(cur, "labourer", "update") && !can(cur, "master", "update")) return DENIED;
      const before = cur.labourers.find((l) => l.id === id);
      if (!before) return { ok: false, error: "Labourer not found" };
      const merged = { ...before, ...patch };
      // Imported people may still lack a crew / wage (B09): don't block other edits on that
      const bad = checkLabourer(merged, cur.labourers, { allowIncomplete: !before.supervisorId || !(before.wageDaily > 0) });
      if (bad) return { ok: false, error: bad };
      patch = { ...patch, ...(patch.epNumber !== undefined ? { epNumber: normalizeEp(patch.epNumber)! } : {}) };
      // docs §1: a new EP archives the old one with its date
      if (patch.epNumber !== undefined && before.epNumber && normalizeEp(before.epNumber) && patch.epNumber !== normalizeEp(before.epNumber)) {
        patch = { ...patch, epHistory: [...(before.epHistory ?? []), { ep: normalizeEp(before.epNumber)!, until: new Date().toISOString().slice(0, 10) }] };
      }
      const changes = describeChanges(before, patch, ["aadhaar", "epHistory"]);
      if (!changes) return { ok: true };
      setState((s) => {
        const next = { ...s, labourers: s.labourers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
        return { ...next, auditLog: [makeAudit(next, "labourer", "update", `Labourer ${before.name}: ${changes}`), ...s.auditLog] };
      });
      return { ok: true };
    },
    []
  );

  const removeLabourer = useCallback((id: string) => {
    const cur = stateRef.current;
    if (cur.currentRole !== "owner" && cur.currentRole !== "super_admin") return { ok: false, error: "Only Owner or Super Admin can delete a labourer" };
    const l = cur.labourers.find((x) => x.id === id);
    if (!l) return { ok: false, error: "Labourer not found" };
    const used =
      cur.attendance.some((a) => a.labourerId === id) ||
      cur.wageLedger.some((w) => w.labourerId === id) ||
      cur.users.some((u) => u.labourerId === id);
    if (used) return { ok: false, error: `${l.name} has attendance, wages or a login — deactivate instead` };
    setState((s) => {
      const next = { ...s, labourers: s.labourers.filter((x) => x.id !== id) };
      return { ...next, auditLog: [makeAudit(next, "labourer", "delete", `Deleted labourer ${l.name} · ${l.epNumber}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  /** SIC / Owner / SA put labourers on a supervisor's crew (docs §23). Reports who moved off another crew. */
  const assignCrew = useCallback((labourerIds: string[], supervisorId: string) => {
    const cur = stateRef.current;
    if (!can(cur, "crew", "approve")) return { ...DENIED, moved: [] };
    const sup = cur.staff.find((x) => x.id === supervisorId && x.role === "supervisor");
    if (!sup) return { ok: false as const, error: "Pick a supervisor", moved: [] };
    const picked = cur.labourers.filter((l) => labourerIds.includes(l.id) && l.active && l.supervisorId !== supervisorId);
    if (!picked.length) return { ok: false as const, error: "Pick at least one labourer not already on this crew", moved: [] };
    const off = picked.filter((l) => l.siteId !== sup.siteId);
    if (off.length) return { ok: false as const, error: `${off[0].name} works on another site`, moved: [] };
    const moved = picked.map((l) => ({ labourerId: l.id, name: l.name, fromSupervisorId: l.supervisorId || null }));
    const ids = new Set(picked.map((l) => l.id));
    setState((s) => {
      const next = {
        ...s,
        labourers: s.labourers.map((l) => (ids.has(l.id) ? { ...l, supervisorId } : l)),
        // A direct move settles any open request for these labourers
        crewRequests: s.crewRequests.map((r) =>
          ids.has(r.labourerId) && (r.status === "requested" || r.status === "released")
            ? { ...r, status: (r.toSupervisorId === supervisorId ? "approved" : "cancelled") as CrewRequest["status"], decidedBy: s.currentUserId ?? undefined, decidedAt: new Date().toISOString() }
            : r
        ),
      };
      return {
        ...next,
        auditLog: [
          ...moved.map((m) =>
            makeAudit(next, "crew", "assign", `${m.name} → ${sup.name}${m.fromSupervisorId ? ` (from ${s.staff.find((x) => x.id === m.fromSupervisorId)?.name ?? m.fromSupervisorId})` : " (was unassigned)"}`)
          ),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true as const, moved };
  }, []);

  /** Take a labourer off their crew (unassigned). A major change (docs §23). */
  const removeFromCrew = useCallback((labourerId: string) => {
    const cur = stateRef.current;
    if (!can(cur, "crew", "approve")) return DENIED;
    const lab = cur.labourers.find((l) => l.id === labourerId);
    if (!lab?.supervisorId) return { ok: false as const, error: "Not on a crew" };
    const from = cur.staff.find((x) => x.id === lab.supervisorId)?.name ?? lab.supervisorId;
    setState((s) => {
      const next = { ...s, labourers: s.labourers.map((l) => (l.id === labourerId ? { ...l, supervisorId: "" } : l)) };
      return { ...next, auditLog: [makeAudit(next, "crew", "remove", `${lab.name} taken off ${from}'s crew`), ...s.auditLog] };
    });
    return { ok: true as const };
  }, []);

  /** A supervisor with the right asks for labourers; the SIC approves (docs §23). */
  const requestCrew = useCallback((labourerIds: string[], note?: string) => {
    const cur = stateRef.current;
    const me = cur.staff.find((x) => x.id === cur.currentUserId && x.role === "supervisor");
    if (!me || !can(cur, "crew", "create")) return { ...DENIED, created: [] as CrewRequest[] };
    const created: CrewRequest[] = [];
    for (const id of labourerIds) {
      const lab = cur.labourers.find((l) => l.id === id);
      if (!lab) continue;
      const bad = checkCrewRequest(lab, me.id, me.siteId, [...cur.crewRequests, ...created]);
      if (bad) return { ok: false as const, error: bad, created: [] as CrewRequest[] };
      created.push({
        id: uid("cr"),
        siteId: me.siteId,
        labourerId: lab.id,
        toSupervisorId: me.id,
        fromSupervisorId: lab.supervisorId || null,
        requestedBy: me.id,
        requestedAt: new Date().toISOString(),
        status: "requested",
        ...(note?.trim() ? { note: note.trim() } : {}),
      });
    }
    if (!created.length) return { ok: false as const, error: "Pick at least one labourer", created };
    setState((s) => {
      const next = { ...s, crewRequests: [...created, ...s.crewRequests] };
      return {
        ...next,
        auditLog: [
          ...created.map((r) => makeAudit(next, "crew", "request", `${me.name} asked for ${s.labourers.find((l) => l.id === r.labourerId)?.name ?? r.labourerId}`)),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true as const, created };
  }, []);

  /** The current supervisor lets a requested labourer go (docs §23). */
  const releaseCrew = useCallback((requestId: string) => {
    const cur = stateRef.current;
    const r = cur.crewRequests.find((x) => x.id === requestId);
    if (!r || r.status !== "requested" || !r.fromSupervisorId) return { ok: false as const, error: "Nothing to release" };
    if (cur.currentUserId !== r.fromSupervisorId && !can(cur, "crew", "approve")) return DENIED;
    setState((s) => {
      const next = { ...s, crewRequests: s.crewRequests.map((x) => (x.id === requestId ? { ...x, status: "released" as const, releasedAt: new Date().toISOString() } : x)) };
      return { ...next, auditLog: [makeAudit(next, "crew", "release", `${s.labourers.find((l) => l.id === r.labourerId)?.name ?? r.labourerId} released`), ...s.auditLog] };
    });
    return { ok: true as const };
  }, []);

  /** SIC approves (labourer joins the crew) or rejects a request (docs §23). */
  const raiseObservation = useCallback((input: Omit<SiteObservation, "id" | "status" | "raisedBy" | "raisedAt">) => {
    const cur = stateRef.current;
    if (!can(cur, "safety", "update")) return DENIED;
    if (!input.text.trim()) return { ok: false, error: "Say what you saw" };
    if (!input.location.trim()) return { ok: false, error: "Say where" };
    const sup = cur.staff.find((x) => x.id === input.supervisorId && x.role === "supervisor");
    if (!sup) return { ok: false, error: "Tag the supervisor responsible" };
    const id = uid("obs");
    const row: SiteObservation = { ...input, id, text: input.text.trim(), location: input.location.trim(), status: "open", raisedBy: cur.currentUserId ?? cur.currentAccountId ?? "safety", raisedAt: new Date().toISOString() };
    setState((s) => {
      const next = { ...s, safetyObservations: [row, ...s.safetyObservations] };
      return { ...next, auditLog: [makeAudit(next, "safety", input.stopWork ? "stop_work" : "observation", `${input.stopWork ? "STOP WORK · " : ""}${input.risk} risk · ${row.location}: ${row.text} → ${sup.name}`, input.plant ?? null), ...s.auditLog] };
    });
    return { ok: true, id };
  }, []);

  // ---- Store equipment register (round 2, §27) ----
  const isStore = (s: AppState) => can(s, "store", "update");
  const addTagged = useCallback((input: { type: EquipmentItem["type"]; tag: string; expiryDate?: string; value?: number }) => {
    const cur = stateRef.current;
    if (!isStore(cur)) return DENIED;
    const tag = input.tag.trim().toUpperCase();
    if (!tag) return { ok: false, error: "Give the tag / serial no." };
    if (cur.equipment.some((e) => e.tag.toUpperCase() === tag)) return { ok: false, error: `Tag ${tag} is already in the register` };
    const siteId = entrySiteId(cur);
    setState((s) => {
      const item: EquipmentItem = { id: uid("eq"), type: input.type, tag, status: "ok", lastCheck: todayDate(), expiryDate: input.expiryDate || undefined, checklist: [], siteId, value: input.value || undefined };
      const next = { ...s, equipment: [...s.equipment, item] };
      return { ...next, auditLog: [makeAudit(next, "store", "create", `Equipment ${tag} (${input.type}) added${input.expiryDate ? ` · expires ${input.expiryDate}` : ""}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const receiveKit = useCallback((input: { item: KitLot["item"]; qty: number; expiryDate?: string; note?: string }) => {
    const cur = stateRef.current;
    if (!isStore(cur)) return DENIED;
    if (!(input.qty > 0) || !Number.isInteger(input.qty)) return { ok: false, error: "Quantity must be a whole number above zero" };
    const siteId = entrySiteId(cur);
    setState((s) => {
      const lot: KitLot = { id: uid("lot"), siteId, item: input.item, qty: input.qty, receivedOn: todayDate(), expiryDate: input.expiryDate || undefined, note: input.note?.trim() || undefined };
      const next = { ...s, kitLots: [...s.kitLots, lot] };
      return { ...next, auditLog: [makeAudit(next, "store", "receive", `${input.qty} × ${input.item} received${input.expiryDate ? ` · expires ${input.expiryDate}` : ""}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const issueTagged = useCallback((equipmentId: string, supervisorId: string) => {
    const cur = stateRef.current;
    if (!isStore(cur)) return DENIED;
    const e = cur.equipment.find((x) => x.id === equipmentId);
    if (!e || e.scrapped) return { ok: false, error: "Item not found" };
    if (e.issuedTo) return { ok: false, error: `${e.tag} is already with ${cur.staff.find((s) => s.id === e.issuedTo)?.name ?? "a supervisor"}` };
    if (e.expiryDate && e.expiryDate < todayDate()) return { ok: false, error: `${e.tag} has expired — it can't be issued` };
    if (e.status === "fault") return { ok: false, error: `${e.tag} is marked faulty` };
    const sup = cur.staff.find((s) => s.id === supervisorId && s.role === "supervisor");
    if (!sup) return { ok: false, error: "Pick the supervisor" };
    setState((s) => {
      const next = { ...s, equipment: s.equipment.map((x) => (x.id === equipmentId ? { ...x, issuedTo: supervisorId, issuedOn: todayDate() } : x)) };
      return { ...next, auditLog: [makeAudit(next, "store", "issue", `${e.tag} issued to ${sup.name}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const issueKit = useCallback((item: KitLot["item"], qty: number, supervisorId: string) => {
    const cur = stateRef.current;
    if (!isStore(cur)) return { ...DENIED };
    if (!(qty > 0) || !Number.isInteger(qty)) return { ok: false, error: "Quantity must be a whole number above zero" };
    const sup = cur.staff.find((s) => s.id === supervisorId && s.role === "supervisor");
    if (!sup) return { ok: false, error: "Pick the supervisor" };
    const siteId = entrySiteId(cur);
    const lots = pickLots(cur.kitLots, siteId, item, qty, todayDate());
    if (!lots) return { ok: false, error: `Only ${inStore(cur.kitLots, siteId, item, todayDate())} in the store (unexpired)` };
    const take = new Map(lots.map((l) => [l.lotId, l.qty]));
    setState((s) => {
      const issue: KitIssue = { id: uid("ki"), siteId, item, qty, supervisorId, lots, issuedOn: todayDate(), issuedBy: s.currentUserId ?? "store" };
      const next = { ...s, kitLots: s.kitLots.map((l) => (take.has(l.id) ? { ...l, qty: l.qty - take.get(l.id)! } : l)), kitIssues: [issue, ...s.kitIssues] };
      return { ...next, auditLog: [makeAudit(next, "store", "issue", `${qty} × ${item} issued to ${sup.name} (oldest expiry first)`), ...s.auditLog] };
    });
    return { ok: true, lots };
  }, []);

  const returnEquipment = useCallback((input: { equipmentId?: string; kitIssueId?: string; qty: number; condition: EquipmentReturn["condition"]; note: string }) => {
    const cur = stateRef.current;
    const me = cur.currentUserId ?? "";
    const isMine = (supId?: string) => supId === me || isStore(cur);
    let siteId = entrySiteId(cur);
    if (input.equipmentId) {
      const e = cur.equipment.find((x) => x.id === input.equipmentId);
      if (!e?.issuedTo) return { ok: false, error: "This item isn't issued" };
      if (!isMine(e.issuedTo)) return { ok: false, error: "Only the supervisor holding it returns it" };
      if (cur.equipmentReturns.some((r) => r.equipmentId === e.id && (r.status === "with_store" || r.status === "with_sic"))) return { ok: false, error: "A return for this item is already waiting" };
      siteId = e.siteId;
    } else if (input.kitIssueId) {
      const k = cur.kitIssues.find((x) => x.id === input.kitIssueId);
      if (!k) return { ok: false, error: "Issue not found" };
      if (!isMine(k.supervisorId)) return { ok: false, error: "Only the supervisor it was issued to returns it" };
      const pending = cur.equipmentReturns.filter((r) => r.kitIssueId === k.id && (r.status === "with_store" || r.status === "with_sic")).reduce((t, r) => t + r.qty, 0);
      if (!(input.qty > 0) || input.qty > k.qty - (k.returned ?? 0) - pending) return { ok: false, error: `Return between 1 and ${k.qty - (k.returned ?? 0) - pending}` };
      siteId = k.siteId;
    } else return { ok: false, error: "Pick what is being returned" };
    if (input.condition !== "ok" && !input.note.trim()) return { ok: false, error: "Say what's wrong with it" };
    const id = uid("ret");
    setState((s) => {
      const r: EquipmentReturn = { id, siteId, equipmentId: input.equipmentId, kitIssueId: input.kitIssueId, qty: input.equipmentId ? 1 : input.qty, condition: input.condition, note: input.note.trim(), by: me, at: new Date().toISOString(), status: "with_store" };
      const next = { ...s, equipmentReturns: [r, ...s.equipmentReturns] };
      return { ...next, auditLog: [makeAudit(next, "store", "return", `Return (${input.condition}) raised${input.note.trim() ? ` · ${input.note.trim()}` : ""}`), ...s.auditLog] };
    });
    return { ok: true, id };
  }, []);

  /** Store confirms (scrapped → SIC next); the SIC confirms a scrap; either may reject with a note */
  const decideReturn = useCallback((id: string, approve: boolean, note: string) => {
    const cur = stateRef.current;
    const r = cur.equipmentReturns.find((x) => x.id === id);
    if (!r) return { ok: false, error: "Return not found" };
    const store = isStore(cur);
    const sic = cur.currentRole === "sic" || cur.currentRole === "owner" || cur.currentRole === "super_admin";
    if (r.status === "with_store" && !store) return { ok: false, error: "The store confirms returns" };
    if (r.status === "with_sic" && !sic) return { ok: false, error: "The SIC confirms a scrap" };
    if (r.status !== "with_store" && r.status !== "with_sic") return { ok: false, error: "Already decided" };
    if (!approve && !note.trim()) return { ok: false, error: "Say why it's rejected" };
    const nextStatus: EquipmentReturn["status"] = !approve ? "rejected" : r.status === "with_store" && r.condition === "scrapped" ? "with_sic" : "done";
    const by = cur.currentUserId ?? "";
    setState((s) => {
      let equipment = s.equipment;
      let kitIssues = s.kitIssues;
      let kitLots = s.kitLots;
      if (nextStatus === "done") {
        if (r.equipmentId) {
          // Back to the store (damaged → faulty, expired stays out of issue by date); scrapped leaves the books
          equipment = equipment.map((e) => (e.id !== r.equipmentId ? e : { ...e, issuedTo: undefined, issuedOn: undefined, ...(r.condition === "damaged" ? { status: "fault" as const, faultNote: r.note } : {}), ...(r.condition === "scrapped" ? { scrapped: true } : {}) }));
        }
        if (r.kitIssueId) {
          const k = kitIssues.find((x) => x.id === r.kitIssueId);
          kitIssues = kitIssues.map((x) => (x.id === r.kitIssueId ? { ...x, returned: (x.returned ?? 0) + r.qty } : x));
          // Good ones go back into a lot with the original expiry
          if (k && r.condition === "ok") kitLots = [...kitLots, { id: uid("lot"), siteId: k.siteId, item: k.item, qty: r.qty, receivedOn: todayDate(), expiryDate: k.lots[0]?.expiryDate, note: "returned" }];
        }
      }
      const equipmentReturns = s.equipmentReturns.map((x) =>
        x.id !== id ? x : { ...x, status: nextStatus, decidedNote: note.trim() || x.decidedNote, ...(r.status === "with_store" ? { storeBy: by } : { sicBy: by }) }
      );
      const next = { ...s, equipment, kitIssues, kitLots, equipmentReturns };
      return { ...next, auditLog: [makeAudit(next, "store", "return_decided", `Return ${r.condition} → ${nextStatus}${note.trim() ? ` · ${note.trim()}` : ""}`), ...s.auditLog] };
    });
    return { ok: true, next: nextStatus };
  }, []);

  // ---- Finance: vendor bills and advances (round 2, §27) ----
  const addVendorBill = useCallback((input: Omit<VendorBill, "id" | "status" | "enteredBy" | "siteId">) => {
    const cur = stateRef.current;
    if (!can(cur, "finance", "create")) return DENIED;
    const vendor = input.vendor.trim();
    const billNo = input.billNo.trim();
    if (!vendor || !billNo) return { ok: false, error: "Vendor and bill no. are needed" };
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be above zero" };
    if (!input.billDate || input.billDate > todayDate()) return { ok: false, error: "Pick the bill date (not in the future)" };
    // The same vendor's bill no. once only (every entry checks for duplicates, §24)
    const dup = cur.vendorBills.find((b) => b.vendor.toLowerCase() === vendor.toLowerCase() && b.billNo.toLowerCase() === billNo.toLowerCase());
    if (dup) return { ok: false, error: `${vendor} bill ${billNo} is already entered (${dup.billDate})` };
    setState((s) => {
      const bill: VendorBill = { ...input, vendor, billNo, id: uid("vb"), siteId: entrySiteId(s), status: "unpaid", enteredBy: s.currentUserId ?? "finance", note: input.note?.trim() || undefined };
      const next = { ...s, vendorBills: [bill, ...s.vendorBills] };
      return { ...next, auditLog: [makeAudit(next, "finance", "create", `Vendor bill ${vendor} ${billNo} ₹${input.amount}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const payVendorBill = useCallback((id: string, paidOn: string, paidMode: string) => {
    const cur = stateRef.current;
    if (!can(cur, "finance", "update")) return DENIED;
    const b = cur.vendorBills.find((x) => x.id === id);
    if (!b) return { ok: false, error: "Bill not found" };
    if (b.status === "paid") return { ok: false, error: "Already paid" };
    if (!paidOn || paidOn > todayDate()) return { ok: false, error: "Pick the date paid (not in the future)" };
    setState((s) => {
      const next = { ...s, vendorBills: s.vendorBills.map((x) => (x.id === id ? { ...x, status: "paid" as const, paidOn, paidMode } : x)) };
      return { ...next, auditLog: [makeAudit(next, "finance", "update", `Vendor bill ${b.vendor} ${b.billNo} paid ${paidOn} (${paidMode})`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const giveAdvance = useCallback((input: { labourerId: string; date: string; amount: number; note?: string }) => {
    const cur = stateRef.current;
    if (!can(cur, "finance", "create")) return DENIED;
    const l = cur.labourers.find((x) => x.id === input.labourerId);
    if (!l) return { ok: false, error: "Pick the labourer" };
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be above zero" };
    if (!input.date || input.date > todayDate()) return { ok: false, error: "Pick the date (not in the future)" };
    setState((s) => {
      const a: AdvanceGiven = { id: uid("adv"), labourerId: l.id, date: input.date, amount: input.amount, note: input.note?.trim() || undefined, givenBy: s.currentUserId ?? "finance" };
      const next = { ...s, advances: [a, ...s.advances] };
      return { ...next, auditLog: [makeAudit(next, "finance", "advance", `Advance ₹${input.amount} to ${l.name} (${l.epNumber})`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  // ---- HR leave register (round 2, §27) ----
  const addLeave = useCallback((input: Omit<LeaveEntry, "id" | "status" | "enteredBy" | "enteredAt">) => {
    const cur = stateRef.current;
    if (!can(cur, "hr", "update")) return DENIED;
    const l = cur.labourers.find((x) => x.id === input.labourerId);
    if (!l) return { ok: false, error: "Pick the labourer" };
    if (!input.from || !input.to || input.to < input.from) return { ok: false, error: "Pick the dates (to ≥ from)" };
    if (!input.reason.trim()) return { ok: false, error: "Give the reason" };
    const clash = cur.leaves.find((x) => x.labourerId === l.id && x.status !== "rejected" && x.from <= input.to && input.from <= x.to);
    if (clash) return { ok: false, error: `${l.name} already has leave ${clash.from} → ${clash.to}` };
    setState((s) => {
      const e: LeaveEntry = { ...input, reason: input.reason.trim(), id: uid("lv"), status: "requested", enteredBy: s.currentUserId ?? "hr", enteredAt: new Date().toISOString() };
      const next = { ...s, leaves: [e, ...s.leaves] };
      return { ...next, auditLog: [makeAudit(next, "hr", "leave", `Leave ${input.kind} for ${l.name} ${input.from} → ${input.to}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const decideLeave = useCallback((id: string, approve: boolean, note: string) => {
    const cur = stateRef.current;
    if (!can(cur, "hr", "update")) return DENIED;
    const e = cur.leaves.find((x) => x.id === id);
    if (!e || e.status !== "requested") return { ok: false, error: "This leave isn't waiting" };
    if (!approve && !note.trim()) return { ok: false, error: "Say why it's rejected" };
    setState((s) => {
      const next = { ...s, leaves: s.leaves.map((x) => (x.id === id ? { ...x, status: approve ? ("approved" as const) : ("rejected" as const), decidedBy: s.currentUserId ?? undefined, decidedNote: note.trim() || undefined } : x)) };
      return { ...next, auditLog: [makeAudit(next, "hr", approve ? "approve" : "reject", `Leave ${e.from} → ${e.to}${note.trim() ? ` · ${note.trim()}` : ""}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  /** Supervisor marks fixed; Safety closes or reopens (round 2, §27) */
  const moveObservation = useCallback((id: string, to: "fixed" | "closed" | "open", note?: string) => {
    const cur = stateRef.current;
    const o = cur.safetyObservations.find((x) => x.id === id);
    if (!o) return { ok: false, error: "Observation not found" };
    const me = cur.currentUserId;
    const safety = can(cur, "safety", "update");
    if (to === "fixed") {
      if (o.status !== "open") return { ok: false, error: "Only an open observation can be marked fixed" };
      if (me !== o.supervisorId && !safety) return { ok: false, error: "The tagged supervisor marks it fixed" };
      if (!note?.trim()) return { ok: false, error: "Say what was done" };
    } else {
      if (!safety) return { ok: false, error: "Only Safety closes or reopens an observation" };
      if (to === "closed" && o.status === "closed") return { ok: false, error: "Already closed" };
      if (to === "open" && o.status === "open") return { ok: false, error: "Already open" };
    }
    setState((s) => {
      const now = new Date().toISOString();
      const next = {
        ...s,
        safetyObservations: s.safetyObservations.map((x) =>
          x.id !== id ? x : to === "fixed" ? { ...x, status: "fixed" as const, fixNote: note!.trim(), fixedAt: now } : to === "closed" ? { ...x, status: "closed" as const, closedBy: s.currentUserId ?? undefined, closedAt: now } : { ...x, status: "open" as const, closedAt: undefined, closedBy: undefined }
        ),
      };
      return { ...next, auditLog: [makeAudit(next, "safety", `observation_${to}`, `${o.location}: ${o.text}${note?.trim() ? ` · ${note.trim()}` : ""}`, o.plant ?? null), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const decideCrew = useCallback((requestId: string, approve: boolean, note: string) => {
    const cur = stateRef.current;
    if (!can(cur, "crew", "approve")) return DENIED;
    const r = cur.crewRequests.find((x) => x.id === requestId);
    if (!r) return { ok: false as const, error: "Request not found" };
    const lab = cur.labourers.find((l) => l.id === r.labourerId);
    if (approve) {
      const block = approveBlock(r, lab);
      if (block) return { ok: false as const, error: block };
    } else if (!note.trim()) {
      return { ok: false as const, error: "Give a reason so the supervisor knows why" };
    }
    setState((s) => {
      const now = new Date().toISOString();
      const next = {
        ...s,
        labourers: approve ? s.labourers.map((l) => (l.id === r.labourerId ? { ...l, supervisorId: r.toSupervisorId } : l)) : s.labourers,
        crewRequests: s.crewRequests.map((x) =>
          x.id === requestId
            ? { ...x, status: (approve ? "approved" : "rejected") as CrewRequest["status"], decidedBy: s.currentUserId ?? undefined, decidedAt: now, ...(note.trim() ? { note: note.trim() } : {}) }
            : x
        ),
      };
      const to = s.staff.find((x) => x.id === r.toSupervisorId)?.name ?? r.toSupervisorId;
      return {
        ...next,
        auditLog: [makeAudit(next, "crew", approve ? "approve" : "reject", `${lab?.name ?? r.labourerId} → ${to}${note.trim() ? ` · ${note.trim()}` : ""}`), ...s.auditLog],
      };
    });
    return { ok: true as const };
  }, []);

  const addLabourer = useCallback(
    (row: Omit<Labourer, "id"> & { id?: string }) => {
      const id = row.id ?? uid("lb");
      const cur = stateRef.current;
      if (!can(cur, "labourer", "create") && !can(cur, "master", "update")) return DENIED;
      const bad = checkLabourer({ ...row, id }, cur.labourers);
      if (bad) return { ok: false, error: bad };
      const clean = { ...row, id, name: row.name.trim(), epNumber: normalizeEp(row.epNumber)! };
      setState((s) => ({
        ...s,
        labourers: [clean, ...s.labourers],
        auditLog: [
          makeAudit(s, "labourer", "create", `Labourer ${clean.name} · ${clean.epNumber}`),
          ...s.auditLog,
        ],
      }));
      return { ok: true, id };
    },
    []
  );

  /**
   * Add many labourers at once (B09 CSV upload), plus any trades the file needs
   * that Master Data doesn't have yet. Rows were checked by checkImport; EPs are
   * checked again here so nothing already used slips in.
   */
  const importLabourers = useCallback((
    rows: Omit<Labourer, "id">[],
    newTrades: { id: string; label: string }[],
    fileName: string,
    updates: { id: string; patch: Partial<Labourer> }[] = []
  ) => {
    const cur = stateRef.current;
    if (!can(cur, "labourer", "create") && !can(cur, "labourer", "upload") && !can(cur, "master", "update")) return { ...DENIED, added: 0, updated: 0 };
    if (!rows.length && !updates.length) return { ok: false, error: "Nothing to add", added: 0, updated: 0 };
    const account = cur.users.find((u) => u.id === cur.currentAccountId);
    const stamp = { by: account?.name || account?.username || "someone", at: new Date().toISOString(), file: fileName };
    const used = new Set(cur.labourers.flatMap((l) => [normalizeEp(l.epNumber), ...(l.epHistory ?? []).map((h) => normalizeEp(h.ep))]).filter(Boolean));
    const clash = rows.find((r) => used.has(normalizeEp(r.epNumber)));
    if (clash) return { ok: false, error: `EP ${clash.epNumber} is already used — check the file again`, added: 0, updated: 0 };
    const made = rows.map((r) => ({ ...r, id: uid("lb"), name: r.name.trim(), epNumber: normalizeEp(r.epNumber)!, upload: stamp }));
    // RIL details refreshed for people already registered (pass dates, status, EIC, area)
    const patchOf = new Map(updates.map((u) => [u.id, u.patch]));
    const trades = newTrades.filter((t) => !cur.tradeCatalogue.some((x) => x.id === t.id));
    setState((s) => {
      const next = {
        ...s,
        labourers: [...made, ...s.labourers.map((l) => (patchOf.has(l.id) ? { ...l, ...patchOf.get(l.id), upload: stamp } : l))],
        tradeCatalogue: [...s.tradeCatalogue, ...trades.map((t) => ({ id: t.id, label: t.label, subcategories: [], active: true, siteId: null }))],
      };
      return {
        ...next,
        auditLog: [
          makeAudit(next, "labourer", "import", `${made.length} labourers added${updates.length ? `, ${updates.length} updated` : ""} from ${fileName}${trades.length ? ` · ${trades.length} new trades` : ""}`),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true, added: made.length, updated: updates.length };
  }, []);

  const upsertContractor = useCallback(async (row: Contractor) => {
    const id = row.id || uid("con");
    if (!can(stateRef.current, "master", "update")) return DENIED;
    const next = { ...row, id };
    const saved = await remoteSaveMaster("contractors", next);
    if (!saved.ok) return saved;
    setState((s) => {
      const exists = s.masterCatalog.contractors.some((c) => c.id === id);
      return {
        ...s,
        masterCatalog: {
          ...s.masterCatalog,
          contractors: exists
            ? s.masterCatalog.contractors.map((c) => (c.id === id ? next : c))
            : [next, ...s.masterCatalog.contractors],
        },
        auditLog: [
          makeAudit(
            s,
            "master",
            exists ? "update" : "create",
            `Contractor ${next.code}`
          ),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true, id };
  }, []);

  const setContractorActive = useCallback(async (id: string, active: boolean) => {
    if (!can(stateRef.current, "master", "update")) return DENIED;
    const row = stateRef.current.masterCatalog.contractors.find((c) => c.id === id);
    if (!row) return { ok: false, error: "Contractor not found" };
    const saved = await remoteSaveMaster("contractors", { ...row, active });
    if (!saved.ok) return saved;
    setState((s) => {
      const next = {
        ...s,
        masterCatalog: {
          ...s.masterCatalog,
          contractors: s.masterCatalog.contractors.map((c) => (c.id === id ? { ...c, active } : c)),
        },
      };
      return { ...next, auditLog: [makeAudit(next, "master", "update", `Contractor ${row.code}: ${active ? "activated" : "deactivated"}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const upsertCatalogItem = useCallback(
    async (
      sheet: keyof Omit<MasterCatalog, "contractors" | "materials">,
      row: CatalogItem
    ) => {
      const id = row.id || uid("cat");
      if (!can(stateRef.current, "master", "update")) return DENIED;
      const next = { ...row, id };
      const saved = await remoteSaveMaster(sheet, next);
      if (!saved.ok) return saved;
      setState((s) => {
        const list = s.masterCatalog[sheet] as CatalogItem[];
        const exists = list.some((r) => r.id === id);
        return {
          ...s,
          masterCatalog: {
            ...s.masterCatalog,
            [sheet]: exists
              ? list.map((r) => (r.id === id ? next : r))
              : [next, ...list],
          },
          auditLog: [
            makeAudit(
              s,
              "master",
              exists ? "update" : "create",
              `${sheet} ${next.code}`
            ),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true, id };
    },
    []
  );

  const upsertMaterial = useCallback(async (row: MaterialItem) => {
    const id = row.id || uid("mat");
    if (!can(stateRef.current, "master", "update")) return DENIED;
    const next = { ...row, id };
    const saved = await remoteSaveMaster("materials", next);
    if (!saved.ok) return saved;
    setState((s) => {
      const exists = s.masterCatalog.materials.some((m) => m.id === id);
      return {
        ...s,
        masterCatalog: {
          ...s.masterCatalog,
          materials: exists
            ? s.masterCatalog.materials.map((m) => (m.id === id ? next : m))
            : [next, ...s.masterCatalog.materials],
        },
        auditLog: [
          makeAudit(
            s,
            "master",
            exists ? "update" : "create",
            `Material ${next.code}`
          ),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true, id };
  }, []);

  const setCatalogActive = useCallback(
    async (sheet: keyof MasterCatalog, id: string, active: boolean) => {
      if (!can(stateRef.current, "master", "update")) return DENIED;
      const row = (
        stateRef.current.masterCatalog[sheet] as (CatalogItem | Contractor | MaterialItem)[]
      ).find((r) => r.id === id);
      if (!row) return { ok: false, error: "Row not found" };
      const saved = await remoteSaveMaster(sheet, { ...row, active });
      if (!saved.ok) return saved;
      setState((s) => {
        const list = s.masterCatalog[sheet] as { id: string; active: boolean }[];
        const next = {
          ...s,
          masterCatalog: {
            ...s.masterCatalog,
            [sheet]: list.map((r) => (r.id === id ? { ...r, active } : r)),
          },
        };
        return { ...next, auditLog: [makeAudit(next, "master", "update", `${sheet} ${row.code}: ${active ? "activated" : "deactivated"}`), ...s.auditLog] };
      });
      return { ok: true };
    },
    []
  );

  const upsertSite = useCallback(async (input: AppState["sites"][number]) => {
    if (!can(stateRef.current, "master", "update")) return DENIED;
    const site = { ...input, code: input.code.trim().toUpperCase(), name: input.name.trim(), plants: input.plants.map((p) => p.trim()).filter(Boolean) };
    const bad = checkSite(site, stateRef.current.sites) ?? checkPlantRps(site.rpTags, site.plantDetails ?? []);
    if (bad) return { ok: false, error: bad };
    const saved = await remoteSaveSite(site);
    if (!saved.ok) return saved;
    setState((s) => {
      const exists = s.sites.some((x) => x.id === site.id);
      return {
        ...s,
        sites: exists
          ? s.sites.map((x) => (x.id === site.id ? site : x))
          : [...s.sites, site],
        auditLog: [
          makeAudit(s, "master", exists ? "update" : "create", `Site ${site.code}${site.enabled ? "" : " (switched off)"}`),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true };
  }, []);

  const addStaff = useCallback((input: Omit<StaffMember, "id">) => {
    const cur = stateRef.current;
    // Round 2 (§27): HR keeps staff records too
    if (!can(cur, "users", "create") && !can(cur, "master", "update") && !can(cur, "hr", "update")) return "";
    const id = uid("st");
    setState((s) => {
      const next = { ...s, staff: [...s.staff, { ...input, id }] };
      return {
        ...next,
        auditLog: [
          makeAudit(next, "users", "create", `Staff record ${input.name} (${input.role}) · ${input.siteId}`),
          ...s.auditLog,
        ],
      };
    });
    return id;
  }, []);

  const updateStaff = useCallback((id: string, patch: Partial<Omit<StaffMember, "id">>) => {
    const cur = stateRef.current;
    if (!can(cur, "users", "update") && !can(cur, "master", "update") && !can(cur, "hr", "update")) return DENIED;
    const before = cur.staff.find((x) => x.id === id);
    if (!before) return { ok: false, error: "Staff record not found" };
    setState((s) => {
      const next = { ...s, staff: s.staff.map((x) => (x.id === id ? { ...x, ...patch } : x)) };
      const what = patch.active !== undefined && Object.keys(patch).length === 1 ? (patch.active ? "activated" : "deactivated") : "edited";
      return { ...next, auditLog: [makeAudit(next, "users", "update", `Staff record ${before.name} ${what}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  /** docs §24: monthly pay upload — add new lines, change lines whose amount differs; Admin / HR */
  const importPay = useCallback((rows: { labourerId: string; month: string; lines: { kind: WageLedgerEntry["kind"]; amount: number; state: "new" | "changed" | "same"; existingId?: string }[] }[], fileName: string) => {
    const cur = stateRef.current;
    if (!can(cur, "labourer", "upload")) return { ...DENIED, added: 0, changed: 0 };
    const account = cur.users.find((u) => u.id === cur.currentAccountId);
    const stamp = { by: account?.name || account?.username || "someone", at: new Date().toISOString(), file: fileName };
    const adds: WageLedgerEntry[] = [];
    const changes = new Map<string, number>();
    for (const r of rows) {
      const lab = cur.labourers.find((l) => l.id === r.labourerId);
      for (const x of r.lines) {
        if (x.state === "new") adds.push({ id: uid("wl"), labourerId: r.labourerId, date: `${r.month}-01`, kind: x.kind, amount: x.amount, note: `Pay upload ${r.month}`, siteId: lab?.siteId, upload: stamp });
        else if (x.state === "changed" && x.existingId) changes.set(x.existingId, x.amount);
      }
    }
    if (!adds.length && !changes.size) return { ok: false, error: "Nothing new — every line is already uploaded", added: 0, changed: 0 };
    setState((s) => {
      const next = {
        ...s,
        wageLedger: [...adds, ...s.wageLedger.map((w) => (changes.has(w.id) ? { ...w, amount: changes.get(w.id)!, upload: stamp, note: `${w.note} · changed by pay upload` } : w))],
      };
      return { ...next, auditLog: [makeAudit(next, "labourer", "pay_upload", `${adds.length} pay lines added, ${changes.size} changed from ${fileName}`), ...s.auditLog] };
    });
    return { ok: true, added: adds.length, changed: changes.size };
  }, []);

  const addWageEntry = useCallback((entry: Omit<WageLedgerEntry, "id">) => {
    setState((s) => {
      if (!can(s, "finance", "create") || !(entry.amount > 0)) return s;
      const full: WageLedgerEntry = { ...entry, id: uid("wg") };
      let financeAlerts = s.financeAlerts;
      if (entry.flaggedToSic) {
        financeAlerts = [
          {
            id: uid("fa"),
            createdAt: new Date().toISOString(),
            kind: "wage_anomaly",
            title: "Wage / advance anomaly",
            detail: `${entry.kind} ₹${entry.amount} — ${entry.note}`,
            acknowledged: false,
            flaggedToSic: true,
          },
          ...financeAlerts,
        ];
      }
      return {
        ...s,
        wageLedger: [full, ...s.wageLedger],
        financeAlerts,
      };
    });
  }, []);

  const acknowledgeFinanceAlert = useCallback((id: string) => {
    setState((s) => !can(s, "finance", "update") ? s : ({
      ...s,
      financeAlerts: s.financeAlerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
    }));
  }, []);

  const flagFinanceAlertToSic = useCallback((id: string) => {
    setState((s) => !can(s, "finance", "update") ? s : ({
      ...s,
      financeAlerts: s.financeAlerts.map((a) =>
        a.id === id ? { ...a, flaggedToSic: true } : a
      ),
    }));
  }, []);

  const createUserLocal = useCallback((input: Omit<UserAccount, "id">) => {
    let result: { ok: boolean; error?: string; id?: string } = { ok: true };
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      if (s.currentRole !== "super_admin" && s.currentRole !== "owner") {
        result = { ok: false, error: "Only Owner or Super Admin can create users" };
        return s;
      }
      const invalid = checkSeat(input, s.users) ?? checkUserChange({ role: s.currentRole, accountId: s.currentAccountId }, s.users, null, input);
      if (invalid) {
        result = { ok: false, error: invalid };
        return s;
      }
      if (!input.roles.length) {
        result = { ok: false, error: "Assign at least one role" };
        return s;
      }
      const id = uid("usr");
      const user: UserAccount = { ...input, id };
      result = { ok: true, id };
      const next = { ...s, users: [user, ...s.users] };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "users",
            "create",
            `Created ${user.username} · roles [${user.roles.join(", ")}]`
          ),
          ...s.auditLog,
        ],
      };
    };
    step(stateRef.current);
    setState(step);
    return result;
  }, []);

  const updateUserLocal = useCallback((id: string, patch: Partial<UserAccount>) => {
    let result: { ok: boolean; error?: string } = { ok: true };
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      if (s.currentRole !== "super_admin" && s.currentRole !== "owner") {
        result = { ok: false, error: "Only Owner or Super Admin can edit users" };
        return s;
      }
      const existing = s.users.find((u) => u.id === id);
      if (!existing) {
        result = { ok: false, error: "User not found" };
        return s;
      }
      const guard = checkUserChange({ role: s.currentRole, accountId: s.currentAccountId }, s.users, existing, {
        roles: patch.roles ?? existing.roles,
        active: patch.active ?? existing.active,
      });
      if (guard) {
        result = { ok: false, error: guard };
        return s;
      }
      if (patch.password !== undefined && patch.password.length < MIN_PASSWORD) {
        result = { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` };
        return s;
      }
      if (patch.siteIds || patch.roles) {
        const bad = checkSites(patch.roles ?? existing.roles, patch.siteIds ?? existing.siteIds);
        if (bad) {
          result = { ok: false, error: bad };
          return s;
        }
      }
      if (
        patch.username &&
        s.users.some(
          (u) =>
            u.id !== id &&
            u.username.toLowerCase() === patch.username!.toLowerCase()
        )
      ) {
        result = { ok: false, error: "Username already exists" };
        return s;
      }
      const users = s.users.map((u) => (u.id === id ? { ...u, ...patch, id } : u));
      const next = { ...s, users };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "users",
            "update",
            patch.password !== undefined
              ? `Password reset for ${existing.username}`
              : `Updated ${existing.username}: ${describeChanges(existing, patch, ["password"]) || Object.keys(patch).join(", ")}`
          ),
          ...s.auditLog,
        ],
      };
    };
    step(stateRef.current);
    setState(step);
    return result;
  }, []);

  /** Real user management via the admin-users edge function when Supabase is on. */
  const createUser = useCallback(
    async (input: Omit<UserAccount, "id">) => {
      if (!supabase) return createUserLocal(input);
      const cur = stateRef.current;
      const guard = checkUserChange({ role: cur.currentRole, accountId: cur.currentAccountId }, cur.users, null, input);
      if (guard) return { ok: false, error: guard };
      const r = await remoteCreateUser(input);
      if (!r.ok) return { ok: false, error: r.error };
      const account = r.account;
      setState((s) => {
        const next = { ...s, users: [account, ...s.users.filter((u) => u.id !== account.id)] };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "users",
              "create",
              `Created ${account.username} · roles [${account.roles.join(", ")}]`
            ),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true, id: account.id };
    },
    [createUserLocal]
  );

  const updateUser = useCallback(
    async (id: string, patch: Partial<UserAccount>) => {
      if (!supabase) return updateUserLocal(id, patch);
      if (patch.username !== undefined) {
        return { ok: false, error: "Usernames cannot be changed once created" };
      }
      const cur = stateRef.current;
      const existing = cur.users.find((u) => u.id === id);
      if (!existing) return { ok: false, error: "User not found" };
      const guard = checkUserChange({ role: cur.currentRole, accountId: cur.currentAccountId }, cur.users, existing, {
        roles: patch.roles ?? existing.roles,
        active: patch.active ?? existing.active,
      });
      if (guard) return { ok: false, error: guard };
      const r = await remoteUpdateUser(id, patch);
      if (!r.ok) return { ok: false, error: r.error };
      return updateUserLocal(id, patch);
    },
    [updateUserLocal]
  );

  const setUserPassword = useCallback(async (id: string, password: string) => {
    if (password.length < MIN_PASSWORD) return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters` };
    // Demo mode: change the local login (same checks as any other user edit)
    if (!supabase) return updateUserLocal(id, { password });
    const cur = stateRef.current;
    const target = cur.users.find((u) => u.id === id);
    const guard = target ? checkUserChange({ role: cur.currentRole, accountId: cur.currentAccountId }, cur.users, target, target) : "User not found";
    if (guard) return { ok: false, error: guard };
    const r = await remoteSetPassword(id, password);
    if (!r.ok) return { ok: false, error: r.error };
    setState((s) => {
      const target = s.users.find((u) => u.id === id);
      return {
        ...s,
        auditLog: [
          makeAudit(s, "users", "set_password", `Password reset for ${target?.username ?? id}`),
          ...s.auditLog,
        ],
      };
    });
    return { ok: true };
  }, [updateUserLocal]);

  const createEquipmentRequest = useCallback(
    (
      input: Omit<
        EquipmentRequest,
        "id" | "createdAt" | "updatedAt" | "status" | "createdBy"
      > & { status?: EquipmentRequestStatus }
    ) => {
      const id = uid("er");
      const now = new Date().toISOString();
      setState((s) => {
        if (!can(s, "requests", "create")) return s;
        const req: EquipmentRequest = {
          ...input,
          id,
          createdAt: now,
          updatedAt: now,
          createdBy: s.currentUserId ?? s.currentAccountId ?? "unknown",
          status: input.status ?? "open",
        };
        const next = {
          ...s,
          equipmentRequests: [req, ...s.equipmentRequests],
        };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "requests",
              "create",
              `${req.kind}: ${req.description}`,
              req.plant
            ),
            ...s.auditLog,
          ],
        };
      });
      return id;
    },
    []
  );

  const actOnRequest = useCallback((id: string, action: RequestAction, note?: string) => {
    const cur = stateRef.current;
    const r = cur.equipmentRequests.find((x) => x.id === id);
    if (!r) return { ok: false, error: "Request not found" };
    const why = note?.trim();
    const mine = r.createdBy === (cur.currentUserId ?? cur.currentAccountId);
    // Who may do what, from which status (docs §9, changed by §24: requests go straight to the
    // store with the SIC told; the store may reject, and the SIC may override a rejection)
    const store = can(cur, "requests", "update");
    const sic = can(cur, "requests", "approve");
    const rules: Record<RequestAction, { from: EquipmentRequestStatus[]; to: EquipmentRequestStatus; allowed: boolean; needsNote?: boolean }> = {
      approve: { from: ["open"], to: "sic_approved", allowed: sic },
      start: { from: ["open", "sic_approved"], to: "fulfilling", allowed: store },
      fulfil: { from: ["open", "sic_approved", "fulfilling"], to: "fulfilled", allowed: store },
      part_fill: { from: ["open", "sic_approved", "fulfilling"], to: "part_filled", allowed: store, needsNote: true },
      reject: { from: ["open", "fulfilling"], to: "rejected", allowed: store, needsNote: true },
      override: { from: ["rejected"], to: "sic_approved", allowed: sic },
      cancel: { from: ["open", "sic_approved", "fulfilling", "rejected"], to: "cancelled", allowed: sic || store || mine, needsNote: true },
      receive: { from: ["fulfilled", "part_filled"], to: "received", allowed: mine || cur.currentRole === "super_admin" },
    };
    const rule = rules[action];
    if (!rule.allowed) return { ok: false, error: action === "receive" ? "Only the person who raised it confirms it was received" : "Your role can't do this" };
    if (!rule.from.includes(r.status)) return { ok: false, error: `Can't ${action.replace("_", " ")} a request that is ${r.status.replace("_", " ")}` };
    if (rule.needsNote && !why) return { ok: false, error: "Give a note (what was short, or why it's cancelled)" };
    setState((s) => {
      const now = new Date().toISOString();
      const by = s.currentUserId ?? s.currentAccountId ?? undefined;
      const equipmentRequests = s.equipmentRequests.map((x) => {
        if (x.id !== id) return x;
        const next: EquipmentRequest = { ...x, status: rule.to, updatedAt: now };
        if (action === "approve") Object.assign(next, { approvedBy: by, approvedAt: now });
        if (action === "fulfil" || action === "part_fill") Object.assign(next, { fulfilledBy: by, fulfilledAt: now, fulfillNote: why || "Issued from store" });
        if (action === "part_fill" || action === "cancel") next.cancelNote = why;
        if (action === "receive") next.receivedAt = now;
        if (action === "reject") Object.assign(next, { rejectedBy: by, rejectedAt: now, rejectNote: why });
        if (action === "override") Object.assign(next, { overriddenBy: by, overriddenAt: now, overrideNote: why || undefined });
        return next;
      });
      const next = { ...s, equipmentRequests };
      return { ...next, auditLog: [makeAudit(next, "requests", action === "approve" ? "approve" : "update", `${r.description} · ${r.status} → ${rule.to}${why ? ` · ${why}` : ""}`, r.plant), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const importOpsExcel = useCallback((kind: OpsTransferId, rows: TransferPreviewRow[]) => {
    const cur = stateRef.current;
    if (!canExcelTransfer(cur.currentRole)) return { ok: false, error: "Only Owner / Super Admin can upload Excel" };
    const spec = opsTransferSpec(kind);
    if (!spec) return { ok: false, error: "Unknown sheet" };
    return spec.apply(rows, { state: cur, setState });
  }, []);

  const setEquipmentStatus = useCallback((id: string, status: "ok" | "due" | "fault", note?: string) => {
    const cur = stateRef.current;
    const eq = cur.equipment.find((e) => e.id === id);
    if (!eq) return { ok: false, error: "Equipment not found" };
    const role = cur.currentRole;
    // docs §7: a supervisor flags a fault; the store repairs and changes the status back
    if (status === "fault" && role !== "supervisor" && role !== "store" && role !== "super_admin" && role !== "owner") return { ok: false, error: "Supervisors (or the store) report faults" };
    if (status !== "fault" && role !== "store" && role !== "super_admin" && role !== "owner") return { ok: false, error: "Only the store marks kit repaired" };
    if (status === "fault" && !note?.trim()) return { ok: false, error: "Say what's wrong with it" };
    setState((s) => {
      const equipment = s.equipment.map((e) => (e.id === id ? { ...e, status, faultNote: status === "fault" ? note!.trim() : undefined, lastCheck: todayDate() } : e));
      const next = { ...s, equipment };
      return { ...next, auditLog: [makeAudit(next, "store", "update", `${eq.tag}: ${eq.status} → ${status}${note?.trim() ? ` · ${note.trim()}` : ""}`), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const updateEquipmentRequest = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<
          EquipmentRequest,
          "status" | "fulfillNote" | "qty" | "description" | "urgent"
        >
      >
    ) => {
      setState((s) => {
        if (!can(s, "requests", "update") && !can(s, "requests", "approve")) return s;
        const existing = s.equipmentRequests.find((r) => r.id === id);
        if (!existing) return s;
        const now = new Date().toISOString();
        const equipmentRequests = s.equipmentRequests.map((r) => {
          if (r.id !== id) return r;
          const next = { ...r, ...patch, updatedAt: now };
          if (patch.status === "fulfilled") {
            next.fulfilledBy = s.currentUserId ?? undefined;
            next.fulfilledAt = now;
          }
          return next;
        });
        const next = { ...s, equipmentRequests };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "requests",
              patch.status === "fulfilled" ? "approve" : "update",
              `${id} · ${patch.status ?? "edit"}`,
              existing.plant
            ),
            ...s.auditLog,
          ],
        };
      });
    },
    []
  );

  const applyTelegram = useCallback(
    (input: {
      role: RoleId;
      messageType: MessageType;
      content: string;
      mappedEntity: DraftEntityKind;
    }): TelegramDraft => {
      const draft: TelegramDraft = {
        id: uid("tg"),
        createdAt: new Date().toISOString(),
        role: input.role,
        messageType: input.messageType,
        content: input.content,
        mappedEntity: input.mappedEntity,
        status: "applied",
      };

      setState((s) => {
        if (!can(s, "telegram", "create")) return s;
        let next = { ...s, telegramDrafts: [draft, ...s.telegramDrafts] };
        const today = todayDate();

        if (input.mappedEntity === "attendance") {
          // Mark only the labourer the message names (EP or name); otherwise leave it for review
          const text = input.content.toUpperCase();
          const labourer = next.labourers.find(
            (l) => (l.epNumber && text.includes(l.epNumber.toUpperCase())) || text.includes(l.name.toUpperCase())
          );
          if (!labourer) draft.status = "needs_review";
          if (labourer) {
            const record: AttendanceRecord = {
              id: uid("att"),
              date: today,
              labourerId: labourer.id,
              status: "present",
              inTime: "08:00",
              note: `Via Telegram (${input.messageType}): ${input.content.slice(0, 80)}`,
              markedBy: `telegram:${input.role}`,
              siteId: entrySiteId(next),
            };
            draft.entityId = record.id;
            next = { ...next, attendance: [record, ...next.attendance] };
          }
        }

        // dpr_note: the Telegram page adds it to today's Work report (telegramToReport)

        if (input.mappedEntity === "expense") {
          // Costs need the docs §8 fields: Finance completes it in Work → P&L from this draft
          draft.status = "needs_review";
        }

        // stock_receipt: the Telegram page adds the receipt to Work paint (receivePaint)

        if (input.mappedEntity === "safety_obs") {
          const day = next.safetyDays[0];
          if (day) {
            next = {
              ...next,
              safetyDays: next.safetyDays.map((d) =>
                d.id === day.id
                  ? {
                      ...d,
                      observations: `${d.observations}\n[TG] ${input.content}`,
                      photoMock:
                        input.messageType === "image"
                          ? `mock://telegram/${draft.id}.jpg`
                          : d.photoMock,
                    }
                  : d
              ),
            };
            draft.entityId = day.id;
          }
          // The Telegram page also adds it to today's safety report in Work
        }

        return {
          ...next,
          telegramDrafts: next.telegramDrafts.map((t) =>
            t.id === draft.id ? { ...draft } : t
          ),
        };
      });

      return draft;
    },
    []
  );

  const currentAccount = useMemo(
    () => state.users.find((u) => u.id === state.currentAccountId) ?? null,
    [state.users, state.currentAccountId]
  );

  const scopedState = useMemo(() => scopeState(state), [state]);

  const api = useMemo<StoreApi>(
    () => ({
      state: scopedState,
      fullState: state,
      hydrated,
      currentAccount,
      labourerSync,
      login,
      switchRole,
      logout,
      resetSeed,
      markAttendance,
      toggleSafetyItem,
      signSafetyDay,
      applyTelegram,
      setEquipmentStatus,
      actOnRequest,
      applyDprAttendance,
      clearDprAttendance,
      raiseRequestsFromDpr,
      openSafetyDay,
      uploadAcplText,
      runAcplMatch,
      resolveAcplFlag,
      updateRateCard,
      switchSite,
      setEntrySite,
      upsertRateLine,
      updateTrade,
      addTrade,
      upsertWageBand,
      setWageBandActive,
      updateLabourer,
      addLabourer,
      importLabourers,
      importPay,
      removeLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
      assignCrew,
      removeFromCrew,
      requestCrew,
      releaseCrew,
      decideCrew,
      raiseObservation,
      moveObservation,
      addTagged,
      receiveKit,
      issueTagged,
      issueKit,
      returnEquipment,
      decideReturn,
      addVendorBill,
      payVendorBill,
      giveAdvance,
      addLeave,
      decideLeave,
      addStaff,
      updateStaff,
      addWageEntry,
      acknowledgeFinanceAlert,
      flagFinanceAlertToSic,
      createUser,
      updateUser,
      setUserPassword,
      startImpersonation,
      endImpersonation,
      importOpsExcel,
      createEquipmentRequest,
      updateEquipmentRequest,
    }),
    [
      labourerSync,
      state,
      scopedState,
      hydrated,
      currentAccount,
      login,
      switchRole,
      logout,
      resetSeed,
      markAttendance,
      toggleSafetyItem,
      signSafetyDay,
      applyTelegram,
      setEquipmentStatus,
      actOnRequest,
      applyDprAttendance,
      clearDprAttendance,
      raiseRequestsFromDpr,
      openSafetyDay,
      uploadAcplText,
      runAcplMatch,
      resolveAcplFlag,
      updateRateCard,
      switchSite,
      setEntrySite,
      upsertRateLine,
      updateTrade,
      addTrade,
      upsertWageBand,
      setWageBandActive,
      updateLabourer,
      addLabourer,
      importLabourers,
      importPay,
      removeLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
      assignCrew,
      removeFromCrew,
      requestCrew,
      releaseCrew,
      decideCrew,
      raiseObservation,
      moveObservation,
      addTagged,
      receiveKit,
      issueTagged,
      issueKit,
      returnEquipment,
      decideReturn,
      addVendorBill,
      payVendorBill,
      giveAdvance,
      addLeave,
      decideLeave,
      addStaff,
      updateStaff,
      addWageEntry,
      acknowledgeFinanceAlert,
      flagFinanceAlertToSic,
      createUser,
      updateUser,
      setUserPassword,
      startImpersonation,
      endImpersonation,
      importOpsExcel,
      createEquipmentRequest,
      updateEquipmentRequest,
    ]
  );

  return (
    <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
