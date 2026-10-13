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
import { supabase } from "./supabase/client";
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
import { checkSite } from "./sites";
import { normalizeEp } from "./ep";
import { checkLabourer, describeChanges } from "./labourers";
import { daysAgo } from "./today";
import { WORKING } from "./attendance";
import { checkSeat, checkSites, checkUserChange, MIN_PASSWORD } from "./users";
import type {
  AcplMatchRow,
  AcplPunchRow,
  AcplResolveStatus,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  AuditEntry,
  DraftEntityKind,
  EquipmentRequest,
  EquipmentRequestStatus,
  FinanceEntry,
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
  WageLedgerEntry,
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
  /** Ledger entry with the docs §8 fields; returns why it was refused */
  addFinance: (
    entry: Omit<FinanceEntry, "id" | "siteId" | "enteredBy"> & { siteId?: string }
  ) => { ok: boolean; error?: string };
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
      >
    >
  ) => { ok: boolean; error?: string };
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

export type RequestAction = "approve" | "start" | "fulfil" | "part_fill" | "cancel" | "receive";

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
  return {
    ...seed,
    ...parsed,
    currentAccountId: parsed.currentAccountId ?? null,
    impersonatorAccountId: parsed.impersonatorAccountId ?? null,
    impersonatorSnapshot: parsed.impersonatorSnapshot ?? null,
    users,
    auditLog: parsed.auditLog ?? seed.auditLog,
    equipmentRequests: parsed.equipmentRequests ?? seed.equipmentRequests,
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
          const siteId = landingSite(role, recovered.siteIds, fresh.currentSiteId);
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
    const siteId = landingSite(role, account.siteIds, s.currentSiteId);
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
      const siteId = landingSite(role, me.siteIds, s.currentSiteId);
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

  // B2: a deactivated user (or an ended session) is signed out within a few minutes
  const signedIn = !!state.currentAccountId;
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
      const siteId = landingSite(role, target.siteIds, s.currentSiteId);
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
      if (!can(stateRef.current, "finance", "create")) return DENIED;
      // docs §8: date, time, amount, category, vendor, payment mode, remark
      if (!(entry.amount > 0)) return { ok: false, error: "Amount must be above zero" };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || entry.date > todayDate()) return { ok: false, error: "Pick a date that isn't in the future" };
      if (!entry.time) return { ok: false, error: "Enter the time" };
      if (!entry.category.trim()) return { ok: false, error: "Pick a category" };
      if (!entry.vendor?.trim()) return { ok: false, error: "Enter who paid or was paid" };
      if (!entry.paymentMode) return { ok: false, error: "Pick the payment mode" };
      if (!entry.description.trim()) return { ok: false, error: "Add a remark" };
      setState((s) => {
        const row: FinanceEntry = {
          ...entry,
          vendor: entry.vendor?.trim(),
          description: entry.description.trim(),
          id: uid("fin"),
          siteId: entry.siteId ?? entrySiteId(s),
          enteredBy: s.currentUserId ?? "system",
        };
        const next = { ...s, finance: [row, ...s.finance] };
        return { ...next, auditLog: [makeAudit(next, "finance", "create", `${row.kind} ₹${row.amount.toLocaleString("en-IN")} · ${row.category} · ${row.vendor}`), ...s.auditLog] };
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
      // The approved report replaces manual marks for those people, but another
      // approved report's marks stay: a split day across two supervisors (docs §4)
      const keys = new Set(derived.map((a) => `${a.date}:${a.labourerId}`));
      const attendance = [
        ...derived,
        ...s.attendance.filter((a) => a.sourceDprId !== report.id && (a.sourceDprId || !keys.has(`${a.date}:${a.labourerId}`))),
      ];
      const next = { ...s, attendance };
      return { ...next, auditLog: [makeAudit(next, "approvals", "approve", `DPR ${report.date} · ${report.plant}: attendance for ${derived.length}`, report.plant), ...s.auditLog] };
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
          { id: uid("er"), createdAt: now, updatedAt: now, createdBy: report.submitterId, siteId: report.siteId, plant: report.plant, kind: req.kind, description: req.description, qty: req.qty, urgent: req.urgent, status: "open", sourceDprId: report.id },
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
        >
      >
    ) => {
      const cur = stateRef.current;
      if (!can(cur, "labourer", "update") && !can(cur, "master", "update")) return DENIED;
      const before = cur.labourers.find((l) => l.id === id);
      if (!before) return { ok: false, error: "Labourer not found" };
      const merged = { ...before, ...patch };
      const bad = checkLabourer(merged, cur.labourers);
      if (bad) return { ok: false, error: bad };
      patch = { ...patch, ...(patch.epNumber !== undefined ? { epNumber: normalizeEp(patch.epNumber)! } : {}) };
      const changes = describeChanges(before, patch, ["aadhaar"]);
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
    const bad = checkSite(site, stateRef.current.sites);
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
    // Who may do what, from which status (docs §9)
    const rules: Record<RequestAction, { from: EquipmentRequestStatus[]; to: EquipmentRequestStatus; allowed: boolean; needsNote?: boolean }> = {
      approve: { from: ["open"], to: "sic_approved", allowed: can(cur, "requests", "approve") },
      start: { from: ["sic_approved"], to: "fulfilling", allowed: can(cur, "requests", "update") },
      fulfil: { from: ["sic_approved", "fulfilling"], to: "fulfilled", allowed: can(cur, "requests", "update") },
      part_fill: { from: ["sic_approved", "fulfilling"], to: "part_filled", allowed: can(cur, "requests", "update"), needsNote: true },
      cancel: { from: ["open", "sic_approved", "fulfilling"], to: "cancelled", allowed: can(cur, "requests", "approve") || can(cur, "requests", "update") || mine, needsNote: true },
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
        return next;
      });
      const next = { ...s, equipmentRequests };
      return { ...next, auditLog: [makeAudit(next, "requests", action === "approve" ? "approve" : "update", `${r.description} · ${r.status} → ${rule.to}${why ? ` · ${why}` : ""}`, r.plant), ...s.auditLog] };
    });
    return { ok: true };
  }, []);

  const setEquipmentStatus = useCallback((id: string, status: "ok" | "due" | "fault", note?: string) => {
    const cur = stateRef.current;
    const eq = cur.equipment.find((e) => e.id === id);
    if (!eq) return { ok: false, error: "Equipment not found" };
    const role = cur.currentRole;
    // docs §7: a supervisor flags a fault; the store repairs and changes the status back
    if (status === "fault" && role !== "supervisor" && role !== "store" && role !== "super_admin") return { ok: false, error: "Supervisors (or the store) report faults" };
    if (status !== "fault" && role !== "store" && role !== "super_admin") return { ok: false, error: "Only the store marks kit repaired" };
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
          // Prefer a number marked as money (₹ / Rs / INR); else the largest number in the message
          const money = input.content.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i);
          const numbers = [...input.content.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
          const amount = money ? Number(money[1].replace(/,/g, "")) : numbers.length ? Math.max(...numbers) : 0;
          if (!(amount > 0)) draft.status = "needs_review";
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
          // A message with no amount posts nothing; Finance completes it from the draft
          if (amount > 0) {
            draft.entityId = fin.id;
            next = { ...next, finance: [fin, ...next.finance] };
          }
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
      login,
      switchRole,
      logout,
      resetSeed,
      markAttendance,
      addFinance,
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
      updateLabourer,
      addLabourer,
      removeLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
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
      updateLabourer,
      addLabourer,
      removeLabourer,
      upsertContractor,
      setContractorActive,
      upsertCatalogItem,
      upsertMaterial,
      setCatalogActive,
      upsertSite,
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
