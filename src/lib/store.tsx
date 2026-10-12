"use client";

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
import { scoreFromMatchRatio } from "./estimate";
import { PAINT_STAGE_ORDER } from "./paint-lifecycle";
import { resolveActivityRate, withSupersession } from "./rate-book";
import { roleMeta } from "./roles";
import { migrateLegacySafetyBody } from "./safety-dpr";
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
import type {
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
  state: AppState;
  hydrated: boolean;
  currentAccount: UserAccount | null;
  login: (
    username: string,
    password: string
  ) => Promise<{ ok: true; role: RoleId } | { ok: false; error: string }>;
  switchRole: (role: RoleId) => void;
  logout: () => void;
  resetSeed: () => void;
  markAttendance: (
    labourerId: string,
    status: AttendanceStatus,
    note?: string
  ) => void;
  addFinance: (entry: Omit<FinanceEntry, "id" | "siteId" | "enteredBy">) => void;
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
  reviewDpr: (id: string, decision: "sic_approved" | "sic_rejected", note: string) => void;
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
  computeRatings: (packageId: string) => void;
  markJmsPayment: (packageId: string, received: boolean, note?: string) => void;
  updateRateCard: (id: string, patch: Partial<RateCard>) => void;
  switchSite: (siteId: string) => { ok: boolean; error?: string };
  upsertRateLine: (
    input: Omit<RateLine, "id" | "superseded"> & { id?: string; superseded?: boolean }
  ) => string;
  updateTrade: (id: string, patch: Partial<TradeDefinition>) => void;
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
  upsertSite: (site: AppState["sites"][number]) => void;
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
    const siteId = account.siteIds[0] ?? s.currentSiteId;
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
      const next = { ...s, currentRole: role };
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
    setState((s) => {
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
    });
    return result;
  }, []);

  const endImpersonation = useCallback(() => {
    let result:
      | { ok: true; home: string }
      | { ok: false; error: string } = { ok: false, error: "Unknown error" };
    setState((s) => {
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
    });
    return result;
  }, []);

  const resetSeed = useCallback(() => {
    const fresh = createSeedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    setState(fresh);
  }, []);

  const markAttendance = useCallback(
    (labourerId: string, status: AttendanceStatus, note?: string) => {
      setState((s) => {
        const today = "2026-10-05";
        const existing = s.attendance.find(
          (a) => a.labourerId === labourerId && a.date === today
        );
        const record: AttendanceRecord = {
          id: existing?.id ?? uid("att"),
          date: today,
          labourerId,
          status,
          inTime: status === "present" || status === "half" ? "08:00" : undefined,
          markedBy: s.currentUserId ?? "system",
          siteId: s.currentSiteId,
          note,
        };
        const attendance = existing
          ? s.attendance.map((a) => (a.id === existing.id ? record : a))
          : [...s.attendance, record];
        return { ...s, attendance };
      });
    },
    []
  );

  const addFinance = useCallback(
    (entry: Omit<FinanceEntry, "id" | "siteId" | "enteredBy">) => {
      setState((s) => ({
        ...s,
        finance: [
          {
            ...entry,
            id: uid("fin"),
            siteId: s.currentSiteId,
            enteredBy: s.currentUserId ?? "system",
          },
          ...s.finance,
        ],
      }));
    },
    []
  );

  const toggleSafetyItem = useCallback((dayId: string, itemId: number) => {
    setState((s) => ({
      ...s,
      safetyDays: s.safetyDays.map((d) =>
        d.id !== dayId
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
    setState((s) => ({
      ...s,
      safetyDays: s.safetyDays.map((d) =>
        d.id === dayId ? { ...d, signed: true } : d
      ),
    }));
  }, []);

  const advancePaintStage = useCallback((lineId: string) => {
    setState((s) => {
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
    setState((s) => {
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
    });
    return result;
  }, []);

  const submitDpr = useCallback((id: string) => {
    setState((s) => {
      const doc = s.dprDocuments.find((d) => d.id === id);
      if (!doc) return s;
      if (doc.status !== "draft" && doc.status !== "sic_rejected") return s;
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
      const next = { ...s, dprDocuments, equipmentRequests };
      return {
        ...next,
        auditLog: [
          makeAudit(
            next,
            "dpr",
            "submit",
            `Submitted ${id} (frozen until SIC review)`,
            doc.plant
          ),
          ...s.auditLog,
        ],
      };
    });
  }, []);

  const reviewDpr = useCallback(
    (id: string, decision: "sic_approved" | "sic_rejected", note: string) => {
      setState((s) => {
        const doc = s.dprDocuments.find((d) => d.id === id);
        if (!doc) return s;
        const now = new Date().toISOString();
        const dprDocuments = s.dprDocuments.map((d) =>
          d.id === id
            ? {
                ...d,
                status: decision,
                sicNote: note,
                sicReviewedBy: s.currentUserId ?? "st-sic",
                sicReviewedAt: now,
                updatedAt: now,
              }
            : d
        );

        let attendance = s.attendance;
        if (decision === "sic_approved") {
          attendance = attendance.filter((a) => a.sourceDprId !== id);
          const derived = attendanceFromApprovedDpr(
            id,
            doc.date,
            doc.siteId,
            doc.labourMarks,
            s.currentUserId ?? "st-sic"
          );
          const keys = new Set(derived.map((a) => `${a.date}:${a.labourerId}`));
          attendance = [
            ...derived,
            ...attendance.filter((a) => !keys.has(`${a.date}:${a.labourerId}`)),
          ];
        }

        const next = { ...s, dprDocuments, attendance };
        return {
          ...next,
          auditLog: [
            makeAudit(
              next,
              "approvals",
              decision === "sic_approved" ? "approve" : "reject",
              `${id} · ${note || decision}`,
              doc.plant
            ),
            ...s.auditLog,
          ],
        };
      });
    },
    []
  );

  const uploadAcplText = useCallback(
    (text: string, date: string, source: "upload" | "paste") => {
      const parsed = parseAcplCsv(text, date);
      setState((s) => {
        const punches: AcplPunchRow[] = parsed.map((p) => ({
          ...p,
          id: uid("acpl"),
          source,
        }));
        return { ...s, acplPunches: [...punches, ...s.acplPunches] };
      });
      return parsed.length;
    },
    []
  );

  const runAcplMatch = useCallback((date: string) => {
    let count = 0;
    setState((s) => {
      const matches = matchAcplAgainstApproved(s, s.acplPunches, date);
      count = matches.length;
      // Replace open matches for that date
      const kept = s.acplMatches.filter(
        (m) => m.date !== date || m.resolveStatus !== "open"
      );
      return { ...s, acplMatches: [...matches, ...kept] };
    });
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
      setState((s) => {
        const role = s.currentRole;
        const canHr = role === "hr" || role === "super_admin";
        const canSicOverride =
          opts?.sicOverride &&
          (role === "sic" || role === "super_admin" || role === "owner");
        if (!canHr && !canSicOverride) {
          result = {
            ok: false,
            error: "ACPL flags: HR resolves; SIC may override (12C).",
          };
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
        if (match.labourerId && status === "resolved_acpl") {
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
      });
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
      setState((s) => {
        const lines = pkg.lines.map((line) => {
          if (line.rateInr > 0) {
            return { ...line, amountInr: line.qty * line.rateInr };
          }
          const book = resolveActivityRate(
            s.rateLines,
            s.currentSiteId,
            line.activity,
            line.unit
          );
          if (!book) return line;
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
          detail: `${pkg.label} · expected ₹${expectedIncome.toLocaleString("en-IN")}`,
          jmsPackageId: id,
          acknowledged: false,
          flaggedToSic: false,
        };
        const full: JmsPackage = {
          ...pkg,
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

  const matchJmsLines = useCallback((packageId: string) => {
    setState((s) => {
      const pkg = s.jmsPackages.find((p) => p.id === packageId);
      if (!pkg) return s;
      const approved = s.dprDocuments.filter(
        (d) => d.status === "sic_approved" || d.status === "submitted"
      );
      const lines = pkg.lines.map((line) => {
        let best:
          | { dprId: string; workId: string; claimed: number; ratio: number }
          | undefined;
        for (const dpr of approved) {
          if (line.activity === "scaffolding" && dpr.scaffoldWork) {
            for (const w of dpr.scaffoldWork) {
              const claimed = w.standingM3 || w.erectM3;
              if (!claimed) continue;
              const ratio = Math.min(line.qty, claimed) / Math.max(line.qty, claimed);
              if (!best || ratio > best.ratio) {
                best = { dprId: dpr.id, workId: w.id, claimed, ratio };
              }
            }
          }
          if (
            (line.activity === "painting" || line.activity === "blasting") &&
            dpr.paintWork
          ) {
            for (const w of dpr.paintWork) {
              if (w.activity !== line.activity && line.activity !== "painting") {
                // allow painting JMS to match painting lines; blasting to blasting
              }
              if (w.activity !== line.activity) continue;
              const claimed = w.areaM2;
              const ratio = Math.min(line.qty, claimed) / Math.max(line.qty, claimed);
              if (!best || ratio > best.ratio) {
                best = { dprId: dpr.id, workId: w.id, claimed, ratio };
              }
            }
          }
        }
        if (!best) return line;
        return {
          ...line,
          matchedDprId: best.dprId,
          matchedWorkLineId: best.workId,
          dprClaimedQty: best.claimed,
          matchRatio: Math.round(best.ratio * 100) / 100,
        };
      });
      return {
        ...s,
        jmsPackages: s.jmsPackages.map((p) =>
          p.id === packageId ? { ...p, lines, status: "sic_review" } : p
        ),
      };
    });
  }, []);

  const reviewJmsPackage = useCallback(
    (id: string, decision: "sic_approved" | "sic_rejected", note: string) => {
      setState((s) => {
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
    setState((s) => {
      const pkg = s.jmsPackages.find((p) => p.id === packageId);
      if (!pkg) return s;
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
            (e) => e.expiryDate && e.expiryDate < "2026-10-05"
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
          date: "2026-10-05",
          kind: "incentive" as const,
          amount: r.suggestedSupervisorIncentive,
          note: `JMS rating incentive · score ${r.score}`,
          flaggedToSic: false,
        },
      ]);

      return {
        ...s,
        workRatings: [
          ...ratings,
          ...s.workRatings.filter((r) => r.jmsPackageId !== packageId),
        ],
        wageLedger: [...wageAdds, ...s.wageLedger],
      };
    });
  }, []);

  const markJmsPayment = useCallback(
    (packageId: string, received: boolean, note?: string) => {
      setState((s) => {
        const pkg = s.jmsPackages.find((p) => p.id === packageId);
        if (!pkg) return s;
        const jmsPackages = s.jmsPackages.map((p) =>
          p.id === packageId
            ? {
                ...p,
                paymentReceived: received,
                paymentReceivedAt: received
                  ? new Date().toISOString()
                  : undefined,
                paymentNote: note,
              }
            : p
        );
        let finance = s.finance;
        let financeAlerts = s.financeAlerts;
        if (received) {
          finance = [
            {
              id: uid("fin"),
              date: "2026-10-05",
              kind: "income",
              category: "JMS payment",
              amount: pkg.expectedIncome,
              description: `Payment received — ${pkg.label}`,
              siteId: s.currentSiteId,
              enteredBy: s.currentUserId ?? "finance",
            },
            ...finance,
          ];
        } else {
          financeAlerts = [
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
            ...financeAlerts,
          ];
        }
        return { ...s, jmsPackages, finance, financeAlerts };
      });
    },
    []
  );

  const updateRateCard = useCallback((id: string, patch: Partial<RateCard>) => {
    setState((s) => ({
      ...s,
      rateCards: s.rateCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  }, []);

  const switchSite = useCallback((siteId: string) => {
    const s = stateRef.current;
    const account = s.users.find((u) => u.id === s.currentAccountId);
    if (!account) return { ok: false as const, error: "Not signed in" };
    const canSwitch =
      s.currentRole === "super_admin" ||
      s.currentRole === "owner" ||
      s.currentRole === "sic" ||
      s.currentRole === "admin" ||
      s.currentRole === "finance";
    if (!canSwitch) {
      return { ok: false as const, error: "Site switch not allowed for this role" };
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

  const upsertRateLine = useCallback(
    (
      input: Omit<RateLine, "id" | "superseded"> & {
        id?: string;
        superseded?: boolean;
      }
    ) => {
      const id = input.id ?? uid("rl");
      setState((s) => {
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
    setState((s) => ({
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
      setState((s) => ({
        ...s,
        labourers: s.labourers.map((l) =>
          l.id === id ? { ...l, ...patch } : l
        ),
      }));
    },
    []
  );

  const addLabourer = useCallback(
    (row: Omit<Labourer, "id"> & { id?: string }) => {
      const id = row.id ?? uid("lb");
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

  const upsertSite = useCallback((site: AppState["sites"][number]) => {
    void remoteSaveSite(site);
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
  }, []);

  const addWageEntry = useCallback((entry: Omit<WageLedgerEntry, "id">) => {
    setState((s) => {
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
    setState((s) => ({
      ...s,
      financeAlerts: s.financeAlerts.map((a) =>
        a.id === id ? { ...a, acknowledged: true } : a
      ),
    }));
  }, []);

  const flagFinanceAlertToSic = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      financeAlerts: s.financeAlerts.map((a) =>
        a.id === id ? { ...a, flaggedToSic: true } : a
      ),
    }));
  }, []);

  const createUserLocal = useCallback((input: Omit<UserAccount, "id">) => {
    let result: { ok: boolean; error?: string; id?: string } = { ok: true };
    setState((s) => {
      if (s.currentRole !== "super_admin" && s.currentRole !== "owner") {
        result = { ok: false, error: "Only Owner or Super Admin can create users" };
        return s;
      }
      if (s.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
        result = { ok: false, error: "Username already exists" };
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
    });
    return result;
  }, []);

  const updateUserLocal = useCallback((id: string, patch: Partial<UserAccount>) => {
    let result: { ok: boolean; error?: string } = { ok: true };
    setState((s) => {
      if (s.currentRole !== "super_admin" && s.currentRole !== "owner") {
        result = { ok: false, error: "Only Owner or Super Admin can edit users" };
        return s;
      }
      const existing = s.users.find((u) => u.id === id);
      if (!existing) {
        result = { ok: false, error: "User not found" };
        return s;
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
    });
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
        let next = { ...s, telegramDrafts: [draft, ...s.telegramDrafts] };
        const today = "2026-10-05";

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
              siteId: next.currentSiteId,
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
              siteId: next.currentSiteId,
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
            siteId: next.currentSiteId,
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
            siteId: next.currentSiteId,
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
            siteId: next.currentSiteId,
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

  const api = useMemo<StoreApi>(
    () => ({
      state,
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
