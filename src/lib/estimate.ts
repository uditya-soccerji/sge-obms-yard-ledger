import type { RateCard, RateCardKind, RateLine } from "./types";
import { resolveActivityRate } from "./rate-book";

export interface EstimateInput {
  kind: RateCardKind;
  quantity: number;
  rateOverride?: number;
  paintOverride?: number;
  manpowerOverride?: number;
  /** When set, prefer latest rate-book line for this site. */
  siteId?: string;
  rateLines?: RateLine[];
}

export interface EstimateResult {
  kind: RateCardKind;
  quantity: number;
  unit: "m2" | "m3";
  rateInr: number;
  costInr: number;
  paintLitres: number;
  manpowerDays: number;
  materialNote?: string;
  /** True when ₹ came from PO rate book rather than legacy rate card. */
  fromRateBook?: boolean;
  rateBookLineId?: string;
}

export function estimateCost(
  cards: RateCard[],
  input: EstimateInput
): EstimateResult | null {
  const card = cards.find((c) => c.kind === input.kind);
  if (!card) return null;

  let rate = input.rateOverride ?? card.rateInr;
  let fromRateBook = false;
  let rateBookLineId: string | undefined;
  if (
    input.rateOverride == null &&
    input.siteId &&
    input.rateLines &&
    input.rateLines.length
  ) {
    const book = resolveActivityRate(
      input.rateLines,
      input.siteId,
      input.kind,
      card.unit
    );
    if (book) {
      rate = book.rateInr;
      fromRateBook = true;
      rateBookLineId = book.id;
    }
  }

  const paintPer = input.paintOverride ?? card.paintLitresPerUnit ?? 0;
  const mpPer = input.manpowerOverride ?? card.manpowerDaysPerUnit;
  return {
    kind: input.kind,
    quantity: input.quantity,
    unit: card.unit,
    rateInr: rate,
    costInr: Math.round(input.quantity * rate),
    paintLitres: Math.round(input.quantity * paintPer * 10) / 10,
    manpowerDays: Math.round(input.quantity * mpPer * 10) / 10,
    materialNote: fromRateBook
      ? `Rate book · ${card.materialNote ?? ""}`.trim()
      : card.materialNote,
    fromRateBook,
    rateBookLineId,
  };
}

export function scoreFromMatchRatio(ratio: number): number {
  if (ratio >= 0.98) return 5;
  if (ratio >= 0.9) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.65) return 2;
  return 1;
}
