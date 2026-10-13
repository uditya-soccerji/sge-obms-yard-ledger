import type { MaterialItem } from "./master/types";
import type { PaintStockLine } from "./types";

/** Default tolerance (docs §6) until a paint's MPS tolerance is set in Master Data → Materials. */
export const DEFAULT_VARIANCE_TOLERANCE_PCT = 8;

/** Tolerance for a paint line: the matching material's setting, else the default. */
export function toleranceFor(line: Pick<PaintStockLine, "sapCode">, materials: MaterialItem[]): number {
  const m = materials.find((x) => x.active && x.sapCode && x.sapCode === line.sapCode);
  return m?.varianceTolerancePct ?? DEFAULT_VARIANCE_TOLERANCE_PCT;
}

/**
 * SGE-used vs RIL-posted litres for one line (docs §6). Owner home and the
 * Store page both use this, so they flag the same lines with the same rule.
 */
export function paintVariance(line: PaintStockLine, materials: MaterialItem[]) {
  if (line.rilPosted == null || line.sgeUsed == null || !(line.rilPosted > 0)) return null;
  const litres = Math.round((line.sgeUsed - line.rilPosted) * 100) / 100;
  const pct = (litres / line.rilPosted) * 100;
  const tolerance = toleranceFor(line, materials);
  return { litres, pct, tolerance, over: Math.abs(pct) > tolerance };
}
