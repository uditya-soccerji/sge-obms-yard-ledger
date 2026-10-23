"use client";

import { WAGE_UNDO_MS } from "../wage-requests";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { canCloseJob, canVoidExpense, JMS_FLOW, currentMonthOf, EXPENSE_CATEGORIES, entryDiffs, finalStage, isMonthClosed, jobJmsQty, lineStatus, nextJmsStatuses, nextJobNo, nextMonth, pickWorkOrder, round3, validMembers, woUsage } from "./logic";
import { createEmptyWork, createWorkSeed, WORK_STORAGE_KEY, WORK_TODAY } from "./seed";
import { daysAgo, nowTime, setDemoToday, today } from "../today";
import { applyScenario, type ScenarioId } from "./scenarios";
import { useStore } from "../store";
import { remoteAudit } from "../supabase/remote";
import type { RoleId } from "../types";
import { reasonText, type WorkEvent } from "./events";
import { entryArea } from "./logic";
import { workRights } from "./permissions";
import type { DprEntry, DprReport, Expense, Jms, JmsPayment, JmsStatus, JmsSubmission, Job, PlanLine, Stage, WorkState } from "./types";
import { compareJms, linkCandidates } from "./jms-compare";
import { inStock, LIFECYCLE, LIFECYCLE_LABEL, paintUsedInMonth, stepVariance } from "./paint-steps";
import type { PaintBatch, PaintStep } from "./types";
import { blankReport, entriesOf, isLate, pendingReports, reportOpen, sameDay } from "./reports";
import { effectivePermission } from "../permissions";
import { dprCrew, validateDprForSubmit } from "../dpr-validate";
import type { DprSubmitterType, ModuleId, PermissionAction } from "../types";
import { STAGES } from "./types";
import { passesNeedingAction, showDate } from "../gate-pass";
import { workTransferSpec, type WorkTransferId } from "../work-transfer";
import type { TransferPreviewRow } from "../transfer-types";

type Result = { ok: true; id?: string } | { ok: false; error: string };

interface WorkApi {
  work: WorkState;
  hydrated: boolean;
  /** Owner / Super Admin Excel import for a Work sheet (after duplicate preview) */
  importExcel: (kind: WorkTransferId, rows: TransferPreviewRow[]) => { ok: boolean; error?: string; added?: number; updated?: number };
  addPlanLine: (input: Omit<PlanLine, "id" | "carriedM2" | "month"> & { month?: string }) => Result;
  startJob: (input: { planLineId: string; location: string; stages: Stage[]; startDate: string; plannedM2?: number; plannedEnd?: string }) => Result;
  /** SIC approves the supervisor's job plan or sends it back (docs §24) */
  decideJobPlan: (jobId: string, approve: boolean, note: string) => Result;
  /** Admin enters the JMS no. and amount and approves it for Finance, or sends it back (docs §24) */
  adminApproveJms: (jmsId: string, rilJmsNo: string, amount: number) => Result;
  adminReturnJms: (jmsId: string, reason: string) => Result;
  /** Add a job line; it goes on the day's open report (made if none), or on `reportId` */
  addDpr: (input: Omit<DprEntry, "id" | "supervisorId">) => Result;
  /** Remove a job line while its report is still a draft or sent back */
  removeEntry: (id: string) => Result;
  /** Save a report (draft); a submitted or approved one is frozen */
  saveReport: (doc: DprReport) => Result;
  /** Submit to SIC: refused with the list of problems until §5's checks pass */
  submitReport: (id: string) => Result;
  /** SIC approves (attendance is taken from it) or sends back with a reason */
  reviewReport: (id: string, decision: "sic_approved" | "sic_rejected", note: string) => Result;
  /** Owner / Super Admin reopen an approved report, with the reason (logged) */
  unlockReport: (id: string, reason: string) => Result;
  /** Telegram: add a message to today's open report of that submitter (made if none) */
  telegramToReport: (input: { content: string; submitterId: string; submitterType: DprSubmitterType; siteId: string; observation?: boolean }) => Result;
  requestClose: (jobId: string, endDate?: string) => Result;
  confirmJms: (jobId: string) => Result;
  /** SIC sends a closed job back to the supervisor, with the reason (docs §5, §19) */
  rejectClose: (jobId: string, reason: string) => Result;
  /** Move a JMS one stage on (Owner / Super Admin may step back one); every change is logged */
  setJmsStatus: (jmsId: string, status: JmsStatus, note?: string) => Result;
  /**
   * Admin uploads a JMS submitted to RIL. The same RIL JMS no. updates the
   * existing record (docs §14); a new one is linked to its internal JMS when
   * exactly one matches (same site, plant, service item, period).
   */
  uploadSubmission: (input: Omit<JmsSubmission, "id" | "qty" | "amount" | "statusLog" | "uploadedBy" | "uploadedAt" | "jmsId">) => Result;
  linkSubmission: (submissionId: string, jmsId: string) => Result;
  unlinkSubmission: (submissionId: string) => Result;
  /** Close one site's current month and carry its unfinished work forward */
  closeMonth: (siteId: string) => Result;
  /** Issue from SGE store stock to a supervisor: creates our 941 step */
  issuePaint: (batchId: string, supervisorId: string, qtyL: number) => Result;
  /** Add a batch at any stage before issue (PR / PO / RIL store / SGE store) */
  receivePaint: (input: Omit<PaintBatch, "id" | "supervisorId" | "issuedOn" | "updatedAt">) => Result;
  /** Move a batch one stage on (PR → PO → RIL store → SGE store) */
  advancePaintLifecycle: (batchId: string) => Result;
  /** Month reco: our 942 for a supervisor · paint · month, litres = DPR use */
  recoMonth: (supervisorId: string, sap: string, month: string) => Result;
  /** Post a reco: our 261 */
  postMonth: (recoId: string) => Result;
  /** RIL's number (and litres, on a 942) typed against our step — reference only */
  setRilRef: (stepId: string, ref: string, rilLitres?: number) => Result;
  /** Record the money received, or clear it (null) with a reason */
  recordPayment: (jmsId: string, payment: JmsPayment | null, clearReason?: string) => Result;
  addExpense: (input: Omit<Expense, "id">) => Result;
  /** Change a cost: the person who entered it on the same day, later the Owner; every edit is logged (docs §8) */
  editExpense: (id: string, patch: Partial<Pick<Expense, "amount" | "category" | "vendor" | "paymentMode" | "note" | "billFile" | "billPending" | "time">>) => Result;
  /** Void a cost with a reason: it stays on record but leaves the P&L (docs §8) */
  removeExpense: (id: string, reason: string) => Result;
  loadScenario: (id: ScenarioId) => void;
  /** Load the DTA Aug–Sep demo and replay it on its demo date (Owner / Super Admin) */
  loadDemo: () => void;
  /** Mark every current event as seen by this account (bell) */
  markSeen: (accountId: string) => void;
  /** Start fresh: an empty current month on the real date (Owner / Super Admin) */
  resetWork: () => void;
  /** Log an event raised outside the Work store (e.g. crew changes, docs §23) */
  notify: (e: Omit<WorkEvent, "id" | "seq" | "at" | "day" | "actorName" | "actorRole">) => void;
}

const WorkContext = createContext<WorkApi | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

const NOT_ALLOWED: Result = { ok: false, error: "Your role can't do this" };

export function WorkProvider({ children }: { children: React.ReactNode }) {
  const [work, setWork] = useState<WorkState>(() => createEmptyWork(today().slice(0, 7)));
  const [hydrated, setHydrated] = useState(false);
  const ref = React.useRef(work);
  ref.current = work;

  // Who is acting (the viewed-as account when Super Admin uses "View as")
  const { currentAccount, state: appState, fullState, applyDprAttendance, clearDprAttendance, raiseRequestsFromDpr, markWageChangesNotified } = useStore();
  const actor = React.useRef({ name: "System", role: null as RoleId | null, staffId: null as string | null, accountId: "", impersonatedBy: undefined as string | undefined });
  actor.current = {
    name: currentAccount?.name ?? "System",
    role: appState.currentRole,
    staffId: appState.currentUserId,
    accountId: currentAccount?.id ?? "",
    // "View as": keep the Super Admin's name on everything done in someone else's seat
    impersonatedBy: fullState.impersonatorAccountId ? fullState.users.find((u) => u.id === fullState.impersonatorAccountId)?.name : undefined,
  };
  // Staff and sites are reference lists (never cut to a site), used to check site rules
  const staffRef = React.useRef(fullState.staff);
  staffRef.current = fullState.staff;
  const sitesRef = React.useRef(fullState.sites);
  sitesRef.current = fullState.sites;
  const materialsRef = React.useRef(fullState.masterCatalog.materials);
  materialsRef.current = fullState.masterCatalog.materials;
  const rights = () => workRights(actor.current.role);
  const accountRef = React.useRef(currentAccount);
  accountRef.current = currentAccount;
  /** Main permission matrix (DPR desk, approvals) for the acting account */
  const may = (module: ModuleId, action: PermissionAction) => effectivePermission(accountRef.current, actor.current.role, module, action);
  const labourersRef = React.useRef(fullState.labourers);
  labourersRef.current = fullState.labourers;
  const mainActs = React.useRef({ applyDprAttendance, clearDprAttendance, raiseRequestsFromDpr });
  mainActs.current = { applyDprAttendance, clearDprAttendance, raiseRequestsFromDpr };
  /** A supervisor may only act on their own lines and jobs. */
  const notMine = (supervisorId: string) => actor.current.role === "supervisor" && supervisorId !== actor.current.staffId;

  /** Append one activity-log / notification event (docs §19). */
  const log = useCallback((e: Omit<WorkEvent, "id" | "seq" | "at" | "day" | "actorName" | "actorRole">) => {
    setWork((s) => {
      const seq = (s.events[s.events.length - 1]?.seq ?? 0) + 1;
      // Pass alerts come from the clock, not from whoever happened to open the app (docs §24)
      const system = e.kind === "pass_expiring";
      const ev: WorkEvent = { ...e, id: `ev-${seq}`, seq, at: new Date().toISOString(), day: today(), actorName: system ? "System" : actor.current.name, actorRole: system ? null : actor.current.role, impersonatedBy: system ? undefined : actor.current.impersonatedBy };
      return { ...s, events: [...s.events, ev] };
    });
    // Merge plan Step 11: the same event goes to the shared audit_log (Test tools reset never touches it)
    void remoteAudit({
      userId: actor.current.accountId,
      username: actor.current.name,
      role: actor.current.role,
      siteId: e.siteId || null,
      module: "work",
      action: e.kind,
      detail: e.detail ? `${e.title} — ${e.detail}` : e.title,
      impersonatedBy: actor.current.impersonatedBy ?? null,
    });
  }, []);
  const siteOfJob = (w: WorkState, job: Job) => w.planLines.find((l) => l.id === job.planLineId)?.siteId ?? "";

  useEffect(() => {
    try {
      // Merge plan Step 10: older Work keys are never read again
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith("sge-work-v") && k !== WORK_STORAGE_KEY) localStorage.removeItem(k);
      }
      const raw = localStorage.getItem(WORK_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as WorkState;
        setWork({ ...saved, reports: saved.reports ?? [], submissions: saved.submissions ?? [], paintSteps: saved.paintSteps ?? [] });
      }
    } catch {
      /* keep seed */
    }
    setHydrated(true);
  }, [log]);

  // 2026-10-24: alerts and work saved in another tab show here at once (not written back — no ping-pong)
  const fromOtherTab = React.useRef(false);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== WORK_STORAGE_KEY || !e.newValue) return;
      try {
        const saved = JSON.parse(e.newValue) as WorkState;
        fromOtherTab.current = true;
        setWork({ ...saved, reports: saved.reports ?? [], submissions: saved.submissions ?? [], paintSteps: saved.paintSteps ?? [] });
      } catch {
        /* unreadable copy — keep ours */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (fromOtherTab.current) {
      fromOtherTab.current = false;
      return;
    }
    try {
      localStorage.setItem(WORK_STORAGE_KEY, JSON.stringify(work));
    } catch {
      /* storage full / blocked */
    }
  }, [work, hydrated]);

  // docs §24: a RIL pass within 10 days of expiry (or expired) alerts HR, Admin and the
  // labourer's supervisor once per pass — a new expiry date from the RIL upload alerts again
  // 2026-10-24: a wage change alerts Owner / SA only after the Admin's Undo window, with the count waiting
  const wageReqs = fullState.wageChangeRequests;
  const markNotified = React.useRef(markWageChangesNotified);
  markNotified.current = markWageChangesNotified;
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => {
      const now = Date.now();
      const due = wageReqs.filter((r) => r.status === "pending" && !r.notified && now - Date.parse(r.requestedAt) >= WAGE_UNDO_MS);
      if (!due.length) return;
      const waiting = wageReqs.filter((r) => r.status === "pending").length;
      log({
        kind: "wage_change_requested",
        problem: true,
        siteId: "",
        title: `${waiting} wage change request${waiting === 1 ? "" : "s"} waiting for approval`,
        detail: `New from ${[...new Set(due.map((r) => r.requestedByName))].join(", ")}: ${due.length} · Master Data → Daily wages`,
        tab: "/master-data?sheet=wageBands",
        refId: due.map((r) => r.id).join(","),
      });
      markNotified.current(due.map((r) => r.id));
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [hydrated, wageReqs, log]);

  const passLabourers = fullState.labourers;
  useEffect(() => {
    if (!hydrated) return;
    const sent = new Set(ref.current.events.filter((e) => e.kind === "pass_expiring").map((e) => e.refId));
    for (const p of passesNeedingAction(passLabourers, today())) {
      const l = p.labourer;
      const refId = `${l.id}:${l.passExpiry}`;
      if (sent.has(refId)) continue;
      log({
        kind: "pass_expiring",
        siteId: l.siteId,
        subjectStaffId: l.supervisorId || undefined,
        problem: p.state === "expired",
        title: p.state === "expired" ? `${l.name}: RIL pass expired` : `${l.name}: RIL pass expires in ${p.days} day${p.days === 1 ? "" : "s"}`,
        detail: `EP ${l.epNumber} · expiry ${showDate(l.passExpiry)} · renew / reissue`,
        tab: "/home",
        refId,
      });
    }
  }, [hydrated, passLabourers, log]);

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { ok: false, error: "Pick the start date" };
    if (input.startDate > today()) return { ok: false, error: "A job can't start in the future" };
    // docs §24: the supervisor's plan — what he expects to finish and by when
    if (input.plannedM2 != null && !(input.plannedM2 > 0)) return { ok: false, error: "Planned m² must be above zero" };
    if (input.plannedEnd && input.plannedEnd < input.startDate) return { ok: false, error: "The planned end can't be before the start" };
    const planned = input.plannedM2 && input.plannedEnd;
    const siteCode = sitesRef.current.find((x) => x.id === line.siteId)?.code ?? line.siteId.replace("site-", "").toUpperCase();
    const job: Job = {
      id: uid("job"),
      // Numbered per site: J-MTF-0001, not a count shared by every site
      jobNo: nextJobNo(w.jobs, siteCode),
      planLineId: line.id,
      location: input.location.trim(),
      startDate: input.startDate,
      stages: input.stages,
      status: "open",
      supervisorId: line.supervisorId,
      ...(planned ? { plannedM2: round3(input.plannedM2!), plannedEnd: input.plannedEnd, planStatus: "pending" as const } : {}),
    };
    setWork((s) => ({ ...s, jobs: [...s.jobs, job] }));
    log({ kind: "job_started", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `${job.jobNo} started`, detail: `${line.plant} · ${job.location}`, tab: "jobs", refId: job.id });
    if (planned) log({ kind: "job_plan", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `${job.jobNo} plan: ${job.plannedM2} m² by ${job.plannedEnd}`, detail: `${line.plant} · ${job.location} · from ${job.startDate} — approve or send back`, tab: "jobs", refId: job.id });
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
    // Date (docs §4, §5): never in the future or before the job started; field
    // and office roles back-date to yesterday at most, Owner / Super Admin further
    const role = actor.current.role;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Pick the date" };
    if (input.date > today()) return { ok: false, error: "A DPR can't be dated in the future" };
    if (input.date < job.startDate) return { ok: false, error: `The job started on ${job.startDate} — the DPR can't be earlier` };
    if (role !== "owner" && role !== "super_admin" && input.date < daysAgo(1)) {
      return { ok: false, error: "Only today or yesterday can be entered — ask the Owner to back-date further" };
    }
    // Same row rules as the form: a half-filled row is an error, not silently dropped
    const checked = validMembers(input.members);
    if (checked.error) return { ok: false, error: checked.error };
    const members = checked.members;
    // DFT at final shade (docs §17), checked here too so no screen can skip it
    const item = w.serviceItems.find((x) => x.code === w.planLines.find((l) => l.id === job.planLineId)?.serviceCode);
    if (input.stage === finalStage(job) && item?.paints.length && !(Number(input.dft) > 0)) {
      return { ok: false, error: "Actual DFT is required at final shade" };
    }
    if (input.dft != null && (input.dft <= 0 || input.dft > 2000)) return { ok: false, error: "DFT must be between 1 and 2,000 µm" };
    const area = members.reduce((s, m) => s + m.nos * m.side * m.length * m.cf, 0);
    if (area > 2000) return { ok: false, error: `Area ${round3(area)} m² is over the 2,000 m² per line limit` };
    if (input.litres < 0) return { ok: false, error: "Litres can't be negative" };
    if (input.litres > 0 && !input.paintSap) return { ok: false, error: "Pick which paint the litres are from" };
    // Who keyed it in comes from the signed-in role, not the screen (docs §5b)
    const enteredBy: DprEntry["enteredBy"] =
      role === "admin" || role === "sic" || role === "owner" || role === "super_admin" ? role : "supervisor";
    // The line goes on a daily report (merge plan §1): the one given, or the day's open one
    const plan = w.planLines.find((l) => l.id === job.planLineId)!;
    const key = { submitterId: job.supervisorId, siteId: plan.siteId, plant: plan.plant, date: input.date, submitterType: "painting_blasting" as const, admin: enteredBy === "admin" };
    let report = input.reportId
      ? w.reports.find((r) => r.id === input.reportId)
      : w.reports.find((r) => reportOpen(r) && sameDay(r, key));
    if (input.reportId) {
      if (!report) return { ok: false, error: "Report not found" };
      if (!reportOpen(report)) return { ok: false, error: "That report is submitted — lines can't be added" };
      if (report.date !== input.date) return { ok: false, error: `This report is for ${report.date}` };
      if (report.siteId !== plan.siteId || (report.plant && report.plant !== plan.plant)) return { ok: false, error: `${job.jobNo} is on ${plan.plant}; this report is for ${report.plant || "another site"}` };
      if (report.submitterId !== job.supervisorId) return { ok: false, error: `${job.jobNo} belongs to another supervisor` };
    }
    const fresh = !report;
    if (!report) report = { ...blankReport({ submitterId: job.supervisorId, submitterType: "painting_blasting", siteId: plan.siteId, plant: plan.plant, date: input.date }), enteredBy: enteredBy === "admin" ? "admin" : undefined, enteredByName: enteredBy === "admin" ? actor.current.name : undefined };
    // Crew on the line must be on the report as working; add anyone missing as present 08:00–18:00
    const marked = new Set(report.labourMarks.map((m) => m.labourerId));
    const addMarks = (input.crew ?? []).filter((id) => !marked.has(id)).map((labourerId) => ({ labourerId, status: "present" as const, inTime: "08:00", outTime: "18:00" }));
    const nextReport: DprReport = { ...report, plant: report.plant || plan.plant, labourMarks: [...report.labourMarks, ...addMarks], updatedAt: new Date().toISOString() };
    const entry: DprEntry = { ...input, reportId: nextReport.id, members, enteredBy, enteredByName: actor.current.name, id: uid("wd"), supervisorId: job.supervisorId };
    setWork((s) => ({
      ...s,
      reports: fresh ? [...s.reports, nextReport] : s.reports.map((r) => (r.id === nextReport.id ? nextReport : r)),
      dprs: [...s.dprs, entry],
    }));
    const siteId = siteOfJob(w, job);
    log({ kind: "dpr_added", siteId, subjectStaffId: job.supervisorId, title: `${job.jobNo} · ${STAGES.find((x) => x.id === entry.stage)?.label} ${round3(entryArea(entry))} m²`, detail: `${job.location}${entry.enteredBy !== "supervisor" ? ` · entered by ${entry.enteredByName} (${entry.enteredBy.replace("_", " ")})` : ""}${entry.crew?.length ? ` · crew ${entry.crew.length}` : ""}`, tab: "jobs", refId: job.id });
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

  const requestClose = useCallback<WorkApi["requestClose"]>((jobId, endDate) => {
    if (!rights().canEnter) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job) return { ok: false, error: "Job not found" };
    if (notMine(job.supervisorId)) return { ok: false, error: "That job belongs to another supervisor" };
    const check = canCloseJob(job, w.dprs);
    if (!check.ok) return { ok: false, error: `Still missing: ${check.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}` };
    // The day's reports go to SIC first (merge plan Step 3)
    const unsent = pendingReports(job, w).filter(reportOpen);
    if (unsent.length) return { ok: false, error: `Submit the DPR for ${unsent.map((r) => r.date).sort().join(", ")} first` };
    // docs §24: ending the job gives the end date; the JMS covers the DPRs from start to end
    const lastDpr = w.dprs.filter((d) => d.jobId === jobId).map((d) => d.date).sort().pop() ?? job.startDate;
    const end = endDate || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return { ok: false, error: "Pick the end date" };
    if (end > today()) return { ok: false, error: "The end date can't be in the future" };
    if (end < lastDpr) return { ok: false, error: `There are DPR lines up to ${lastDpr} — the end date can't be earlier` };
    // A real timestamp, so the 24-hour escalation (docs §19) can age it
    const at = new Date().toISOString();
    setWork((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "awaiting_sic", endDate: end, closeRequestedAt: at, closeRequestedBy: actor.current.accountId, sentBack: undefined } : j)),
    }));
    log({ kind: "job_closed", siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} ended ${end} — confirm JMS`, detail: `${job.location} · ${round3(jobJmsQty(job, w.dprs))} m² final shade · ${job.startDate} → ${end}`, tab: "jobs", refId: job.id });
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

  /** docs §24: the SIC approves the supervisor's plan for a job, or sends it back with a reason */
  const decideJobPlan = useCallback<WorkApi["decideJobPlan"]>((jobId, approve, note) => {
    if (!rights().canConfirm) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job || job.planStatus !== "pending") return { ok: false, error: "This job has no plan waiting for approval" };
    const why = note.trim();
    if (!approve && !why) return { ok: false, error: "Give a reason so the supervisor can re-plan" };
    setWork((s) => ({ ...s, jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, planStatus: approve ? "approved" : "sent_back", planNote: why || undefined, planDecidedBy: actor.current.name } : j)) }));
    log({ kind: "job_plan_decided", problem: !approve, siteId: siteOfJob(w, job), subjectStaffId: job.supervisorId, title: `${job.jobNo} plan ${approve ? "approved" : "sent back"}`, detail: why || `${job.plannedM2} m² by ${job.plannedEnd}`, tab: "jobs", refId: job.id });
    return { ok: true };
  }, [log]);

  /** docs §24: the Admin enters RIL's JMS no. and the amount and submits — then Finance sees it */
  const adminApproveJms = useCallback<WorkApi["adminApproveJms"]>((jmsId, rilJmsNo, amount) => {
    if (actor.current.role !== "admin" && !rights().isBoss) return NOT_ALLOWED;
    const w = ref.current;
    const j = w.jms.find((x) => x.id === jmsId);
    if (!j || j.adminStatus !== "pending_admin") return { ok: false, error: "This JMS isn't waiting for the Admin" };
    const no = rilJmsNo.trim();
    if (!/^\d{7}$/.test(no)) return { ok: false, error: "The JMS no. is 7 digits" };
    if (w.jms.some((x) => x.id !== jmsId && x.rilJmsNo === no)) return { ok: false, error: `JMS no. ${no} is already used on another JMS` };
    if (!(amount > 0)) return { ok: false, error: "Amount must be above zero" };
    const at = new Date().toISOString();
    const amt = Math.round(amount * 100) / 100;
    setWork((s) => ({
      ...s,
      jms: s.jms.map((x) =>
        x.id === jmsId
          ? { ...x, adminStatus: "approved", rilJmsNo: no, amount: amt, computedAmount: x.computedAmount ?? x.amount, adminBy: actor.current.name, adminAt: at, statusLog: [...(x.statusLog ?? []), { at, by: actor.current.name, from: x.status, to: x.status, note: `Admin: JMS no. ${no}, ₹${amt.toLocaleString("en-IN")}` }] }
          : x
      ),
    }));
    const job = w.jobs.find((x) => x.id === j.jobId);
    const diff = (j.computedAmount ?? j.amount) !== amt;
    log({ kind: "jms_admin_approved", problem: diff, siteId: job ? siteOfJob(w, job) : "", subjectStaffId: job?.supervisorId, title: `JMS ${no} approved · ${job?.jobNo ?? ""}`, detail: `₹${amt.toLocaleString("en-IN")}${diff ? ` (worked out ₹${(j.computedAmount ?? j.amount).toLocaleString("en-IN")})` : ""} · ${j.qty} m² · now with Finance`, tab: "payments", refId: jmsId });
    return { ok: true };
  }, [log]);

  /** docs §24: the Admin sends a JMS back when the DPR compilation is wrong — the job reopens for the supervisor */
  const adminReturnJms = useCallback<WorkApi["adminReturnJms"]>((jmsId, reason) => {
    if (actor.current.role !== "admin" && !rights().isBoss) return NOT_ALLOWED;
    const w = ref.current;
    const j = w.jms.find((x) => x.id === jmsId);
    if (!j || j.adminStatus !== "pending_admin") return { ok: false, error: "Only a JMS waiting for the Admin can be sent back" };
    const why = reason.trim();
    if (!why) return { ok: false, error: "Say what's wrong so the supervisor can fix the DPRs" };
    const job = w.jobs.find((x) => x.id === j.jobId);
    const sentBack = { by: actor.current.name, at: new Date().toISOString(), reason: `JMS ${j.jmsNo}: ${why}` };
    setWork((s) => ({
      ...s,
      jms: s.jms.filter((x) => x.id !== jmsId),
      jobs: s.jobs.map((x) => (x.id === j.jobId ? { ...x, status: "open", jmsId: undefined, closedAt: undefined, closeRequestedAt: undefined, closeRequestedBy: undefined, sentBack } : x)),
    }));
    log({ kind: "jms_returned", problem: true, siteId: job ? siteOfJob(w, job) : "", subjectStaffId: job?.supervisorId, title: `JMS ${j.jmsNo} sent back by Admin · ${job?.jobNo ?? ""}`, detail: `${why} · job reopened ${j.periodFrom} → ${j.periodTo}, ${j.qty} m²`, tab: "jobs", refId: j.jobId });
    return { ok: true };
  }, [log]);

  const confirmJms = useCallback<WorkApi["confirmJms"]>((jobId) => {
    if (!rights().canConfirm) return NOT_ALLOWED;
    const w = ref.current;
    const job = w.jobs.find((j) => j.id === jobId);
    if (!job || job.status !== "awaiting_sic") return { ok: false, error: "Job isn't waiting for SIC" };
    // Nobody confirms a JMS for a job they closed themselves
    if (job.closeRequestedBy && job.closeRequestedBy === actor.current.accountId && !rights().isBoss) {
      return { ok: false, error: "You closed this job — another SIC (or the Owner) has to confirm it" };
    }
    // Closing a cycle never approves DPRs by itself (merge plan P2): the SIC reviews each first
    const pending = pendingReports(job, w);
    if (pending.some(reportOpen)) return { ok: false, error: "A DPR for this job is still with the supervisor — it has to be submitted first" };
    if (pending.length) return { ok: false, error: `${pending.length} DPR(s) for this job still need your review — approve them (or send back) first` };
    const line = w.planLines.find((l) => l.id === job.planLineId)!;
    const item = w.serviceItems.find((s) => s.code === line.serviceCode)!;
    const qty = jobJmsQty(job, w.dprs);
    const dates = w.dprs.filter((d) => d.jobId === jobId).map((d) => d.date).sort();
    const periodTo = job.endDate ?? dates[dates.length - 1] ?? today();
    // The work order must be valid on the JMS date (docs §17)
    const wo = pickWorkOrder(w, line.siteId, line.serviceCode, periodTo);
    if (!wo) return { ok: false, error: `No valid work order covers ${line.serviceCode} on ${periodTo} — add or extend the work order first` };
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
      periodTo,
      status: "JMS SUBMITTED",
      woId: wo.id,
      confirmedOn: today(),
      ratePending: item.ratePending || undefined,
      statusLog: [{ at: new Date().toISOString(), by: actor.current.name, from: "JMS SUBMITTED", to: "JMS SUBMITTED", note: "Created on SIC confirm" }],
      // docs §24: the Admin enters the JMS no. and amount before Finance sees it
      adminStatus: "pending_admin",
      computedAmount: Math.round(qty * item.rate * 100) / 100,
    };
    setWork((s) => ({
      ...s,
      jms: [...s.jms, row],
      jobs: s.jobs.map((j) => (j.id === jobId ? { ...j, status: "closed", closedAt: today(), jmsId: id } : j)),
    }));
    log({ kind: "jms_confirmed", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `JMS ${row.jmsNo} confirmed · ${job.jobNo}`, detail: `${qty} m² × ₹${item.rate}${item.ratePending ? " (placeholder rate — ARC list pending)" : ""} = ₹${row.amount.toLocaleString("en-IN")}`, tab: "jms", refId: id });
    log({ kind: "jms_admin_pending", siteId: line.siteId, subjectStaffId: job.supervisorId, title: `JMS ${row.jmsNo} · ${job.jobNo}: enter JMS no. and amount`, detail: `${qty} m² · ${row.periodFrom} → ${row.periodTo} · worked out ₹${row.amount.toLocaleString("en-IN")}`, tab: "/home", refId: id });
    // Tell Owner / SIC / Finance when this JMS takes the WO past its cap or an item past its scope
    const before = woUsage(wo.id, w);
    if (before) {
      const capAfter = (before.billed + row.amount) / (wo.capInr || Infinity);
      const itemScope = wo.scope[line.serviceCode] ?? 0;
      const itemAfter = (before.items.find((i) => i.code === line.serviceCode)?.used ?? 0) + qty;
      if (capAfter > 1 || (itemScope > 0 && itemAfter > itemScope)) {
        log({ kind: "wo_warning", problem: true, siteId: line.siteId, title: `WO ${wo.woNo} over ${capAfter > 1 ? "its ₹ cap" : `scope for ${line.serviceCode}`}`, detail: `JMS ${row.jmsNo} · ${capAfter > 1 ? `${Math.round(capAfter * 100)}% of cap` : `${round3(itemAfter)} of ${itemScope} m²`}`, tab: "wo", refId: wo.id });
      }
    }
    return { ok: true, id };
  }, [log]);

  const removeEntry = useCallback<WorkApi["removeEntry"]>((id) => {
    const w = ref.current;
    const e = w.dprs.find((d) => d.id === id);
    if (!e) return { ok: false, error: "Line not found" };
    const r = e.reportId ? w.reports.find((x) => x.id === e.reportId) : undefined;
    if (!r || !reportOpen(r)) return { ok: false, error: "Only lines on a draft or sent-back DPR can be removed" };
    if (!rights().canEnter || notMine(e.supervisorId)) return NOT_ALLOWED;
    const job = w.jobs.find((j) => j.id === e.jobId);
    if (job && job.status !== "open") return { ok: false, error: "The job is closed" };
    setWork((s) => ({ ...s, dprs: s.dprs.filter((d) => d.id !== id) }));
    log({ kind: "dpr_added", siteId: r.siteId, subjectStaffId: e.supervisorId, title: `Line removed · ${job?.jobNo ?? ""} ${round3(entryArea(e))} m²`, detail: `${e.date} · ${STAGES.find((x) => x.id === e.stage)?.label}`, tab: "jobs", refId: e.jobId });
    return { ok: true };
  }, [log]);

  const saveReport = useCallback<WorkApi["saveReport"]>((doc) => {
    if (!may("dpr", "create") && !may("dpr", "update")) return NOT_ALLOWED;
    if (actor.current.role === "supervisor" && doc.submitterId !== actor.current.staffId) return { ok: false, error: "That DPR belongs to another supervisor" };
    const w = ref.current;
    const existing = w.reports.find((r) => r.id === doc.id);
    if (existing && !reportOpen(existing)) return { ok: false, error: `This DPR is ${existing.status === "submitted" ? "with SIC" : "approved"} — it can't be edited` };
    if (existing && existing.plant && doc.plant !== existing.plant && entriesOf(w, doc.id).length) return { ok: false, error: "This DPR has job lines on " + existing.plant + " — the plant can't change" };
    // Crew booked on this report's job lines stays marked, whatever the form held
    const booked = [...new Set(entriesOf(w, doc.id).flatMap((e) => e.crew ?? []))].filter((id) => !doc.labourMarks.some((m) => m.labourerId === id));
    const saved: DprReport = {
      ...doc,
      labourMarks: [...doc.labourMarks, ...booked.map((labourerId) => ({ labourerId, status: "present" as const, inTime: "08:00", outTime: "18:00" }))],
      status: existing?.status ?? "draft",
      updatedAt: new Date().toISOString(),
    };
    setWork((s) => ({ ...s, reports: existing ? s.reports.map((r) => (r.id === doc.id ? saved : r)) : [...s.reports, saved] }));
    return { ok: true, id: doc.id };
  }, []);

  const submitReport = useCallback<WorkApi["submitReport"]>((id) => {
    if (!may("dpr", "submit")) return NOT_ALLOWED;
    const w = ref.current;
    const r = w.reports.find((x) => x.id === id);
    if (!r) return { ok: false, error: "DPR not found" };
    if (!reportOpen(r)) return { ok: false, error: "Already submitted" };
    if (actor.current.role === "supervisor" && r.submitterId !== actor.current.staffId) return { ok: false, error: "That DPR belongs to another supervisor" };
    const plants = sitesRef.current.find((x) => x.id === r.siteId)?.plants ?? [];
    const problems = validateDprForSubmit(r, dprCrew(r, labourersRef.current), plants, entriesOf(w, id));
    if (problems.length) return { ok: false, error: problems.join(" · ") };
    const at = new Date().toISOString();
    // Stamped on the app date (the demo date when one is set), India time, for the 10:00 deadline
    const sent: DprReport = { ...r, status: "submitted", submittedAt: `${today()}T${nowTime()}:00+05:30`, updatedAt: at };
    setWork((s) => ({ ...s, reports: s.reports.map((x) => (x.id === id ? sent : x)) }));
    // Requests on the DPR go to the request desk (docs §9)
    mainActs.current.raiseRequestsFromDpr(sent);
    // docs §23: the crew's attendance counts when the DPR is submitted; the SIC is told and reviews the work
    mainActs.current.applyDprAttendance(sent);
    const late = isLate(sent);
    log({ kind: "dpr_submitted", problem: late, siteId: r.siteId, subjectStaffId: r.submitterId, title: `DPR ${r.date} · ${r.plant} submitted${late ? " late" : ""}`, detail: `${r.submitterType.replace("_", " & ")} · ${entriesOf(w, id).length} job line(s) · crew ${r.labourMarks.length}`, tab: "jobs", refId: id });
    // docs §24: each request goes to the store and the SIC is told; issues alert the SIC
    for (const q of sent.requests) {
      const urgent = q.urgent || q.reason === "urgent";
      log({ kind: "request_raised", problem: urgent, siteId: r.siteId, subjectStaffId: r.submitterId, title: urgent ? `URGENT · ${q.description}` : `${q.reason ? `${q.reason[0].toUpperCase()}${q.reason.slice(1)}: ` : ""}${q.description}`, detail: `${q.kind} · qty ${q.qty ?? "—"} · ${r.plant} · from DPR ${r.date}`, tab: "/requests", refId: id });
    }
    if (sent.issues?.trim()) log({ kind: "dpr_issue", problem: true, siteId: r.siteId, subjectStaffId: r.submitterId, title: `Issue on ${r.plant} · DPR ${r.date}`, detail: sent.issues.trim(), tab: `/dpr/${id}`, refId: id });
    return { ok: true };
  }, [log]);

  const reviewReport = useCallback<WorkApi["reviewReport"]>((id, decision, note) => {
    if (!may("approvals", "approve")) return NOT_ALLOWED;
    const w = ref.current;
    const r = w.reports.find((x) => x.id === id);
    if (!r || r.status !== "submitted") return { ok: false, error: "This DPR isn't waiting for review" };
    if (decision === "sic_rejected" && !note.trim()) return { ok: false, error: "Give a reason so the supervisor can fix it" };
    const at = new Date().toISOString();
    // Round 2 (§27): Admin may review for the SIC at any time; both names stay in the log
    const forSic = actor.current.role === "admin";
    const done: DprReport = { ...r, status: decision, sicNote: note.trim() || undefined, sicReviewedBy: forSic ? `${actor.current.name} (Admin for SIC)` : actor.current.name, sicReviewedAt: at, updatedAt: at };
    setWork((s) => ({ ...s, reports: s.reports.map((x) => (x.id === id ? done : x)) }));
    // Attendance was recorded at submit (docs §23); the review accepts the work quantities
    log({
      kind: decision === "sic_approved" ? "dpr_approved" : "dpr_sent_back",
      problem: decision === "sic_rejected",
      siteId: r.siteId,
      subjectStaffId: r.submitterId,
      title: `DPR ${r.date} · ${r.plant} ${decision === "sic_approved" ? "approved" : "sent back"}${forSic ? " by Admin for SIC" : ""}`,
      detail: note.trim() || "Approved",
      tab: "jobs",
      refId: id,
    });
    if (forSic) log({ kind: "dpr_for_sic", siteId: r.siteId, subjectStaffId: r.submitterId, title: `Admin ${decision === "sic_approved" ? "approved" : "sent back"} DPR ${r.date} · ${r.plant} for you`, detail: note.trim() || "No note", tab: `/dpr/${id}`, refId: id });
    return { ok: true };
  }, [log]);

  const unlockReport = useCallback<WorkApi["unlockReport"]>((id, reason) => {
    const role = actor.current.role;
    if (role !== "owner" && role !== "super_admin") return { ok: false, error: "Only the Owner or Super Admin can unlock an approved DPR" };
    const w = ref.current;
    const r = w.reports.find((x) => x.id === id);
    if (!r || r.status !== "sic_approved") return { ok: false, error: "Only an approved DPR can be unlocked" };
    if (!reason.trim()) return { ok: false, error: "Give the reason for unlocking (it's logged)" };
    const jobsDone = w.jobs.filter((j) => j.status === "closed" && entriesOf(w, id).some((e) => e.jobId === j.id));
    if (jobsDone.length) return { ok: false, error: `${jobsDone.map((j) => j.jobNo).join(", ")} already became a JMS — unlocking would change a confirmed quantity` };
    const at = new Date().toISOString();
    setWork((s) => ({ ...s, reports: s.reports.map((x) => (x.id === id ? { ...x, status: "draft", updatedAt: at, unlocks: [...(x.unlocks ?? []), { by: actor.current.name, at, reason: reason.trim() }] } : x)) }));
    // Attendance taken from it goes until it is approved again
    mainActs.current.clearDprAttendance(id);
    log({ kind: "dpr_unlocked", problem: true, siteId: r.siteId, subjectStaffId: r.submitterId, title: `DPR ${r.date} · ${r.plant} unlocked`, detail: reason.trim(), tab: "jobs", refId: id });
    return { ok: true };
  }, [log]);

  const telegramToReport = useCallback<WorkApi["telegramToReport"]>((input) => {
    const w = ref.current;
    const day = today();
    const open = w.reports.find((r) => r.submitterId === input.submitterId && r.submitterType === input.submitterType && r.date === day && reportOpen(r));
    const base = open ?? blankReport({ submitterId: input.submitterId, submitterType: input.submitterType, siteId: input.siteId, date: day });
    let next: DprReport = {
      ...base,
      telegramDraftLines: [...base.telegramDraftLines, input.content],
      note: base.note ? `${base.note}\n[TG] ${input.content}` : `[TG] ${input.content}`,
      updatedAt: new Date().toISOString(),
    };
    if (input.observation && next.safetyBody) {
      next = {
        ...next,
        safetyBody: {
          ...next.safetyBody,
          observations: [
            ...next.safetyBody.observations,
            { id: `obs-tg-${Date.now()}`, obsNo: "", type: "UA", from: "S", risk: "MEDIUM", status: "OPEN", checkedBy: "S", whereWhat: input.content, actionTaken: "", whoWillFix: "", firstFoundOn: day, fixByDate: "" },
          ],
        },
      };
    }
    setWork((s) => ({ ...s, reports: open ? s.reports.map((r) => (r.id === next.id ? next : r)) : [...s.reports, next] }));
    return { ok: true, id: next.id };
  }, []);

  const setJmsStatus = useCallback<WorkApi["setJmsStatus"]>((jmsId, status, note) => {
    // Round 2 (§27): after confirming, the SIC only views the JMS; Admin / Owner / SA move it
    if (actor.current.role !== "admin" && !rights().isBoss) return NOT_ALLOWED;
    const w = ref.current;
    const j = w.jms.find((x) => x.id === jmsId);
    if (!j) return { ok: false, error: "JMS not found" };
    if (status === "PAID") return { ok: false, error: "PAID is set by recording the payment on the Payments tab" };
    if (!nextJmsStatuses(j.status, rights().isBoss).includes(status)) {
      return { ok: false, error: `${j.status} can only move to ${nextJmsStatuses(j.status, rights().isBoss).join(" or ") || "nothing (it's paid)"}` };
    }
    const entry = { at: new Date().toISOString(), by: actor.current.name, from: j.status, to: status, note: note?.trim() || undefined };
    setWork((s) => ({ ...s, jms: s.jms.map((x) => (x.id === jmsId ? { ...x, status, statusLog: [...(x.statusLog ?? []), entry] } : x)) }));
    const job = w.jobs.find((x) => x.id === j.jobId);
    const back = JMS_FLOW.indexOf(status) < JMS_FLOW.indexOf(j.status);
    log({ kind: "jms_status", problem: back, siteId: job ? siteOfJob(w, job) : "", subjectStaffId: job?.supervisorId, title: `JMS ${j.jmsNo}: ${j.status} → ${status}`, detail: back ? "Stepped back" : "RIL stage moved on", tab: "jms", refId: j.id });
    return { ok: true };
  }, [log]);

  /** Internal JMS takes RIL's status from its linked submission (docs §10), never undoing a recorded payment */
  const followStatus = (j: Jms, s: JmsSubmission): Jms => {
    if (j.payment || s.status === "A1 REJECT" || s.status === j.status || s.status === "PAID") return j;
    return { ...j, status: s.status, statusLog: [...(j.statusLog ?? []), { at: new Date().toISOString(), by: actor.current.name, from: j.status, to: s.status, note: `From RIL JMS ${s.rilJmsNo}` }] };
  };

  const uploadSubmission = useCallback<WorkApi["uploadSubmission"]>((input) => {
    if (!may("jms", "upload")) return NOT_ALLOWED;
    const no = input.rilJmsNo.trim();
    if (!/^\d{7}$/.test(no)) return { ok: false, error: "RIL JMS no. is 7 digits" };
    if (!input.siteId) return { ok: false, error: "Pick the site" };
    if (!input.plant.trim()) return { ok: false, error: "Pick the plant" };
    if (!input.woNo.trim()) return { ok: false, error: "Enter the WO no." };
    if (!input.periodFrom || !input.periodTo || input.periodFrom > input.periodTo) return { ok: false, error: "Pick the period (from ≤ to)" };
    if (!input.items.length) return { ok: false, error: "Add at least one item" };
    const w = ref.current;
    const at = new Date().toISOString();
    const existing = w.submissions.find((s) => s.rilJmsNo === no);
    const qty = round3(input.items.reduce((t, i) => t + i.qty, 0));
    const amount = Math.round(input.items.reduce((t, i) => t + i.amount, 0) * 100) / 100;
    const sub: JmsSubmission = existing
      ? {
          ...existing,
          ...input,
          rilJmsNo: no,
          qty,
          amount,
          statusLog: existing.status === input.status ? existing.statusLog : [...existing.statusLog, { status: input.status, at, by: actor.current.name }],
          uploadedBy: actor.current.name,
          uploadedAt: at,
        }
      : { ...input, rilJmsNo: no, id: uid("jsub"), qty, amount, statusLog: [{ status: input.status, at, by: actor.current.name }], uploadedBy: actor.current.name, uploadedAt: at };
    // Link a new (or unlinked) submission when exactly one internal JMS fits
    if (!sub.jmsId) {
      const c = linkCandidates(sub, w);
      if (c.length === 1) sub.jmsId = c[0].id;
    }
    const linked = sub.jmsId ? w.jms.find((j) => j.id === sub.jmsId) : undefined;
    setWork((s) => ({
      ...s,
      submissions: existing ? s.submissions.map((x) => (x.id === sub.id ? sub : x)) : [...s.submissions, sub],
      jms: s.jms.map((j) => (j.id === sub.jmsId ? followStatus({ ...j, submissionId: sub.id }, sub) : j)),
    }));
    log({ kind: existing ? "jms_status" : "jms_submitted", siteId: sub.siteId, title: `RIL JMS ${no} ${existing ? "re-uploaded" : "uploaded"} · ${sub.status}`, detail: `${sub.plant} · ${qty} · ₹${amount.toLocaleString("en-IN")}${linked ? ` · linked to JMS ${linked.jmsNo}` : " · not linked yet"}`, tab: "jms", refId: linked?.id ?? sub.id });
    if (linked) {
      const diffs = compareJms(linked, sub, w);
      if (diffs.length) log({ kind: "jms_difference", problem: true, siteId: sub.siteId, title: `JMS ${linked.jmsNo} vs RIL ${no}: ${diffs.map((d) => d.field).join(", ")} differ`, detail: diffs.map((d) => `${d.field}: ours ${d.internal}, RIL ${d.submitted}`).join(" · "), tab: "jms", refId: linked.id });
    }
    return { ok: true, id: sub.id };
  }, [log]);

  const linkSubmission = useCallback<WorkApi["linkSubmission"]>((submissionId, jmsId) => {
    if (!may("jms", "upload") && !may("jms", "approve")) return NOT_ALLOWED;
    const w = ref.current;
    const sub = w.submissions.find((s) => s.id === submissionId);
    const j = w.jms.find((x) => x.id === jmsId);
    if (!sub || !j) return { ok: false, error: "Not found" };
    if (j.submissionId && j.submissionId !== submissionId) return { ok: false, error: `JMS ${j.jmsNo} is already linked to another submission` };
    const line = w.planLines.find((l) => l.id === j.planLineId);
    if (line?.siteId !== sub.siteId) return { ok: false, error: "That JMS is on another site" };
    setWork((s) => ({
      ...s,
      submissions: s.submissions.map((x) => (x.id === submissionId ? { ...x, jmsId } : x.jmsId === jmsId ? { ...x, jmsId: undefined } : x)),
      jms: s.jms.map((x) => (x.id === jmsId ? followStatus({ ...x, submissionId }, sub) : x.submissionId === submissionId ? { ...x, submissionId: undefined } : x)),
    }));
    const diffs = compareJms(j, sub, w);
    log({ kind: "jms_linked", problem: diffs.length > 0, siteId: sub.siteId, title: `JMS ${j.jmsNo} ↔ RIL ${sub.rilJmsNo}`, detail: diffs.length ? `Differences: ${diffs.map((d) => d.field).join(", ")}` : "Matches", tab: "jms", refId: j.id });
    return { ok: true };
  }, [log]);

  const unlinkSubmission = useCallback<WorkApi["unlinkSubmission"]>((submissionId) => {
    if (!may("jms", "upload") && !may("jms", "approve")) return NOT_ALLOWED;
    const sub = ref.current.submissions.find((s) => s.id === submissionId);
    if (!sub?.jmsId) return { ok: false, error: "Not linked" };
    const j = ref.current.jms.find((x) => x.id === sub.jmsId);
    setWork((s) => ({
      ...s,
      submissions: s.submissions.map((x) => (x.id === submissionId ? { ...x, jmsId: undefined } : x)),
      jms: s.jms.map((x) => (x.submissionId === submissionId ? { ...x, submissionId: undefined } : x)),
    }));
    log({ kind: "jms_linked", siteId: sub.siteId, title: `RIL ${sub.rilJmsNo} unlinked${j ? ` from JMS ${j.jmsNo}` : ""}`, detail: "Unlinked", tab: "jms", refId: sub.id });
    return { ok: true };
  }, [log]);

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
    if (!inStock(b)) return { ok: false, error: "That batch isn't in the SGE store yet" };
    if (!(qtyL > 0)) return { ok: false, error: "Quantity must be above zero" };
    if (qtyL > b.qtyL) return { ok: false, error: `Only ${b.qtyL} L in this batch` };
    const sup = staffRef.current.find((x) => x.id === supervisorId);
    if (!sup || sup.role !== "supervisor") return { ok: false, error: "Pick a supervisor" };
    if (sup.siteId !== b.siteId) return { ok: false, error: `${sup.name} doesn't work on this batch's site` };
    const issued = { ...b, id: uid("pb"), qtyL, supervisorId, issuedOn: today() };
    // Our 941: the issue in the supervisor's name (RIL's 941 no. is added later for reference)
    const step941: PaintStep = { id: uid("ps"), step: "941", batchId: issued.id, supervisorId, sap: b.sap, month: today().slice(0, 7), litres: qtyL, date: today(), by: actor.current.name };
    setWork((s) => ({
      ...s,
      paint: [...s.paint.map((x) => (x.id === batchId ? { ...x, qtyL: round3(x.qtyL - qtyL) } : x)), issued],
      paintSteps: [...s.paintSteps, step941],
    }));
    log({ kind: "paint_issued", siteId: b.siteId, subjectStaffId: supervisorId, problem: b.expiry < today(), title: `${qtyL} L ${b.name} issued`, detail: `Batch ${b.batch} · exp ${b.expiry}${b.expiry < today() ? " (EXPIRED)" : ""}`, tab: "paint", refId: issued.id });
    return { ok: true, id: issued.id };
  }, [log]);

  const receivePaint = useCallback<WorkApi["receivePaint"]>((input) => {
    if (!rights().canIssuePaint) return NOT_ALLOWED;
    if (!input.sap.trim() || !input.name.trim()) return { ok: false, error: "Enter the paint (SAP code and name)" };
    if (!(input.qtyL > 0)) return { ok: false, error: "Litres must be above zero" };
    if (!input.siteId) return { ok: false, error: "Pick the site" };
    if (input.expiry && input.mfg && input.expiry < input.mfg) return { ok: false, error: "Expiry can't be before manufacture" };
    const b: PaintBatch = { ...input, sap: input.sap.trim(), name: input.name.trim(), id: uid("pb"), supervisorId: null, updatedAt: new Date().toISOString() };
    setWork((s) => ({ ...s, paint: [...s.paint, b] }));
    log({ kind: "paint_received", siteId: b.siteId, title: `${b.qtyL} L ${b.name} · ${LIFECYCLE_LABEL[b.lifecycle ?? "sge_receive"]}`, detail: `Batch ${b.batch || "—"}${b.prNo ? ` · PR ${b.prNo}` : ""}${b.poNo ? ` · PO ${b.poNo}` : ""}`, tab: "paint", refId: b.id });
    return { ok: true, id: b.id };
  }, [log]);

  const advancePaintLifecycle = useCallback<WorkApi["advancePaintLifecycle"]>((batchId) => {
    if (!rights().canIssuePaint) return NOT_ALLOWED;
    const b = ref.current.paint.find((x) => x.id === batchId);
    if (!b || b.supervisorId) return { ok: false, error: "Batch not found" };
    const at = LIFECYCLE.indexOf(b.lifecycle ?? "sge_receive");
    if (at >= LIFECYCLE.length - 1) return { ok: false, error: "Already in the SGE store — issue it to a supervisor" };
    const to = LIFECYCLE[at + 1];
    if (to === "po" && !b.prNo) return { ok: false, error: "Enter the PR no. first" };
    if (to === "ril_receive" && !b.poNo) return { ok: false, error: "Enter the PO no. first" };
    setWork((s) => ({ ...s, paint: s.paint.map((x) => (x.id === batchId ? { ...x, lifecycle: to, updatedAt: new Date().toISOString() } : x)) }));
    log({ kind: "paint_stage", siteId: b.siteId, title: `${b.name} → ${LIFECYCLE_LABEL[to]}`, detail: `${b.qtyL} L · batch ${b.batch || "—"}`, tab: "paint", refId: b.id });
    return { ok: true };
  }, [log]);

  const recoMonth = useCallback<WorkApi["recoMonth"]>((supervisorId, sap, month) => {
    if (!rights().canIssuePaint && actor.current.role !== "admin") return NOT_ALLOWED;
    const w = ref.current;
    if (month >= today().slice(0, 7)) return { ok: false, error: "Reco is done after the month ends" };
    if (w.paintSteps.some((s) => s.step === "942" && s.supervisorId === supervisorId && s.sap === sap && s.month === month)) return { ok: false, error: "That month is already reconciled" };
    const litres = paintUsedInMonth(supervisorId, sap, month, w.dprs);
    const step: PaintStep = { id: uid("ps"), step: "942", supervisorId, sap, month, litres, date: today(), by: actor.current.name };
    setWork((s) => ({ ...s, paintSteps: [...s.paintSteps, step] }));
    const site = staffRef.current.find((x) => x.id === supervisorId)?.siteId ?? "";
    log({ kind: "paint_step", siteId: site, subjectStaffId: supervisorId, title: `942 reco · ${month} · ${litres} L`, detail: `${sap} · from DPR use`, tab: "paint", refId: step.id });
    return { ok: true, id: step.id };
  }, [log]);

  const postMonth = useCallback<WorkApi["postMonth"]>((recoId) => {
    if (!rights().canIssuePaint && actor.current.role !== "admin") return NOT_ALLOWED;
    const w = ref.current;
    const reco = w.paintSteps.find((s) => s.id === recoId && s.step === "942");
    if (!reco) return { ok: false, error: "Reco not found" };
    if (w.paintSteps.some((s) => s.step === "261" && s.recoId === recoId)) return { ok: false, error: "Already posted" };
    const step: PaintStep = { id: uid("ps"), step: "261", recoId, supervisorId: reco.supervisorId, sap: reco.sap, month: reco.month, litres: reco.litres, date: today(), by: actor.current.name };
    setWork((s) => ({ ...s, paintSteps: [...s.paintSteps, step] }));
    const site = staffRef.current.find((x) => x.id === reco.supervisorId)?.siteId ?? "";
    log({ kind: "paint_step", siteId: site, subjectStaffId: reco.supervisorId, title: `261 posted · ${reco.month} · ${reco.litres} L`, detail: reco.sap, tab: "paint", refId: step.id });
    return { ok: true, id: step.id };
  }, [log]);

  const setRilRef = useCallback<WorkApi["setRilRef"]>((stepId, refNo, rilLitres) => {
    if (!rights().canIssuePaint && actor.current.role !== "admin") return NOT_ALLOWED;
    const w = ref.current;
    const st = w.paintSteps.find((s) => s.id === stepId);
    if (!st) return { ok: false, error: "Step not found" };
    if (!refNo.trim()) return { ok: false, error: "Enter RIL's number" };
    if (rilLitres != null && !(rilLitres >= 0)) return { ok: false, error: "Litres can't be negative" };
    const next: PaintStep = { ...st, rilRef: refNo.trim(), rilRefBy: actor.current.name, rilRefAt: new Date().toISOString(), rilLitres: st.step === "942" ? rilLitres : undefined };
    setWork((s) => ({ ...s, paintSteps: s.paintSteps.map((x) => (x.id === stepId ? next : x)) }));
    const site = staffRef.current.find((x) => x.id === st.supervisorId)?.siteId ?? "";
    log({ kind: "paint_step", siteId: site, subjectStaffId: st.supervisorId, title: `RIL ${st.step} no. ${next.rilRef}`, detail: `${st.sap} · ${st.month}${next.rilLitres != null ? ` · RIL ${next.rilLitres} L vs ours ${st.litres} L` : ""}`, tab: "paint", refId: st.id });
    const v = stepVariance(next, materialsRef.current);
    if (v?.over) log({ kind: "paint_variance", problem: true, siteId: site, subjectStaffId: st.supervisorId, title: `Paint variance ${v.pct.toFixed(1)}% · ${st.sap} ${st.month}`, detail: `Ours ${st.litres} L vs RIL ${next.rilLitres} L (tolerance ±${v.tolerance}%)`, tab: "paint", refId: st.id });
    return { ok: true };
  }, [log]);

  /** Record (or clear, with null) the money received against a JMS. */
  const recordPayment = useCallback<WorkApi["recordPayment"]>((jmsId, payment, clearReason) => {
    if (!rights().canMoney) return NOT_ALLOWED;
    const j = ref.current.jms.find((x) => x.id === jmsId);
    if (!j) return { ok: false, error: "JMS not found" };
    if (j.adminStatus === "pending_admin") return { ok: false, error: "This JMS is waiting for the Admin to enter its number and amount" };
    if (!payment && !clearReason?.trim()) return { ok: false, error: "Give a reason for clearing this payment" };
    if (payment) {
      if (!(payment.amount > 0)) return { ok: false, error: "Amount received must be above zero" };
      if (!payment.receivedOn) return { ok: false, error: "Date received is required" };
      if (payment.receivedOn > today()) return { ok: false, error: "The date received can't be in the future" };
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
    } else {
      const w = ref.current;
      const job = w.jobs.find((x) => x.id === j.jobId);
      log({ kind: "payment_cleared", problem: true, siteId: job ? siteOfJob(w, job) : "", title: `Payment cleared · JMS ${j.jmsNo}`, detail: clearReason!.trim(), tab: "payments", refId: j.id });
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
      // On the app date (the demo date when one is set), so "same day" edits line up with today()
      enteredAt: `${today()}T${nowTime()}:00+05:30`,
    };
    setWork((s) => ({ ...s, expenses: [...s.expenses, entry] }));
    log({ kind: "expense_added", problem: !!input.billPending, siteId: input.siteId, title: `Cost ₹${input.amount.toLocaleString("en-IN")} · ${entry.category} · ${entry.vendor}`, detail: `${input.kind === "fixed" ? `Fixed · ${month}` : "Direct (job)"} · ${input.paymentMode}${input.billPending ? " · bill to follow" : ""}`, tab: "pnl", refId: id });
    return { ok: true, id };
  }, [log]);

  const editExpense = useCallback<WorkApi["editExpense"]>((id, patch) => {
    if (!rights().canMoney) return NOT_ALLOWED;
    const x = ref.current.expenses.find((e) => e.id === id);
    if (!x) return { ok: false, error: "Cost not found" };
    if (!canVoidExpense(x, { accountId: actor.current.accountId, role: actor.current.role }, today())) {
      return { ok: false, error: "Only the person who entered it can change it, on the same day — after that, the Owner" };
    }
    if (patch.amount !== undefined && !(patch.amount > 0)) return { ok: false, error: "Amount must be above zero" };
    if (patch.category !== undefined && !(EXPENSE_CATEGORIES as readonly string[]).includes(patch.category)) return { ok: false, error: "Pick a category from the list" };
    if (patch.vendor !== undefined && !patch.vendor.trim()) return { ok: false, error: "Enter who was paid (vendor)" };
    if (patch.note !== undefined && !patch.note.trim()) return { ok: false, error: "Add a remark" };
    const keys = (Object.keys(patch) as (keyof typeof patch)[]).filter((k) => patch[k] !== x[k]);
    if (!keys.length) return { ok: true };
    const changes = keys.map((k) => `${k} ${x[k] ?? "—"} → ${patch[k] ?? "—"}`).join(", ");
    const edit = { by: actor.current.name, at: new Date().toISOString(), changes };
    setWork((s) => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...patch, edits: [...(e.edits ?? []), edit] } : e)) }));
    const late = (x.enteredAt ?? "").slice(0, 10) !== today();
    log({ kind: "expense_edited", problem: late, siteId: x.siteId, title: `Cost edited · ${x.category} ₹${x.amount.toLocaleString("en-IN")}`, detail: changes, tab: "pnl", refId: id });
    return { ok: true };
  }, [log]);

  const removeExpense = useCallback<WorkApi["removeExpense"]>((id, reason) => {
    if (!rights().canMoney) return NOT_ALLOWED;
    const x = ref.current.expenses.find((e) => e.id === id);
    if (!x) return { ok: false, error: "Cost not found" };
    if (!canVoidExpense(x, { accountId: actor.current.accountId, role: actor.current.role }, today())) {
      return { ok: false, error: "Only the person who entered it can void it, on the same day — after that, the Owner" };
    }
    if (!reason.trim()) return { ok: false, error: "Give a reason for voiding this cost" };
    const voided = { by: actor.current.name, at: new Date().toISOString(), reason: reason.trim() };
    setWork((s) => ({ ...s, expenses: s.expenses.map((e) => (e.id === id ? { ...e, voided } : e)) }));
    // Owner sees edits after the day as problems (docs §19)
    const late = (x.enteredAt ?? "").slice(0, 10) !== today();
    log({ kind: "expense_voided", problem: late, siteId: x.siteId, title: `Cost voided · ₹${x.amount.toLocaleString("en-IN")} ${x.category}`, detail: reason.trim(), tab: "pnl", refId: id });
    return { ok: true };
  }, [log]);

  /** Test helper: load a prepared state on top of the demo data, on the demo date. */
  const loadScenario = useCallback((id: ScenarioId) => {
    if (!rights().isBoss) return;
    setDemoToday(WORK_TODAY);
    setWork(applyScenario(createWorkSeed(), id));
  }, []);

  const loadDemo = useCallback(() => {
    if (!rights().isBoss) return;
    setDemoToday(WORK_TODAY);
    setWork(createWorkSeed());
  }, []);

  const markSeen = useCallback((accountId: string) => {
    setWork((s) => ({ ...s, lastSeen: { ...s.lastSeen, [accountId]: s.events[s.events.length - 1]?.seq ?? 0 } }));
  }, []);

  const resetWork = useCallback(() => {
    if (!rights().isBoss) return;
    setDemoToday(null);
    setWork(createEmptyWork(today().slice(0, 7)));
  }, []);

  const importExcel = useCallback<WorkApi["importExcel"]>((kind, rows) => {
    if (!rights().isBoss) return { ok: false, error: "Only Owner / Super Admin can upload Excel" };
    const spec = workTransferSpec(kind);
    if (!spec) return { ok: false, error: "Unknown sheet" };
    return spec.apply(rows, {
      work: ref.current,
      sites: sitesRef.current,
      staff: staffRef.current,
      setWork,
    });
  }, []);

  const api = useMemo<WorkApi>(
    () => ({ work, hydrated, importExcel, editExpense, receivePaint, advancePaintLifecycle, recoMonth, postMonth, setRilRef, uploadSubmission, linkSubmission, unlinkSubmission, addPlanLine, startJob, decideJobPlan, adminApproveJms, adminReturnJms, addDpr, removeEntry, saveReport, submitReport, reviewReport, unlockReport, telegramToReport, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, recordPayment, addExpense, removeExpense, loadScenario, loadDemo, markSeen, resetWork, notify: log }),
    [work, hydrated, importExcel, editExpense, receivePaint, advancePaintLifecycle, recoMonth, postMonth, setRilRef, uploadSubmission, linkSubmission, unlinkSubmission, addPlanLine, startJob, decideJobPlan, adminApproveJms, adminReturnJms, addDpr, removeEntry, saveReport, submitReport, reviewReport, unlockReport, telegramToReport, requestClose, confirmJms, rejectClose, setJmsStatus, closeMonth, issuePaint, recordPayment, addExpense, removeExpense, loadScenario, loadDemo, markSeen, resetWork, log]
  );
  return <WorkContext.Provider value={api}>{children}</WorkContext.Provider>;
}

export function useWork() {
  const ctx = useContext(WorkContext);
  if (!ctx) throw new Error("useWork must be used within WorkProvider");
  return ctx;
}
