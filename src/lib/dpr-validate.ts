import type { Labourer } from "./types";
import type { DprEntry, DprReport } from "./work/types";
import { entryArea } from "./work/logic";
import { timeProblem, WORKING } from "./attendance";

/** Max area on one painting / blasting line (docs §5). */
export const MAX_LINE_M2 = 2000;

/** Crew a DPR must account for: the submitter's active labourers. */
export function dprCrew(doc: Pick<DprReport, "submitterId" | "submitterType">, labourers: Labourer[]): Labourer[] {
  if (doc.submitterType === "safety" || doc.submitterType === "store") return [];
  return labourers.filter((l) => l.active && l.supervisorId === doc.submitterId);
}

/**
 * What stops a DPR from being submitted to SIC (docs §5 "before submitting").
 * Returns a list of plain-language problems; empty means it can go.
 * Saving a draft is never blocked, only submitting.
 */
export function validateDprForSubmit(
  doc: DprReport,
  crew: Labourer[],
  sitePlants: string[],
  /** The job lines filed under this report (painting & blasting) */
  entries: DprEntry[] = []
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

  // docs §24: every store request says what is needed and why
  doc.requests.forEach((q, i) => {
    if (!q.description.trim()) out.push(`Request ${i + 1}: say what is needed`);
    if (!q.reason) out.push(`Request ${i + 1}: pick a reason (urgent, damaged, required, replacement, scrapped, expired)`);
  });

  if (doc.submitterType === "painting_blasting") {
    // Quantities are the job lines (Work entries) under this report
    const total = entries.reduce((s, e) => s + entryArea(e), 0);
    entries.forEach((e, i) => {
      if (entryArea(e) > MAX_LINE_M2) out.push(`Job line ${i + 1}: over the ${MAX_LINE_M2.toLocaleString("en-IN")} m² per line limit`);
    });
    if (!(total > 0) && !doc.zeroReason?.trim()) out.push("Add a job line with the m² done, or give a reason for zero");
    // Everyone booked on a job line must be marked as working on the report
    const worked = new Set(doc.labourMarks.filter((m) => WORKING.includes(m.status)).map((m) => m.labourerId));
    const missing = [...new Set(entries.flatMap((e) => e.crew ?? []))].filter((id) => !worked.has(id));
    if (missing.length) out.push(`${missing.length} crew member(s) on the job lines aren't marked as working on this report`);
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
