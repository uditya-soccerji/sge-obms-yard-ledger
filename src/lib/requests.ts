import type { EquipmentRequest, RequestReason } from "./types";

/** Why a supervisor asks the store for something (owner, docs §24) */
export const REQUEST_REASONS: { value: RequestReason; label: string }[] = [
  { value: "urgent", label: "Urgent" },
  { value: "damaged", label: "Damaged" },
  { value: "required", label: "Required" },
  { value: "replacement", label: "Replacement" },
  { value: "scrapped", label: "Scrapped" },
  { value: "expired", label: "Expired" },
];

export const reasonLabel = (r?: RequestReason) => REQUEST_REASONS.find((x) => x.value === r)?.label ?? "";

/** Still with the store (or bounced back to the SIC) */
export const OPEN_STATUSES: EquipmentRequest["status"][] = ["open", "sic_approved", "fulfilling", "rejected"];

/** Queue order: rejected (SIC must decide) and urgent first, then oldest first */
export function queueOrder(a: EquipmentRequest, b: EquipmentRequest): number {
  const rank = (r: EquipmentRequest) =>
    !OPEN_STATUSES.includes(r.status) ? 3 : r.status === "rejected" ? 0 : r.urgent || r.reason === "urgent" ? 1 : 2;
  return rank(a) - rank(b) || (rank(a) === 3 ? b.updatedAt.localeCompare(a.updatedAt) : a.createdAt.localeCompare(b.createdAt));
}
