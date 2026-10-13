import type { RateLine } from "./types";

/** Lookup key: site + item + uom. */
export function rateLookupKey(
  siteId: string,
  itemKey: string,
  uom: string
): string {
  return `${siteId}::${itemKey.trim().toLowerCase()}::${uom.trim().toLowerCase()}`;
}

/**
 * Latest rate for (site, itemKey, uom): highest effectiveFrom among
 * non-superseded lines that include the site. Ties broken by insertion order (last wins).
 */
export function latestRate(
  lines: RateLine[],
  siteId: string,
  itemKey: string,
  uom: string
): RateLine | null {
  const key = itemKey.trim().toLowerCase();
  const unit = uom.trim().toLowerCase();
  const candidates = lines.filter(
    (l) =>
      !l.superseded &&
      l.siteIds.includes(siteId) &&
      l.itemKey.trim().toLowerCase() === key &&
      l.uom.trim().toLowerCase() === unit
  );
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) =>
    cur.effectiveFrom >= best.effectiveFrom ? cur : best
  );
}

/** Current (non-superseded) rates for a site, one row per itemKey+uom. */
export function currentRatesForSite(
  lines: RateLine[],
  siteId: string
): RateLine[] {
  const byKey = new Map<string, RateLine>();
  for (const line of lines) {
    if (line.superseded || !line.siteIds.includes(siteId)) continue;
    const k = `${line.itemKey.trim().toLowerCase()}::${line.uom.trim().toLowerCase()}`;
    const prev = byKey.get(k);
    if (!prev || line.effectiveFrom >= prev.effectiveFrom) {
      byKey.set(k, line);
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.description.localeCompare(b.description)
  );
}

/** History for an item at a site (all versions, newest first). */
export function rateHistory(
  lines: RateLine[],
  siteId: string,
  itemKey: string,
  uom?: string
): RateLine[] {
  const key = itemKey.trim().toLowerCase();
  return lines
    .filter(
      (l) =>
        l.siteIds.includes(siteId) &&
        l.itemKey.trim().toLowerCase() === key &&
        (uom == null || l.uom.trim().toLowerCase() === uom.trim().toLowerCase())
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

/**
 * Heuristic: map estimator / JMS activity kinds to a representative PO item key
 * when an exact match isn't provided.
 */
export const ACTIVITY_ITEM_HINTS: Record<
  string,
  { itemKey: string; uom: string; label: string }[]
> = {
  pipeline: [
    { itemKey: "3378186", uom: "m2", label: "MPS18 blast+spray (pipeline-ish)" },
    { itemKey: "3378166", uom: "m2", label: "MPS19 handtool brush" },
  ],
  structures: [
    { itemKey: "3378225", uom: "m2", label: "MPS18 blast brushroller" },
    { itemKey: "3378139", uom: "m2", label: "MPS19 powertool spray" },
  ],
  tanks: [
    { itemKey: "3361261", uom: "m2", label: "Cu slag blast armamastic" },
    { itemKey: "3143998", uom: "m2", label: "Surface prep manual/mech" },
  ],
  scaffolding: [],
  painting: [
    { itemKey: "3378186", uom: "m2", label: "MPS18 blast+spray" },
    { itemKey: "3378166", uom: "m2", label: "MPS19 handtool" },
  ],
  blasting: [
    { itemKey: "3361261", uom: "m2", label: "Cu slag blast" },
    { itemKey: "3143998", uom: "m2", label: "Surface prep" },
  ],
};

/**
 * Resolve the rate book line for an activity at a site, through the item
 * hints above. With `guess` (estimates only), fall back to the first current
 * painting-like line at the site; never guess for money that gets billed.
 */
export function resolveActivityRate(
  lines: RateLine[],
  siteId: string,
  activity: string,
  uom?: string,
  guess = false
): RateLine | null {
  const hints = ACTIVITY_ITEM_HINTS[activity] ?? [];
  for (const h of hints) {
    if (uom && h.uom !== uom) continue;
    const hit = latestRate(lines, siteId, h.itemKey, h.uom);
    if (hit) return hit;
  }
  if (!guess) return null;
  // Estimate-only fallback: first current m2 painting-ish line at site
  const current = currentRatesForSite(lines, siteId);
  const unit = (uom ?? "m2").toLowerCase();
  return (
    current.find(
      (l) =>
        l.uom.toLowerCase() === unit &&
        /paint|blast|mps|spray|prep/i.test(l.description)
    ) ?? null
  );
}

/**
 * Mark older same-key lines superseded after inserting a newer line — only
 * for the sites the new line covers. An older DTA+MTF line hit by a DTA-only
 * rate is split: it stays current for MTF and is superseded for DTA.
 */
export function withSupersession(
  existing: RateLine[],
  incoming: RateLine
): RateLine[] {
  return existing.flatMap((l) => {
    if (l.id === incoming.id) return [l];
    const sameItem =
      l.itemKey.trim().toLowerCase() === incoming.itemKey.trim().toLowerCase() &&
      l.uom.trim().toLowerCase() === incoming.uom.trim().toLowerCase();
    if (!sameItem || l.superseded) return [l];
    const shared = l.siteIds.filter((s) => incoming.siteIds.includes(s));
    if (!shared.length) return [l];
    if (l.effectiveFrom < incoming.effectiveFrom) {
      const rest = l.siteIds.filter((s) => !incoming.siteIds.includes(s));
      if (!rest.length) return [{ ...l, superseded: true }];
      return [
        { ...l, siteIds: shared, superseded: true },
        { ...l, id: `${l.id}-${rest.join("-")}`, siteIds: rest },
      ];
    }
    if (
      l.effectiveFrom === incoming.effectiveFrom &&
      l.id !== incoming.id
    ) {
      // Same date: keep both current; latestRate takes the later one
      return [l];
    }
    return [l];
  });
}
