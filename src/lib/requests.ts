/**
 * Spares / equipment / material requests (docs §9, B06):
 * SIC approval pending → approved → fulfilled | not fulfilled, or rejected;
 * the requester then confirms received. Urgent first on every board.
 */
import type { EquipmentRequest, EquipmentRequestStatus } from "./types";

export const REQUEST_STATUS_LABEL: Record<EquipmentRequestStatus, string> = {
  sic_pending: "SIC approval pending",
  approved: "Approved — to fulfil",
  fulfilled: "Fulfilled",
  not_fulfilled: "Not fulfilled",
  rejected: "Rejected",
  received: "Received",
};

export const REQUEST_TONE: Record<EquipmentRequestStatus, "ok" | "warn" | "accent" | "default" | "crit"> = {
  sic_pending: "warn",
  approved: "accent",
  fulfilled: "ok",
  not_fulfilled: "crit",
  rejected: "crit",
  received: "default",
};

/** Board filters, in the order the store sees them (owner, 2026-10-13). */
export const BOARD_FILTERS: { id: "open" | EquipmentRequestStatus; label: string }[] = [
  { id: "open", label: "All open" },
  { id: "sic_pending", label: "SIC approval pending" },
  { id: "approved", label: "To fulfil" },
  { id: "fulfilled", label: "Fulfilled" },
  { id: "not_fulfilled", label: "Not fulfilled" },
  { id: "rejected", label: "Rejected" },
];

export const isOpenRequest = (r: Pick<EquipmentRequest, "status">) => r.status === "sic_pending" || r.status === "approved";

/** Urgent first, then oldest first (the longest waiting is served first). */
export function sortBoard(rows: EquipmentRequest[]): EquipmentRequest[] {
  return [...rows].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || a.createdAt.localeCompare(b.createdAt));
}

export function filterBoard(rows: EquipmentRequest[], filter: "open" | EquipmentRequestStatus): EquipmentRequest[] {
  return rows.filter((r) => (filter === "open" ? isOpenRequest(r) : r.status === filter));
}

export type RequestAction = "approve" | "reject" | "fulfil" | "not_fulfilled" | "received";

/** What a step needs: who may do it, from which status, and whether a note is required (§9). */
export const REQUEST_STEPS: Record<RequestAction, { from: EquipmentRequestStatus[]; to: EquipmentRequestStatus; note: boolean; label: string }> = {
  approve: { from: ["sic_pending"], to: "approved", note: false, label: "Approve" },
  reject: { from: ["sic_pending", "approved"], to: "rejected", note: true, label: "Reject" },
  fulfil: { from: ["approved"], to: "fulfilled", note: false, label: "Fulfilled" },
  not_fulfilled: { from: ["approved"], to: "not_fulfilled", note: true, label: "Not fulfilled" },
  received: { from: ["fulfilled"], to: "received", note: false, label: "Received" },
};

/** Why this step can't be done now, or null. */
export function stepBlock(r: Pick<EquipmentRequest, "status">, action: RequestAction, note: string): string | null {
  const step = REQUEST_STEPS[action];
  if (!step.from.includes(r.status)) return `Can't ${step.label.toLowerCase()} a request that is ${REQUEST_STATUS_LABEL[r.status].toLowerCase()}`;
  if (step.note && !note.trim()) return action === "reject" ? "Give a reason to reject" : "Say why it couldn't be fulfilled";
  return null;
}

/** Statuses from before B06, mapped on load. */
export function migrateRequestStatus(s: string): EquipmentRequestStatus {
  if (s === "open") return "sic_pending";
  if (s === "fulfilling") return "approved";
  if (s === "cancelled") return "rejected";
  return s as EquipmentRequestStatus;
}
