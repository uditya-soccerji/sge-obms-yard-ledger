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
  const isNoNorm = scheme.status === "none" || coats.every((c) => c.b == null);

  const coatResults: CoatResult[] = coats.map((coat) => {
    const rate = opts.method === "brush" ? coat.b : coat.sp;
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
    flaggedForOwner: scheme.status === "disputed" || scheme.status === "verify",
  };
}

export function scaffoldVolume(l: number, b: number, h: number, e: number) {
  return +(l * b * h * e).toFixed(2);
}

export function areaFromDims(length: number, width: number, faces = 1) {
  return +(length * width * faces).toFixed(2);
}
