"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { canCloseJob, entryArea, finalStage, jobStageAreas, memberArea, monthLabel, round3 } from "@/lib/work/logic";
import { WORK_TODAY } from "@/lib/work/seed";
import { useWork } from "@/lib/work/store";
import type { Job, Member, Stage } from "@/lib/work/types";
import { STAGES } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, lineLabel, Msg, selectCls, StageChips, useWorkScope } from "./common";

type Filter = "open" | "awaiting_sic" | "closed";

export function WorkJobs() {
  const { state } = useStore();
  const { requestClose, confirmJms, rejectClose } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const [filter, setFilter] = useState<Filter>("open");
  const [dprFor, setDprFor] = useState<string | null>(null);
  const [showEntries, setShowEntries] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
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
          Current plan month: <b>{monthLabel(work.currentMonth)}</b> · as of {WORK_TODAY}
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
        return (
          <Panel key={job.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-base font-bold tracking-wide">{job.jobNo}</span>
                  <StatusPill tone={job.status === "open" ? "accent" : job.status === "awaiting_sic" ? "warn" : "ok"}>
                    {job.status === "open" ? "Open" : job.status === "awaiting_sic" ? "Waiting for SIC" : `JMS ${jms?.jmsNo ?? ""}`}
                  </StatusPill>
                  {line.month !== work.currentMonth ? <StatusPill>{monthLabel(line.month)}</StatusPill> : null}
                </div>
                <div className="mt-0.5 text-sm">{lineLabel(line, it)}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  {job.location} · {s.staffName(job.supervisorId)} · started {job.startDate}
                  {s.allSites ? ` · ${s.siteCode(line.siteId)}` : ""}
                </div>
                <Trail jobId={job.id} jmsId={job.jmsId} />
              </div>
              <div className="flex flex-wrap gap-2">
                {job.status === "open" && s.canEnter ? (
                  <Button size="sm" variant="outline" onClick={() => setDprFor(dprFor === job.id ? null : job.id)}>
                    {dprFor === job.id ? "Cancel DPR" : "Add DPR entry"}
                  </Button>
                ) : null}
                {job.status === "open" && s.canEnter ? (
                  <Button
                    size="sm"
                    disabled={!close.ok}
                    title={close.ok ? "Send to SIC to confirm as a JMS" : `Missing: ${close.missing.map((m) => STAGES.find((x) => x.id === m)?.label).join(", ")}`}
                    onClick={() => {
                      const r = requestClose(job.id);
                      setMsg(r.ok ? { ok: true, msg: `${job.jobNo} closed — waiting for SIC to confirm.` } : { ok: false, msg: r.error });
                    }}
                  >
                    Close job
                  </Button>
                ) : null}
                {job.status === "awaiting_sic" && s.canConfirm ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => { rejectClose(job.id); setMsg({ ok: true, msg: `${job.jobNo} sent back to the supervisor.` }); }}>
                      Send back
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        const r = confirmJms(job.id);
                        setMsg(r.ok ? { ok: true, msg: `${job.jobNo} confirmed — JMS created for ${fmtM2(areas[fin])} m².` } : { ok: false, msg: r.error });
                      }}
                    >
                      Confirm → JMS
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

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
                        <td className="px-2 py-1.5">{e.enteredBy === "admin" ? "Admin (data operator)" : "Supervisor"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {dprFor === job.id ? <DprForm job={job} onDone={(m) => { setMsg(m); if (m.ok) setDprFor(null); }} /> : null}
          </Panel>
        );
      })}

      {s.canEnter ? <StartJob onDone={setMsg} /> : null}
    </div>
  );
}

const blankMember = (): Member => ({ name: "", nos: 1, side: 1, length: 0, cf: 0 });

function DprForm({ job, onDone }: { job: Job; onDone: (m: { ok: boolean; msg: string }) => void }) {
  const { state: appState } = useStore();
  const { addDpr } = useWork();
  const s = useWorkScope();
  const line = s.line(job.planLineId)!;
  const it = s.item(line.serviceCode);
  const fin = finalStage(job);
  const [date, setDate] = useState(WORK_TODAY);
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
  const area = round3(members.reduce((t, m) => t + memberArea(m), 0));
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
        if (stage === fin && it?.paints.length && !(Number(dft) > 0)) return setErr("Actual DFT is required at final shade");
        const r = addDpr({ date, jobId: job.id, stage, members, paintSap: lit > 0 ? paintSap : undefined, litres: lit, dft: Number(dft) || undefined, enteredBy: s.enteredBy, crew });
        if (!r.ok) return setErr(r.error);
        onDone({ ok: true, msg: `DPR entry saved: ${fmtM2(area)} m² ${STAGES.find((x) => x.id === stage)?.label} on ${job.jobNo}.` });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Date</Label>
          <Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
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
          Entered as: <b className="ml-1">{s.enteredBy === "admin" ? "Admin (data operator)" : "Supervisor"}</b>
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
    (l) => l.month === s.work.currentMonth && s.lineIds.has(l.id) && (s.role !== "supervisor" || l.supervisorId === state.currentUserId)
  );
  const [lineId, setLineId] = useState(lines[0]?.id ?? "");
  const line = s.line(lineId);
  const it = line ? s.item(line.serviceCode) : undefined;
  const [location, setLocation] = useState("");
  const [stages, setStages] = useState<Stage[] | null>(null);
  const chosen = stages ?? it?.defaultStages ?? ["prep", "coat1", "coat2", "final"];

  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold">Start a job</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--sge-ink-3)]">No plan lines this month for you. Add one on the Plan vs actual tab.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const r = startJob({ planLineId: lineId, location, stages: chosen, startDate: WORK_TODAY });
            onDone(r.ok ? { ok: true, msg: "Job started — add DPR entries as work progresses." } : { ok: false, msg: r.error });
            if (r.ok) { setLocation(""); setStages(null); }
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
              <Label>Location / area</Label>
              <Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. TT4 NORTH SIDE SR NO. 269–276" />
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
          <Button type="submit">Start job</Button>
        </form>
      )}
    </Panel>
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
