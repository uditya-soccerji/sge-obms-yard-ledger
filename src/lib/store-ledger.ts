import type { AppState, StoreGroup, StoreItem, StoreMove } from "./types";
import { STORE_CATALOGUE } from "./store-catalogue";
import { MPS_SCHEMES, TYPE6_SHADES } from "./mps-norms";

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
  // Master Data paint: its code is the paint type ("Type 4"); the brand goes in brackets.
  // Type 6 "by shade" is a placeholder — each shade has its own code (TYPE6_SHADES).
  const paints: StoreItem[] = s.masterCatalog.materials.filter((m) => m.sapCode !== "by shade").map((m) => ({
    id: `paint:${m.id}`,
    group: "paint",
    category: /^type/i.test(m.code) ? m.code : m.paintSystem || "Paint",
    name: m.paintSystem ? `${m.label} (${m.paintSystem})` : m.label,
    code: m.sapCode || undefined,
    unit: m.uom || "L",
    trackExpiry: true,
    reorder: {},
    active: m.active,
  }));
  // Every MPS paint (by SAP code) and every Type 6 shade is on the list, unless already there by code
  const have = new Set([...paints, ...s.storeItems].map((i) => i.code).filter(Boolean));
  return [...paints, ...s.storeItems, ...MPS_PAINTS.filter((p) => !have.has(p.code))];
}

/** The paints the MPS sheet names, one item per SAP code; Type 6 one per shade (2026-10-27) */
const MPS_PAINTS: StoreItem[] = (() => {
  const out = new Map<string, StoreItem>();
  for (const s of MPS_SCHEMES) {
    for (const c of s.coats) {
      if (!c.sap || c.sap === "by shade" || out.has(c.sap)) continue;
      const [type, name] = c.paint.includes(":") ? c.paint.split(":").map((x) => x.trim()) : ["MPS paint", c.paint];
      out.set(c.sap, { id: `si-mps-${c.sap}`, group: "paint", category: type, name: `${type} · ${name}`, code: c.sap, unit: "L", trackExpiry: true, reorder: {}, active: true });
    }
  }
  for (const sh of TYPE6_SHADES) {
    out.set(sh.code, { id: `si-mps-${sh.code}`, group: "paint", category: "Type 6", name: `Type 6 · PU finish · ${sh.shade}`, code: sh.code, unit: "L", trackExpiry: true, reorder: {}, active: true });
  }
  return [...out.values()];
})();

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

// ─── Paint types (2026-10-27): paint is picked by type, then SAP code ───────

/** SAP code → its paint type label ("Type 17"), from the MPS sheet; Type 6 shades → "Type 6" */
const TYPE_BY_SAP: Map<string, { type: string; name: string }> = (() => {
  const m = new Map<string, { type: string; name: string }>();
  for (const s of MPS_SCHEMES) {
    for (const c of s.coats) {
      if (!c.sap || c.sap === "by shade") continue;
      const [type, name] = c.paint.includes(":") ? c.paint.split(":").map((x) => x.trim()) : [c.paint, ""];
      if (!m.has(c.sap)) m.set(c.sap, { type: type.replace(/^TYPE/i, "Type").replace(/\s+/g, " "), name });
    }
  }
  for (const sh of TYPE6_SHADES) m.set(sh.code, { type: "Type 6", name: "Aliphatic Acrylic Urethane finish" });
  return m;
})();

/** A paint item's type: from its SAP code when the MPS sheet knows it, else its category */
export function paintTypeOf(item: StoreItem): string {
  return (item.code && TYPE_BY_SAP.get(item.code)?.type) || item.category || "Other paint";
}

/** Type 2 < Type 4 < … < Type 10A < Type 25 < named systems */
function typeOrder(t: string): [number, string] {
  const m = t.match(/^Type\s*(\d+)\s*([A-Z]?)/i);
  return m ? [Number(m[1]), m[2] ?? ""] : [999, t];
}

/** Paint grouped by type, for the type dropdown; each with its SAP-coded items */
export function paintTypes(items: StoreItem[]): { type: string; label: string; items: StoreItem[] }[] {
  const by = new Map<string, StoreItem[]>();
  for (const i of items.filter((x) => x.group === "paint" && x.active)) {
    const t = paintTypeOf(i);
    by.set(t, [...(by.get(t) ?? []), i]);
  }
  return [...by.entries()]
    .map(([type, its]) => {
      const name = its.map((i) => (i.code && TYPE_BY_SAP.get(i.code)?.name) || "").find(Boolean);
      // The SAP code goes with the type: one code → shown; several (Type 6 shades) → counted
      const codes = [...new Set(its.map((i) => i.code).filter(Boolean))];
      const sap = codes.length === 1 ? `SAP ${codes[0]}` : codes.length > 1 ? `${codes.length} SAP codes` : "";
      return { type, label: [type, sap, name].filter(Boolean).join(" · "), items: its.sort((a, b) => a.name.localeCompare(b.name)) };
    })
    .sort((a, b) => {
      const [an, as] = typeOrder(a.type);
      const [bn, bs] = typeOrder(b.type);
      return an - bn || as.localeCompare(bs) || a.type.localeCompare(b.type);
    });
}

/** The two separate stocks: paint, and everything else */
export type StockScope = "paint" | "other";
export const inScope = (item: StoreItem | undefined, scope: StockScope) => !!item && (scope === "paint" ? item.group === "paint" : item.group !== "paint");

// ─── Stock status (2026-10-27): expiry, idle stock, and which batch to issue next ───

/** Paint near expiry = expiring within this many days */
export const NEAR_EXPIRY_DAYS = 30;
/** "Not used" = no issue of the item from this store in this many days */
export const IDLE_DAYS = 30;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Batches still in a store with their first-received date, for FEFO (paint) / FIFO (the rest) */
export function batchesFor(moves: StoreMove[], siteId: string, itemId: string): { batch: string; expiry?: string; received: string; qty: number }[] {
  const by = new Map<string, { batch: string; expiry?: string; received: string; qty: number }>();
  for (const m of moves) {
    if (m.siteId !== siteId || m.itemId !== itemId || !m.batch) continue;
    const b = by.get(m.batch) ?? { batch: m.batch, expiry: m.expiry, received: m.date, qty: 0 };
    if (!b.expiry && m.expiry) b.expiry = m.expiry;
    if (m.kind !== "issue" && m.date < b.received) b.received = m.date;
    b.qty = round(b.qty + signedIn(m));
    by.set(m.batch, b);
  }
  return [...by.values()].filter((b) => b.qty > 0);
}

export interface StockStatus {
  expiredQty: number;
  nearQty: number;
  lastIssue?: string;
  /** In stock but no issue in the last IDLE_DAYS */
  idle: boolean;
  /** The batch to issue next: earliest expiry for paint (FEFO), earliest received for the rest (FIFO) */
  next?: { batch: string; expiry?: string; received: string; qty: number };
}

export function stockStatus(moves: StoreMove[], siteId: string, item: StoreItem, today: string, inStoreQty: number): StockStatus {
  const batches = batchesFor(moves, siteId, item.id);
  const near = addDays(today, NEAR_EXPIRY_DAYS);
  const expiredQty = round(batches.filter((b) => b.expiry && b.expiry < today).reduce((t, b) => t + b.qty, 0));
  const nearQty = round(batches.filter((b) => b.expiry && b.expiry >= today && b.expiry <= near).reduce((t, b) => t + b.qty, 0));
  const lastIssue = moves.filter((m) => m.kind === "issue" && m.siteId === siteId && m.itemId === item.id).map((m) => m.date).sort().pop();
  const idle = inStoreQty > 0 && (!lastIssue || lastIssue < addDays(today, -IDLE_DAYS));
  const usable = batches.filter((b) => !b.expiry || b.expiry >= today);
  const order = item.group === "paint"
    ? usable.sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999") || a.received.localeCompare(b.received))
    : usable.sort((a, b) => a.received.localeCompare(b.received));
  return { expiredQty, nearQty, lastIssue, idle, next: order[0] };
}

/** Quantity issued to each plant of a site, item by item (issued, not yet used — DPR use comes in stage 2) */
export function byPlant(moves: StoreMove[], siteId: string, itemId: string): { plant: string; qty: number }[] {
  const m = new Map<string, number>();
  for (const x of moves) if (x.kind === "issue" && x.siteId === siteId && x.itemId === itemId && x.plant) m.set(x.plant, round((m.get(x.plant) ?? 0) + x.qty));
  return [...m.entries()].map(([plant, qty]) => ({ plant, qty })).filter((p) => p.qty > 0).sort((a, b) => b.qty - a.qty);
}
