import { PAINT_COATS, PAINT_SCHEMES, THINNER_PCT } from "./paint-schemes";
import type { DprPaintWorkLine } from "./types";

/** How far litres may drift from the MPS norm before the line is flagged (docs §5 "far off"). */
export const NORM_WARN = 0.5;

/** A paint the supervisor can pick on a painting line, with its SAP code when known. */
export interface PaintChoice {
  name: string;
  sap: string;
}

/**
 * MPS numbers to choose from: every scheme with norms, plus MPS used by the
 * work order's service items (e.g. MPS-6, MPS-23) so a real job's MPS is never missing.
 */
export function mpsOptions(extra: number[] = []): number[] {
  return [...new Set([...PAINT_SCHEMES.map((s) => s.id), ...extra])]
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
}

/** "MPS-13" → 13 (service items store the MPS as text). */
export function mpsNumber(label: string): number | null {
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : null;
}

/** Paint types in an MPS system (one per paint, in coat order), plus its thinner. */
export function paintChoicesFor(mps: number | undefined): PaintChoice[] {
  if (mps == null) return [];
  const out: PaintChoice[] = [];
  for (const c of PAINT_COATS.filter((x) => x.m === mps)) {
    if (!out.some((o) => o.name === c.p)) out.push({ name: c.p, sap: c.sap });
  }
  const thinner = PAINT_COATS.find((x) => x.m === mps && x.tsap)?.tsap;
  if (out.length) out.push({ name: "Thinner", sap: thinner ?? "" });
  return out;
}

/** Total litres on a line: the per-paint rows when present, else the old single figure. */
export function lineLitres(line: Pick<DprPaintWorkLine, "paints" | "paintLitres">): number {
  if (line.paints?.length) return Math.round(line.paints.reduce((s, p) => s + (p.litres || 0), 0) * 1000) / 1000;
  return line.paintLitres ?? 0;
}

/**
 * Litres the MPS norm expects for this area (brush norm per coat + thinner %),
 * or null when the scheme has no norm (e.g. MPS-7) or the line isn't painting.
 */
export function normLitres(line: Pick<DprPaintWorkLine, "activity" | "areaM2" | "mpsScheme">): number | null {
  if (line.activity !== "painting" || !(line.areaM2 > 0) || line.mpsScheme == null) return null;
  const coats = PAINT_COATS.filter((c) => c.m === line.mpsScheme);
  if (!coats.length || coats.some((c) => c.b == null)) return null;
  const paint = coats.reduce((s, c) => s + (c.b ?? 0), 0) * line.areaM2;
  return Math.round(paint * (1 + THINNER_PCT) * 10) / 10;
}

/** "far off" the norm (docs §5): a warning, never a block. Returns the message or null. */
export function normWarning(line: DprPaintWorkLine): string | null {
  const norm = normLitres(line);
  const used = lineLitres(line);
  if (norm == null || !(used > 0)) return null;
  const off = (used - norm) / norm;
  if (Math.abs(off) <= NORM_WARN) return null;
  return `${used} L is ${Math.round(Math.abs(off) * 100)}% ${off > 0 ? "above" : "below"} the MPS-${line.mpsScheme} norm (~${norm} L for ${line.areaM2} m²)`;
}
