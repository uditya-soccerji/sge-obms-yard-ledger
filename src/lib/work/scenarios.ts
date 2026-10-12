/**
 * Test scenarios: each takes fresh seed data and prepares one situation a
 * tester wants to try, so nobody has to click through setup by hand.
 */
import { jobStageAreas } from "./logic";
import { WORK_TODAY } from "./seed";
import type { WorkState } from "./types";

export type ScenarioId = "month_end" | "short_payment" | "expired_paint" | "paint_overdraw";

export const SCENARIOS: { id: ScenarioId; label: string; detail: string }[] = [
  {
    id: "month_end",
    label: "Month end",
    detail: "Every open September job has all stages done and is waiting for SIC. Confirm them, then close the month.",
  },
  {
    id: "short_payment",
    label: "Short payments",
    detail: "All approved JMS are paid; several came in short (deduction, recovery, short-paid). Check the gap on Payments and P&L.",
  },
  {
    id: "expired_paint",
    label: "Expired paint",
    detail: "Expired store batches were issued to V. Chauhan. See the expiry chart and the warnings.",
  },
  {
    id: "paint_overdraw",
    label: "Paint overdrawn",
    detail: "K. Solanki's DPRs used more Type 24 than was issued. See the negative balance flag.",
  },
];

export function applyScenario(w: WorkState, id: ScenarioId): WorkState {
  const s: WorkState = structuredClone(w);
  if (id === "month_end") {
    for (const job of s.jobs) {
      const line = s.planLines.find((l) => l.id === job.planLineId);
      if (job.status !== "open" || line?.month !== s.currentMonth) continue;
      const done = jobStageAreas(job, s.dprs);
      const last = [...s.dprs].reverse().find((d) => d.jobId === job.id);
      for (const stage of job.stages) {
        if (done[stage] > 0 || !last) continue;
        s.dprs.push({ ...last, id: `wd-sc-${job.id}-${stage}`, stage, date: WORK_TODAY, litres: 0, paintSap: undefined, dft: stage === "final" ? 100 : undefined });
      }
      job.status = "awaiting_sic";
      job.closeRequestedAt = WORK_TODAY;
    }
  }
  if (id === "short_payment") {
    const reasons = ["deduction", "recovery", "short_paid", undefined, undefined] as const;
    s.jms.forEach((j, i) => {
      if (j.payment) return;
      const r = reasons[i % reasons.length];
      const factor = r === "deduction" ? 0.98 : r === "short_paid" ? 0.93 : 1;
      const amount = r === "recovery" ? j.amount - 2500 : j.amount * factor;
      j.payment = { receivedOn: WORK_TODAY < j.confirmedOn ? j.confirmedOn : WORK_TODAY, amount: Math.round(amount * 100) / 100, reason: r, note: r ? "Test scenario" : undefined };
      j.status = "PAID";
    });
  }
  if (id === "expired_paint") {
    for (const b of s.paint) {
      if (!b.supervisorId && b.expiry < WORK_TODAY) {
        b.supervisorId = "st-sup1";
        b.issuedOn = WORK_TODAY;
      }
    }
  }
  if (id === "paint_overdraw") {
    const job = s.jobs.find((j) => j.status === "open" && j.supervisorId === "st-sup2");
    const last = job && [...s.dprs].reverse().find((d) => d.jobId === job.id);
    if (job && last) {
      s.dprs.push({ ...last, id: "wd-sc-overdraw", date: WORK_TODAY, stage: "coat1", litres: 420, paintSap: "2002462154" });
    }
  }
  return s;
}
