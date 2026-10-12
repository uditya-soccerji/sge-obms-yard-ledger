"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canCloseJob, currentMonthOf, EXPENSE_CATEGORIES, entryDiffs, isMonthClosed, jobJmsQty, lineStatus, nextMonth, round3 } from "./logic";
import { createWorkSeed, WORK_STORAGE_KEY, WORK_TODAY } from "./seed";
import { applyScenario, type ScenarioId } from "./scenarios";
import { useStore } from "../store";
import type { RoleId } from "../types";
import { reasonText, type WorkEvent } from "./events";
import { entryArea } from "./logic";
import { workRights } from "./permissions";
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
  /** SIC sends a closed job back to the supervisor, with the reason (docs §5, §19) */
  rejectClose: (jobId: string, reason: string) => Result;
  setJmsStatus: (jmsId: string, status: JmsStatus) => void;
  /** Close one site's current month and carry its unfinished work forward */
  closeMonth: (siteId: string) => Result;
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

const NOT_ALLOWED: Result = { ok: false, error: "Your role can't do this" };

export function WorkProvider({ children }: { children: React.ReactNode }) {
  const [work, setWork] = useState<WorkState>(createWorkSeed);
  const [hydrated, setHydrated] = useState(false);
  const ref = React.useRef(work);
  ref.current = work;

  // Who is acting (the viewed-as account when Super Admin uses "View as")
  const { currentAccount, state: appState, fullState } = useStore();
  const actor = React.useRef({ name: "System", role: null as RoleId | null, staffId: null as string | null, accountId: "" });
  actor.current = { name: currentAccount?.name ?? "System", role: appState.currentRole, staffId: appState.currentUserId, accountId: currentAccount?.id ?? "" };
  // Staff list is a reference list (never cut to a site), used to check site rules
  const staffRef = React.useRef(fullState.staff);
  staffRef.current = fullState.staff;
  const rights = () => workRights(actor.current.role);
  /** A supervisor may only act on their own lines and jobs. */
  const notMine = (supervisorId: string) => actor.current.role === "supervisor" && supervisorId !== actor.current.staffId;

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
    if (!rights().canPlan) return NOT_ALLOWED;
    const w = ref.current;
    const month = input.month ?? currentMonthOf(w, input.siteId);
    if (isMonthClosed(w, input.siteId, month)) return { ok: false, error: "That month is closed" };
    if (!(input.planM2 > 0)) return { ok: false, error: "Plan m² must be above zero" };
    const sup = staffRef.current.find((x) => x.id === input.supervisorId);
    if (!sup || sup.role !== "supervisor" || sup.siteId !== input.siteId) {
      return { ok: false, error: "Pick a supervisor who works on this site" };
    }
    // Same plant + service item + supervisor adds to the line; another supervisor gets their own line
    const existing = w.planLines.find(
      (l) => l.month === month && l.siteId === input.siteId && l.plant === input.plant && l.serviceCode === input.serviceCode && l.supervisorId === input.supervisorId
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
    if (!rights().canEnter) return NOT_ALLOWED;
    const w = ref.current;
    const line = w.planLines.find((l) => l.id === input.planLineId);
    if (!line) return { ok: false, error: "Pick a plan line" };
    if (notMine(line.supervisorId)) return { ok: false, error: "That plan line belongs to another supervisor" };
    if (isMonthClosed(w, line.siteId, line.month)) return { ok: false, error: "That plan month is closed" };
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
    if (!rights().canEnter) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === input.jobId);
    if (!job) return { ok: false, error: "Job not found" };
    if (notMine(job.supervisorId)) return { ok: false, error: "That job belongs to another supervisor" };
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
    const siteId = siteOfJob(w, job);
    log({ kind: "dpr_added", siteId, subjectStaffId: job.supervisorId, title: `${job.jobNo} · ${STAGES.find((x) => x.id === entry.stage)?.label} ${round3(entryArea(entry))} m²`, detail: `${job.location}${entry.enteredBy === "admin" ? " · entered by Admin" : ""}${entry.crew?.length ? ` · crew ${entry.crew.length}` : ""}`, tab: "jobs", refId: job.id });
    // Double entry (docs §5b): Admin's figure counts; tell the supervisor when the two differ
    const diff = entryDiffs([...w.dprs, entry]).find((d) => d.jobId === job.id && d.date === entry.date && d.stage === entry.stage);
    if (diff) {
      log({
        kind: "dpr_mismatch",
        problem: true,
        siteId,
        subjectStaffId: job.supervisorId,
        title: `${job.jobNo} · Admin and supervisor figures differ`,
        detail: `${entry.date} ${STAGES.find((x) => x.id === entry.stage)?.label}: supervisor ${diff.supervisorArea} m² / ${diff.supervisorLitres} L, Admin ${diff.adminArea} m² / ${diff.adminLitres} L. Admin's figure is used.`,
        tab: "jobs",
        refId: job.id,
      });
    }
    return { ok: true, id: entry.id };
  }, [log]);

  const requestClose = useCallback<WorkApi["requestClose"]>((jobId) => {
    if (!rights().canEnter) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, error: "Job not found" };
    if (notMine(job.supervisorId)) return { ok: false, error: "That job belongs to another supervisor" };
    const check = canCloseJob(job, w.dprs);
    if (!check.ok) return { ok: false, error: `Still missing: ${check.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}` };
    // A real timestamp, so the 24-hour escalation (docs §19) can age it
    const at = new Date().toISOString();
    setWork((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "awaiting_sic", closeRequestedAt: at, closeRequestedBy: actor.current.accountId, sentBack: undefined } : j)),
    }));
    log({ kind: "job_closed", siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} closed — confirm JMS`, detail: `${job.location} · ${round3(jobJmsQty(job, w.dprs))} m² final shade`, tab: "jobs", refId: job.id });
    return { ok: true };
  }, [log]);

  const rejectClose = useCallback<WorkApi["rejectClose"]>((jobId, reason) => {
    if (!rights().canConfirm) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "awaiting_sic") return { ok: false, error: "Job isn't waiting for SIC" };
    const why = reason.trim();
    if (!why) return { ok: false, error: "Give a reason so the supervisor knows what to fix" };
    log({ kind: "job_sent_back", problem: true, siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} sent back by SIC`, detail: `${job.location} · ${why}`, tab: "jobs", refId: job.id });
    const sentBack = { by: actor.current.name, at: new Date().toISOString(), reason: why };
    setWork((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "open", closeRequestedAt: undefined, closeRequestedBy: undefined, sentBack } : j)) }));
    return { ok: true };
  }, [log]);

  const confirmJms = useCallback<WorkApi["confirmJms"]>((jobId) => {
    if (!rights().canConfirm) return NOT_ALLOWED;
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
    if (!rights().canConfirm) return;
    setWork((s) => ({ ...s, jms: s.jms.map((j) => (j.id === jmsId ? { ...j, status } : j)) }));
  }, []);

  /** Close one site's current month: its unfinished balance + open jobs move to next month. */
  const closeMonth = useCallback<WorkApi["closeMonth"]>((siteId) => {
    if (!rights().canConfirm) return NOT_ALLOWED;
    const w = ref.current;
    const month = currentMonthOf(w, siteId);
    const next = nextMonth(month);
    const siteLines = w.planLines.filter((l) => l.siteId === siteId && l.month === month);
    const lineIds = new Set(siteLines.map((l) => l.id));
    const waiting = w.jobs.filter((j) => j.status === "awaiting_sic" && lineIds.has(j.planLineId));
    if (waiting.length) return { ok: false, error: `${waiting.length} job(s) still waiting for SIC — confirm or send back first` };
    const moves = new Map<string, string>();
    const carried: PlanLine[] = [];
    for (const line of siteLines) {
      const rem = lineStatus(line, w).remaining;
      const hasOpen = w.jobs.some((j) => j.planLineId === line.id && j.status === "open");
      if (rem <= 0 && !hasOpen) continue;
      const id = uid("pl");
      moves.set(line.id, id);
      carried.push({ ...line, id, month: next, planM2: 0, carriedM2: rem, carriedFromId: line.id });
    }
    setWork((s) => {
      const prev = s.siteMonths[siteId] ?? { current: month, closed: [] };
      return {
        ...s,
        planLines: [...s.planLines, ...carried],
        jobs: s.jobs.map((j) => (j.status === "open" && moves.has(j.planLineId) ? { ...j, planLineId: moves.get(j.planLineId)! } : j)),
        siteMonths: { ...s.siteMonths, [siteId]: { current: next, closed: [...prev.closed, month] } },
      };
    });
    log({ kind: "month_closed", siteId, title: `${month} closed`, detail: `${carried.length} plan lines carried into ${next}`, tab: "plan" });
    return { ok: true };
  }, [log]);

  const issuePaint = useCallback<WorkApi["issuePaint"]>((batchId, supervisorId, qtyL) => {
    if (!rights().canIssuePaint) return NOT_ALLOWED;
    const w = ref.current;
    const b = w.paint.find((x) => x.id === batchId);
    if (!b || b.supervisorId) return { ok: false, error: "Pick a store batch" };
    if (!(qtyL > 0)) return { ok: false, error: "Quantity must be above zero" };
    if (qtyL > b.qtyL) return { ok: false, error: `Only ${b.qtyL} L in this batch` };
    const sup = staffRef.current.find((x) => x.id === supervisorId);
    if (!sup || sup.role !== "supervisor") return { ok: false, error: "Pick a supervisor" };
    if (sup.siteId !== b.siteId) return { ok: false, error: `${sup.name} doesn't work on this batch's site` };
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
    if (!rights().canMoney) return NOT_ALLOWED;
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
    if (!rights().canMoney) return NOT_ALLOWED;
    if (!(input.amount > 0)) return { ok: false, error: "Amount must be above zero" };
    if (!input.category.trim()) return { ok: false, error: "Category is required" };
    // docs §8: date, time, amount, category, vendor, payment mode, remark, bill
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick the date" };
    if (!input.time || !/^\d{2}:\d{2}$/.test(input.time)) return { ok: false, error: "Enter the time" };
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(input.category.trim())) return { ok: false, error: "Pick a category from the list" };
    if (!input.vendor?.trim()) return { ok: false, error: "Enter who was paid (vendor)" };
    if (!input.paymentMode) return { ok: false, error: "Pick the payment mode" };
    if (!input.note?.trim()) return { ok: false, error: "Add a remark" };
    if (!input.billFile && !input.billPending) return { ok: false, error: "Attach the bill / receipt, or tick 'Bill to follow'" };
    if (input.kind === "direct" && !input.jobId) return { ok: false, error: "A direct cost needs a job" };
    // A direct cost belongs to the month it was spent; a fixed cost to the month picked
    const month = input.kind === "direct" ? input.date.slice(0, 7) : input.month;
    if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Pick the month this cost belongs to" };
    const id = uid("ex");
    const entry: Expense = {
      ...input,
      month,
      category: input.category.trim(),
      vendor: input.vendor?.trim(),
      note: input.note?.trim(),
      id,
      enteredBy: actor.current.accountId,
      enteredByName: actor.current.name,
      enteredAt: new Date().toISOString(),
    };
    setWork((s) => ({ ...s, expenses: [...s.expenses, entry] }));
    log({ kind: "expense_added", problem: !!input.billPending, siteId: input.siteId, title: `Cost ₹${input.amount.toLocaleString("en-IN")} · ${entry.category} · ${entry.vendor}`, detail: `${input.kind === "fixed" ? `Fixed · ${month}` : "Direct (job)"} · ${input.paymentMode}${input.billPending ? " · bill to follow" : ""}`, tab: "pnl", refId: id });
    return { ok: true, id };
  }, [log]);

  const removeExpense = useCallback((id: string) => {
    if (!rights().canMoney) return;
    setWork((s) => ({ ...s, expenses: s.expenses.filter((x) => x.id !== id) }));
  }, []);

  /** Test helper: load a prepared state on top of fresh seed data. */
  const loadScenario = useCallback((id: ScenarioId) => {
    if (!rights().isBoss) return;
    setWork(applyScenario(createWorkSeed(), id));
  }, []);

  const markSeen = useCallback((accountId: string) => {
    setWork((s) => ({ ...s, lastSeen: { ...s.lastSeen, [accountId]: s.events[s.events.length - 1]?.seq ?? 0 } }));
  }, []);

  const resetWork = useCallback(() => {
    if (!rights().isBoss) return;
    setWork(createWorkSeed());
  }, []);

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
