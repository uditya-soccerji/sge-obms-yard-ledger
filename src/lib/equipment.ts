/**
 * Supervisor equipment "setups" (docs §7, B05). Each supervisor holds a set of
 * items; tagged kinds are one record per item (tag TYPE-SITE-##), counted kinds
 * (gloves, PPE kits) carry a quantity. Expiry warns 15 days ahead (§7).
 */
import type { EquipmentItem, EquipmentKind } from "./types";

/** §7: warn this many days before an item expires. */
export const EQUIP_EXPIRY_WARN_DAYS = 15;

export interface EquipmentKindDef {
  id: EquipmentKind;
  label: string;
  /** Tag prefix for TYPE-SITE-## (§7) */
  code: string;
  /** tagged = one record per item; counted = a quantity per batch */
  tracking: "tagged" | "counted";
  /** Approximate value per item / unit, ₹ (owner, 2026-10-13: IFR ~₹5,000) */
  unitValue?: number;
}

export const EQUIPMENT_KINDS: EquipmentKindDef[] = [
  { id: "compressor", label: "Compressor", code: "CMP", tracking: "tagged" },
  { id: "hopper", label: "Hopper", code: "HOP", tracking: "tagged" },
  { id: "airless", label: "Airless spray painting machine", code: "ALS", tracking: "tagged" },
  { id: "harness", label: "Harness", code: "FBH", tracking: "tagged" },
  { id: "ppe_kit", label: "PPE kit", code: "PPE", tracking: "counted" },
  { id: "ifr", label: "IFR (body suit)", code: "IFR", tracking: "tagged", unitValue: 5000 },
  { id: "helmet", label: "Helmet", code: "HLM", tracking: "tagged" },
  { id: "gloves", label: "Gloves", code: "GLV", tracking: "counted" },
  { id: "rope_access", label: "Rope access kit", code: "RAK", tracking: "tagged" },
];

export function kindDef(kind: EquipmentKind): EquipmentKindDef {
  return EQUIPMENT_KINDS.find((k) => k.id === kind) ?? { id: kind, label: kind, code: kind.slice(0, 3).toUpperCase(), tracking: "tagged" };
}

/** Items in a supervisor's setup. */
export function setupOf(items: EquipmentItem[], supervisorId: string): EquipmentItem[] {
  return items.filter((e) => e.supervisorId === supervisorId);
}

/** FEFO = first expiry first (no expiry last); FIFO = first issued first. */
export function sortSetup(items: EquipmentItem[], order: "fefo" | "fifo"): EquipmentItem[] {
  const far = "9999-12-31";
  return [...items].sort((a, b) =>
    order === "fefo"
      ? (a.expiryDate ?? far).localeCompare(b.expiryDate ?? far) || a.tag.localeCompare(b.tag)
      : (a.issuedOn ?? far).localeCompare(b.issuedOn ?? far) || a.tag.localeCompare(b.tag)
  );
}

export type ExpiryState = "expired" | "soon" | "ok" | "none";

export function equipExpiryState(expiry: string | undefined, today: string): ExpiryState {
  if (!expiry) return "none";
  const days = Math.round((Date.parse(expiry) - Date.parse(today)) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= EQUIP_EXPIRY_WARN_DAYS) return "soon";
  return "ok";
}

/** Rupee value a supervisor holds (kinds with a known unit value). */
export function setupValue(items: EquipmentItem[]): number {
  return items.reduce((s, e) => s + (kindDef(e.type).unitValue ?? 0) * (e.qty ?? 1), 0);
}

/** Next tag TYPE-SITE-## for a kind on a site (§7), e.g. IFR-MTF-03. */
export function nextTag(kind: EquipmentKind, siteCode: string, items: EquipmentItem[]): string {
  const prefix = `${kindDef(kind).code}-${siteCode}-`;
  const used = items.map((e) => e.tag).filter((t) => t.startsWith(prefix)).map((t) => Number(t.slice(prefix.length)) || 0);
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(2, "0")}`;
}

/** Why an expiry can't be set, or null when fine. */
export function checkExpiry(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return "Pick a valid expiry date";
  return null;
}
