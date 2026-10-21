/**
 * Store equipment register (round 2, docs §27). Tagged items are tracked one by
 * one (compressor, hopper, airless machine, harness, IFR body suit, rope access);
 * counted items by quantity in lots with an expiry (gloves, PPE kit, helmet).
 * Issues take the oldest expiry first. Returns are confirmed by the store; a
 * scrapped item also needs the SIC before it leaves the books.
 */
import type { EquipmentItem, KitIssue, KitLot } from "./types";

export type TaggedType = EquipmentItem["type"];
export type KitType = KitLot["item"];

export const TAGGED: { type: TaggedType; label: string; value?: number }[] = [
  { type: "compressor", label: "Compressor" },
  { type: "hopper", label: "Hopper" },
  { type: "airless", label: "Airless spray machine" },
  { type: "harness", label: "Full-body harness" },
  { type: "ifr", label: "IFR body suit", value: 5000 },
  { type: "rope_access", label: "Rope access kit" },
];
export const KITS: { item: KitType; label: string }[] = [
  { item: "gloves", label: "Gloves (pair)" },
  { item: "ppe_kit", label: "PPE kit" },
  { item: "helmet", label: "Helmet" },
];
export const taggedLabel = (t: string) => TAGGED.find((x) => x.type === t)?.label ?? t;
export const kitLabel = (t: string) => KITS.find((x) => x.item === t)?.label ?? t;

/** Oldest expiry first; lots without an expiry go last, then oldest received */
export function fefo(a: { expiryDate?: string; receivedOn?: string }, b: { expiryDate?: string; receivedOn?: string }) {
  if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
  if (a.expiryDate) return -1;
  if (b.expiryDate) return 1;
  return (a.receivedOn ?? "").localeCompare(b.receivedOn ?? "");
}

/** Take qty from the site's lots, oldest expiry first; null when there isn't enough */
export function pickLots(lots: KitLot[], siteId: string, item: KitType, qty: number, today: string): KitIssue["lots"] | null {
  const usable = lots.filter((l) => l.siteId === siteId && l.item === item && l.qty > 0 && (!l.expiryDate || l.expiryDate >= today)).sort(fefo);
  const out: KitIssue["lots"] = [];
  let left = qty;
  for (const l of usable) {
    if (left <= 0) break;
    const take = Math.min(l.qty, left);
    out.push({ lotId: l.id, qty: take, expiryDate: l.expiryDate });
    left -= take;
  }
  return left > 0 ? null : out;
}

export const inStore = (lots: KitLot[], siteId: string, item: KitType, today: string) =>
  lots.filter((l) => l.siteId === siteId && l.item === item && (!l.expiryDate || l.expiryDate >= today)).reduce((t, l) => t + l.qty, 0);

export const RETURN_CONDITIONS = [
  { value: "ok", label: "OK (back to store)" },
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "scrapped", label: "Scrapped" },
] as const;
