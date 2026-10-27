import { currentMonthOf, lineStatus } from "./work/logic";
import type { Stage, WorkState } from "./work/types";
import { schemeOf, type Method } from "./mps-norms";

/** Type 6 needs are by type — the plan doesn't say the shade */
export const TYPE6_KEY = "Type 6";

/** The DPR stage a coat is painted at (a stripe coat goes with the first coat) */
const STAGE_OF: Record<string, Stage> = { Stripe: "coat1", First: "coat1", Intermediate: "coat2", Final: "final" };

/**
 * 2026-10-27: paint still needed this month, by paint and plant, from the site's plan.
 * For each plan line: its service item's MPS gives the coats; each coat needs
 * (plan remaining m² − m² already painted at that coat) × norm (brush, or spray when the item says SPRAY).
 * Keyed by SAP code; Type 6 by TYPE6_KEY.
 */
export function plannedPaintNeed(work: WorkState, siteId: string): Map<string, { plant: string; litres: number }[]> {
  const month = currentMonthOf(work, siteId);
  const byKey = new Map<string, Map<string, number>>();
  for (const line of work.planLines.filter((l) => l.siteId === siteId && l.month === month)) {
    const item = work.serviceItems.find((x) => x.code === line.serviceCode);
    const scheme = schemeOf(item?.mps);
    if (!scheme) continue;
    const method: Method = /SPRAY/i.test(item?.description ?? "") ? "spray" : "brush";
    const st = lineStatus(line, work);
    for (const c of scheme.coats) {
      const norm = c[method];
      if (!norm || !c.sap) continue;
      const area = Math.max(0, st.remaining - (st.inProgress[STAGE_OF[c.coat] ?? "coat1"] ?? 0));
      if (!area) continue;
      const key = c.sap === "by shade" ? TYPE6_KEY : c.sap;
      const plants = byKey.get(key) ?? new Map<string, number>();
      plants.set(line.plant, (plants.get(line.plant) ?? 0) + area * norm);
      byKey.set(key, plants);
    }
  }
  const out = new Map<string, { plant: string; litres: number }[]>();
  for (const [k, plants] of byKey) out.set(k, [...plants.entries()].map(([plant, l]) => ({ plant, litres: Math.round(l * 10) / 10 })).sort((a, b) => b.litres - a.litres));
  return out;
}
