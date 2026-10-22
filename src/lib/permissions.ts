import type {
  ModuleId,
  PermissionAction,
  PermissionOverride,
  RoleId,
  UserAccount,
} from "./types";

export type PermissionKey = `${ModuleId}:${PermissionAction}`;

/** Default rights matrix per role (locked ACL picks). */
const ROLE_MATRIX: Record<RoleId, Partial<Record<ModuleId, PermissionAction[]>>> = {
  super_admin: {
    crew: ["view", "approve", "update"],
    owner: ["view"],
    sic: ["view", "approve"],
    admin: ["view", "create", "update", "upload"],
    hr: ["view", "create", "update"],
    finance: ["view", "create", "update", "export"],
    supervisor: ["view", "create", "update", "submit"],
    store: ["view", "create", "update", "submit"],
    safety: ["view", "create", "update", "submit"],
    labourer: ["view"],
    dpr: ["view", "create", "update", "submit", "approve", "upload"],
    approvals: ["view", "approve"],
    acpl: ["view", "upload", "update", "approve"],
    jms: ["view", "upload", "update", "approve", "export"],
    calculators: ["view"],
    telegram: ["view", "create"],
    users: ["view", "create", "update", "admin"],
    audit: ["view", "export"],
    requests: ["view", "create", "update", "approve"],
    submissions: ["view"],
    trades: ["view", "create", "update", "admin"],
    rates: ["view", "create", "update", "admin", "upload"],
    master: ["view", "create", "update", "admin"],
  },
  owner: {
    owner: ["view"],
    crew: ["view", "approve", "update"],
    sic: ["view", "approve"],
    admin: ["view"],
    hr: ["view"],
    finance: ["view", "create", "update", "export"],
    supervisor: ["view"],
    store: ["view"],
    safety: ["view"],
    labourer: ["view"],
    dpr: ["view", "approve"],
    approvals: ["view", "approve"],
    acpl: ["view"],
    // Owner signs off JMS alongside SIC (the JMS screen offers it)
    jms: ["view", "approve", "export"],
    calculators: ["view"],
    telegram: ["view", "create"],
    audit: ["view", "export"],
    // Owner manages seats in Master Data (not the Super Admin role itself)
    users: ["view", "create", "update"],
    // Round 2 (§27): the Owner may override a store rejection
    requests: ["view", "approve"],
    submissions: ["view"],
    trades: ["view"],
    rates: ["view"],
    master: ["view", "create", "update", "admin"],
  },
  sic: {
    // SIC changes crews and approves supervisors' requests (docs §23)
    crew: ["view", "approve"],
    sic: ["view"],
    dpr: ["view", "approve"],
    approvals: ["view", "approve"],
    // Round 2 (§27): ACPL approve removed
    acpl: ["view"],
    // Round 2 (§27): the SIC confirms the ended job only; JMS approve removed
    jms: ["view"],
    supervisor: ["view"],
    store: ["view"],
    safety: ["view"],
    finance: ["view"],
    calculators: ["view"],
    requests: ["view", "create", "approve"],
    submissions: ["view"],
    rates: ["view"],
  },
  admin: {
    admin: ["view", "create", "update", "upload"],
    labourer: ["upload"],
    dpr: ["view", "create", "update", "upload", "submit"],
    acpl: ["view", "upload"],
    // docs §24: the Admin enters the JMS no. and amount and approves it for Finance
    jms: ["view", "upload", "update", "approve"],
    calculators: ["view"],
    requests: ["view", "create"],
    submissions: ["view", "create", "submit"],
    trades: ["view", "create", "update"],
    rates: ["view", "create", "update", "upload"],
    // Round 2 (§27): Admin approves DPR quantities for the SIC, any time
    approvals: ["view", "approve"],
    // Round 2 (§27): Admin manages Materials and Units (sheets limited in desk.ts + RLS)
    master: ["view", "update"],
  },
  hr: {
    hr: ["view", "create", "update"],
    // HR and Admin upload RIL's export (pass dates) and the monthly pay file (docs §24)
    labourer: ["view", "create", "update", "upload"],
    acpl: ["view", "upload", "update"],
    calculators: ["view"],
    submissions: ["view"],
    trades: ["view"],
  },
  finance: {
    finance: ["view", "create", "update", "export"],
    jms: ["view"],
    calculators: ["view"],
    submissions: ["view"],
    rates: ["view"],
  },
  supervisor: {
    supervisor: ["view", "create", "update", "submit"],
    // Sees own crew and asks the SIC for labourers (docs §24: every supervisor, no per-person tick)
    crew: ["view", "create"],
    dpr: ["view", "create", "update", "submit", "upload"],
    store: ["view"],
    calculators: ["view"],
    requests: ["view", "create"],
    submissions: ["view", "create", "submit"],
  },
  store: {
    store: ["view", "create", "update", "submit"],
    dpr: ["view", "create", "update", "submit", "upload"],
    requests: ["view", "create", "update"],
    calculators: ["view"],
    submissions: ["view", "create", "submit"],
  },
  safety: {
    safety: ["view", "create", "update", "submit"],
    dpr: ["view", "create", "update", "submit", "upload"],
    calculators: ["view"],
    requests: ["view", "create"],
    submissions: ["view", "create", "submit"],
  },
  labourer: {
    labourer: ["view"],
  },
};

export function roleHas(role: RoleId, module: ModuleId, action: PermissionAction): boolean {
  const acts = ROLE_MATRIX[role]?.[module];
  return !!acts?.includes(action);
}

export function effectivePermission(
  account: UserAccount | null | undefined,
  activeRole: RoleId | null | undefined,
  module: ModuleId,
  action: PermissionAction
): boolean {
  if (!account || !activeRole) return false;
  if (!account.roles.includes(activeRole)) return false;

  // Owner rule (2026-10-21): Owner and Super Admin have every right — anything added later included
  if (activeRole === "owner" || activeRole === "super_admin") return true;

  const override = account.permissionOverrides.find(
    (o) => o.module === module && o.action === action
  );
  if (override) return override.allow;

  return roleHas(activeRole, module, action);
}

export function canViewModule(
  account: UserAccount | null | undefined,
  activeRole: RoleId | null | undefined,
  module: ModuleId
): boolean {
  return effectivePermission(account, activeRole, module, "view");
}

export function plantScopeFor(
  account: UserAccount | null | undefined,
  activeRole: RoleId | null | undefined
): "all" | string[] {
  if (!account || !activeRole) return [];
  if (
    activeRole === "super_admin" ||
    activeRole === "owner" ||
    activeRole === "sic" ||
    activeRole === "admin" ||
    activeRole === "hr" ||
    activeRole === "finance" ||
    // The store serves every plant on its site
    activeRole === "store"
  ) {
    return "all";
  }
  // No plants assigned means no restriction (the site rule still applies), not "nothing"
  return account.plantIds.length ? account.plantIds : "all";
}

/**
 * Reset and test tools wipe or replace this browser's data, so only Owner and
 * Super Admin get them, and not while viewing as someone else (the tester
 * should see exactly what that role sees).
 */
export function canUseTestTools(role: RoleId | null | undefined, viewingAs: boolean): boolean {
  return !viewingAs && (role === "owner" || role === "super_admin");
}

export function describeOverride(o: PermissionOverride): string {
  return `${o.module}:${o.action} → ${o.allow ? "allow" : "deny"}`;
}

export { ROLE_MATRIX };
