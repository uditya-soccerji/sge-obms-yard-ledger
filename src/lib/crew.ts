/**
 * Supervisor crews (docs §23). A labourer's standing crew is `Labourer.supervisorId`.
 * SIC / Owner / Super Admin change crews directly; any supervisor raises a
 * request the SIC approves (docs §24 dropped the per-person "pick" tick). A
 * labourer already on another crew moves only after that supervisor releases
 * them; that supervisor, the SIC, Admin and HR are told.
 */
import { effectivePermission } from "./permissions";
import type { CrewRequest, Labourer, PermissionOverride, RoleId, StaffMember, UserAccount } from "./types";

/** The per-person right Owner / Super Admin switch on for a supervisor. */
export const PICK_OWN_CREW: PermissionOverride = { module: "crew", action: "create", allow: true };

/** SIC, Owner, Super Admin: assign / remove directly and decide requests. */
export function canManageCrew(account: UserAccount | null | undefined, role: RoleId | null | undefined): boolean {
  return effectivePermission(account, role, "crew", "approve");
}

/** A supervisor who may request labourers for their own crew. */
export function canPickOwnCrew(account: UserAccount | null | undefined, role: RoleId | null | undefined): boolean {
  return role === "supervisor" && effectivePermission(account, role, "crew", "create");
}

export function hasPickRight(account: Pick<UserAccount, "permissionOverrides">): boolean {
  return account.permissionOverrides.some((o) => o.module === "crew" && o.action === "create" && o.allow);
}

/** Overrides with the "pick own crew" right switched on or off (other overrides kept). */
export function withPickRight(overrides: PermissionOverride[], on: boolean): PermissionOverride[] {
  const rest = overrides.filter((o) => !(o.module === "crew" && o.action === "create"));
  return on ? [...rest, PICK_OWN_CREW] : rest;
}

export function crewOf(labourers: Labourer[], supervisorId: string): Labourer[] {
  return labourers.filter((l) => l.active && l.supervisorId === supervisorId);
}

/** Supervisors of a site, for picking whose crew to work on. */
export function siteSupervisors(staff: StaffMember[], siteId: string): StaffMember[] {
  return staff.filter((s) => s.role === "supervisor" && s.siteId === siteId);
}

export const isOpenRequest = (r: CrewRequest) => r.status === "requested" || r.status === "released";

/** Why a supervisor can't ask for this labourer, or null when the request can go. */
export function checkCrewRequest(
  labourer: Labourer,
  toSupervisorId: string,
  supervisorSiteId: string,
  requests: CrewRequest[]
): string | null {
  if (!labourer.active) return `${labourer.name} is inactive`;
  if (labourer.siteId !== supervisorSiteId) return `${labourer.name} works on another site`;
  if (labourer.supervisorId === toSupervisorId) return `${labourer.name} is already on this crew`;
  if (requests.some((r) => isOpenRequest(r) && r.labourerId === labourer.id && r.toSupervisorId === toSupervisorId)) {
    return `${labourer.name} is already requested`;
  }
  return null;
}

/**
 * Can the SIC approve this request now? Round 2 (§27): the SIC decides even when the
 * labourer is still on another crew — that supervisor is told, not asked.
 */
export function approveBlock(r: CrewRequest, labourer: Labourer | undefined): string | null {
  if (!isOpenRequest(r)) return "This request is already decided";
  if (!labourer || !labourer.active) return "Labourer not found or inactive";
  return null;
}
