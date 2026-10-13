import { PAINT_COATS, PAINT_SCHEMES, THINNER_PCT } from "./paint-schemes";
import type { AppMethod, CalcResult, CoatResult } from "./paint-types";

export function calculatePaint(opts: {
  schemeId: number;
  area: number;
  method: AppMethod;
  contingencyPct?: number;
  manualLitres?: number;
  manualReason?: string;
}): CalcResult {
  const scheme = PAINT_SCHEMES.find((s) => s.id === opts.schemeId);
  if (!scheme) {
    throw new Error(`Unknown MPS scheme ${opts.schemeId}`);
  }
  const contingency = 1 + (opts.contingencyPct ?? 0) / 100;
  const coats = PAINT_COATS.filter((c) => c.m === opts.schemeId);
  // Judged on the chosen method's norms: a scheme with spray norms only still works for spray
  const rateOf = (c: (typeof coats)[number]) => (opts.method === "brush" ? c.b : c.sp);
  const isNoNorm = scheme.status === "none" || coats.every((c) => rateOf(c) == null);

  const coatResults: CoatResult[] = coats.map((coat) => {
    const rate = rateOf(coat);
    if (rate == null) {
      return { coat, litres: null, thinner: null, manual: true };
    }
    const litres = +(rate * opts.area * contingency).toFixed(2);
    const thinner = +(litres * THINNER_PCT).toFixed(2);
    return { coat, litres, thinner, manual: false };
  });

  if (isNoNorm) {
    const manual = opts.manualLitres ?? null;
    const thinner = manual != null ? +(manual * THINNER_PCT).toFixed(2) : null;
    return {
      schemeId: opts.schemeId,
      area: opts.area,
      method: opts.method,
      contingencyPct: opts.contingencyPct ?? 0,
      coats: coatResults,
      totalPaint: manual,
      totalThinner: thinner,
      isNoNorm: true,
      status: scheme.status,
      flaggedForOwner: Boolean(opts.manualReason?.trim()),
    };
  }

  // Coats without a norm can't be added up; the total says so instead of quietly leaving them out
  const missing = coatResults.filter((c) => c.litres == null).map((c) => c.coat.pos);
  const totalPaint = +coatResults.reduce((s, c) => s + (c.litres ?? 0), 0).toFixed(2);
  const totalThinner = +coatResults.reduce((s, c) => s + (c.thinner ?? 0), 0).toFixed(2);

  return {
    schemeId: opts.schemeId,
    area: opts.area,
    method: opts.method,
    contingencyPct: opts.contingencyPct ?? 0,
    coats: coatResults,
    totalPaint,
    totalThinner,
    isNoNorm: false,
    status: scheme.status,
    flaggedForOwner: scheme.status === "disputed" || scheme.status === "verify" || missing.length > 0,
    partial: missing.length ? missing : undefined,
  };
}

const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** m³ — negative or blank sizes count as 0; 3 decimals like every quantity in the app. */
export function scaffoldVolume(l: number, b: number, h: number, e: number) {
  return r3(pos(l) * pos(b) * pos(h) * pos(e));
}

/** m² to 3 decimals (the house rule, same as round3 in work/logic). */
export function areaFromDims(length: number, width: number, faces = 1) {
  return r3(pos(length) * pos(width) * pos(faces));
}
