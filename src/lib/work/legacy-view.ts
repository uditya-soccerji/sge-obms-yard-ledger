/**
 * TEMPORARY (merge plan Step 4–7): the legacy JMS package screen still matches
 * JMS lines against "DPR paint lines". This turns Work reports + job lines into
 * that shape. Deleted when the JMS package model goes (Step 7).
 */
import { entryArea, round3 } from "./logic";
import type { DprReport, WorkState } from "./types";

export type LegacyDprView = DprReport & {
  paintWork: { id: string; plant: string; activity: "painting" | "blasting"; areaM2: number }[];
};

export function reportsAsDprDocuments(w: Pick<WorkState, "reports" | "dprs">): LegacyDprView[] {
  return w.reports.map((r) => ({
    ...r,
    paintWork: w.dprs
      .filter((e) => e.reportId === r.id)
      .map((e) => ({ id: e.id, plant: r.plant, activity: e.stage === "prep" ? ("blasting" as const) : ("painting" as const), areaM2: round3(entryArea(e)) })),
  }));
}
