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
import { SafetyDprForm } from "@/components/dpr/safety-dpr-form";
import { blankSafetyBody } from "@/lib/safety-dpr";
import type {
  AttendanceStatus,
  DprDocument,
  DprPaintUse,
  DprPaintWorkLine,
  DprRequest,
  DprScaffoldWorkLine,
  DprSubmitterType,
  Site,
} from "@/lib/types";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { sitePlantDetails } from "@/lib/site-scope";
import { kindDef } from "@/lib/equipment";
import { lineLitres, mpsNumber, mpsOptions, normLitres, normWarning, paintChoicesFor } from "@/lib/dpr-paint";
import { ATTENDANCE_OPTIONS, otHours, timeProblem, WORKING } from "@/lib/attendance";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function blankDpr(opts: {
  submitterId: string;
  submitterType: DprSubmitterType;
  siteId: string;
}): DprDocument {
  const now = new Date().toISOString();
  return {
    id: uid("dprd"),
    date: todayDate(),
    siteId: opts.siteId,
    // Picked from the site's plant list (docs §3), never assumed
    plant: "",
    submitterId: opts.submitterId,
    submitterType: opts.submitterType,
    status: "draft",
    labourMarks: [],
    equipmentMarks: [],
    requests: [],
    nextDayPlan: "",
    note: "",
    telegramDraftLines: [],
    paintWork:
      opts.submitterType === "painting_blasting"
        ? [
            {
              id: uid("pw"),
              plant: "",
              bay: "",
              activity: "painting",
              areaM2: 0,
              mpsScheme: undefined,
              paintLitres: 0,
              paints: [],
            },
          ]
        : undefined,
    scaffoldWork:
      opts.submitterType === "scaffolding"
        ? [
            {
              id: uid("sw"),
              plant: "",
              location: "",
              erectM3: 0,
              dismantleM3: 0,
              standingM3: 0,
            },
          ]
        : undefined,
    safetyBody:
      opts.submitterType === "safety" ? blankSafetyBody() : undefined,
    storeBody:
      opts.submitterType === "store"
        ? {
            stockByPlant: [{ plant: "", paintLitres: 0 }],
            issues: [],
            receipts: [],
            sparesMovement: [],
          }
        : undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export function DprForm({
  value,
  onChange,
  readOnly,
}: {
  value: DprDocument;
  onChange: (next: DprDocument) => void;
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

  // B05: a field DPR checks the submitter's own setup; with no setup yet, the site's unassigned kit
  const siteKit = state.equipment.filter((e) => e.siteId === value.siteId);
  const ownSetup = siteKit.filter((e) => e.supervisorId === value.submitterId);
  const fieldDpr = value.submitterType === "painting_blasting" || value.submitterType === "scaffolding";
  const equipment = !fieldDpr ? siteKit : ownSetup.length ? ownSetup : siteKit.filter((e) => !e.supervisorId);
  // The DPR's site plants (docs §3: every DPR picks one of its site's plants)
  const site = state.sites.find((x) => x.id === value.siteId);
  const plants = site?.plants ?? [];
  // MPS picked from a list (B07): schemes with norms + the work order's service items
  const { work } = useWork();
  const mpsList = useMemo(
    () => mpsOptions(work.serviceItems.map((x) => mpsNumber(x.mps)).filter((n): n is number => n != null)),
    [work.serviceItems]
  );
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
                      {l.trade} · {l.epNumber}
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
          Equipment assigned
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
                    {eq.tag} · {kindDef(eq.type).label}{eq.qty ? ` × ${eq.qty}` : ""}
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
            Requests (spare / equipment / material)
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
                className="grid gap-2 rounded-md border border-[var(--sge-line)] p-2 sm:grid-cols-5"
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

      {value.submitterType === "painting_blasting" && value.paintWork ? (
        <PaintWorkEditor
          lines={value.paintWork}
          plants={plants}
          site={site}
          mpsList={mpsList}
          readOnly={readOnly}
          onChange={(paintWork) => onChange({ ...value, paintWork })}
        />
      ) : null}

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

function PaintWorkEditor({
  lines,
  plants,
  site,
  mpsList,
  onChange,
  readOnly,
}: {
  lines: DprPaintWorkLine[];
  plants: string[];
  /** The DPR's site, for each plant's Master Data locations (B02) */
  site?: Site;
  mpsList: number[];
  onChange: (lines: DprPaintWorkLine[]) => void;
  readOnly?: boolean;
}) {
  const fieldCls =
    "mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";
  const setLine = (idx: number, patch: Partial<DprPaintWorkLine>) =>
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  // Keep the old single total in step with the per-paint rows (other screens still read it)
  const setPaints = (idx: number, paints: DprPaintUse[]) =>
    setLine(idx, { paints, paintLitres: lineLitres({ paints }) });

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Painting / blasting work
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
                  id: uid("pw"),
                  plant: lines[lines.length - 1]?.plant ?? "",
                  bay: "",
                  activity: "painting",
                  areaM2: 0,
                  mpsScheme: lines[lines.length - 1]?.mpsScheme,
                  paintLitres: 0,
                  paints: [],
                },
              ])
            }
          >
            Add line
          </Button>
        ) : null}
      </div>
      <div className="space-y-3">
        {lines.map((line, idx) => {
          const locations = site && line.plant
            ? (sitePlantDetails(site).find((d) => d.name === line.plant)?.locations ?? []).map((l) => l.name)
            : [];
          const choices = paintChoicesFor(line.mpsScheme);
          const paints = line.paints ?? [];
          const warn = normWarning(line);
          const listId = `${line.id}-locations`;
          const paintListId = `${line.id}-paints`;
          return (
            <div key={line.id} className="rounded-md border border-[var(--sge-line)] p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Label>Plant</Label>
                  <select
                    className={fieldCls}
                    disabled={readOnly}
                    value={line.plant}
                    onChange={(e) => setLine(idx, { plant: e.target.value })}
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
                    list={locations.length ? listId : undefined}
                    placeholder={locations.length ? "Pick or type a location" : "Type the location / bay"}
                    value={line.bay}
                    onChange={(e) => setLine(idx, { bay: e.target.value })}
                  />
                  {locations.length ? (
                    <datalist id={listId}>
                      {locations.map((l) => <option key={l} value={l} />)}
                    </datalist>
                  ) : null}
                </div>
                <div>
                  <Label>Activity</Label>
                  <select
                    className={fieldCls}
                    disabled={readOnly}
                    value={line.activity}
                    onChange={(e) => setLine(idx, { activity: e.target.value as DprPaintWorkLine["activity"] })}
                  >
                    <option value="painting">Painting</option>
                    <option value="blasting">Blasting</option>
                  </select>
                </div>
                <div>
                  <Label>Area m²</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    disabled={readOnly}
                    value={line.areaM2}
                    onChange={(e) => setLine(idx, { areaM2: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>MPS</Label>
                  <select
                    className={fieldCls}
                    disabled={readOnly}
                    value={line.mpsScheme ?? ""}
                    onChange={(e) => setLine(idx, { mpsScheme: e.target.value ? Number(e.target.value) : undefined })}
                  >
                    <option value="">Pick MPS…</option>
                    {mpsList.map((m) => <option key={m} value={m}>MPS-{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Total paint</Label>
                  <div className="mt-2 font-heading text-sm font-bold tabular-nums">
                    {lineLitres(line)} L
                    {normLitres(line) != null ? (
                      <span className="ml-2 text-xs font-normal text-[var(--sge-ink-3)]">norm ~{normLitres(line)} L</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {line.activity === "painting" ? (
                <div className="mt-3 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
                      Paint used (litres per type)
                    </span>
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setPaints(idx, [...paints, { id: uid("pu"), type: "", litres: 0 }])}
                      >
                        Add paint
                      </Button>
                    ) : null}
                  </div>
                  {paints.length === 0 ? (
                    <p className="text-xs text-[var(--sge-ink-3)]">
                      No paint entered{line.mpsScheme == null ? " — pick the MPS to see its paints" : ""}.
                    </p>
                  ) : null}
                  {choices.length ? (
                    <datalist id={paintListId}>
                      {choices.map((c) => <option key={c.name} value={c.name} />)}
                    </datalist>
                  ) : null}
                  <div className="space-y-1.5">
                    {paints.map((p, j) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Input
                          aria-label={`Line ${idx + 1} paint ${j + 1} type`}
                          className="h-8 text-sm"
                          disabled={readOnly}
                          list={choices.length ? paintListId : undefined}
                          placeholder={choices.length ? "Pick or type the paint" : "Type the paint"}
                          value={p.type}
                          onChange={(e) => {
                            const type = e.target.value;
                            const sap = choices.find((c) => c.name === type)?.sap || undefined;
                            setPaints(idx, paints.map((x, k) => (k === j ? { ...x, type, sap } : x)));
                          }}
                        />
                        <Input
                          aria-label={`Line ${idx + 1} paint ${j + 1} litres`}
                          type="number"
                          className="h-8 w-28 text-sm"
                          disabled={readOnly}
                          value={p.litres}
                          onChange={(e) =>
                            setPaints(idx, paints.map((x, k) => (k === j ? { ...x, litres: Number(e.target.value) } : x)))
                          }
                        />
                        <span className="text-xs text-[var(--sge-ink-3)]">L</span>
                        {!readOnly ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => setPaints(idx, paints.filter((_, k) => k !== j))}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {warn ? <p className="mt-1.5 text-xs text-[var(--sge-brass-ink)]">⚠ {warn}</p> : null}
                </div>
              ) : null}

              {!readOnly && lines.length > 1 ? (
                <div className="mt-2 flex justify-end">
                  <Button type="button" size="sm" variant="ghost" onClick={() => onChange(lines.filter((_, i) => i !== idx))}>
                    Remove line
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
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
