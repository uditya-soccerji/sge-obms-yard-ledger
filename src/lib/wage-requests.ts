import type { AppState, WageChangeRequest } from "./types";

/** How long the Admin can Undo a wage change before Owner / SA are alerted (2026-10-24) */
export const WAGE_UNDO_MS = 60_000;

/** Where a wage-request alert takes you: Daily wages with the requests list open */
export const WAGE_REQUESTS_TAB = "/master-data?sheet=wageBands&requests=open";

type WageView = Pick<AppState, "wageChangeRequests" | "currentRole" | "currentUserId" | "currentAccountId">;

/** Approved / rejected requests the signed-in Admin asked for and hasn't looked at yet */
export function unseenWageDecisions(s: WageView): WageChangeRequest[] {
  if (s.currentRole !== "admin") return [];
  const me = s.currentUserId ?? s.currentAccountId;
  return s.wageChangeRequests.filter((r) => (r.status === "approved" || r.status === "rejected") && !r.seenByRequester && r.requestedBy === me);
}

/** The number on Master Data / Daily wages: waiting requests, plus new decisions for the Admin */
export function wageBadgeCount(s: WageView): number {
  return s.wageChangeRequests.filter((r) => r.status === "pending").length + unseenWageDecisions(s).length;
}
