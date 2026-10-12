"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canCloseJob, jobJmsQty, lineStatus, nextMonth, round3 } from "./logic";
import { createWorkSeed, WORK_STORAGE_KEY, WORK_TODAY } from "./seed";
import { applyScenario, type ScenarioId } from "./scenarios";
import { useStore } from "../store";
import type { RoleId } from "../types";
import { reasonText, type WorkEvent } from "./events";
import { entryArea } from "./logic";
import type { DprEntry, Expense, Jms, JmsPayment, JmsStatus, Job, PlanLine, Stage, WorkState } from "./types";
import { STAGES } from "./types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

interface WorkApi {
  work: WorkState;
  hydrated: boolean;
  addPlanLine: (input: Omit<PlanLine, "id" | "carriedM2" | "month"> & { month?: string }) => Result;
  startJob: (input: { planLineId: string; location: string; stages: Stage[]; startDate: string }) => Result;
  addDpr: (input: Omit<DprEntry, "id" | "supervisorId">) => Result;
  requestClose: (jobId: string) => Result;
  confirmJms: (jobId: string) => Result;
  rejectClose: (jobId: string) => Result;
  setJmsStatus: (jmsId: string, status: JmsStatus) => void;
  closeMonth: () => Result;
  issuePaint: (batchId: string, supervisorId: string, qtyL: number) => Result;
  recordPayment: (jmsId: string, payment: JmsPayment | null) => Result;
  addExpense: (input: Omit<Expense, "id">) => Result;
  removeExpense: (id: string) => void;
  loadScenario: (id: ScenarioId) => void;
  /** Mark every current event as seen by this account (bell) */
  markSeen: (accountId: string) => void;
  resetWork: () => void;
}

const WorkContext = createContext<WorkApi | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function WorkProvider({ children }: { children: React.ReactNode }) {
  const [work, setWork] = useState<WorkState>(createWorkSeed);
  const [hydrated, setHydrated] = useState(false);
  const ref = React.useRef(work);
  ref.current = work;

  // Who is acting (the viewed-as account when Super Admin uses "View as")
  const { currentAccount, state: appState } = useStore();
  const actor = React.useRef({ name: "System", role: null as RoleId | null });
  actor.current = { name: currentAccount?.name ?? "System", role: appState.currentRole };

  /** Append one activity-log / notification event (docs §19). */
  const log = useCallback((e: Omit<WorkEvent, "id" | "seq" | "at" | "day" | "actorName" | "actorRole">) => {
    setWork((s) => {
      const seq = (s.events[s.events.length - 1]?.seq ?? 0) + 1;
      const ev: WorkEvent = { ...e, id: `ev-${seq}`, seq, at: new Date().toISOString(), day: WORK_TODAY, actorName: actor.current.name, actorRole: actor.current.role };
      return { ...s, events: [...s.events, ev] };
    });
  }, []);
  const siteOfJob = (w: WorkState, job: Job) => w.planLines.find((l) => l.id === job.planLineId)?.siteId ?? "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORK_STORAGE_KEY);
      if (raw) setWork(JSON.parse(raw) as WorkState);
    } catch {
      /* keep seed */
    }
    setHydrated(true);
  }, [log]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    } catch {
      /* storage full / blocked */
    }
  }, [work, hydrated]);

  const addPlanLine = useCallback<WorkApi["addPlanLine"]>((input) => {
    const w = ref.current;
    const month = input.month ?? w.currentMonth;
    if (w.closedMonths.includes(month)) return { ok: false, error: "That month is closed" };
    if (!(input.planM2 > 0)) return { ok: false, error: "Plan m² must be above zero" };
    const existing = w.planLines.find(
      (l) => l.month === month && l.siteId === input.siteId && l.plant === input.plant && l.serviceCode === input.serviceCode
    );
    if (existing) {
      setWork((s) => ({
        ...s,
        planLines: s.planLines.map((l) => (l.id === existing.id ? { ...l, planM2: round3(l.planM2 + input.planM2) } : l)),
      }));
      log({ kind: "plan_added", siteId: input.siteId, subjectStaffId: input.supervisorId, title: `Plan +${input.planM2} m² · ${input.plant}`, detail: `${input.serviceCode} · ${month}`, tab: "plan", refId: existing.id });
      return { ok: true, id: existing.id };
    }
    const id = uid("pl");
    setWork((s) => ({ ...s, planLines: [...s.planLines, { ...input, id, month, carriedM2: 0 }] }));
    log({ kind: "plan_added", siteId: input.siteId, subjectStaffId: input.supervisorId, title: `New plan line · ${input.plant} · ${input.planM2} m²`, detail: `${input.serviceCode} · ${month}`, tab: "plan", refId: id });
    return { ok: true, id };
  }, [log]);

  const startJob = useCallback<WorkApi["startJob"]>((input) => {
    const w = ref.current;
    const line = w.planLines.find((l) => l.id === input.planLineId);
    if (!line) return { ok: false, error: "Pick a plan line" };
    if (w.closedMonths.includes(line.month)) return { ok: false, error: "That plan month is closed" };
    if (!input.location.trim()) return { ok: false, error: "Location is required" };
    if (input.stages.length === 0) return { ok: false, error: "Pick at least one stage" };
    const seq = w.jobs.length + 101;
    const site = line.siteId.replace("site-", "").toUpperCase();
    const job: Job = {
      id: uid("job"),
      jobNo: `J-${site}-${String(seq).padStart(4, "0")}`,
      planLineId: line.id,
      location: input.location.trim(),
      startDate: input.startDate,
      stages: input.stages,
      status: "open",
      supervisorId: line.supervisorId,
    };
    setWork((s) => ({ ...s, jobs: [...s.jobs, job] }));
    log({ kind: "job_started", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `${job.jobNo} started`, detail: `${line.plant} · ${job.location}`, tab: "jobs", refId: job.id });
    return { ok: true, id: job.id };
  }, [log]);

  const addDpr = useCallback<WorkApi["addDpr"]>((input) => {
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === input.jobId);
    if (!job) return { ok: false, error: "Job not found" };
    if (job.status !== "open") return { ok: false, error: "Job is closed — no more DPR entries" };
    if (!job.stages.includes(input.stage)) return { ok: false, error: "That stage isn't part of this job" };
    const members = input.members.filter((m) => m.name.trim() && m.nos > 0 && m.side > 0 && m.length > 0 && m.cf > 0);
    if (members.length === 0) return { ok: false, error: "Add at least one measured member (NOS, SIDE, LENGTH, CF all above 0)" };
    const area = members.reduce((s, m) => s + m.nos * m.side * m.length * m.cf, 0);
    if (area > 2000) return { ok: false, error: `Area ${round3(area)} m² is over the 2,000 m² per line limit` };
    if (input.litres < 0) return { ok: false, error: "Litres can't be negative" };
    if (input.litres > 0 && !input.paintSap) return { ok: false, error: "Pick which paint the litres are from" };
    const entry: DprEntry = { ...input, members, id: uid("wd"), supervisorId: job.supervisorId };
    setWork((s) => ({ ...s, dprs: [...s.dprs, entry] }));
    log({ kind: "dpr_added", siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} · ${STAGES.find((x) => x.id === entry.stage)?.label} ${round3(entryArea(entry))} m²`, detail: `${job.location}${entry.enteredBy === "admin" ? " · entered by Admin" : ""}${entry.crew?.length ? ` · crew ${entry.crew.length}` : ""}`, tab: "jobs", refId: job.id });
    return { ok: true, id: entry.id };
  }, [log]);

  const requestClose = useCallback<WorkApi["requestClose"]>((jobId) => {
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, error: "Job not found" };
    const check = canCloseJob(job, w.dprs);
    if (!check.ok) return { ok: false, error: `Still missing: ${check.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}` };
    setWork((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "awaiting_sic", closeRequestedAt: WORK_TODAY } : j)),
    }));
    log({ kind: "job_closed", siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} closed — confirm JMS`, detail: `${job.location} · ${round3(jobJmsQty(job, w.dprs))} m² final shade`, tab: "jobs", refId: job.id });
    return { ok: true };
  }, [log]);

  const rejectClose = useCallback<WorkApi["rejectClose"]>((jobId) => {
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (job) log({ kind: "job_sent_back", problem: true, siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} sent back by SIC`, detail: job.location, tab: "jobs", refId: job.id });
    setWork((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "open", closeRequestedAt: undefined } : j)) }));
    return { ok: true };
  }, [log]);

  const confirmJms = useCallback<WorkApi["confirmJms"]>((jobId) => {
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "awaiting_sic") return { ok: false, error: "Job isn't waiting for SIC" };
    const line = w.planLines.find((l) => l.id === job.planLineId)!;
    const item = w.serviceItems.find((s) => s.code === line.serviceCode)!;
    const wo = w.workOrders.find((o) => o.siteId === line.siteId && o.scope[line.serviceCode] != null);
    const qty = jobJmsQty(job, w.dprs);
    const dates = w.dprs.filter((d) => d.jobId === jobId).map((d) => d.date).sort();
    const last = Math.max(0, ...w.jms.map((j) => Number(j.jmsNo) || 0));
    const id = uid("jms");
    const row: Jms = {
      id,
      jmsNo: String(last + 1),
      jobId,
      planLineId: line.id,
      serviceCode: line.serviceCode,
      qty,
      rate: item.rate,
      amount: Math.round(qty * item.rate * 100) / 100,
      periodFrom: job.startDate,
      periodTo: dates[dates.length - 1] ?? WORK_TODAY,
      status: "JMS SUBMITTED",
      woId: wo?.id ?? "",
      confirmedOn: WORK_TODAY,
    };
    setWork((s) => ({
      ...s,
      jms: [...s.jms, row],
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "closed", closedAt: WORK_TODAY, jmsId: id } : j)),
    }));
    log({ kind: "jms_confirmed", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `JMS ${row.jmsNo} confirmed · ${job.jobNo}`, detail: `${qty} m² × ₹${item.rate} = ₹${row.amount.toLocaleString("en-IN")}`, tab: "jms", refId: id });
    return { ok: true, id };
  }, [log]);

  const setJmsStatus = useCallback((jmsId: string, status: JmsStatus) => {
    setWork((s) => ({ ...s, jms: s.jms.map((j) => (j.id === jmsId ? { ...j, status } : j)) }));
  }, []);

  /** Close the current month: unfinished balance + open jobs move to next month. */
  const closeMonth = useCallback<WorkApi["closeMonth"]>(() => {
    const w = ref.current;
    const month = w.currentMonth;
    const next = nextMonth(month);
    const waiting = w.jobs.filter((j) => j.status === "awaiting_sic" && w.planLines.find((l) => l.id === j.planLineId)?.month === month);
    if (waiting.length) return { ok: false, error: `${waiting.length} job(s) still waiting for SIC — confirm or send back first` };
    const moves = new Map<string, string>();
    const carried: PlanLine[] = [];
    for (const line of w.planLines.filter((l) => l.month === month)) {
      const rem = lineStatus(line, w).remaining;
      const hasOpen = w.jobs.some((j) => j.planLineId === line.id && j.status === "open");
      if (rem <= 0 && !hasOpen) continue;
      const id = uid("pl");
      moves.set(line.id, id);
      carried.push({ ...line, id, month: next, planM2: 0, carriedM2: rem, carriedFromId: line.id });
    }
    setWork((s) => ({
      ...s,
      planLines: [...s.planLines, ...carried],
      jobs: s.jobs.map((j) => (j.status === "open" && moves.has(j.planLineId) ? { ...j, planLineId: moves.get(j.planLineId)! } : j)),
      closedMonths: [...s.closedMonths, month],
      currentMonth: next,
    }));
    for (const site of new Set(w.planLines.filter((l) => l.month === month).map((l) => l.siteId))) {
      log({ kind: "month_closed", siteId: site, title: `${month} closed`, detail: `${carried.filter((l) => l.siteId === site).length} plan lines carried into ${next}`, tab: "plan" });
    }
    return { ok: true };
  }, [log]);

  const issuePaint = useCallback<WorkApi["issuePaint"]>((batchId, supervisorId, qtyL) => {
    const w = ref.current;
    const b = w.paint.find((x) => x.id === batchId);
    if (!b || b.supervisorId) return { ok: false, error: "Pick a store batch" };
    if (!(qtyL > 0)) return { ok: false, error: "Quantity must be above zero" };
    if (qtyL > b.qtyL) return { ok: false, error: `Only ${b.qtyL} L in this batch` };
    const issued = { ...b, id: uid("pb"), qtyL, supervisorId, issuedOn: WORK_TODAY };
    setWork((s) => ({
      ...s,
      paint: [...s.paint.map((x) => (x.id === batchId ? { ...x, qtyL: round3(x.qtyL - qtyL) } : x)), issued],
    }));
    log({ kind: "paint_issued", siteId: b.siteId, subjectStaffId: supervisorId, problem: b.expiry < WORK_TODAY, title: `${qtyL} L ${b.name} issued`, detail: `Batch ${b.batch} · exp ${b.expiry}${b.expiry < WORK_TODAY ? " (EXPIRED)" : ""}`, tab: "paint", refId: issued.id });
    return { ok: true, id: issued.id };
  }, [log]);

  /** Record (or clear, with null) the money received against a JMS. */
  const recordPayment = useCallback<WorkApi["recordPayment"]>((jmsId, payment) => {
    const j = ref.current.jms.find((x) => x.id === jmsId);
    if (!j) return { ok: false, error: "JMS not found" };
    if (payment) {
      if (!(payment.amount > 0)) return { ok: false, error: "Amount received must be above zero" };
      if (!payment.receivedOn) return { ok: false, error: "Date received is required" };
      if (payment.receivedOn < j.confirmedOn) return { ok: false, error: "Payment date can't be before SIC approval" };
      if (Math.abs(payment.amount - j.amount) >= 1 && !payment.reason) return { ok: false, error: "Pick a reason for the difference" };
    }
    setWork((s) => ({
      ...s,
      jms: s.jms.map((x) =>
        x.id === jmsId
          ? { ...x, payment: payment ?? undefined, status: payment ? "PAID" : x.status === "PAID" ? "INVOICE UPLOADED" : x.status }
          : x
      ),
    }));
    if (payment) {
      const w = ref.current;
      const job = w.jobs.find((x) => x.id === j.jobId);
      const gap = Math.round((payment.amount - j.amount) * 100) / 100;
      log({ kind: "payment_recorded", problem: gap <= -1, siteId: job ? siteOfJob(w, job) : "", subjectStaffId: job?.supervisorId, title: `JMS ${j.jmsNo} paid ₹${payment.amount.toLocaleString("en-IN")}`, detail: gap <= -1 ? `Short by ₹${(-gap).toLocaleString("en-IN")} (${reasonText(payment.reason)})` : "Matches approved value", tab: "payments", refId: j.id });
    }
    return { ok: true };
  }, [log]);

  const addExpense = useCallback<WorkApi["addExpense"]>((input) => {
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be above zero" };
    if (!input.category.trim()) return { ok: false, error: "Category is required" };
    if (input.kind === "direct" && !input.jobId) return { ok: false, error: "A direct cost needs a job" };
    const id = uid("ex");
    setWork((s) => ({ ...s, expenses: [...s.expenses, { ...input, category: input.category.trim(), id }] }));
    log({ kind: "expense_added", siteId: input.siteId, title: `Cost ₹${input.amount.toLocaleString("en-IN")} · ${input.category.trim()}`, detail: input.kind === "fixed" ? `Fixed · ${input.month}` : "Direct (job)", tab: "pnl", refId: id });
    return { ok: true, id };
  }, [log]);

  const removeExpense = useCallback((id: string) => {
    setWork((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
  }, []);

  /** Test helper: load a prepared state on top of fresh seed data. */
  const loadScenario = useCallback((id: ScenarioId) => setWork(applyScenario(createWorkSeed(), id)), []);

  const markSeen = useCallback((accountId: string) => {
    setWork((s) => ({ ...s, lastSeen: { ...s.lastSeen, [accountId]: s.events[s.events.length - 1]?.seq ?? 0 } }));
  }, []);

  const resetWork = useCallback(() => setWork(createWorkSeed()), []);

  const api = useMemo<WorkApi>(
    () => ({ work, hydrated, addPlanLine, startJob, addDpr, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, recordPayment, addExpense, removeExpense, loadScenario, markSeen, resetWork }),
    [work, hydrated, addPlanLine, startJob, addDpr, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, recordPayment, addExpense, removeExpense, loadScenario, markSeen, resetWork]
  );
  return <WorkContext.Provider value={api}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const ctx = useContext(WorkContext);
  if (!ctx) throw new Error("useWork must be used within WorkProvider");
  return ctx;
}
