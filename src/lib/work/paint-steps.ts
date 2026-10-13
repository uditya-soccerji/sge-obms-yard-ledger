/**
 * Paint lifecycle in Work (merge plan §3, Owner decision 3). Batches carry the
 * stages before the paint is ours to issue (PR → PO → RIL store → SGE store);
 * after that, 941 / 942 / 261 are our own steps — issue, month reco, posting —
 * with RIL's numbers typed against them for reference only.
 */
import type { MaterialItem } from "../master/types";
import { effectiveEntries, round3 } from "./logic";
import type { DprEntry, PaintBatch, PaintLifecycle, PaintStep, WorkState } from "./types";

export const LIFECYCLE: PaintLifecycle[] = ["pr", "po", "ril_receive", "sge_receive"];
export const LIFECYCLE_LABEL: Record<PaintLifecycle, string> = {
  pr: "PR raised",
  po: "PO placed",
  ril_receive: "In RIL store",
  sge_receive: "In SGE store",
};

/** A batch is stock we can issue once it is in the SGE store (no lifecycle = older rows, already in stock). */
export const inStock = (b: PaintBatch) => (b.lifecycle ?? "sge_receive") === "sge_receive";
export const onOrder = (b: PaintBatch) => !inStock(b);

/** Litres a supervisor used of one paint in one month, from DPR job lines (Admin's figure wins, §5b). */
export function paintUsedInMonth(supervisorId: string, sap: string, month: string, dprs: DprEntry[]): number {
  return round3(
    effectiveEntries(dprs)
      .filter((e) => e.supervisorId === supervisorId && e.paintSap === sap && e.date.startsWith(month))
      .reduce((s, e) => s + e.litres, 0)
  );
}

export interface RecoRow {
  supervisorId: string;
  sap: string;
  name: string;
  month: string;
  used: number;
  /** The 942 step, once the month's reco is done */
  reco?: PaintStep;
  /** The 261 step, once posted */
  posted?: PaintStep;
}

/**
 * Month-end reconciliation rows: every supervisor · paint · month with DPR use
 * or a 942 already made, so the store sees what is still to reco and post.
 */
export function recoRows(w: Pick<WorkState, "dprs" | "paint" | "paintSteps">, siteOf: (supervisorId: string) => string | undefined, siteFilter: (siteId: string) => boolean): RecoRow[] {
  const keys = new Map<string, RecoRow>();
  const nameOf = (sap: string) => w.paint.find((b) => b.sap === sap)?.name ?? sap;
  for (const e of effectiveEntries(w.dprs)) {
    if (!e.paintSap || !(e.litres > 0)) continue;
    const site = siteOf(e.supervisorId);
    if (!site || !siteFilter(site)) continue;
    const month = e.date.slice(0, 7);
    const k = `${e.supervisorId}|${e.paintSap}|${month}`;
    if (!keys.has(k)) keys.set(k, { supervisorId: e.supervisorId, sap: e.paintSap, name: nameOf(e.paintSap), month, used: 0 });
  }
  for (const s of w.paintSteps.filter((x) => x.step === "942")) {
    const site = siteOf(s.supervisorId);
    if (!site || !siteFilter(site)) continue;
    const k = `${s.supervisorId}|${s.sap}|${s.month}`;
    if (!keys.has(k)) keys.set(k, { supervisorId: s.supervisorId, sap: s.sap, name: nameOf(s.sap), month: s.month, used: 0 });
  }
  for (const r of keys.values()) {
    r.used = paintUsedInMonth(r.supervisorId, r.sap, r.month, w.dprs);
    r.reco = w.paintSteps.find((s) => s.step === "942" && s.supervisorId === r.supervisorId && s.sap === r.sap && s.month === r.month);
    r.posted = r.reco ? w.paintSteps.find((s) => s.step === "261" && s.recoId === r.reco!.id) : undefined;
  }
  return [...keys.values()].sort((a, b) => b.month.localeCompare(a.month) || a.supervisorId.localeCompare(b.supervisorId));
}

/** Default tolerance (docs §6) until a paint's tolerance is set in Master Data → Materials. */
export const DEFAULT_VARIANCE_TOLERANCE_PCT = 8;

export function toleranceFor(sap: string, materials: MaterialItem[]): number {
  return materials.find((m) => m.active && m.sapCode === sap)?.varianceTolerancePct ?? DEFAULT_VARIANCE_TOLERANCE_PCT;
}

/** Our DPR-derived use vs RIL's litres on a 942 step, where RIL gave a figure (docs §6). */
export function stepVariance(step: PaintStep, materials: MaterialItem[]) {
  if (step.step !== "942" || step.rilLitres == null || !(step.rilLitres > 0)) return null;
  const litres = round3(step.litres - step.rilLitres);
  const pct = (litres / step.rilLitres) * 100;
  const tolerance = toleranceFor(step.sap, materials);
  return { litres, pct, tolerance, over: Math.abs(pct) > tolerance };
}
