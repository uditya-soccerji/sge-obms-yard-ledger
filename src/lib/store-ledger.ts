import type { AppState, StoreGroup, StoreItem, StoreMove } from "./types";
import { STORE_CATALOGUE } from "./store-catalogue";

/**
 * Store ledger (2026-10-27, stage 1): one item list, every in / out a line,
 * stock = the sum of the lines. Paint items come live from Master Data → Materials.
 */

export const GROUP_LABEL: Record<StoreGroup, string> = { paint: "Paint", material: "Materials", equipment: "Equipment", ppe: "PPE", fuel: "Fuel", other: "Others" };

/** Which group the owner's categories belong to */
export function groupForCategory(category: string): StoreGroup {
  if (category === "Safety & PPE") return "ppe";
  if (category === "Hardware & Hand Tools") return "equipment";
  if (category === "Office Supplies & Stationery") return "other";
  if (category === "Fuel") return "fuel";
  return "material";
}

/** Items saved before the groups were split ("consumable") move to their group */
export function normalizeStoreItems(items: (Omit<StoreItem, "group"> & { group: string })[]): StoreItem[] {
  return items.map((i) => (i.group === "consumable" ? { ...i, group: groupForCategory(i.category) } : (i as StoreItem)));
}

export const MOVE_LABEL: Record<StoreMove["kind"], string> = { opening: "Opening stock", receive: "Receive", issue: "Issue", adjust: "Adjust" };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The starting item list: the owner's 7 categories + diesel (paint is added from Master Data, not here) */
export function seedStoreItems(): StoreItem[] {
  const items: StoreItem[] = [];
  for (const c of STORE_CATALOGUE) {
    const group = groupForCategory(c.name);
    for (const name of c.items) {
      items.push({ id: `si-${slug(c.name)}-${slug(name)}`, group, category: c.name, name, unit: "nos", trackExpiry: false, reorder: {}, active: true });
    }
  }
  items.push({ id: "si-fuel-diesel", group: "fuel", category: "Fuel", name: "Diesel", unit: "L", trackExpiry: false, reorder: {}, active: true });
  return items;
}

/** Every store item: the store's own list + each paint in Master Data → Materials */
export function allStoreItems(s: Pick<AppState, "storeItems" | "masterCatalog">): StoreItem[] {
  const paints: StoreItem[] = s.masterCatalog.materials.map((m) => ({
    id: `paint:${m.id}`,
    group: "paint",
    category: m.paintSystem || "Paint",
    name: m.label,
    code: m.sapCode,
    unit: m.uom || "L",
    trackExpiry: true,
    reorder: {},
    active: m.active,
  }));
  return [...paints, ...s.storeItems];
}

const signedIn = (m: StoreMove) => (m.kind === "issue" ? -m.qty : m.qty);

/** Quantity in a store (not with supervisors) */
export function inStore(moves: StoreMove[], siteId: string, itemId: string): number {
  return round(moves.filter((m) => m.siteId === siteId && m.itemId === itemId).reduce((t, m) => t + signedIn(m), 0));
}

/** Quantity a supervisor holds (issued, not yet used or returned — use / return come in stages 2 and 3) */
export function heldBy(moves: StoreMove[], supervisorId: string, itemId: string): number {
  return round(moves.filter((m) => m.kind === "issue" && m.supervisorId === supervisorId && m.itemId === itemId).reduce((t, m) => t + m.qty, 0));
}

/** What a supervisor holds now, item by item (positive only) */
export function holdingsOf(moves: StoreMove[], supervisorId: string): { itemId: string; qty: number; flagged: boolean }[] {
  const ids = [...new Set(moves.filter((m) => m.supervisorId === supervisorId).map((m) => m.itemId))];
  return ids
    .map((itemId) => ({ itemId, qty: heldBy(moves, supervisorId, itemId), flagged: moves.some((m) => m.supervisorId === supervisorId && m.itemId === itemId && !!m.extraIssue) }))
    .filter((h) => h.qty > 0);
}

/** Batches still in a store, oldest expiry first (for an expiry-tracked item) */
export function batchesInStore(moves: StoreMove[], siteId: string, itemId: string): { batch: string; expiry?: string; qty: number }[] {
  const by = new Map<string, { batch: string; expiry?: string; qty: number }>();
  for (const m of moves) {
    if (m.siteId !== siteId || m.itemId !== itemId || !m.batch) continue;
    const b = by.get(m.batch) ?? { batch: m.batch, expiry: m.expiry, qty: 0 };
    if (!b.expiry && m.expiry) b.expiry = m.expiry;
    b.qty = round(b.qty + signedIn(m));
    by.set(m.batch, b);
  }
  return [...by.values()].filter((b) => b.qty > 0).sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
