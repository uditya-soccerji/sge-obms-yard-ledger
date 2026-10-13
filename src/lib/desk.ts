import { canViewModule } from "./permissions";
import type { MasterSheetId } from "./master/types";
import type { ModuleId, RoleId, UserAccount } from "./types";

export type OpsPanelId =
  | "dpr"
  | "store"
  | "safety"
  | "approvals"
  | "crew"
  | "acpl"
  | "jms"
  | "finance"
  | "hr"
  | "requests"
  | "submissions"
  | "audit"
  | "admin"
  | "paint-calc"
  | "area-calc"
  | "scaffold-calc"
  | "estimate"
  | "telegram";

export interface OpsPill {
  id: OpsPanelId;
  label: string;
  module: ModuleId;
}

/** Role-only inner Operations strip. Empty → hide the Operations tab. */
const ROLE_PILLS: Record<RoleId, OpsPill[]> = {
  super_admin: [
    { id: "dpr", label: "DPR", module: "dpr" },
    { id: "crew", label: "Crews", module: "crew" },
    { id: "store", label: "Store / FIM", module: "store" },
    { id: "safety", label: "Safety", module: "safety" },
    { id: "approvals", label: "Approvals", module: "approvals" },
    { id: "acpl", label: "ACPL", module: "acpl" },
    { id: "jms", label: "JMS", module: "jms" },
    { id: "finance", label: "Finance", module: "finance" },
    { id: "hr", label: "HR", module: "hr" },
    { id: "requests", label: "Requests", module: "requests" },
    { id: "audit", label: "Audit", module: "audit" },
    { id: "estimate", label: "Estimator", module: "calculators" },
    { id: "paint-calc", label: "Paint calc", module: "calculators" },
    { id: "area-calc", label: "Area", module: "calculators" },
    { id: "scaffold-calc", label: "Scaffold calc", module: "calculators" },
    { id: "telegram", label: "Telegram", module: "telegram" },
  ],
  owner: [
    { id: "approvals", label: "Approvals", module: "approvals" },
    { id: "crew", label: "Crews", module: "crew" },
    { id: "store", label: "Store / FIM", module: "store" },
    { id: "jms", label: "JMS", module: "jms" },
    { id: "finance", label: "Finance", module: "finance" },
    { id: "acpl", label: "ACPL", module: "acpl" },
    { id: "audit", label: "Audit", module: "audit" },
    { id: "estimate", label: "Estimator", module: "calculators" },
    { id: "telegram", label: "Telegram", module: "telegram" },
  ],
  sic: [
    { id: "approvals", label: "Approvals", module: "approvals" },
    { id: "crew", label: "Crews", module: "crew" },
    { id: "dpr", label: "DPR", module: "dpr" },
    { id: "jms", label: "JMS", module: "jms" },
    { id: "acpl", label: "ACPL", module: "acpl" },
    { id: "store", label: "Store / FIM", module: "store" },
    { id: "safety", label: "Safety", module: "safety" },
  ],
  admin: [
    { id: "admin", label: "Uploads", module: "admin" },
    { id: "dpr", label: "DPR", module: "dpr" },
    { id: "acpl", label: "ACPL", module: "acpl" },
    { id: "jms", label: "JMS", module: "jms" },
    { id: "estimate", label: "Estimator", module: "calculators" },
  ],
  hr: [
    { id: "hr", label: "Attendance", module: "hr" },
    { id: "acpl", label: "ACPL", module: "acpl" },
  ],
  finance: [
    { id: "finance", label: "Finance", module: "finance" },
    { id: "jms", label: "JMS", module: "jms" },
    { id: "estimate", label: "Estimator", module: "calculators" },
  ],
  supervisor: [
    { id: "dpr", label: "DPR", module: "dpr" },
    { id: "crew", label: "My crew", module: "crew" },
    { id: "store", label: "Store", module: "store" },
    { id: "submissions", label: "My submissions", module: "submissions" },
    { id: "requests", label: "Requests", module: "requests" },
    { id: "paint-calc", label: "Paint calc", module: "calculators" },
    { id: "estimate", label: "Estimator", module: "calculators" },
  ],
  store: [
    { id: "store", label: "Store / FIM", module: "store" },
    { id: "dpr", label: "DPR", module: "dpr" },
    { id: "requests", label: "Requests", module: "requests" },
    { id: "submissions", label: "My submissions", module: "submissions" },
  ],
  safety: [
    { id: "safety", label: "Safety DPR", module: "safety" },
    { id: "dpr", label: "DPR desk", module: "dpr" },
    { id: "submissions", label: "My submissions", module: "submissions" },
  ],
  labourer: [],
};

/** Owner and Super Admin see every sheet; Admin keeps trades and the rate book (M3, rules §2). */
export function canAccessMasterData(role: RoleId | null | undefined): boolean {
  return role === "super_admin" || role === "owner" || role === "admin";
}

export function masterSheetsFor(role: RoleId | null | undefined): "all" | MasterSheetId[] {
  if (role === "super_admin" || role === "owner") return "all";
  if (role === "admin") return ["trades", "rateBook"];
  return [];
}

export function opsPillsFor(
  account: UserAccount | null | undefined,
  role: RoleId | null | undefined
): OpsPill[] {
  if (!account || !role) return [];
  return (ROLE_PILLS[role] ?? []).filter((p) =>
    canViewModule(account, role, p.module)
  );
}

export type TopNavId = "home" | "work" | "operations" | "master";

/** Work order → plan → job → DPR → JMS tracking (src/app/(app)/work). */
export function canAccessWork(role: RoleId | null | undefined): boolean {
  return role === "super_admin" || role === "owner" || role === "sic" || role === "admin" || role === "supervisor" || role === "finance" || role === "store";
}

export function topNavFor(
  account: UserAccount | null | undefined,
  role: RoleId | null | undefined
): { id: TopNavId; href: string; label: string }[] {
  const items: { id: TopNavId; href: string; label: string }[] = [
    { id: "home", href: "/home", label: "Home" },
  ];
  if (canAccessWork(role)) {
    items.push({ id: "work", href: "/work", label: "Work" });
  }
  if (opsPillsFor(account, role).length > 0) {
    items.push({ id: "operations", href: "/operations", label: "Operations" });
  }
  if (canAccessMasterData(role)) {
    items.push({ id: "master", href: "/master-data", label: "Master Data" });
  }
  return items;
}
