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
    requests: ["view"],
    submissions: ["view"],
    trades: ["view"],
    rates: ["view"],
    master: ["view", "create", "update", "admin"],
  },
  sic: {
    // SIC changes crews and approves supervisors' requests (docs §20)
    crew: ["view", "approve"],
    sic: ["view"],
    dpr: ["view", "approve"],
    approvals: ["view", "approve"],
    acpl: ["view", "approve"],
    jms: ["view", "approve"],
    supervisor: ["view"],
    store: ["view"],
    safety: ["view"],
    finance: ["view"],
    calculators: ["view"],
    requests: ["view"],
    submissions: ["view"],
    rates: ["view"],
  },
  admin: {
    admin: ["view", "create", "update", "upload"],
    // docs §5 (B04): Admin approves work quantities on the SIC's behalf; both are logged
    dpr: ["view", "create", "update", "upload", "submit", "approve"],
    approvals: ["view", "approve"],
    acpl: ["view", "upload"],
    jms: ["view", "upload", "update"],
    calculators: ["view"],
    requests: ["view"],
    submissions: ["view", "create", "submit"],
    trades: ["view", "create", "update"],
    rates: ["view", "create", "update", "upload"],
  },
  hr: {
    hr: ["view", "create", "update"],
    labourer: ["view", "create", "update"],
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
    // Sees own crew; picking labourers ("create") is granted per person by Owner / SA (docs §20)
    crew: ["view"],
    dpr: ["view", "create", "update", "submit", "upload"],
    store: ["view"],
    calculators: ["view"],
    requests: ["view", "create"],
    submissions: ["view", "create", "submit"],
  },
  store: {
    store: ["view", "create", "update", "submit"],
    dpr: ["view", "create", "update", "submit", "upload"],
    requests: ["view", "update", "approve"],
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

  const override = account.permissionOverrides.find(
    (o) => o.module === module && o.action === action
  );
  if (override) return override.allow;

  // Super admin active role always wins for users/admin
  if (activeRole === "super_admin") return roleHas("super_admin", module, action);

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
