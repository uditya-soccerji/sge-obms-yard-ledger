"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canCloseJob, jobJmsQty, lineStatus, nextMonth, round3 } from "./logic";
import { createWorkSeed, WORK_STORAGE_KEY, WORK_TODAY } from "./seed";
import type { DprEntry, Jms, JmsStatus, Job, PlanLine, Stage, WorkState } from "./types";
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WORK_STORAGE_KEY);
      if (raw) setWork(JSON.parse(raw) as WorkState);
    } catch {
      /* keep seed */
    }
    setHydrated(true);
  }, []);

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
      return { ok: true, id: existing.id };
    }
    const id = uid("pl");
    setWork((s) => ({ ...s, planLines: [...s.planLines, { ...input, id, month, carriedM2: 0 }] }));
    return { ok: true, id };
  }, []);

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
    return { ok: true, id: job.id };
  }, []);

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
    return { ok: true, id: entry.id };
  }, []);

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
    return { ok: true };
  }, []);

  const rejectClose = useCallback<WorkApi["rejectClose"]>((jobId) => {
    setWork((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "open", closeRequestedAt: undefined } : j)) }));
    return { ok: true };
  }, []);

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
    };
    setWork((s) => ({
      ...s,
      jms: [...s.jms, row],
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "closed", closedAt: WORK_TODAY, jmsId: id } : j)),
    }));
    return { ok: true, id };
  }, []);

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
    return { ok: true };
  }, []);

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
    return { ok: true, id: issued.id };
  }, []);

  const resetWork = useCallback(() => setWork(createWorkSeed()), []);

  const api = useMemo<WorkApi>(
    () => ({ work, hydrated, addPlanLine, startJob, addDpr, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, resetWork }),
    [work, hydrated, addPlanLine, startJob, addDpr, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, resetWork]
  );
  return <WorkContext.Provider value={api}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const ctx = useContext(WorkContext);
  if (!ctx) throw new Error("useWork must be used within WorkProvider");
  return ctx;
}
