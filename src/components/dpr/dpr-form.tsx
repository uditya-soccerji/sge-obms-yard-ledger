"use client";

import { useMemo, useState } from "react";
import { today as todayDate } from "@/lib/today";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_REASONS } from "@/lib/requests";
import { SafetyDprForm } from "@/components/dpr/safety-dpr-form";
import type {
  AttendanceStatus,
  DprRequest,
  DprScaffoldWorkLine,
} from "@/lib/types";
import type { DprReport } from "@/lib/work/types";
import { blankReport, reportOpen } from "@/lib/work/reports";
import { useWork } from "@/lib/work/store";
import { entryArea, round3 } from "@/lib/work/logic";
import { STAGES } from "@/lib/work/types";
import { JobEntryForm } from "@/components/work/work-jobs";
import { useStore } from "@/lib/store";
import { ATTENDANCE_OPTIONS, otHours, timeProblem, WORKING } from "@/lib/attendance";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** A new daily report (kept under the old name for the DPR desk pages). */
export const blankDpr = blankReport;

export function DprForm({
  value,
  onChange,
  readOnly,
}: {
  value: DprReport;
  onChange: (next: DprReport) => void;
  readOnly?: boolean;
}) {
  const { state } = useStore();
  const crew = useMemo(
    () =>
      state.labourers.filter(
        (l) =>
          l.active &&
          (value.submitterType === "safety" ||
            value.submitterType === "store" ||
            l.supervisorId === value.submitterId)
      ),
    [state.labourers, value.submitterId, value.submitterType]
  );

  const equipment = state.equipment.filter((e) => e.siteId === value.siteId);
  // The DPR's site plants (docs §3: every DPR picks one of its site's plants)
  const plants = state.sites.find((x) => x.id === value.siteId)?.plants ?? [];
  const supervisors = state.staff.filter((x) => x.role === "supervisor" && x.siteId === value.siteId);

  function setMark(labourerId: string, status: AttendanceStatus) {
    const existing = value.labourMarks.find((m) => m.labourerId === labourerId);
    const labourMarks = existing
      ? value.labourMarks.map((m) =>
          m.labourerId === labourerId
            ? {
                ...m,
                status,
                inTime: WORKING.includes(status) ? m.inTime ?? "08:00" : undefined,
                outTime: WORKING.includes(status) ? m.outTime ?? (status === "half" ? "13:00" : "18:00") : undefined,
              }
            : m
        )
      : [
          ...value.labourMarks,
          {
            labourerId,
            status,
            inTime: WORKING.includes(status) ? "08:00" : undefined,
            outTime: WORKING.includes(status) ? (status === "half" ? "13:00" : "18:00") : undefined,
          },
        ];
    onChange({ ...value, labourMarks });
  }

  function setTime(labourerId: string, key: "inTime" | "outTime", v: string) {
    onChange({
      ...value,
      labourMarks: value.labourMarks.map((m) => (m.labourerId === labourerId ? { ...m, [key]: v || undefined } : m)),
    });
  }

  function toggleEquipment(equipmentId: string) {
    const exists = value.equipmentMarks.find(
      (e) => e.equipmentId === equipmentId
    );
    if (exists) {
      onChange({
        ...value,
        equipmentMarks: value.equipmentMarks.filter(
          (e) => e.equipmentId !== equipmentId
        ),
      });
      return;
    }
    const eq = equipment.find((e) => e.id === equipmentId);
    onChange({
      ...value,
      equipmentMarks: [
        ...value.equipmentMarks,
        {
          equipmentId,
          status: eq?.status ?? "ok",
          expiryDate: eq?.expiryDate,
        },
      ],
    });
  }

  function addRequest() {
    const req: DprRequest = {
      id: uid("req"),
      kind: "spare",
      description: "",
      qty: 1,
    };
    onChange({ ...value, requests: [...value.requests, req] });
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Header
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              className="mt-1"
              disabled={readOnly}
              value={value.date}
              onChange={(e) => onChange({ ...value, date: e.target.value })}
            />
          </div>
          <div>
            <Label>Plant</Label>
            <select
                className="mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                disabled={readOnly}
                value={value.plant}
                onChange={(e) => onChange({ ...value, plant: e.target.value })}
              >
                <option value="">Pick plant…</option>
                {plants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
          </div>
          <div>
            <Label>Type</Label>
            <div className="mt-2">
              <StatusPill>{value.submitterType.replace("_", " / ")}</StatusPill>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Label>Note</Label>
          <Textarea
            className="mt-1"
            disabled={readOnly}
            value={value.note}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
            rows={2}
          />
        </div>
        <div className="mt-3">
          {/* docs §24: problems on site go to the SIC as an alert when the DPR is submitted */}
          <Label htmlFor="dpr-issues">Issues on site (the SIC is alerted)</Label>
          <Textarea
            id="dpr-issues"
            className="mt-1"
            disabled={readOnly}
            placeholder="e.g. compressor down 2 hrs, permit delayed, short of thinner — leave empty if none"
            value={value.issues ?? ""}
            onChange={(e) => onChange({ ...value, issues: e.target.value })}
            rows={2}
          />
        </div>
        <div className="mt-3">
          <Label>Next-day plan</Label>
          <Textarea
            className="mt-1"
            disabled={readOnly}
            value={value.nextDayPlan}
            onChange={(e) =>
              onChange({ ...value, nextDayPlan: e.target.value })
            }
            rows={2}
          />
        </div>
        {value.submitterType === "painting_blasting" || value.submitterType === "scaffolding" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={readOnly}
                checked={!!value.permitOk}
                onCheckedChange={(c) => onChange({ ...value, permitOk: !!c })}
              />
              Work permit seen and in force
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={readOnly}
                checked={!!value.tbtDone}
                onCheckedChange={(c) => onChange({ ...value, tbtDone: !!c })}
              />
              Toolbox talk (TBT) held
            </label>
            <div>
              <Label>Reason, if no quantity today</Label>
              <Input
                className="mt-1"
                disabled={readOnly}
                value={value.zeroReason ?? ""}
                placeholder="e.g. permit not issued, rain"
                onChange={(e) => onChange({ ...value, zeroReason: e.target.value })}
              />
            </div>
          </div>
        ) : null}
        {value.telegramDraftLines.length > 0 ? (
          <div className="mt-3 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
              Telegram draft lines
            </div>
            <ul className="space-y-1 text-xs text-[var(--sge-ink-2)]">
              {value.telegramDraftLines.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      {value.submitterType !== "store" &&
      value.submitterType !== "safety" ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Labour attendance
          </h3>
          {crew.length === 0 ? (
            // B03: a new supervisor has no crew yet; say so instead of an empty panel
            <p className="text-sm text-[var(--sge-ink-3)]">
              No labourers are on this supervisor&apos;s crew yet. The SIC assigns them in{" "}
              <a className="text-[var(--sge-brass-ink)] underline" href="/operations?p=crew">
                Operations → Crews
              </a>
              {" "}(or the supervisor requests them there, if allowed).
            </p>
          ) : null}
          <div className="space-y-2">
            {crew.map((l) => {
              const mark = value.labourMarks.find((m) => m.labourerId === l.id);
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-[var(--sge-ink-3)]">
                      {state.tradeCatalogue.find((t) => t.id === l.trade)?.label ?? l.trade} · {l.epNumber}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      disabled={readOnly}
                      value={mark?.status ?? ""}
                      onValueChange={(v) =>
                        setMark(l.id, v as AttendanceStatus)
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue placeholder="Mark" />
                      </SelectTrigger>
                      <SelectContent>
                        {ATTENDANCE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mark && WORKING.includes(mark.status) ? (
                      <>
                        <Input aria-label={`In-time ${l.name}`} type="time" disabled={readOnly} className="h-8 w-[104px] text-xs" value={mark.inTime ?? ""} onChange={(e) => setTime(l.id, "inTime", e.target.value)} />
                        <Input aria-label={`Out-time ${l.name}`} type="time" disabled={readOnly} className="h-8 w-[104px] text-xs" value={mark.outTime ?? ""} onChange={(e) => setTime(l.id, "outTime", e.target.value)} />
                        {timeProblem(mark.inTime, mark.outTime) ? (
                          <span className="text-[11px] text-[var(--sge-crit)]">{timeProblem(mark.inTime, mark.outTime)}</span>
                        ) : otHours(mark.inTime, mark.outTime) > 0 ? (
                          <span className="text-[11px] font-semibold text-[var(--sge-warn)]">OT {otHours(mark.inTime, mark.outTime)} h</span>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : null}

      {value.submitterType !== "safety" ? (
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Equipment &amp; material on crew
        </h3>
        <div className="space-y-2">
          {equipment.map((eq) => {
            const marked = value.equipmentMarks.find(
              (e) => e.equipmentId === eq.id
            );
            return (
              <label
                key={eq.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    disabled={readOnly}
                    checked={!!marked}
                    onCheckedChange={() => toggleEquipment(eq.id)}
                  />
                  <span>
                    {eq.tag} · {eq.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusPill
                    tone={
                      eq.status === "ok"
                        ? "ok"
                        : eq.status === "due"
                          ? "warn"
                          : "crit"
                    }
                  >
                    {eq.status}
                  </StatusPill>
                  {eq.expiryDate ? (
                    <span
                      className={
                        eq.expiryDate < todayDate()
                          ? "font-mono text-[var(--sge-crit)]"
                          : "font-mono text-[var(--sge-ink-3)]"
                      }
                    >
                      exp {eq.expiryDate}
                    </span>
                  ) : null}
                </div>
              </label>
            );
          })}
        </div>
      </Panel>
      ) : null}

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Requests to the store (spare / equipment / material)
          </h3>
          {!readOnly ? (
            <Button size="sm" variant="outline" type="button" onClick={addRequest}>
              Add request
            </Button>
          ) : null}
        </div>
        {value.requests.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No requests.</p>
        ) : (
          <div className="space-y-2">
            {value.requests.map((r, idx) => (
              <div
                key={r.id}
                className="grid gap-2 rounded-md border border-[var(--sge-line)] p-2 sm:grid-cols-6"
              >
                <Select
                  disabled={readOnly}
                  value={r.kind}
                  onValueChange={(v) => {
                    const requests = value.requests.map((x, i) =>
                      i === idx
                        ? { ...x, kind: v as DprRequest["kind"] }
                        : x
                    );
                    onChange({ ...value, requests });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["spare", "equipment", "material", "other"] as const).map(
                      (k) => (
                        <SelectItem key={k} value={k}>
                          {k}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <select
                  aria-label={`Reason for request ${idx + 1}`}
                  disabled={readOnly}
                  className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs"
                  value={r.reason ?? ""}
                  onChange={(e) => {
                    const reason = (e.target.value || undefined) as DprRequest["reason"];
                    const requests = value.requests.map((x, i) => (i === idx ? { ...x, reason, urgent: reason === "urgent" } : x));
                    onChange({ ...value, requests });
                  }}
                >
                  <option value="">Reason…</option>
                  {REQUEST_REASONS.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <Input
                  disabled={readOnly}
                  className="sm:col-span-2"
                  placeholder="Description"
                  value={r.description}
                  onChange={(e) => {
                    const requests = value.requests.map((x, i) =>
                      i === idx ? { ...x, description: e.target.value } : x
                    );
                    onChange({ ...value, requests });
                  }}
                />
                <Input
                  disabled={readOnly}
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={r.qty ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    const requests = value.requests.map((x, i) =>
                      i === idx ? { ...x, qty: e.target.value && n > 0 ? n : undefined } : x
                    );
                    onChange({ ...value, requests });
                  }}
                />
                {!readOnly ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, requests: value.requests.filter((_, i) => i !== idx) })}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {value.submitterType === "painting_blasting" ? <JobLines report={value} readOnly={readOnly} /> : null}

      {value.submitterType === "scaffolding" && value.scaffoldWork ? (
        <ScaffoldWorkEditor
          lines={value.scaffoldWork}
          plants={plants}
          readOnly={readOnly}
          onChange={(scaffoldWork) => onChange({ ...value, scaffoldWork })}
        />
      ) : null}

      {value.submitterType === "safety" && value.safetyBody ? (
        <SafetyDprForm
          body={value.safetyBody}
          readOnly={readOnly}
          onChange={(safetyBody) => onChange({ ...value, safetyBody })}
        />
      ) : null}

      {value.submitterType === "store" && value.storeBody ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Store body
          </h3>
          <div className="mb-3 space-y-2">
            <div className="text-xs font-semibold uppercase text-[var(--sge-ink-3)]">
              Stock by plant
            </div>
            {value.storeBody.stockByPlant.map((row, idx) => (
              <div key={idx} className="grid grid-cols-2 gap-2">
                <select
                className="mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                disabled={readOnly}
                value={row.plant}
                onChange={(e) => {
                    const stockByPlant = value.storeBody!.stockByPlant.map(
                      (r, i) =>
                        i === idx ? { ...r, plant: e.target.value } : r
                    );
                    onChange({
                      ...value,
                      storeBody: { ...value.storeBody!, stockByPlant },
                    });
                  }}
              >
                <option value="">Pick plant…</option>
                {plants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
                <Input
                  disabled={readOnly}
                  type="number"
                  value={row.paintLitres}
                  onChange={(e) => {
                    const stockByPlant = value.storeBody!.stockByPlant.map(
                      (r, i) =>
                        i === idx
                          ? { ...r, paintLitres: Number(e.target.value) }
                          : r
                    );
                    onChange({
                      ...value,
                      storeBody: { ...value.storeBody!, stockByPlant },
                    });
                  }}
                />
              </div>
            ))}
          </div>
          {!readOnly ? (
            <StoreLines
              supervisors={supervisors.map((x) => ({ id: x.id, name: x.name }))}
              onIssue={(issue) => onChange({ ...value, storeBody: { ...value.storeBody!, issues: [...value.storeBody!.issues, issue] } })}
              onReceipt={(receipt) => onChange({ ...value, storeBody: { ...value.storeBody!, receipts: [...value.storeBody!.receipts, receipt] } })}
              onAddStockRow={() => onChange({ ...value, storeBody: { ...value.storeBody!, stockByPlant: [...value.storeBody!.stockByPlant, { plant: "", paintLitres: 0 }] } })}
            />
          ) : null}
          <div className="space-y-1 text-sm text-[var(--sge-ink-2)]">
            <div>
              Issues: {value.storeBody.issues.length} · Receipts:{" "}
              {value.storeBody.receipts.length} · Spares moves:{" "}
              {value.storeBody.sparesMovement.length}
            </div>
            {value.storeBody.issues.map((iss, i) => (
              <div key={i} className="font-mono text-xs text-[var(--sge-ink-3)]">
                ISSUE {iss.qtyLitres}L {iss.sapCode} → {iss.toSupervisorId}
              </div>
            ))}
            {value.storeBody.receipts.map((rc, i) => (
              <div key={`rc-${i}`} className="font-mono text-xs text-[var(--sge-ink-3)]">
                RECEIPT {rc.qtyLitres}L {rc.sapCode}
              </div>
            ))}
            {value.storeBody.sparesMovement.map((sp, i) => (
              <div key={i} className="font-mono text-xs text-[var(--sge-ink-3)]">
                SPARE {sp.direction} {sp.qty}× {sp.item}
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/**
 * Painting & blasting quantities on a DPR are job lines (merge plan Step 4):
 * each picks an open job on this plant and a stage, with measured members,
 * paint and crew — the same line the Work job card adds. They move the job on.
 */
function JobLines({ report, readOnly }: { report: DprReport; readOnly?: boolean }) {
  const { work, removeEntry } = useWork();
  const [adding, setAdding] = useState<string>("");
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const saved = work.reports.some((r) => r.id === report.id);
  const lines = work.dprs.filter((d) => d.reportId === report.id);
  const jobs = work.jobs.filter((j) => {
    const line = work.planLines.find((l) => l.id === j.planLineId);
    return j.status === "open" && j.supervisorId === report.submitterId && line?.siteId === report.siteId && line.plant === report.plant;
  });
  const jobNo = (id: string) => work.jobs.find((j) => j.id === id)?.jobNo ?? id;
  const editable = !readOnly && saved && reportOpen(report);
  const job = jobs.find((j) => j.id === adding);
  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
        Painting / blasting — job lines
      </h3>
      {lines.length === 0 ? (
        <p className="text-sm text-[var(--sge-ink-3)]">No job lines yet.</p>
      ) : (
        <table className="mb-3 w-full text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
            <tr>
              <th className="py-1">Job</th>
              <th>Stage</th>
              <th className="text-right">m²</th>
              <th className="text-right">Litres</th>
              <th className="text-right">Crew</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((e) => (
              <tr key={e.id} className="border-t border-[var(--sge-line)]">
                <td className="py-1.5 font-mono">{jobNo(e.jobId)}</td>
                <td>{STAGES.find((x) => x.id === e.stage)?.label}</td>
                <td className="text-right font-mono">{round3(entryArea(e))}</td>
                <td className="text-right font-mono">{e.litres || "—"}</td>
                <td className="text-right font-mono">{e.crew?.length ?? 0}</td>
                <td className="text-right">
                  {editable ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => { const r = removeEntry(e.id); setMsg(r.ok ? null : { ok: false, msg: r.error }); }}>
                      Remove
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!saved && !readOnly ? (
        <p className="text-xs text-[var(--sge-ink-3)]">Pick the plant and save the draft, then add job lines here.</p>
      ) : null}
      {editable ? (
        jobs.length === 0 ? (
          <p className="text-xs text-[var(--sge-ink-3)]">No open jobs for this supervisor on {report.plant || "this plant"}. Start one in Work → Jobs &amp; DPR.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label>Add a line for job</Label>
                <select
                  className="mt-1 h-9 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                >
                  <option value="">Pick a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.jobNo} · {j.location}</option>
                  ))}
                </select>
              </div>
            </div>
            {job ? (
              <JobEntryForm
                job={job}
                reportId={report.id}
                fixedDate={report.date}
                onDone={(m) => {
                  setMsg(m);
                  if (m.ok) setAdding("");
                }}
              />
            ) : null}
          </div>
        )
      ) : null}
      {msg ? <p className={msg.ok ? "mt-2 text-xs text-[var(--sge-ok)]" : "mt-2 text-xs text-[var(--sge-crit)]"}>{msg.msg}</p> : null}
    </Panel>
  );
}

function ScaffoldWorkEditor({
  lines,
  plants,
  onChange,
  readOnly,
}: {
  lines: DprScaffoldWorkLine[];
  plants: string[];
  onChange: (lines: DprScaffoldWorkLine[]) => void;
  readOnly?: boolean;
}) {
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Scaffolding work
        </h3>
        {!readOnly ? (
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() =>
              onChange([
                ...lines,
                {
                  id: uid("sw"),
                  plant: lines[lines.length - 1]?.plant ?? "",
                  location: "",
                  erectM3: 0,
                  dismantleM3: 0,
                  standingM3: 0,
                },
              ])
            }
          >
            Add line
          </Button>
        ) : null}
      </div>
      {lines.map((line, idx) => (
        <div
          key={line.id}
          className="mb-3 grid gap-2 rounded-md border border-[var(--sge-line)] p-3 sm:grid-cols-4"
        >
          <div>
            <Label>Plant</Label>
            <select
                className="mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                disabled={readOnly}
                value={line.plant}
                onChange={(e) => onChange(lines.map((l, i) => (i === idx ? { ...l, plant: e.target.value } : l)))}
              >
                <option value="">Pick plant…</option>
                {plants.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
          </div>
          <div>
            <Label>Location</Label>
            <Input
              className="mt-1"
              disabled={readOnly}
              value={line.location}
              onChange={(e) => {
                const next = lines.map((l, i) =>
                  i === idx ? { ...l, location: e.target.value } : l
                );
                onChange(next);
              }}
            />
          </div>
          {(
            [
              ["erectM3", "Erect m³"],
              ["dismantleM3", "Dismantle m³"],
              ["standingM3", "Standing m³"],
              ["liftingTrips", "Lifting & shifting (trips)"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <Label>{label}</Label>
              <Input
                type="number"
                className="mt-1"
                disabled={readOnly}
                value={line[key] ?? 0}
                onChange={(e) => {
                  const next = lines.map((l, i) =>
                    i === idx ? { ...l, [key]: Number(e.target.value) } : l
                  );
                  onChange(next);
                }}
              />
            </div>
          ))}
          {!readOnly && lines.length > 1 ? (
            <div className="flex items-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(lines.filter((_, i) => i !== idx))}>
                Remove line
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </Panel>
  );
}

/** Store DPR: add a stock row, a paint issue to a supervisor, or a receipt into the store. */
function StoreLines({
  supervisors,
  onIssue,
  onReceipt,
  onAddStockRow,
}: {
  supervisors: { id: string; name: string }[];
  onIssue: (issue: { toSupervisorId: string; sapCode: string; qtyLitres: number }) => void;
  onReceipt: (receipt: { sapCode: string; qtyLitres: number }) => void;
  onAddStockRow: () => void;
}) {
  const [kind, setKind] = useState<"issue" | "receipt">("issue");
  const [sap, setSap] = useState("");
  const [litres, setLitres] = useState("");
  const [to, setTo] = useState("");
  const toId = supervisors.some((x) => x.id === to) ? to : supervisors[0]?.id ?? "";
  const ok = sap.trim() && Number(litres) > 0 && (kind === "receipt" || toId);
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-dashed border-[var(--sge-line)] p-2 text-sm">
      <Button type="button" size="sm" variant="ghost" onClick={onAddStockRow}>Add stock row</Button>
      <select className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs" value={kind} onChange={(e) => setKind(e.target.value as "issue" | "receipt")}>
        <option value="issue">Issue to supervisor</option>
        <option value="receipt">Receipt into store</option>
      </select>
      <Input className="h-8 w-36" placeholder="SAP code" value={sap} onChange={(e) => setSap(e.target.value)} />
      <Input className="h-8 w-24" type="number" min="0" placeholder="Litres" value={litres} onChange={(e) => setLitres(e.target.value)} />
      {kind === "issue" ? (
        <select className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs" value={toId} onChange={(e) => setTo(e.target.value)}>
          {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!ok}
        onClick={() => {
          if (kind === "issue") onIssue({ toSupervisorId: toId, sapCode: sap.trim(), qtyLitres: Number(litres) });
          else onReceipt({ sapCode: sap.trim(), qtyLitres: Number(litres) });
          setSap("");
          setLitres("");
        }}
      >
        Add {kind}
      </Button>
    </div>
  );
}
