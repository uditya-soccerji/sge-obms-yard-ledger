import type { DprDocument, Labourer } from "./types";

/** Max area on one painting / blasting line (docs §5). */
export const MAX_LINE_M2 = 2000;

/** Crew a DPR must account for: the submitter's active labourers. */
export function dprCrew(doc: Pick<DprDocument, "submitterId" | "submitterType">, labourers: Labourer[]): Labourer[] {
  if (doc.submitterType === "safety" || doc.submitterType === "store") return [];
  return labourers.filter((l) => l.active && l.supervisorId === doc.submitterId);
}

/**
 * What stops a DPR from being submitted to SIC (docs §5 "before submitting").
 * Returns a list of plain-language problems; empty means it can go.
 * Saving a draft is never blocked, only submitting.
 */
export function validateDprForSubmit(
  doc: DprDocument,
  crew: Labourer[],
  sitePlants: string[]
): string[] {
  const out: string[] = [];
  if (!doc.date) out.push("Pick the date");
  if (!doc.plant.trim()) out.push("Pick a plant");
  else if (sitePlants.length && !sitePlants.includes(doc.plant)) out.push(`Plant "${doc.plant}" isn't on this site — pick one of ${sitePlants.join(", ")}`);

  const fieldWork = doc.submitterType === "painting_blasting" || doc.submitterType === "scaffolding";
  if (fieldWork) {
    if (!doc.permitOk) out.push("Confirm the work permit");
    if (!doc.tbtDone) out.push("Confirm the toolbox talk (TBT)");
    const unmarked = crew.filter((l) => !doc.labourMarks.some((m) => m.labourerId === l.id));
    if (unmarked.length) {
      const names = unmarked.slice(0, 5).map((l) => l.name).join(", ");
      out.push(`Mark attendance for every crew member — ${unmarked.length} not marked (${names}${unmarked.length > 5 ? ", …" : ""})`);
    }
  }

  if (doc.submitterType === "painting_blasting") {
    const lines = doc.paintWork ?? [];
    const total = lines.reduce((s, l) => s + (l.areaM2 || 0), 0);
    lines.forEach((l, i) => {
      if (l.areaM2 < 0) out.push(`Painting line ${i + 1}: area can't be negative`);
      if (l.areaM2 > MAX_LINE_M2) out.push(`Painting line ${i + 1}: ${l.areaM2} m² is over the ${MAX_LINE_M2.toLocaleString("en-IN")} m² per line limit`);
    });
    if (!(total > 0) && !doc.zeroReason?.trim()) out.push("Enter the m² done, or give a reason for zero");
  }

  if (doc.submitterType === "scaffolding") {
    const lines = doc.scaffoldWork ?? [];
    const any = lines.some((l) => l.erectM3 > 0 || l.dismantleM3 > 0 || l.standingM3 > 0);
    if (lines.some((l) => l.erectM3 < 0 || l.dismantleM3 < 0 || l.standingM3 < 0)) out.push("Scaffold volumes can't be negative");
    if (!any && !doc.zeroReason?.trim()) out.push("Enter the m³ erected, dismantled or standing, or give a reason for zero");
  }

  doc.requests.forEach((r, i) => {
    if (!r.description.trim()) out.push(`Request ${i + 1}: describe what's needed`);
    if (!(Number(r.qty) > 0)) out.push(`Request ${i + 1}: quantity must be above 0`);
  });
  return out;
}
