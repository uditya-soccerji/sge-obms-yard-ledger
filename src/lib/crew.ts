/**
 * Supervisor crews (docs §20). A labourer's standing crew is `Labourer.supervisorId`.
 * SIC / Owner / Super Admin change crews directly; a supervisor with the
 * "pick own crew" right raises a request the SIC approves. A labourer already
 * on another crew moves only after that supervisor releases them.
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
 * Can the SIC approve this request now? A labourer still on another
 * supervisor's crew must be released by that supervisor first (docs §20).
 */
export function approveBlock(r: CrewRequest, labourer: Labourer | undefined): string | null {
  if (!isOpenRequest(r)) return "This request is already decided";
  if (!labourer || !labourer.active) return "Labourer not found or inactive";
  const stillOnOther = !!labourer.supervisorId && labourer.supervisorId !== r.toSupervisorId;
  if (stillOnOther && r.status !== "released") return "Waiting for the current supervisor to release";
  return null;
}
