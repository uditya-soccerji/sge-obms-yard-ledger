import type { DprDocument, Labourer } from "./types";
import { timeProblem, WORKING } from "./attendance";

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
    for (const m of doc.labourMarks) {
      if (!WORKING.includes(m.status)) continue;
      const t = timeProblem(m.inTime, m.outTime);
      const who = crew.find((l) => l.id === m.labourerId)?.name ?? m.labourerId;
      if (t) out.push(`${who}: ${t.toLowerCase()}`);
    }
    if (unmarked.length) {
      const names = unmarked.slice(0, 5).map((l) => l.name).join(", ");
      out.push(`Mark attendance for every crew member — ${unmarked.length} not marked (${names}${unmarked.length > 5 ? ", …" : ""})`);
    }
  }

  if (doc.submitterType === "painting_blasting") {
    const lines = doc.paintWork ?? [];
    const total = lines.reduce((s, l) => s + (l.areaM2 || 0), 0);
    lines.forEach((l, i) => {
      const n = `Painting line ${i + 1}`;
      if (!l.plant) out.push(`${n}: pick the plant`);
      if (!l.bay.trim()) out.push(`${n}: pick or type the location`);
      if (l.areaM2 < 0) out.push(`${n}: area can't be negative`);
      if (l.areaM2 > MAX_LINE_M2) out.push(`${n}: ${l.areaM2} m² is over the ${MAX_LINE_M2.toLocaleString("en-IN")} m² per line limit`);
      // docs §5 (B07): MPS, and litres per paint type, on every painting line
      if (l.activity === "painting") {
        if (l.mpsScheme == null) out.push(`${n}: pick the MPS`);
        const paints = l.paints ?? [];
        if (l.areaM2 > 0 && !paints.some((p) => p.litres > 0)) out.push(`${n}: add the paint type(s) and litres used`);
        paints.forEach((p, j) => {
          if (!p.type.trim()) out.push(`${n}, paint ${j + 1}: pick the paint type`);
          if (!(p.litres > 0)) out.push(`${n}, paint ${j + 1}: litres must be above 0`);
        });
        const types = paints.map((p) => p.type.trim().toLowerCase()).filter(Boolean);
        if (new Set(types).size < types.length) out.push(`${n}: the same paint type is entered twice`);
      }
    });
    if (!(total > 0) && !doc.zeroReason?.trim()) out.push("Enter the m² done, or give a reason for zero");
  }

  if (doc.submitterType === "scaffolding") {
    const lines = doc.scaffoldWork ?? [];
    const any = lines.some((l) => l.erectM3 > 0 || l.dismantleM3 > 0 || l.standingM3 > 0 || (l.liftingTrips ?? 0) > 0);
    if (lines.some((l) => l.erectM3 < 0 || l.dismantleM3 < 0 || l.standingM3 < 0)) out.push("Scaffold volumes can't be negative");
    if (!any && !doc.zeroReason?.trim()) out.push("Enter the m³ erected, dismantled or standing (or lifting trips), or give a reason for zero");
    lines.forEach((l, i) => {
      if (!l.plant) out.push(`Scaffold line ${i + 1}: pick the plant`);
    });
  }

  if (doc.submitterType === "safety") {
    // docs §11: every unsafe act / condition needs an owner and a fix-by date
    (doc.safetyBody?.observations ?? []).forEach((o, i) => {
      if (o.type === "SAFE") return;
      if (!o.whoWillFix?.trim()) out.push(`Observation ${i + 1}: who will fix it?`);
      if (!o.fixByDate) out.push(`Observation ${i + 1}: fix-by date`);
    });
  }

  doc.requests.forEach((r, i) => {
    if (!r.description.trim()) out.push(`Request ${i + 1}: describe what's needed`);
    if (!(Number(r.qty) > 0)) out.push(`Request ${i + 1}: quantity must be above 0`);
  });
  return out;
}
