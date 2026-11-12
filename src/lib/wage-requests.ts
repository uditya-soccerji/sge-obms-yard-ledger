import type { AppState, MasterChangeRequest, MasterRequestSheet, WageChangeRequest } from "./types";

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

// ---- 2026-10-24: the same flow on Trades / Rate book / Materials / Units ----

type ChangeView = WageView & Pick<AppState, "masterChangeRequests">;

/** Where a plan-line alert takes you: Work → Plan with the requests list open */
export const PLAN_REQUESTS_TAB = "/work?t=plan&requests=open";

export const SHEET_NAME: Record<MasterRequestSheet, string> = { trades: "Trades", rateBook: "Rate book", materials: "Materials", units: "Units" };

/** Where an alert about a Master Data request takes you */
export const masterRequestsTab = (sheet: MasterRequestSheet) => `/master-data?sheet=${sheet}&requests=open`;

/** Decided Master Data requests the signed-in Admin hasn't looked at yet */
export function unseenMasterDecisions(s: ChangeView, sheet?: MasterRequestSheet): MasterChangeRequest[] {
  if (s.currentRole !== "admin") return [];
  const me = s.currentUserId ?? s.currentAccountId;
  return s.masterChangeRequests.filter((r) => (!sheet || r.sheet === sheet) && (r.status === "approved" || r.status === "rejected") && !r.seenByRequester && r.requestedBy === me);
}

/** The number on a Master Data sheet button: waiting requests, plus new decisions for the Admin */
export function sheetBadgeCount(s: ChangeView, sheet: MasterRequestSheet): number {
  return s.masterChangeRequests.filter((r) => r.sheet === sheet && r.status === "pending").length + unseenMasterDecisions(s, sheet).length;
}

/** The number on the Master Data tab: every sheet's requests, Daily wages included */
export function changeBadgeCount(s: ChangeView): number {
  return wageBadgeCount(s) + s.masterChangeRequests.filter((r) => r.status === "pending").length + unseenMasterDecisions(s).length;
}
