import type { RoleId } from "../types";

/**
 * Who may do what in the Work module. The screens use these to show buttons,
 * and the Work store checks them again so a hidden button isn't the only guard.
 */
export function workRights(role: RoleId | null | undefined) {
  const boss = role === "owner" || role === "super_admin";
  return {
    isBoss: boss,
    // Payments + P&L: Owner, Super Admin, Finance (docs §18)
    canMoney: boss || role === "finance",
    canConfirm: boss || role === "sic",
    canPlan: boss || role === "sic" || role === "admin",
    canEnter: boss || role === "supervisor" || role === "admin" || role === "sic",
    // The store issues paint into a supervisor's name (docs §6, §9)
    canIssuePaint: boss || role === "store",
  };
}

export type WorkRights = ReturnType<typeof workRights>;

/** Work tabs a role sees. The Store Keeper only works the paint stock. */
export function workTabsFor(role: RoleId | null | undefined): string[] | "all" {
  if (role === "store") return ["paint"];
  return "all";
}
