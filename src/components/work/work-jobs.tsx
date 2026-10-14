"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { canCloseJob, effectiveEntries, entryArea, entryDiffs, finalStage, jobProgress, jobStageAreas, memberArea, monthLabel, round3, validMembers } from "@/lib/work/logic";
import { daysAgo } from "@/lib/today";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";
import { pendingReports, reportOpen } from "@/lib/work/reports";
import Link from "next/link";
import type { Job, Member, Stage } from "@/lib/work/types";
import { STAGES } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, lineLabel, Msg, selectCls, StageChips, useWorkScope } from "./common";

type Filter = "open" | "awaiting_sic" | "closed";

export function WorkJobs() {
  const { state } = useStore();
  const { requestClose, confirmJms, rejectClose, reviewReport, decideJobPlan } = useWork();
  // End date typed per job when ending it, and the plan send-back reason (docs §24)
  const [endDates, setEndDates] = useState<Record<string, string>>({});
  const [planBack, setPlanBack] = useState<Record<string, string>>({});
  const s = useWorkScope();
  const { work } = s;
  const [filter, setFilter] = useState<Filter>("open");
  const [dprFor, setDprFor] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  // Job being sent back, and the reason typed for it
  const [sendBack, setSendBack] = useState<{ jobId: string; reason: string } | null>(null);
  const mine = (j: Job) => s.role !== "supervisor" || j.supervisorId === state.currentUserId;
  // Closed jobs imported as JMS only (e.g. August) have no DPR entries; they live on the JMS tab
  const hasEntries = (j: Job) => work.dprs.some((d) => d.jobId === j.id);

  const jobs = work.jobs
    .filter((j) => s.lineIds.has(j.planLineId) && mine(j))
    .filter((j) => (filter === "closed" ? j.status === "closed" && hasEntries(j) : j.status === filter))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const count = (f: Filter) => work.jobs.filter((j) => s.lineIds.has(j.planLineId) && mine(j) && j.status === f && (f !== "closed" || hasEntries(j))).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        {(
          [
            ["open", "Open"],
            ["awaiting_sic", "Waiting for SIC"],
            ["closed", "Closed → JMS"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]",
              filter === id ? "bg-[var(--sge-night)] text-white" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
            )}
          >
            {label} ({count(id)})
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--sge-ink-3)]">
          {s.allSites ? "Each site has its own plan month" : <>Current plan month: <b>{monthLabel(s.monthOf(s.currentSiteId))}</b></>} · as of {today()}
        </span>
      </div>
      <Msg text={msg} />

      {jobs.length === 0 ? (
        <EmptyState title="No jobs here" detail="Start a job against a plan line below, then add DPR entries stage by stage." />
      ) : null}

      {jobs.map((job) => {
        const line = s.line(job.planLineId)!;
        const it = s.item(line.serviceCode);
        const areas = jobStageAreas(job, work.dprs);
        const fin = finalStage(job);
        const close = canCloseJob(job, work.dprs);
        const entries = work.dprs.filter((d) => d.jobId === job.id).sort((a, b) => a.date.localeCompare(b.date));
        const jms = work.jms.find((x) => x.id === job.jmsId);
        const diffs = entryDiffs(entries);
        const counted = new Set(effectiveEntries(entries).map((e) => e.id));
        const reportOfEntry = (id?: string) => work.reports.find((r) => r.id === id);
        const pending = pendingReports(job, work);
        const toReview = pending.filter((r) => r.status === "submitted");
        return (
          <Panel key={job.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base font-bold tracking-wide">{job.jobNo}</span>
                  <StatusPill tone={job.status === "open" ? "accent" : job.status === "awaiting_sic" ? "warn" : "ok"}>
                    {job.status === "open" ? "Open" : job.status === "awaiting_sic" ? "Ended — waiting for SIC" : jms?.adminStatus === "pending_admin" ? `JMS ${jms.jmsNo} · with Admin` : `JMS ${jms?.rilJmsNo ?? jms?.jmsNo ?? ""}`}
                  </StatusPill>
                  {job.planStatus ? (
                    <StatusPill tone={job.planStatus === "approved" ? "ok" : job.planStatus === "pending" ? "warn" : "crit"}>
                      {job.planStatus === "approved" ? "Plan approved" : job.planStatus === "pending" ? "Plan waiting for SIC" : "Plan sent back"}
                    </StatusPill>
                  ) : null}
                  {line.month !== s.monthOf(line.siteId) ? <StatusPill>{monthLabel(line.month)}</StatusPill> : null}
                </div>
                <div className="mt-0.5 text-sm">{lineLabel(line, it)}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  {job.location} · {s.staffName(job.supervisorId)} · started {job.startDate}
                  {job.endDate ? ` · ended ${job.endDate}` : ""}
                  {s.allSites ? ` · ${s.siteCode(line.siteId)}` : ""}
                </div>
                {job.plannedM2 ? <PlanProgress job={job} /> : null}
                {job.planStatus === "sent_back" && job.planNote ? (
                  <p className="mt-1 rounded-sm bg-[var(--sge-crit-wash)] px-2 py-1 text-[11px] text-[var(--sge-crit)]">
                    <b>Plan sent back by {job.planDecidedBy}:</b> {job.planNote}
                  </p>
                ) : null}
                <Trail jobId={job.id} jmsId={job.jmsId} />
                {job.status === "open" && job.sentBack ? (
                  <p className="mt-1 rounded-sm bg-[var(--sge-crit-wash)] px-2 py-1 text-[11px] text-[var(--sge-crit)]">
                    <b>Sent back by {job.sentBack.by}:</b> {job.sentBack.reason}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {job.status === "open" && s.canEnter ? (
                  <Button size="sm" variant="outline" onClick={() => setDprFor(dprFor === job.id ? null : job.id)}>
                    {dprFor === job.id ? "Cancel DPR" : "Add DPR entry"}
                  </Button>
                ) : null}
                {job.status === "open" && s.canEnter ? (
                  <span className="flex items-center gap-1.5">
                    {/* docs §24: ending the job at final shade gives the end date; the JMS covers start → end */}
                    <Input
                      type="date"
                      aria-label={`End date for ${job.jobNo}`}
                      className="h-8 w-[150px]"
                      max={today()}
                      min={job.startDate}
                      value={endDates[job.id] ?? today()}
                      onChange={(e) => setEndDates({ ...endDates, [job.id]: e.target.value })}
                    />
                    <Button
                      size="sm"
                      disabled={!close.ok}
                      title={close.ok ? "Final shade done — send to SIC to confirm as a JMS" : `Missing: ${close.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}`}
                      onClick={() => {
                        const r = requestClose(job.id, endDates[job.id] ?? today());
                        setMsg(r.ok ? { ok: true, msg: `${job.jobNo} ended — waiting for SIC to confirm.` } : { ok: false, msg: r.error });
                      }}
                    >
                      End job
                    </Button>
                  </span>
                ) : null}
                {job.planStatus === "pending" && s.canConfirm ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Input aria-label={`Plan send-back reason for ${job.jobNo}`} className="h-8 w-48" placeholder="Reason (to send back)" value={planBack[job.id] ?? ""} onChange={(e) => setPlanBack({ ...planBack, [job.id]: e.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => { const r = decideJobPlan(job.id, false, planBack[job.id] ?? ""); setMsg(r.ok ? { ok: true, msg: `${job.jobNo} plan sent back.` } : { ok: false, msg: r.error }); }}>
                      Send plan back
                    </Button>
                    <Button size="sm" onClick={() => { const r = decideJobPlan(job.id, true, ""); setMsg(r.ok ? { ok: true, msg: `${job.jobNo} plan approved.` } : { ok: false, msg: r.error }); }}>
                      Approve plan
                    </Button>
                  </span>
                ) : null}
                {job.status === "awaiting_sic" && s.canConfirm ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setSendBack(sendBack?.jobId === job.id ? null : { jobId: job.id, reason: "" })}>
                      {sendBack?.jobId === job.id ? "Cancel" : "Send back"}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const r = confirmJms(job.id);
                        setMsg(
                          r.ok
                            ? { ok: true, msg: `${job.jobNo} confirmed — JMS created for ${fmtM2(areas[fin])} m².${it?.ratePending ? " The rate is a placeholder until the ARC list arrives." : ""}` }
                            : { ok: false, msg: r.error }
                        );
                      }}
                    >
                      Confirm → JMS
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {job.status !== "closed" && pending.length ? (
              <div className="mt-3 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] p-2.5 text-xs">
                <div className="mb-1 font-semibold text-[var(--sge-warn)]">
                  {pending.some(reportOpen) ? "DPRs still with the supervisor" : "DPRs waiting for SIC review"} — the JMS can be confirmed once every DPR is approved
                </div>
                {pending.map((r) => {
                  const lines = work.dprs.filter((d) => d.reportId === r.id);
                  const worked = r.labourMarks.filter((m) => m.status === "present" || m.status === "half" || m.status === "overtime").length;
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 font-mono">
                      <Link className="text-[var(--sge-brass-ink)] underline" href={`/dpr/${r.id}`}>{r.date} · {r.plant}</Link>
                      <span>{r.status === "submitted" ? "submitted" : r.status === "sic_rejected" ? "sent back" : "draft"}</span>
                      <span>· crew {worked}/{r.labourMarks.length}</span>
                      <span>· {fmtM2(lines.reduce((t, e) => t + entryArea(e), 0))} m²</span>
                      <span>· {lines.reduce((t, e) => t + e.litres, 0)} L</span>
                    </div>
                  );
                })}
                {s.canConfirm && toReview.length && !pending.some(reportOpen) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => {
                      const bad = toReview.map((r) => reviewReport(r.id, "sic_approved", "")).find((x) => !x.ok);
                      setMsg(bad && !bad.ok ? { ok: false, msg: bad.error } : { ok: true, msg: `${toReview.length} DPR(s) approved — each one is logged. Now confirm the JMS.` });
                    }}
                  >
                    Approve all {toReview.length} listed
                  </Button>
                ) : null}
              </div>
            ) : null}

            {sendBack?.jobId === job.id ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-2 rounded-sm border border-[var(--sge-crit)]/40 bg-[var(--sge-crit-wash)]/50 p-2.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const r = rejectClose(job.id, sendBack.reason);
                  setMsg(r.ok ? { ok: true, msg: `${job.jobNo} sent back to the supervisor with your reason.` } : { ok: false, msg: r.error });
                  if (r.ok) setSendBack(null);
                }}
              >
                <div className="min-w-[240px] flex-1">
                  <Label>Why is it going back? (the supervisor sees this)</Label>
                  <Input className="mt-1" value={sendBack.reason} onChange={(e) => setSendBack({ jobId: job.id, reason: e.target.value })} placeholder="e.g. final coat DFT below 100 µm at TT3 north side" />
                </div>
                <Button type="submit" size="sm" variant="outline">Send back to supervisor</Button>
              </form>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <StageChips stages={job.stages} areas={areas} final={fin} />
              <button type="button" className="text-xs text-[var(--sge-brass-ink)] underline" onClick={() => setShowEntries(showEntries === job.id ? null : job.id)}>
                {entries.length} DPR entr{entries.length === 1 ? "y" : "ies"}
              </button>
            </div>
            {job.status === "open" && !close.ok && entries.length > 0 ? (
              <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
                To close: enter {close.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}. JMS qty = {STAGES.find((x) => x.id === fin)?.label} m².
              </p>
            ) : null}
            {diffs.length ? (
              <div className="mt-2 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-2.5 py-1.5 text-[11px] text-[var(--sge-ink-2)]">
                <b className="text-[var(--sge-warn)]">Admin and supervisor figures differ</b> — Admin&apos;s figure is used (docs §5b).
                {diffs.map((d) => (
                  <div key={d.date + d.stage} className="font-mono">
                    {d.date} · {STAGES.find((x) => x.id === d.stage)?.label}: supervisor {fmtM2(d.supervisorArea)} m² / {d.supervisorLitres} L · Admin {fmtM2(d.adminArea)} m² / {d.adminLitres} L
                  </div>
                ))}
              </div>
            ) : null}

            {showEntries === job.id ? (
              <div className="mt-3 overflow-x-auto rounded-sm border border-[var(--sge-line)]">
                <table className="w-full min-w-[620px] text-xs">
                  <thead className="bg-[var(--sge-paper-2)]">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Date</th>
                      <th className="px-2 py-1.5 text-left">Stage</th>
                      <th className="px-2 py-1.5 text-left">Members</th>
                      <th className="px-2 py-1.5 text-right">m²</th>
                      <th className="px-2 py-1.5 text-right">Litres</th>
                      <th className="px-2 py-1.5 text-right">DFT</th>
                      <th className="px-2 py-1.5 text-right">Crew</th>
                      <th className="px-2 py-1.5 text-left">Entered by</th>
                      <th className="px-2 py-1.5 text-left">DPR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-t border-[var(--sge-line)]">
                        <td className="px-2 py-1.5">{e.date}</td>
                        <td className="px-2 py-1.5">{STAGES.find((x) => x.id === e.stage)?.label}</td>
                        <td className="px-2 py-1.5">{e.members.length} ({e.members[0]?.name}{e.members.length > 1 ? "…" : ""})</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtM2(entryArea(e))}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{e.litres || "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{e.dft ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{e.crew?.length ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          {e.enteredBy === "admin" ? "Admin (data operator)" : e.enteredBy === "supervisor" ? "Supervisor" : e.enteredBy.replace("_", " ")}
                          {e.enteredByName ? <span className="text-[var(--sge-ink-3)]"> · {e.enteredByName}</span> : null}
                          {counted.has(e.id) ? null : <span className="ml-1 text-[var(--sge-ink-3)]">· not counted (Admin&apos;s figure used)</span>}
                        </td>
                        <td className="px-2 py-1.5">
                          {reportOfEntry(e.reportId) ? (
                            <Link className="text-[var(--sge-brass-ink)] underline" href={`/dpr/${e.reportId}`}>
                              {reportOfEntry(e.reportId)!.status.replace("sic_", "").replace("rejected", "sent back")}
                            </Link>
                          ) : (
                            <span className="text-[var(--sge-ink-3)]">history</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {dprFor === job.id ? <JobEntryForm job={job} onDone={(m) => { setMsg(m); if (m.ok) setDprFor(null); }} /> : null}
          </Panel>
        );
      })}

      {s.canEnter ? <StartJob onDone={setMsg} /> : null}
    </div>
  );
}

const blankMember = (): Member => ({ name: "", nos: 1, side: 1, length: 0, cf: 0 });

/**
 * One job line (members, paint, crew) — used on the Work job card and inside
 * the DPR desk form. The line goes on the day's open report, or on `reportId`.
 */
export function JobEntryForm({ job, onDone, reportId, fixedDate }: { job: Job; onDone: (m: { ok: boolean; msg: string }) => void; reportId?: string; fixedDate?: string }) {
  const { state: appState } = useStore();
  const { addDpr } = useWork();
  const s = useWorkScope();
  const line = s.line(job.planLineId)!;
  const it = s.item(line.serviceCode);
  const fin = finalStage(job);
  const [pickedDate, setDate] = useState(today());
  const date = fixedDate ?? pickedDate;
  const done = jobStageAreas(job, s.work.dprs);
  const [stage, setStage] = useState<Stage>(job.stages.find((x) => done[x] <= 0) ?? job.stages[0]);
  const [members, setMembers] = useState<Member[]>([blankMember()]);
  const [paintSap, setPaintSap] = useState(it?.paints[0]?.sap ?? "");
  const [litres, setLitres] = useState("");
  const [dft, setDft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Crew: the supervisor's active labourers; ticked ones carry this day's labour cost (docs §18)
  const roster = appState.labourers.filter((l) => l.active && l.supervisorId === job.supervisorId);
  const lastCrew = [...s.work.dprs].reverse().find((d) => d.jobId === job.id && d.crew?.length)?.crew ?? [];
  const [crew, setCrew] = useState<string[]>(lastCrew.filter((id) => roster.some((l) => l.id === id)));
  // Total of the rows that will actually be saved (blank rows ignored) — same rule as the store
  const area = round3(validMembers(members).members.reduce((t, m) => t + m.nos * m.side * m.length * m.cf, 0));
  const canBackdate = s.role === "owner" || s.role === "super_admin";
  const norm = it?.paints.find((p) => p.sap === paintSap)?.normL ?? 0;
  const expected = round3(area * norm);
  const lit = Number(litres) || 0;
  const off = expected > 0 && lit > 0 ? lit / expected - 1 : 0;
  const set = (i: number, k: keyof Member, v: string) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: k === "name" ? v : Number(v) } : m)));

  return (
    <form
      className="mt-4 space-y-3 rounded-sm border border-[var(--sge-brass)]/40 bg-[var(--sge-brass-wash)]/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const rows = validMembers(members);
        if (rows.error) return setErr(rows.error);
        if (stage === fin && it?.paints.length && !(Number(dft) > 0)) return setErr("Actual DFT is required at final shade");
        const r = addDpr({ date, jobId: job.id, reportId, stage, members, paintSap: lit > 0 ? paintSap : undefined, litres: lit, dft: Number(dft) || undefined, enteredBy: s.enteredBy, crew });
        if (!r.ok) return setErr(r.error);
        onDone({ ok: true, msg: `Saved: ${fmtM2(area)} m² ${STAGES.find((x) => x.id === stage)?.label} on ${job.jobNo}.${reportId ? "" : " It's on today's DPR — submit it to SIC from the DPR desk."}` });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            className="mt-1"
            // Today or yesterday (docs §4); Owner / Super Admin may back-date to the job start
            min={canBackdate ? job.startDate : [daysAgo(1), job.startDate].sort().pop()}
            max={today()}
            value={date}
            disabled={!!fixedDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label>Stage</Label>
          <select className={selectCls + " mt-1"} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.filter((x) => job.stages.includes(x.id)).map((x) => (
              <option key={x.id} value={x.id}>{x.label}{x.id === fin ? " (final → JMS qty)" : ""}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end text-xs text-[var(--sge-ink-2)]">
          Entered as: <b className="ml-1">{s.enteredBy === "admin" ? "Admin (data operator)" : s.enteredBy === "supervisor" ? "Supervisor" : s.enteredBy.replace("_", " ")}</b>
        </div>
      </div>

      <div>
        <Label>Measurements — NOS × SIDE × LENGTH (m) × CF (m) = area</Label>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
                <th className="py-1 pr-1">Member / description</th>
                <th className="w-16 py-1 pr-1">NOS</th>
                <th className="w-16 py-1 pr-1">Side</th>
                <th className="w-20 py-1 pr-1">Length</th>
                <th className="w-20 py-1 pr-1">CF</th>
                <th className="w-20 py-1 pr-1 text-right">Area m²</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-1"><Input className="h-8" value={m.name} placeholder="e.g. ISMB 350 X 140" onChange={(e) => set(i, "name", e.target.value)} /></td>
                  {(["nos", "side", "length", "cf"] as const).map((k) => (
                    <td key={k} className="py-0.5 pr-1"><Input className="h-8" type="number" min="0" step="any" value={m[k] || ""} onChange={(e) => set(i, k, e.target.value)} /></td>
                  ))}
                  <td className="py-0.5 pr-1 text-right font-mono">{fmtM2(memberArea(m))}</td>
                  <td>
                    {members.length > 1 ? (
                      <button type="button" aria-label="Remove row" onClick={() => setMembers((ms) => ms.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5 text-[var(--sge-ink-3)]" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMembers((ms) => [...ms, blankMember()])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add member
          </Button>
          <span className="text-sm">Total <b className="tabular-nums">{fmtM2(area)} m²</b></span>
        </div>
      </div>

      <div>
        <Label>Crew on this job today ({crew.length} of {roster.length})</Label>
        <div className="mt-1 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {roster.map((l) => {
            const on = crew.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setCrew((c) => (on ? c.filter((x) => x !== l.id) : [...c, l.id]))}
                className={cn(
                  "rounded-sm border px-2 py-1 text-[11px]",
                  on ? "border-[var(--sge-night)] bg-[var(--sge-night)] text-white" : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)]"
                )}
              >
                {l.name}
              </button>
            );
          })}
          {roster.length === 0 ? <span className="text-xs text-[var(--sge-ink-3)]">No labourers under this supervisor.</span> : null}
        </div>
      </div>

      {it?.paintsPending ? (
        <p className="rounded-sm bg-[var(--sge-warn-wash)] px-2.5 py-1.5 text-[11px] text-[var(--sge-warn)]">
          The paint list and norms for {it.mps} haven&apos;t been received yet — litres go against a placeholder until the Owner adds them.
        </p>
      ) : null}
      {it?.paints.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Paint used</Label>
            <select className={selectCls + " mt-1"} value={paintSap} onChange={(e) => setPaintSap(e.target.value)}>
              {it.paints.map((p) => <option key={p.sap} value={p.sap}>{p.name} · {p.sap} · norm {p.normL} L/m²</option>)}
            </select>
          </div>
          <div>
            <Label>Litres used</Label>
            <Input type="number" min="0" step="any" className="mt-1" value={litres} onChange={(e) => setLitres(e.target.value)} />
            <p className={cn("mt-1 text-[11px]", Math.abs(off) > 0.2 ? "text-[var(--sge-crit)]" : "text-[var(--sge-ink-3)]")}>
              Norm for {fmtM2(area)} m²: {fmtM2(expected)} L{lit > 0 && expected > 0 ? ` · ${off >= 0 ? "+" : ""}${(off * 100).toFixed(0)}% vs norm` : ""}
            </p>
          </div>
          {stage === fin ? (
            <div>
              <Label>Actual DFT (µm)</Label>
              <Input type="number" min="0" className="mt-1" value={dft} onChange={(e) => setDft(e.target.value)} />
            </div>
          ) : null}
        </div>
      ) : null}

      {err ? <p className="text-xs text-[var(--sge-crit)]">{err}</p> : null}
      <Button type="submit">Save DPR entry</Button>
    </form>
  );
}

function StartJob({ onDone }: { onDone: (m: { ok: boolean; msg: string }) => void }) {
  const { state } = useStore();
  const { startJob } = useWork();
  const s = useWorkScope();
  const lines = s.work.planLines.filter(
    (l) => l.month === s.monthOf(l.siteId) && s.lineIds.has(l.id) && (s.role !== "supervisor" || l.supervisorId === state.currentUserId)
  );
  const [picked, setLineId] = useState(lines[0]?.id ?? "");
  // The pick only counts while it is still in the list (e.g. after a site switch)
  const lineId = lines.some((l) => l.id === picked) ? picked : lines[0]?.id ?? "";
  const line = s.line(lineId);
  const it = line ? s.item(line.serviceCode) : undefined;
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(today());
  const [plannedM2, setPlannedM2] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [stages, setStages] = useState<Stage[] | null>(null);
  const chosen = stages ?? it?.defaultStages ?? ["prep", "coat1", "coat2", "final"];

  return (
    <Panel>
      <h3 className="mb-1 font-heading text-sm font-bold">Plan &amp; start a job</h3>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">Your plan goes to the SIC for approval; your daily DPRs are measured against it.</p>
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--sge-ink-3)]">No plan lines this month for you. Add one on the Plan vs actual tab.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            // docs §24: the plan (m² and end date) is what the SIC approves and progress is measured against
            if (!(Number(plannedM2) > 0) || !plannedEnd) return onDone({ ok: false, msg: "Give the planned m² and the planned end date" });
            const r = startJob({ planLineId: lineId, location, stages: chosen, startDate, plannedM2: Number(plannedM2), plannedEnd });
            onDone(r.ok ? { ok: true, msg: "Job plan sent to the SIC — add DPR entries as work progresses." } : { ok: false, msg: r.error });
            if (r.ok) { setLocation(""); setStages(null); setPlannedM2(""); setPlannedEnd(""); }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Plan line</Label>
              <select className={selectCls + " mt-1"} value={lineId} onChange={(e) => { setLineId(e.target.value); setStages(null); }}>
                {lines.map((l) => <option key={l.id} value={l.id}>{lineLabel(l, s.item(l.serviceCode))}</option>)}
              </select>
            </div>
            <div>
              <Label>Start date</Label>
              <Input type="date" className="mt-1" max={today()} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Location / area</Label>
              <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. TT4 NORTH SIDE SR NO. 269–276" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="plan-m2">Planned m² (final shade)</Label>
                <Input id="plan-m2" type="number" min={0} className="mt-1" value={plannedM2} onChange={(e) => setPlannedM2(e.target.value)} placeholder="e.g. 450" />
              </div>
              <div>
                <Label htmlFor="plan-end">Planned end date</Label>
                <Input id="plan-end" type="date" className="mt-1" min={startDate} value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <div>
            <Label>Stages this job needs (the last one is the final shade → JMS qty)</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {STAGES.map((x) => (
                <label key={x.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(x.id)}
                    onChange={(e) => setStages(e.target.checked ? STAGES.map((y) => y.id).filter((y) => y === x.id || chosen.includes(y)) : chosen.filter((y) => y !== x.id))}
                  />
                  {x.label}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit">Submit plan &amp; start job</Button>
        </form>
      )}
    </Panel>
  );
}

/** Planned vs done (final-shade m²) and days used vs planned (docs §24) */
function PlanProgress({ job }: { job: Job }) {
  const { work } = useWork();
  const p = jobProgress(job, work.dprs, today());
  const behind = p.pct != null && p.timePct != null && p.timePct > p.pct + 10;
  return (
    <div className="mt-1.5 max-w-md">
      <div className="flex justify-between text-[11px] text-[var(--sge-ink-2)]">
        <span>
          {fmtM2(p.done)} of {fmtM2(job.plannedM2 ?? 0)} m² · {p.pct ?? 0}%
        </span>
        <span className={behind ? "font-semibold text-[var(--sge-crit)]" : ""}>
          day {p.usedDays} of {p.planDays} (by {job.plannedEnd}){behind ? " · behind plan" : ""}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[var(--sge-paper-2)]">
        <div className={cn("h-full", behind ? "bg-[var(--sge-crit)]" : "bg-[var(--sge-ok)]")} style={{ width: `${Math.min(100, p.pct ?? 0)}%` }} />
      </div>
    </div>
  );
}

/** Approval trail for a job: closed by whom / when, confirmed or sent back by whom (docs §19). */
function Trail({ jobId, jmsId }: { jobId: string; jmsId?: string }) {
  const { work } = useWork();
  const steps = work.events.filter(
    (e) => (e.refId === jobId || (jmsId && e.refId === jmsId)) && (e.kind === "job_closed" || e.kind === "jms_confirmed" || e.kind === "job_sent_back")
  );
  if (steps.length === 0) return null;
  const verb = { job_closed: "Closed", jms_confirmed: "Confirmed", job_sent_back: "Sent back" } as const;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {steps.map((e) => (
        <span key={e.id} className={e.kind === "job_sent_back" ? "text-[var(--sge-crit)]" : "text-[var(--sge-ink-2)]"}>
          {verb[e.kind as keyof typeof verb]} by <b>{e.actorName}</b> ({e.actorRole?.replace("_", " ")}) · {e.day}
        </span>
      ))}
    </div>
  );
}
