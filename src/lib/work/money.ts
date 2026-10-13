/**
 * Day figures for the home screens (merge plan Step 9): spend = Work costs
 * (voided ones left out), income = JMS payments received (docs §18: income is
 * only ever a JMS payment).
 */
import type { WorkState } from "./types";

export function spendOn(w: Pick<WorkState, "expenses">, day: string, inSite: (siteId: string) => boolean): number {
  return w.expenses.filter((x) => !x.voided && x.date === day && inSite(x.siteId)).reduce((t, x) => t + x.amount, 0);
}

export function receivedOn(w: Pick<WorkState, "jms" | "planLines">, day: string, inSite: (siteId: string) => boolean): number {
  return w.jms
    .filter((j) => j.payment?.receivedOn === day && inSite(w.planLines.find((l) => l.id === j.planLineId)?.siteId ?? ""))
    .reduce((t, j) => t + (j.payment?.amount ?? 0), 0);
}
