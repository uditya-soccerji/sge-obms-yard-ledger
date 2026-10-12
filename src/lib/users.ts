import type { RoleId, UserAccount } from "./types";

/** Login rules (docs/rules-decisions.md §2). */
export const USERNAME_RE = /^[a-z0-9.]{3,20}$/;
export const MIN_PASSWORD = 6;

/**
 * Check a new or edited seat. Returns an error message, or null when valid.
 * Pass `editingId` when changing an existing user so it isn't matched against itself.
 */
export function checkSeat(
  input: { name: string; username: string; password: string; roles: RoleId[]; siteIds: string[] },
  users: UserAccount[],
  editingId?: string
): string | null {
  if (!input.name.trim()) return "Display name is required";
  if (!USERNAME_RE.test(input.username)) return "Username: 3–20 lowercase letters, digits or dots (e.g. r.mehta)";
  if (users.some((u) => u.id !== editingId && u.username.toLowerCase() === input.username.toLowerCase())) {
    return "Username already exists";
  }
  if (input.password.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters`;
  if (input.roles.length === 0) return "Pick a role";
  return checkSites(input.roles, input.siteIds);
}

/** Site rules: at least one; supervisors work on exactly one site (they may cover several plants there). */
export function checkSites(roles: RoleId[], siteIds: string[]): string | null {
  if (siteIds.length === 0) return "Pick at least one site";
  if (roles.includes("supervisor") && siteIds.length > 1) return "A supervisor works on one site only";
  return null;
}
