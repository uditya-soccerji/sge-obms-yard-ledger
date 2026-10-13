/**
 * Internal JMS (what SIC closed) vs the JMS submitted to RIL (uploaded by
 * Admin): compared, never merged (Owner decision 2, docs §10). Ratings are
 * worked out from these, not stored (merge plan §2).
 */
import { scoreFromMatchRatio } from "../estimate";
import { round3 } from "./logic";
import type { Jms, JmsSubmission, JmsSubmissionItem, WorkState } from "./types";

export interface JmsDiff {
  field: "qty" | "amount" | "service" | "period" | "wo" | "plant";
  internal: string;
  submitted: string;
}

const siteOfJms = (w: Pick<WorkState, "planLines">, j: Jms) => w.planLines.find((l) => l.id === j.planLineId);

/** Every difference between one internal JMS and its submission (docs §10 "flag any difference"). */
export function compareJms(j: Jms, s: JmsSubmission, w: Pick<WorkState, "planLines" | "workOrders">): JmsDiff[] {
  const out: JmsDiff[] = [];
  const line = siteOfJms(w, j);
  const items = s.items.filter((i) => i.serviceCode === j.serviceCode);
  if (!items.length) out.push({ field: "service", internal: j.serviceCode, submitted: s.items.map((i) => i.serviceCode).join(", ") || "—" });
  const qty = round3(items.reduce((t, i) => t + i.qty, 0));
  if (items.length && Math.abs(qty - j.qty) > 0.001) out.push({ field: "qty", internal: `${j.qty} m²`, submitted: `${qty} m²` });
  const amount = Math.round(items.reduce((t, i) => t + i.amount, 0) * 100) / 100;
  if (items.length && Math.abs(amount - j.amount) >= 1) out.push({ field: "amount", internal: `₹${j.amount.toLocaleString("en-IN")}`, submitted: `₹${amount.toLocaleString("en-IN")}` });
  if (s.periodFrom > j.periodTo || s.periodTo < j.periodFrom) out.push({ field: "period", internal: `${j.periodFrom} – ${j.periodTo}`, submitted: `${s.periodFrom} – ${s.periodTo}` });
  const wo = w.workOrders.find((x) => x.id === j.woId);
  if (wo && s.woNo && s.woNo.trim() !== wo.woNo) out.push({ field: "wo", internal: wo.woNo, submitted: s.woNo });
  if (line && s.plant && s.plant.trim().toUpperCase() !== line.plant.toUpperCase()) out.push({ field: "plant", internal: line.plant, submitted: s.plant });
  return out;
}

/** Candidate internal JMS for a submission: same site and plant, a matching service item, overlapping period, not linked yet. */
export function linkCandidates(s: JmsSubmission, w: Pick<WorkState, "jms" | "planLines">): Jms[] {
  return w.jms.filter((j) => {
    if (j.submissionId && j.submissionId !== s.id) return false;
    const line = siteOfJms(w, j);
    if (!line || line.siteId !== s.siteId) return false;
    if (s.plant && line.plant.toUpperCase() !== s.plant.trim().toUpperCase()) return false;
    if (!s.items.some((i) => i.serviceCode === j.serviceCode)) return false;
    return !(s.periodFrom > j.periodTo || s.periodTo < j.periodFrom);
  });
}

/** Items typed / pasted as `service code, description, qty, uom, rate` per line. */
export function parseSubmissionItems(text: string): { items: JmsSubmissionItem[]; error?: string } {
  const items: JmsSubmissionItem[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const [i, l] of lines.entries()) {
    const [serviceCode, description, qty, uom, rate] = l.split(",").map((x) => x.trim());
    const q = Number(qty);
    const r = Number(rate);
    if (/^service/i.test(serviceCode ?? "")) continue; // header row
    if (!serviceCode) return { items, error: `Line ${i + 1}: service code is missing` };
    if (!(q > 0)) return { items, error: `Line ${i + 1}: qty must be above zero` };
    if (!(r > 0)) return { items, error: `Line ${i + 1}: rate must be above zero` };
    const unit = (uom || "M2").toUpperCase() === "M3" ? "M3" : "M2";
    items.push({ serviceCode, description: description || serviceCode, qty: round3(q), uom: unit, rate: r, amount: Math.round(q * r * 100) / 100 });
  }
  if (!items.length) return { items, error: "Add at least one item line" };
  return { items };
}

export interface SupervisorRating {
  supervisorId: string;
  internalQty: number;
  submittedQty: number;
  ratio: number;
  score: number;
  sentBack: number;
  jmsCount: number;
  suggestedIncentive: number;
}

/**
 * Supervisor ratings (merge plan §2), derived each time: how close the
 * submitted (RIL-measured) quantities are to the internal JMS, less one point
 * per two sent-back DPRs or jobs. Only linked pairs count.
 */
export function supervisorRatings(w: Pick<WorkState, "jms" | "jobs" | "submissions" | "events">, month?: string): SupervisorRating[] {
  const by = new Map<string, SupervisorRating>();
  for (const j of w.jms) {
    if (month && !j.periodTo.startsWith(month)) continue;
    const sub = j.submissionId ? w.submissions.find((s) => s.id === j.submissionId) : undefined;
    if (!sub) continue;
    const job = w.jobs.find((x) => x.id === j.jobId);
    if (!job) continue;
    const r = by.get(job.supervisorId) ?? { supervisorId: job.supervisorId, internalQty: 0, submittedQty: 0, ratio: 0, score: 0, sentBack: 0, jmsCount: 0, suggestedIncentive: 0 };
    r.internalQty = round3(r.internalQty + j.qty);
    r.submittedQty = round3(r.submittedQty + sub.items.filter((i) => i.serviceCode === j.serviceCode).reduce((t, i) => t + i.qty, 0));
    r.jmsCount++;
    by.set(job.supervisorId, r);
  }
  for (const r of by.values()) {
    r.sentBack = w.events.filter((e) => (e.kind === "dpr_sent_back" || e.kind === "job_sent_back") && e.subjectStaffId === r.supervisorId && (!month || e.day.startsWith(month))).length;
    r.ratio = r.internalQty && r.submittedQty ? Math.min(r.internalQty, r.submittedQty) / Math.max(r.internalQty, r.submittedQty) : 0;
    r.score = Math.max(1, scoreFromMatchRatio(r.ratio) - Math.floor(r.sentBack / 2));
    r.suggestedIncentive = r.score * 2000;
  }
  return [...by.values()].sort((a, b) => b.score - a.score);
}
