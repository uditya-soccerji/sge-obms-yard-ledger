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
import { dprCrew, validateDprForSubmit } from "./dpr-validate";
import { approveBlock, checkCrewRequest } from "./crew";
import { reviewedAsFor, reviewLine, siteSicId } from "./dpr-review";
import { checkExpiry, kindDef, nextTag } from "./equipment";
import { scoreFromMatchRatio } from "./estimate";
import { effectivePermission } from "./permissions";
import { PAINT_STAGE_ORDER } from "./paint-lifecycle";
import { resolveActivityRate, withSupersession } from "./rate-book";
import { roleMeta } from "./roles";
import { migrateLegacySafetyBody, SAFETY_CHECKLIST_SEED } from "./safety-dpr";
import { seedMasterCatalog } from "./master/seed-catalog";
import { supabase } from "./supabase/client";
import {
  remoteAudit,
  remoteCreateUser,
  remoteLoadMaster,
  remoteLogin,
  remoteLogout,
  remoteSaveMaster,
  remoteSaveSite,
  remoteSetPassword,
  remoteUpdateUser,
} from "./supabase/remote";
import type { CatalogItem, Contractor, MasterCatalog, MaterialItem } from "./master/types";
import { createSeedState, STORAGE_KEY } from "./seed";
import { ALL_SITES, canSeeAllSites, canSwitchSites, entrySiteId, scopeState } from "./site-scope";
import { daysAgo } from "./today";
import { WORKING } from "./attendance";
import { checkSeat, checkSites } from "./users";
import type {
  AcplMatchRow,
  CrewRequest,
  EquipmentItem,
  EquipmentKind,
  AcplPunchRow,
  AcplResolveStatus,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  AuditEntry,
  DraftEntityKind,
  DprDocument,
  DprStatus,
  EquipmentRequest,
  EquipmentRequestStatus,
  FinanceAlert,
  FinanceEntry,
  JmsLine,
  JmsPackage,
  Labourer,
  MessageType,
  ModuleId,
  PaintStockLine,
  PermissionAction,
  StaffMember,
  RateCard,
  RateLine,
  RoleId,
  TelegramDraft,
  TradeDefinition,
  UserAccount,
  WageLedgerEntry,
  WorkRating,
} from "./types";

interface StoreApi {
  /** What screens read: cut to the active site (see scopeState). */
  state: AppState;
  /** Every site, unfiltered — Master Data and the audit log. */
  fullState: AppState;
  hydrated: boolean;
  currentAccount: UserAccount | null;
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
  addFinance: (
    entry: Omit<FinanceEntry, "id" | "siteId" | "enteredBy"> & { siteId?: string }
  ) => void;
  toggleSafetyItem: (dayId: string, itemId: number) => void;
  signSafetyDay: (dayId: string) => void;
  applyTelegram: (input: {
    role: RoleId;
    messageType: MessageType;
    content: string;
    mappedEntity: DraftEntityKind;
  }) => TelegramDraft;
  advancePaintStage: (lineId: string) => void;
  updatePaintLine: (
    lineId: string,
    patch: Partial<
      Pick<
        PaintStockLine,
        | "movement941"
        | "movement942"
        | "movement261"
        | "rilPosted"
        | "sgeUsed"
        | "qtyLitres"
        | "issuedTo"
      >
    >
  ) => void;
  saveDpr: (doc: DprDocument) => { ok: boolean; error?: string };
  submitDpr: (id: string) => void;
  reviewDpr: (id: string, decision: "sic_approved" | "sic_rejected", note: string) => { ok: boolean; error?: string };
  /** Owner / Super Admin reopen an approved DPR for editing, with a logged reason */
  unlockDpr: (id: string, reason: string) => { ok: boolean; error?: string };
  /** Today's safety checklist for a site, created from the F/HSE/008 list when missing */
  openSafetyDay: (siteId: string) => void;
  uploadAcplText: (text: string, date: string, source: "upload" | "paste") => number;
  runAcplMatch: (date: string) => number;
  resolveAcplFlag: (
    id: string,
    status: AcplResolveStatus,
    note?: string,
    opts?: { sicOverride?: boolean }
  ) => { ok: boolean; error?: string };
  uploadJmsPackage: (pkg: Omit<JmsPackage, "id" | "financeNotified" | "expectedIncome" | "paymentReceived"> & { lines: JmsLine[] }) => string;
  reviewJmsPackage: (id: string, decision: "sic_approved" | "sic_rejected", note: string) => void;
  matchJmsLines: (packageId: string) => void;
  computeRatings: (packageId: string) => { ok: boolean; error?: string };
  /** received=true records the payment (amount defaults to expected income); false flags it as due to SIC */
  markJmsPayment: (
    packageId: string,
    received: boolean,
    opts?: { amount?: number; note?: string }
  ) => { ok: boolean; error?: string };
  updateRateCard: (id: string, patch: Partial<RateCard>) => void;
  /** siteId may be ALL_SITES ("all") for Owner / Super Admin. */
  switchSite: (siteId: string) => { ok: boolean; error?: string };
  /** In All sites: which site new records are written to. */
  setEntrySite: (siteId: string) => void;
  upsertRateLine: (
    input: Omit<RateLine, "id" | "superseded"> & { id?: string; superseded?: boolean }
  ) => string;
  updateTrade: (id: string, patch: Partial<TradeDefinition>) => void;
  /** Equipment setups (docs §7, B05) */
  issueEquipment: (input: { kind: EquipmentKind; supervisorId: string; qty: number; expiryDate?: string }) => { ok: boolean; error?: string; tags: string[] };
  assignEquipment: (itemId: string, supervisorId: string) => { ok: boolean; error?: string };
  setEquipmentExpiry: (itemId: string, date: string) => { ok: boolean; error?: string; change?: string };
  /** Crews (docs §20) */
  assignCrew: (
    labourerIds: string[],
    supervisorId: string
  ) => { ok: boolean; error?: string; moved: { labourerId: string; name: string; fromSupervisorId: string | null }[] };
  removeFromCrew: (labourerId: string) => { ok: boolean; error?: string };
  requestCrew: (labourerIds: string[], note?: string) => { ok: boolean; error?: string; created: CrewRequest[] };
  releaseCrew: (requestId: string) => { ok: boolean; error?: string };
  decideCrew: (requestId: string, approve: boolean, note: string) => { ok: boolean; error?: string };
  addTrade: (input: Omit<TradeDefinition, "id"> & { id?: string }) => string;
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
      >
    >
  ) => void;
  upsertContractor: (row: Contractor) => string;
  setContractorActive: (id: string, active: boolean) => void;
  upsertCatalogItem: (
    sheet: keyof Omit<MasterCatalog, "contractors" | "materials">,
    row: CatalogItem
  ) => string;
  upsertMaterial: (row: MaterialItem) => string;
  setCatalogActive: (
    sheet: keyof MasterCatalog,
    id: string,
    active: boolean
  ) => void;
  /** Resolves to an error message, or null when saved */
  upsertSite: (site: AppState["sites"][number]) => Promise<string | null>;
  /** New staff record (to link a login to); returns its id, or "" if not allowed */
  addStaff: (input: Omit<StaffMember, "id">) => string;
  addLabourer: (row: Omit<Labourer, "id"> & { id?: string }) => string;
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
  return effectivePermission(account, s.currentRole, module, action);
}

const DENIED = { ok: false as const, error: "Your role can't do this" };

function migratePaintStock(
  lines: PaintStockLine[] | undefined,
  seedLines: PaintStockLine[]
): PaintStockLine[] {
  if (!lines || lines.length === 0) return seedLines;
  return lines.map((line) => {
    const stage = PAINT_STAGE_ORDER.includes(line.stage)
      ? line.stage
      : "reco";
    return {
      ...line,
      stage,
      movement941: line.movement941,
      movement942: line.movement942,
      movement261: line.movement261,
    };
  });
}

function migrateState(parsed: Partial<AppState>): AppState {
  const seed = createSeedState();
  const users =
    parsed.users && parsed.users.length > 0 ? parsed.users : seed.users;
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
    attendance: (parsed.attendance ?? seed.attendance).map((a) =>
      (a.status as string) === "off" ? { ...a, status: "weekly_off" as const } : a
    ),
    dprDocuments: (parsed.dprDocuments ?? seed.dprDocuments).map((d) =>
      d.submitterType === "safety" && d.safetyBody
        ? {
            ...d,
            safetyBody: migrateLegacySafetyBody(d.safetyBody),
          }
        : d
    ),
    acplPunches: parsed.acplPunches ?? seed.acplPunches,
    acplMatches: parsed.acplMatches ?? seed.acplMatches,
    jmsPackages: parsed.jmsPackages ?? seed.jmsPackages,
    workRatings: parsed.workRatings ?? seed.workRatings,
    rateCards: parsed.rateCards ?? seed.rateCards,
    rateLines:
      parsed.rateLines && parsed.rateLines.length > 0
        ? parsed.rateLines
        : seed.rateLines,
    tradeCatalogue:
      parsed.tradeCatalogue && parsed.tradeCatalogue.length > 0
        ? parsed.tradeCatalogue.map((t) => ({ ...t, siteId: t.siteId ?? null }))
        : seed.tradeCatalogue,
    masterCatalog: parsed.masterCatalog?.dprTypes?.length
      ? {
          ...seedMasterCatalog(),
          ...parsed.masterCatalog,
        }
      : seed.masterCatalog,
    labourers: (parsed.labourers ?? seed.labourers).map((l) => ({
      ...l,
      contractorId: l.contractorId ?? "con-sge",
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
    paintStock: migratePaintStock(parsed.paintStock, seed.paintStock),
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
      /* keep seed */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

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
          const siteId = recovered.siteIds[0] ?? fresh.currentSiteId;
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
    const siteId = canSeeAllSites(role) ? ALL_SITES : account.siteIds[0] ?? s.currentSiteId;
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
      const siteId = me.siteIds[0] ?? s.currentSiteId;
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
      setState({ ...next, auditLog: [entry, ...s.auditLog] });
      void remoteAudit({
        userId: me.id,
        username: me.username,
        role,
        siteId,
        module: "users",
        action: "login",
        detail: entry.detail,
      });
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
          s.currentSiteId === ALL_SITES && !canSeeAllSites(role)
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
      const siteId = target.siteIds[0] ?? s.currentSiteId;
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

  const addFinance = useCallback(
    (entry: Omit<FinanceEntry, "id" | "siteId" | "enteredBy"> & { siteId?: string }) => {
      setState((s) => !can(s, "finance", "create") || !(entry.amount > 0) ? s : ({
        ...s,
        finance: [
          {
            ...entry,
            id: uid("fin"),
            siteId: entry.siteId ?? entrySiteId(s),
            enteredBy: s.currentUserId ?? "system",
          },
          ...s.finance,
        ],
      }));
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

  const advancePaintStage = useCallback((lineId: string) => {
    setState((s) => {
      if (!can(s, "store", "update")) return s;
      const current = s.paintStock.find((l) => l.id === lineId);
      if (!current) return s;
      const idx = PAINT_STAGE_ORDER.indexOf(current.stage);
      if (idx < 0 || idx >= PAINT_STAGE_ORDER.length - 1) return s;
      const nextStage = PAINT_STAGE_ORDER[idx + 1];
      const paintStock = s.paintStock.map((line) =>
        line.id === lineId
          ? {
              ...line,
              stage: nextStage,
              updatedAt: new Date().toISOString().slice(0, 10),
            }
          : line
      );
      const next = { ...s, paintStock };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "store",
            "paint_advance",
            `${lineId} → ${nextStage} · ${current.description}`,
            null
          ),
          ...s.auditLog,
        ],
      };
    });
  }, []);

  const updatePaintLine = useCallback(
    (
      lineId: string,
      patch: Partial<
        Pick<
          PaintStockLine,
          | "movement941"
          | "movement942"
          | "movement261"
          | "rilPosted"
          | "sgeUsed"
          | "qtyLitres"
          | "issuedTo"
        >
      >
    ) => {
      setState((s) => {
        if (!can(s, "store", "update")) return s;
        const paintStock = s.paintStock.map((line) =>
          line.id === lineId
            ? {
                ...line,
                ...patch,
                updatedAt: new Date().toISOString().slice(0, 10),
              }
            : line
        );
        const updated = paintStock.find((l) => l.id === lineId);
        if (!updated) return s;
        const next = { ...s, paintStock };
        const bits = [
          patch.movement941 != null ? `941=${patch.movement941 || "—"}` : null,
          patch.movement942 != null ? `942=${patch.movement942 || "—"}` : null,
          patch.movement261 != null ? `261=${patch.movement261 || "—"}` : null,
          patch.rilPosted != null ? `rilPosted=${patch.rilPosted}` : null,
          patch.sgeUsed != null ? `sgeUsed=${patch.sgeUsed}` : null,
        ].filter(Boolean);
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "store",
              "paint_update",
              `${lineId} · ${bits.join(" · ") || "fields"} · ${updated.description}`,
              null
            ),
            ...s.auditLog,
          ],
        };
      });
    },
    []
  );

  const saveDpr = useCallback((doc: DprDocument) => {
    let result: { ok: boolean; error?: string } = { ok: true };
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      if (!can(s, "dpr", "create") && !can(s, "dpr", "update")) {
        result = DENIED;
        return s;
      }
      const existing = s.dprDocuments.find((d) => d.id === doc.id);
      // Freeze on submit until SIC reject (6A)
      if (
        existing &&
        (existing.status === "submitted" ||
          existing.status === "sic_approved" ||
          existing.status === "locked")
      ) {
        result = {
          ok: false,
          error: `DPR is frozen (${existing.status}). Edit only after SIC reject.`,
        };
        return s;
      }
      const updated = {
        ...doc,
        // Force draft/rejected only when saving edits
        status:
          existing?.status === "sic_rejected"
            ? ("draft" as DprStatus)
            : doc.status === "submitted"
              ? ("draft" as DprStatus)
              : doc.status === "draft" || doc.status === "sic_rejected"
                ? doc.status
                : ("draft" as DprStatus),
        updatedAt: new Date().toISOString(),
      };
      const exists = !!existing;
      const nextDocs = exists
        ? s.dprDocuments.map((d) => (d.id === doc.id ? updated : d))
        : [updated, ...s.dprDocuments];
      const next = { ...s, dprDocuments: nextDocs };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "dpr",
            exists ? "update" : "create",
            `${updated.id} · ${updated.submitterType} · ${updated.plant}`,
            updated.plant
          ),
          ...s.auditLog,
        ],
      };
    };
    step(stateRef.current);
    setState(step);
    return result;
  }, []);

  const submitDpr = useCallback((id: string) => {
    setState((s) => {
      if (!can(s, "dpr", "submit")) return s;
      const doc = s.dprDocuments.find((d) => d.id === id);
      if (!doc) return s;
      if (doc.status !== "draft" && doc.status !== "sic_rejected") return s;
      // Same checks the form shows (docs §5); the store refuses an incomplete DPR too
      const plants = s.sites.find((x) => x.id === doc.siteId)?.plants ?? [];
      if (validateDprForSubmit(doc, dprCrew(doc, s.labourers), plants).length) return s;
      const dprDocuments = s.dprDocuments.map((d) =>
        d.id === id
          ? {
              ...d,
              status: "submitted" as DprStatus,
              updatedAt: new Date().toISOString(),
            }
          : d
      );
      // Sync open DPR requests into equipment desk
      let equipmentRequests = s.equipmentRequests;
      for (const req of doc.requests) {
        const already = equipmentRequests.some(
          (e) => e.sourceDprId === id && e.description === req.description
        );
        if (already) continue;
        equipmentRequests = [
          {
            id: uid("er"),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: doc.submitterId,
            siteId: doc.siteId,
            plant: doc.plant,
            kind: req.kind,
            description: req.description,
            qty: req.qty,
            urgent: req.urgent,
            status: "open",
            sourceDprId: id,
          },
          ...equipmentRequests,
        ];
      }
      // docs §20: the crew's attendance counts when the DPR is submitted; the SIC is
      // told, and approves only the work quantities. A resubmit replaces the marks.
      const derived = attendanceFromApprovedDpr(id, doc.date, doc.siteId, doc.labourMarks, doc.submitterId);
      const keys = new Set(derived.map((a) => `${a.date}:${a.labourerId}`));
      const attendance = [
        ...derived,
        // Another DPR's marks stay: a split day across two supervisors (docs §4)
        ...s.attendance.filter((a) => a.sourceDprId !== id && (a.sourceDprId || !keys.has(`${a.date}:${a.labourerId}`))),
      ];
      const next = { ...s, dprDocuments, equipmentRequests, attendance };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "dpr",
            "submit",
            `Submitted ${id} (frozen until SIC review; attendance recorded)`,
            doc.plant
          ),
          ...s.auditLog,
        ],
      };
    });
  }, []);

  const reviewDpr = useCallback(
    (id: string, decision: "sic_approved" | "sic_rejected", note: string) => {
      const cur = stateRef.current;
      if (!can(cur, "approvals", "approve")) return DENIED;
      const target = cur.dprDocuments.find((d) => d.id === id);
      if (!target || target.status !== "submitted") return { ok: false, error: "This DPR isn't waiting for review" };
      if (decision === "sic_rejected" && !note.trim()) return { ok: false, error: "Give a reason so the supervisor can fix it" };
      setState((s) => {
        const doc = s.dprDocuments.find((d) => d.id === id);
        if (!doc || doc.status !== "submitted") return s;
        const now = new Date().toISOString();
        // B04: Admin reviews on the SIC's behalf; record both people
        const reviewedAs = reviewedAsFor(s.currentRole);
        const onBehalfOf = reviewedAs === "admin_for_sic" ? siteSicId(s.staff, s.users, doc.siteId) : undefined;
        const dprDocuments = s.dprDocuments.map((d) =>
          d.id === id
            ? {
                ...d,
                status: decision,
                sicNote: note,
                sicReviewedBy: s.currentUserId ?? "st-sic",
                sicReviewedAt: now,
                reviewedAs,
                reviewedOnBehalfOf: onBehalfOf,
                updatedAt: now,
              }
            : d
        );
        const line = reviewLine(
          { status: decision, sicReviewedBy: s.currentUserId ?? "st-sic", reviewedAs, reviewedOnBehalfOf: onBehalfOf },
          (sid) => s.staff.find((x) => x.id === sid)?.name ?? sid
        );

        // Attendance was recorded at submit (docs §20); review covers the work quantities
        const next = { ...s, dprDocuments };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "approvals",
              decision === "sic_approved" ? "approve" : "reject",
              `${id} · ${line ?? decision}${note ? ` · ${note}` : ""}`,
              doc.plant
            ),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true };
    },
    []
  );

  const unlockDpr = useCallback((id: string, reason: string) => {
    const cur = stateRef.current;
    if (cur.currentRole !== "owner" && cur.currentRole !== "super_admin") return { ok: false, error: "Only the Owner or Super Admin can unlock an approved DPR" };
    const doc = cur.dprDocuments.find((d) => d.id === id);
    if (!doc || doc.status !== "sic_approved") return { ok: false, error: "Only an approved DPR can be unlocked" };
    if (!reason.trim()) return { ok: false, error: "Give the reason for unlocking (it's logged)" };
    const account = cur.users.find((u) => u.id === cur.currentAccountId);
    setState((s) => {
      const d = s.dprDocuments.find((x) => x.id === id);
      if (!d || d.status !== "sic_approved") return s;
      const at = new Date().toISOString();
      const next = {
        ...s,
        dprDocuments: s.dprDocuments.map((x) =>
          x.id === id
            ? { ...x, status: "draft" as DprStatus, updatedAt: at, unlocks: [...(x.unlocks ?? []), { by: account?.name ?? "Owner", at, reason: reason.trim() }] }
            : x
        ),
        // Attendance taken from it goes until it is approved again
        attendance: s.attendance.filter((a) => a.sourceDprId !== id),
      };
      return { ...next, auditLog: [makeAudit(next, "dpr", "unlock", `${id} · ${reason.trim()}`, d.plant), ...s.auditLog] };
    });
    return { ok: true };
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

  const runAcplMatch = useCallback((date: string) => {
    let count = 0;
    if (!can(stateRef.current, "acpl", "upload") && !can(stateRef.current, "acpl", "approve")) return 0;
    // Run the update on the current state first, so the result returned is the real outcome
    // (React may apply the queued update later); then queue the same update
    const step = (s: AppState): AppState => {
      // A flag someone already resolved stays resolved unless the data behind it changed
      const resolved = s.acplMatches.filter((m) => m.date === date && m.resolveStatus !== "open");
      const same = (a: AcplMatchRow, b: AcplMatchRow) =>
        a.epNumber === b.epNumber && a.flag === b.flag && a.dprStatus === b.dprStatus && a.acplInTime === b.acplInTime && a.acplOutTime === b.acplOutTime;
      const matches = matchAcplAgainstApproved(s, s.acplPunches, date).filter((m) => !resolved.some((r) => same(r, m)));
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

  const uploadJmsPackage = useCallback(
    (
      pkg: Omit<
        JmsPackage,
        "id" | "financeNotified" | "expectedIncome" | "paymentReceived"
      > & { lines: JmsLine[] }
    ) => {
      const id = uid("jms");
      if (!can(stateRef.current, "jms", "upload")) return "";
      setState((s) => {
        // Rates come from the package's own site, not whichever site the header shows
        const site = pkg.siteId ?? entrySiteId(s);
        const lines = pkg.lines.map((line) => {
          if (line.rateInr > 0) {
            return { ...line, rateMissing: undefined, amountInr: Math.round(line.qty * line.rateInr * 100) / 100 };
          }
          const book = resolveActivityRate(s.rateLines, site, line.activity, line.unit);
          // No guessing for billed money: flag it and leave the amount at 0
          if (!book) return { ...line, amountInr: 0, rateMissing: true };
          const rateInr = book.rateInr;
          return {
            ...line,
            rateInr,
            amountInr: Math.round(line.qty * rateInr * 100) / 100,
          };
        });
        const expectedIncome = lines.reduce((sum, l) => sum + l.amountInr, 0);
        const alert: FinanceAlert = {
          id: uid("fa"),
          createdAt: new Date().toISOString(),
          kind: "jms_uploaded",
          title: "JMS package uploaded",
          detail: `${pkg.label} · expected ₹${expectedIncome.toLocaleString("en-IN")}${lines.some((l) => l.rateMissing) ? ` · ${lines.filter((l) => l.rateMissing).length} line(s) have no rate yet` : ""}`,
          jmsPackageId: id,
          acknowledged: false,
          flaggedToSic: false,
        };
        const full: JmsPackage = {
          ...pkg,
          siteId: site,
          id,
          lines,
          status: "uploaded",
          financeNotified: true,
          expectedIncome,
          paymentReceived: false,
        };
        return {
          ...s,
          jmsPackages: [full, ...s.jmsPackages],
          financeAlerts: [alert, ...s.financeAlerts],
        };
      });
      return id;
    },
    []
  );

  /**
   * Tie each JMS line to the SIC-approved DPR work it measures (docs §10):
   * same site, same plant, same activity, inside the JMS period. A JMS covers
   * many DPRs, so their quantities are summed; each DPR work line counts toward
   * one JMS line only.
   */
  const matchJmsLines = useCallback((packageId: string) => {
    if (!can(stateRef.current, "jms", "upload") && !can(stateRef.current, "jms", "approve")) return;
    setState((s) => {
      const pkg = s.jmsPackages.find((p) => p.id === packageId);
      if (!pkg) return s;
      // Period: a "YYYY-MM…" label means that month; otherwise the 31 days up to upload
      const monthMatch = /^(\d{4}-\d{2})/.exec(pkg.period);
      const upTo = pkg.uploadedAt.slice(0, 10);
      const fromDate = new Date(Date.parse(upTo) - 30 * 86_400_000).toISOString().slice(0, 10);
      const inPeriod = (date: string) =>
        monthMatch ? date.startsWith(monthMatch[1]) : date >= fromDate && date <= upTo;
      const approved = s.dprDocuments.filter(
        (d) =>
          d.status === "sic_approved" &&
          (!pkg.siteId || d.siteId === pkg.siteId) &&
          inPeriod(d.date)
      );
      const used = new Set<string>();
      const lines = pkg.lines.map((line) => {
        const hits: { dprId: string; workId: string; qty: number }[] = [];
        for (const dpr of approved) {
          if (line.activity === "scaffolding") {
            for (const w of dpr.scaffoldWork ?? []) {
              const qty = w.standingM3 || w.erectM3;
              if (!qty || used.has(w.id) || (w.plant || dpr.plant) !== line.plant) continue;
              hits.push({ dprId: dpr.id, workId: w.id, qty });
            }
          } else {
            for (const w of dpr.paintWork ?? []) {
              if (w.activity !== line.activity || !w.areaM2 || used.has(w.id) || (w.plant || dpr.plant) !== line.plant) continue;
              hits.push({ dprId: dpr.id, workId: w.id, qty: w.areaM2 });
            }
          }
        }
        if (!hits.length) {
          return { ...line, matchedDprId: undefined, matchedWorkLineId: undefined, matchedWorkLineIds: undefined, dprClaimedQty: undefined, matchRatio: undefined };
        }
        hits.forEach((h) => used.add(h.workId));
        const claimed = Math.round(hits.reduce((t, h) => t + h.qty, 0) * 1000) / 1000;
        const ratio = Math.min(line.qty, claimed) / Math.max(line.qty, claimed);
        return {
          ...line,
          matchedDprId: hits[0].dprId,
          matchedWorkLineId: hits[0].workId,
          matchedWorkLineIds: hits.map((h) => h.workId),
          dprClaimedQty: claimed,
          matchRatio: Math.round(ratio * 100) / 100,
        };
      });
      // Matching never undoes an SIC decision
      const status = pkg.status === "uploaded" ? "sic_review" : pkg.status;
      return {
        ...s,
        jmsPackages: s.jmsPackages.map((p) =>
          p.id === packageId ? { ...p, lines, status } : p
        ),
      };
    });
  }, []);

  const reviewJmsPackage = useCallback(
    (id: string, decision: "sic_approved" | "sic_rejected", note: string) => {
      setState((s) => {
        if (!can(s, "jms", "approve")) return s;
        const pkg = s.jmsPackages.find((p) => p.id === id);
        if (!pkg) return s;
        const alert: FinanceAlert = {
          id: uid("fa"),
          createdAt: new Date().toISOString(),
          kind: "jms_approved",
          title:
            decision === "sic_approved"
              ? "JMS approved by SIC"
              : "JMS rejected by SIC",
          detail: `${pkg.label} · ${note || decision}`,
          jmsPackageId: id,
          acknowledged: false,
          flaggedToSic: false,
        };
        return {
          ...s,
          jmsPackages: s.jmsPackages.map((p) =>
            p.id === id
              ? { ...p, status: decision, sicNote: note }
              : p
          ),
          financeAlerts: [alert, ...s.financeAlerts],
        };
      });
    },
    []
  );

  const computeRatings = useCallback((packageId: string) => {
    const cur = stateRef.current;
    if (!can(cur, "jms", "approve")) return DENIED;
    const target = cur.jmsPackages.find((p) => p.id === packageId);
    if (!target) return { ok: false, error: "JMS package not found" };
    if (target.status !== "sic_approved") return { ok: false, error: "Approve the JMS first — ratings are worked out from an approved JMS" };
    setState((s) => {
      const pkg = s.jmsPackages.find((p) => p.id === packageId);
      if (!pkg || pkg.status !== "sic_approved") return s;
      const bySup = new Map<
        string,
        { jms: number; dpr: number; ratios: number[] }
      >();
      for (const line of pkg.lines) {
        if (!line.matchedDprId) continue;
        const dpr = s.dprDocuments.find((d) => d.id === line.matchedDprId);
        if (!dpr) continue;
        const cur = bySup.get(dpr.submitterId) ?? {
          jms: 0,
          dpr: 0,
          ratios: [],
        };
        cur.jms += line.qty;
        cur.dpr += line.dprClaimedQty ?? line.qty;
        if (line.matchRatio != null) cur.ratios.push(line.matchRatio);
        bySup.set(dpr.submitterId, cur);
      }

      const ratings: WorkRating[] = [];
      for (const [supervisorId, agg] of bySup) {
        const avgRatio =
          agg.ratios.length > 0
            ? agg.ratios.reduce((a, b) => a + b, 0) / agg.ratios.length
            : 0;
        const score = scoreFromMatchRatio(avgRatio);
        const dprDocs = s.dprDocuments.filter(
          (d) => d.submitterId === supervisorId
        );
        const faultEq = dprDocs.flatMap((d) =>
          d.equipmentMarks.filter((e) => e.status === "fault" || e.status === "due")
        ).length;
        const overdue = dprDocs.flatMap((d) =>
          d.equipmentMarks.filter(
            (e) => e.expiryDate && e.expiryDate < todayDate()
          )
        ).length;
        const equipmentCare = Math.max(1, 5 - faultEq - overdue);
        const openFlags = s.acplMatches.filter(
          (m) => m.resolveStatus === "open" && m.flag !== "match"
        ).length;
        const attendanceIntegrity = Math.max(1, 5 - Math.min(4, openFlags));
        const reqCount = dprDocs.reduce((n, d) => n + d.requests.length, 0);
        const requestHygiene = reqCount > 6 ? 3 : reqCount > 3 ? 4 : 5;
        const suggestedSupervisorIncentive = score * 2000;
        const suggestedLabourIncentive = Math.round(agg.jms * 2);

        ratings.push({
          id: uid("wr"),
          supervisorId,
          period: pkg.period,
          jmsPackageId: packageId,
          score,
          jmsAcceptedQty: agg.jms,
          dprClaimedQty: agg.dpr,
          qualityFlags: [
            ...(avgRatio < 0.9 ? ["qty_gap"] : []),
            ...(faultEq > 0 ? ["equipment_fault"] : []),
            ...(overdue > 0 ? ["expiry_overdue"] : []),
          ],
          attendanceIntegrity,
          equipmentCare,
          requestHygiene,
          suggestedSupervisorIncentive,
          suggestedLabourIncentive,
          note: `Match ratio ${(avgRatio * 100).toFixed(0)}%`,
        });
      }

      const wageAdds: WageLedgerEntry[] = ratings.flatMap((r) => [
        {
          id: uid("wg"),
          staffId: r.supervisorId,
          date: todayDate(),
          kind: "incentive" as const,
          amount: r.suggestedSupervisorIncentive,
          note: `JMS rating incentive · score ${r.score} · ${pkg.label}`,
          flaggedToSic: false,
          jmsPackageId: packageId,
        },
      ]);

      return {
        ...s,
        workRatings: [
          ...ratings,
          ...s.workRatings.filter((r) => r.jmsPackageId !== packageId),
        ],
        // Re-running replaces this package's incentive drafts instead of adding more
        wageLedger: [
          ...wageAdds,
          ...s.wageLedger.filter((w) => !(w.kind === "incentive" && w.jmsPackageId === packageId)),
        ],
      };
    });
    return { ok: true };
  }, []);

  /**
   * Record money received against an approved JMS package, once; or flag it as
   * still due to SIC (once while the earlier flag is open).
   */
  const markJmsPayment = useCallback(
    (packageId: string, received: boolean, opts?: { amount?: number; note?: string }) => {
      const cur = stateRef.current;
      if (!can(cur, "finance", "create")) return DENIED;
      const pkg = cur.jmsPackages.find((p) => p.id === packageId);
      if (!pkg) return { ok: false, error: "JMS package not found" };
      if (pkg.status !== "sic_approved") return { ok: false, error: "Only an SIC-approved JMS can be paid or chased" };
      if (pkg.paymentReceived) return { ok: false, error: "Payment is already recorded for this JMS" };
      if (received) {
        const amount = opts?.amount ?? pkg.expectedIncome;
        if (!(amount > 0)) return { ok: false, error: "Amount received must be above zero" };
        const now = new Date().toISOString();
        setState((s) => {
          const p = s.jmsPackages.find((x) => x.id === packageId);
          if (!p || p.paymentReceived) return s;
          const next = {
            ...s,
            jmsPackages: s.jmsPackages.map((x) =>
              x.id === packageId
                ? { ...x, paymentReceived: true, paymentReceivedAt: now, paymentAmount: amount, paymentNote: opts?.note }
                : x
            ),
            finance: [
              {
                id: uid("fin"),
                date: now.slice(0, 10),
                kind: "income" as const,
                category: "JMS payment",
                amount,
                description: `Payment received — ${p.label}${opts?.note ? ` · ${opts.note}` : ""}`,
                siteId: p.siteId ?? entrySiteId(s),
                enteredBy: s.currentUserId ?? "finance",
              },
              ...s.finance,
            ],
          };
          return {
            ...next,
            auditLog: [
              makeAudit(next, "finance", "update", `JMS paid ${p.label}: ₹${amount.toLocaleString("en-IN")} (expected ₹${p.expectedIncome.toLocaleString("en-IN")})`),
              ...s.auditLog,
            ],
          };
        });
        return { ok: true };
      }
      const openFlag = cur.financeAlerts.some(
        (a) => a.jmsPackageId === packageId && a.kind === "payment_due" && !a.acknowledged
      );
      if (openFlag) return { ok: false, error: "Already flagged to SIC — acknowledge that alert first" };
      setState((s) => ({
        ...s,
        financeAlerts: [
          {
            id: uid("fa"),
            createdAt: new Date().toISOString(),
            kind: "payment_due",
            title: "JMS payment not received",
            detail: `${pkg.label} · expected ₹${pkg.expectedIncome.toLocaleString("en-IN")}`,
            jmsPackageId: packageId,
            acknowledged: false,
            flaggedToSic: true,
          },
          ...s.financeAlerts,
        ],
      }));
      return { ok: true };
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
      if (!canSeeAllSites(s.currentRole)) {
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
    const site = s.sites.find((x) => x.id === siteId && x.enabled);
    if (!site) return { ok: false as const, error: "Unknown or disabled site" };
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
    setState((s) => !can(s, "trades", "update") && !can(s, "master", "update") ? s : ({
      ...s,
      tradeCatalogue: s.tradeCatalogue.map((t) =>
        t.id === id ? { ...t, ...patch } : t
      ),
    }));
  }, []);

  const addTrade = useCallback(
    (input: Omit<TradeDefinition, "id"> & { id?: string }) => {
      const slug = input.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");
      const id = input.id ?? (slug || uid("trade"));
      if (!can(stateRef.current, "trades", "create") && !can(stateRef.current, "master", "update")) return "";
      setState((s) => ({
        ...s,
        tradeCatalogue: [
          ...s.tradeCatalogue,
          {
            id,
            label: input.label,
            subcategories: input.subcategories ?? [],
            active: input.active ?? true,
          },
        ],
      }));
      return id;
    },
    []
  );

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
        >
      >
    ) => {
      setState((s) => !can(s, "labourer", "update") && !can(s, "master", "update") ? s : ({
        ...s,
        labourers: s.labourers.map((l) =>
          l.id === id ? { ...l, ...patch } : l
        ),
      }));
    },
    []
  );

  /** Issue new items into a supervisor's setup (docs §7, B05). Tagged kinds get one record per item. */
  const issueEquipment = useCallback(
    (input: { kind: EquipmentKind; supervisorId: string; qty: number; expiryDate?: string }) => {
      const cur = stateRef.current;
      if (!can(cur, "equipment", "create")) return { ...DENIED, tags: [] as string[] };
      const sup = cur.staff.find((x) => x.id === input.supervisorId && x.role === "supervisor");
      if (!sup) return { ok: false as const, error: "Pick a supervisor", tags: [] as string[] };
      if (!(input.qty > 0) || !Number.isInteger(input.qty)) return { ok: false as const, error: "Quantity must be a whole number above 0", tags: [] as string[] };
      if (input.expiryDate) {
        const bad = checkExpiry(input.expiryDate);
        if (bad) return { ok: false as const, error: bad, tags: [] as string[] };
      }
      const site = cur.sites.find((x) => x.id === sup.siteId);
      const def = kindDef(input.kind);
      const now = new Date().toISOString();
      const by = cur.currentUserId ?? "system";
      const made: EquipmentItem[] = [];
      const count = def.tracking === "counted" ? 1 : input.qty;
      for (let i = 0; i < count; i++) {
        const tag = nextTag(input.kind, site?.code ?? "SITE", [...cur.equipment, ...made]);
        made.push({
          id: uid("eq"),
          type: input.kind,
          tag,
          status: "ok",
          lastCheck: now.slice(0, 10),
          ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}),
          checklist: [],
          siteId: sup.siteId,
          supervisorId: sup.id,
          ...(def.tracking === "counted" ? { qty: input.qty } : {}),
          issuedOn: now.slice(0, 10),
          history: [{ at: now, by, change: `Issued to ${sup.name}${def.tracking === "counted" ? ` · qty ${input.qty}` : ""}` }],
        });
      }
      setState((s) => {
        const next = { ...s, equipment: [...s.equipment, ...made] };
        return {
          ...next,
          auditLog: [
            makeAudit(next, "equipment", "issue", `${made.map((m) => m.tag).join(", ")} (${def.label}${def.tracking === "counted" ? ` × ${input.qty}` : ""}) → ${sup.name}`),
            ...s.auditLog,
          ],
        };
      });
      return { ok: true as const, tags: made.map((m) => m.tag) };
    },
    []
  );

  /** Put an existing site item into a supervisor's setup, or take it out ("" = site store). */
  const assignEquipment = useCallback((itemId: string, supervisorId: string) => {
    const cur = stateRef.current;
    if (!can(cur, "equipment", "create")) return DENIED;
    const item = cur.equipment.find((e) => e.id === itemId);
    if (!item) return { ok: false as const, error: "Item not found" };
    const sup = supervisorId ? cur.staff.find((x) => x.id === supervisorId && x.role === "supervisor") : undefined;
    if (supervisorId && (!sup || sup.siteId !== item.siteId)) return { ok: false as const, error: "Pick a supervisor on the item's site" };
    const from = item.supervisorId ? cur.staff.find((x) => x.id === item.supervisorId)?.name ?? item.supervisorId : "site store";
    const to = sup?.name ?? "site store";
    const now = new Date().toISOString();
    setState((s) => {
      const next = {
        ...s,
        equipment: s.equipment.map((e) =>
          e.id === itemId
            ? { ...e, supervisorId: sup?.id, issuedOn: sup ? now.slice(0, 10) : e.issuedOn, history: [...(e.history ?? []), { at: now, by: s.currentUserId ?? "system", change: `${from} → ${to}` }] }
            : e
        ),
      };
      return { ...next, auditLog: [makeAudit(next, "equipment", "assign", `${item.tag}: ${from} → ${to}`), ...s.auditLog] };
    });
    return { ok: true as const };
  }, []);

  /** Set an item's expiry: the supervisor on their own setup, or SIC / store / Owner / SA (B05). Logged. */
  const setEquipmentExpiry = useCallback((itemId: string, date: string) => {
    const cur = stateRef.current;
    if (!can(cur, "equipment", "update")) return DENIED;
    const item = cur.equipment.find((e) => e.id === itemId);
    if (!item) return { ok: false as const, error: "Item not found" };
    const manager = can(cur, "equipment", "create");
    if (!manager && item.supervisorId !== cur.currentUserId) return { ok: false as const, error: "Only your own setup" };
    const bad = checkExpiry(date);
    if (bad) return { ok: false as const, error: bad };
    if (date === item.expiryDate) return { ok: false as const, error: "That's already the expiry" };
    const now = new Date().toISOString();
    const change = `Expiry ${item.expiryDate ?? "—"} → ${date}`;
    setState((s) => {
      const next = {
        ...s,
        equipment: s.equipment.map((e) =>
          e.id === itemId ? { ...e, expiryDate: date, history: [...(e.history ?? []), { at: now, by: s.currentUserId ?? "system", change }] } : e
        ),
      };
      return { ...next, auditLog: [makeAudit(next, "equipment", "expiry", `${item.tag}: ${change}`), ...s.auditLog] };
    });
    return { ok: true as const, change };
  }, []);

  /** SIC / Owner / SA put labourers on a supervisor's crew (docs §20). Reports who moved off another crew. */
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

  /** Take a labourer off their crew (unassigned). A major change (docs §20). */
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

  /** A supervisor with the right asks for labourers; the SIC approves (docs §20). */
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

  /** The current supervisor lets a requested labourer go (docs §20). */
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

  /** SIC approves (labourer joins the crew) or rejects a request (docs §20). */
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
      if (!can(stateRef.current, "labourer", "create") && !can(stateRef.current, "master", "update")) return "";
      setState((s) => ({
        ...s,
        labourers: [{ ...row, id }, ...s.labourers],
        auditLog: [
          makeAudit(s, "master", "create", `Labourer ${row.name}`),
          ...s.auditLog,
        ],
      }));
      return id;
    },
    []
  );

  const upsertContractor = useCallback((row: Contractor) => {
    const id = row.id || uid("con");
    if (!can(stateRef.current, "master", "update")) return id;
    const next = { ...row, id };
    void remoteSaveMaster("contractors", next);
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
    return id;
  }, []);

  const setContractorActive = useCallback((id: string, active: boolean) => {
    if (!can(stateRef.current, "master", "update")) return;
    const row = stateRef.current.masterCatalog.contractors.find((c) => c.id === id);
    if (row) void remoteSaveMaster("contractors", { ...row, active });
    setState((s) => ({
      ...s,
      masterCatalog: {
        ...s.masterCatalog,
        contractors: s.masterCatalog.contractors.map((c) =>
          c.id === id ? { ...c, active } : c
        ),
      },
    }));
  }, []);

  const upsertCatalogItem = useCallback(
    (
      sheet: keyof Omit<MasterCatalog, "contractors" | "materials">,
      row: CatalogItem
    ) => {
      const id = row.id || uid("cat");
      if (!can(stateRef.current, "master", "update")) return id;
      const next = { ...row, id };
      void remoteSaveMaster(sheet, next);
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
      return id;
    },
    []
  );

  const upsertMaterial = useCallback((row: MaterialItem) => {
    const id = row.id || uid("mat");
    if (!can(stateRef.current, "master", "update")) return id;
    const next = { ...row, id };
    void remoteSaveMaster("materials", next);
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
    return id;
  }, []);

  const setCatalogActive = useCallback(
    (sheet: keyof MasterCatalog, id: string, active: boolean) => {
      if (!can(stateRef.current, "master", "update")) return;
      const row = (
        stateRef.current.masterCatalog[sheet] as (CatalogItem | Contractor | MaterialItem)[]
      ).find((r) => r.id === id);
      if (row) void remoteSaveMaster(sheet, { ...row, active });
      setState((s) => {
        const list = s.masterCatalog[sheet] as { id: string; active: boolean }[];
        return {
          ...s,
          masterCatalog: {
            ...s.masterCatalog,
            [sheet]: list.map((r) => (r.id === id ? { ...r, active } : r)),
          },
        };
      });
    },
    []
  );

  const upsertSite = useCallback(async (site: AppState["sites"][number]) => {
    if (!can(stateRef.current, "master", "update")) return "You can't change sites";
    // Save to the shared database first, so a refused save never looks saved here (B01)
    const error = await remoteSaveSite(site);
    if (error) return error;
    setState((s) => {
      const exists = s.sites.some((x) => x.id === site.id);
      return {
        ...s,
        sites: exists
          ? s.sites.map((x) => (x.id === site.id ? site : x))
          : [...s.sites, site],
        auditLog: [
          makeAudit(s, "master", exists ? "update" : "create", `Site ${site.code}`),
          ...s.auditLog,
        ],
      };
    });
    return null;
  }, []);

  const addStaff = useCallback((input: Omit<StaffMember, "id">) => {
    const cur = stateRef.current;
    if (!can(cur, "users", "create") && !can(cur, "master", "update")) return "";
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
      const invalid = checkSeat(input, s.users);
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
            `Updated ${existing.username}: ${Object.keys(patch).join(", ")}`
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
      const r = await remoteUpdateUser(id, patch);
      if (!r.ok) return { ok: false, error: r.error };
      return updateUserLocal(id, patch);
    },
    [updateUserLocal]
  );

  const setUserPassword = useCallback(async (id: string, password: string) => {
    if (!supabase) return { ok: false, error: "Backend not configured" };
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
  }, []);

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
          const labourer = next.labourers[0];
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

        if (input.mappedEntity === "dpr_note") {
          // Prefer appending to an open draft/submitted DPR for the role
          const submitterId =
            input.role === "safety"
              ? "st-safety"
              : input.role === "store"
                ? "st-store"
                : "st-sup1";
          const open = next.dprDocuments.find(
            (d) =>
              d.submitterId === submitterId &&
              (d.status === "draft" || d.status === "submitted") &&
              d.date === today
          );
          if (open) {
            draft.entityId = open.id;
            next = {
              ...next,
              dprDocuments: next.dprDocuments.map((d) =>
                d.id === open.id
                  ? {
                      ...d,
                      telegramDraftLines: [
                        ...d.telegramDraftLines,
                        input.content,
                      ],
                      note: d.note
                        ? `${d.note}\n[TG] ${input.content}`
                        : `[TG] ${input.content}`,
                      updatedAt: new Date().toISOString(),
                    }
                  : d
              ),
            };
          } else {
            const dpr: DprDocument = {
              id: uid("dprd"),
              date: today,
              siteId: entrySiteId(next),
              plant: "CPP",
              submitterId,
              submitterType:
                input.role === "safety"
                  ? "safety"
                  : input.role === "store"
                    ? "store"
                    : "painting_blasting",
              status: "draft",
              labourMarks: [],
              equipmentMarks: [],
              requests: [],
              nextDayPlan: "",
              note: input.content,
              telegramDraftLines: [input.content],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            draft.entityId = dpr.id;
            next = { ...next, dprDocuments: [dpr, ...next.dprDocuments] };
          }

          // Keep legacy thin line for owner gist
          const thin = {
            id: uid("dpr"),
            date: today,
            type: "painting" as const,
            supervisorId: submitterId,
            siteId: entrySiteId(next),
            plant: "CPP",
            location: "Telegram ingest",
            crewCount: 0,
            note: input.content,
            permitOk: false,
            tbtDone: false,
          };
          next = { ...next, dprs: [thin, ...next.dprs] };
        }

        if (input.mappedEntity === "expense") {
          const amountMatch = input.content.match(/(\d[\d,]*)/);
          const amount = amountMatch
            ? Number(amountMatch[1].replace(/,/g, ""))
            : 0;
          const fin: FinanceEntry = {
            id: uid("fin"),
            date: today,
            kind: "expense",
            category: "Telegram",
            amount,
            description: input.content,
            siteId: entrySiteId(next),
            enteredBy: `telegram:${input.role}`,
          };
          draft.entityId = fin.id;
          next = { ...next, finance: [fin, ...next.finance] };
        }

        if (input.mappedEntity === "stock_receipt") {
          const line = {
            id: uid("ps"),
            sapCode: "TG-MOCK",
            description: `Telegram receipt: ${input.content.slice(0, 60)}`,
            mpsScheme: 2,
            batch: `TG-${Date.now().toString().slice(-6)}`,
            stage: "sge_receive" as const,
            qtyLitres: 0,
            siteId: entrySiteId(next),
            updatedAt: today,
          };
          draft.entityId = line.id;
          next = { ...next, paintStock: [line, ...next.paintStock] };
        }

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
          // Also append to safety DPR draft
          const safetyDpr = next.dprDocuments.find(
            (d) =>
              d.submitterType === "safety" &&
              (d.status === "draft" || d.status === "submitted")
          );
          if (safetyDpr?.safetyBody) {
            const obs = {
              id: `obs-tg-${Date.now()}`,
              obsNo: "",
              type: "UA" as const,
              from: "S" as const,
              risk: "MEDIUM" as const,
              status: "OPEN" as const,
              checkedBy: "S" as const,
              whereWhat: input.content,
              actionTaken: "",
              whoWillFix: "",
              firstFoundOn: new Date().toISOString().slice(0, 10),
              fixByDate: "",
            };
            next = {
              ...next,
              dprDocuments: next.dprDocuments.map((d) =>
                d.id === safetyDpr.id
                  ? {
                      ...d,
                      telegramDraftLines: [
                        ...d.telegramDraftLines,
                        input.content,
                      ],
                      note: `${d.note}\n[TG] ${input.content}`,
                      safetyBody: {
                        ...d.safetyBody!,
                        observations: [...d.safetyBody!.observations, obs],
                      },
                    }
                  : d
              ),
            };
          }
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
      login,
      switchRole,
      logout,
      resetSeed,
      markAttendance,
      addFinance,
      toggleSafetyItem,
      signSafetyDay,
      applyTelegram,
      advancePaintStage,
      updatePaintLine,
      saveDpr,
      submitDpr,
      reviewDpr,
      unlockDpr,
      openSafetyDay,
      uploadAcplText,
      runAcplMatch,
      resolveAcplFlag,
      uploadJmsPackage,
      reviewJmsPackage,
      matchJmsLines,
      computeRatings,
      markJmsPayment,
      updateRateCard,
      switchSite,
      setEntrySite,
      upsertRateLine,
      updateTrade,
      addTrade,
      updateLabourer,
      addLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
      assignCrew,
      issueEquipment,
      assignEquipment,
      setEquipmentExpiry,
      removeFromCrew,
      requestCrew,
      releaseCrew,
      decideCrew,
      addStaff,
      addWageEntry,
      acknowledgeFinanceAlert,
      flagFinanceAlertToSic,
      createUser,
      updateUser,
      setUserPassword,
      startImpersonation,
      endImpersonation,
      createEquipmentRequest,
      updateEquipmentRequest,
    }),
    [
      state,
      scopedState,
      hydrated,
      currentAccount,
      login,
      switchRole,
      logout,
      resetSeed,
      markAttendance,
      addFinance,
      toggleSafetyItem,
      signSafetyDay,
      applyTelegram,
      advancePaintStage,
      updatePaintLine,
      saveDpr,
      submitDpr,
      reviewDpr,
      unlockDpr,
      openSafetyDay,
      uploadAcplText,
      runAcplMatch,
      resolveAcplFlag,
      uploadJmsPackage,
      reviewJmsPackage,
      matchJmsLines,
      computeRatings,
      markJmsPayment,
      updateRateCard,
      switchSite,
      setEntrySite,
      upsertRateLine,
      updateTrade,
      addTrade,
      updateLabourer,
      addLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
      assignCrew,
      issueEquipment,
      assignEquipment,
      setEquipmentExpiry,
      removeFromCrew,
      requestCrew,
      releaseCrew,
      decideCrew,
      addStaff,
      addWageEntry,
      acknowledgeFinanceAlert,
      flagFinanceAlertToSic,
      createUser,
      updateUser,
      setUserPassword,
      startImpersonation,
      endImpersonation,
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
