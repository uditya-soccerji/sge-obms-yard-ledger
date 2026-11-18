"use client";

import { staffEpSet } from "@/lib/dpr-validate";
import { useEffect, useMemo, useState } from "react";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { REQUEST_REASONS } from "@/lib/requests";
import { STORE_CATALOGUE } from "@/lib/store-catalogue";
import { SafetyDprForm } from "@/components/dpr/safety-dpr-form";
import type {
  AttendanceStatus,
  DprEquipmentMark,
  DprLabourMark,
  DprRequest,
  DprScaffoldWorkLine,
  EquipmentItem,
} from "@/lib/types";
import type { DprReport } from "@/lib/work/types";
import { blankReport, reportOpen, sameDay } from "@/lib/work/reports";
import { useWork } from "@/lib/work/store";
import { entryArea, round3 } from "@/lib/work/logic";
import { STAGES } from "@/lib/work/types";
import { JobEntryForm } from "@/components/work/work-jobs";
import { PlanWorkLineForm } from "@/components/dpr/plan-work-lines";
import { lineLabel } from "@/components/work/common";
import type { Stage } from "@/lib/work/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ATTENDANCE_OPTIONS } from "@/lib/attendance";
import { worksAt } from "@/lib/site-scope";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** PPE status on the Admin DPR (2026-10-27) */
export const PPE_OPTIONS: { value: NonNullable<DprLabourMark["ppe"]>; label: string; on: string }[] = [
  { value: "ok", label: "OK", on: "bg-[var(--sge-ok)] text-white" },
  { value: "damaged", label: "Damaged", on: "bg-[var(--sge-warn)] text-white" },
  { value: "due", label: "Due", on: "bg-[var(--sge-brass)] text-white" },
  { value: "urgent", label: "Urgent required", on: "bg-[var(--sge-crit)] text-white" },
];

/** Machinery whose run is logged on the DPR: start / end time and meter (diesel for compressors) */
export const MACHINERY: EquipmentItem["type"][] = ["hopper", "compressor", "airless"];

/** Hours between start and end (HH:MM), to 0.1 h; -1 when the end isn't after the start */
export function runHours(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const [a, b] = [start, end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)));
  return b > a ? Math.round(((b - a) / 60) * 10) / 10 : -1;
}

/** A new daily report (kept under the old name for the DPR desk pages). */
export const blankDpr = blankReport;

export function DprForm({
  value,
  onChange,
  readOnly,
  ensureSaved,
}: {
  value: DprReport;
  onChange: (next: DprReport) => void;
  readOnly?: boolean;
  /** Admin DPR: save the draft (if new) before a work line is added */
  ensureSaved?: () => { ok: boolean; error?: string; doc?: DprReport };
}) {
  const { state, fullState, assignCrew } = useStore();
  // Owner, 2026-11-18: the whole register, not just the header's site — a supervisor on two sites has
  // crew members registered at either, and all of them belong on the DPR
  // …and a labourer record that is really a staff member (same EP as a login) is not crew (owner, 2026-11-18)
  const staffEps = useMemo(() => staffEpSet(fullState.staff), [fullState.staff]);
  const labs = useMemo(() => fullState.labourers.filter((l) => !staffEps.has(l.epNumber)), [fullState.labourers, staffEps]);
  // Owner, 2026-11-15: the Admin / SIC / Owner / SA put a labourer on this supervisor's crew from the DPR (§38)
  const canCrew = ["admin", "sic", "owner", "super_admin"].includes(state.currentRole ?? "") && value.submitterType !== "safety" && value.submitterType !== "store";
  const [crewMsg, setCrewMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function addToCrew(labourerId: string) {
    const r = assignCrew([labourerId], value.submitterId);
    const name = labs.find((l) => l.id === labourerId)?.name ?? "Labourer";
    const sup = state.staff.find((x) => x.id === value.submitterId)?.name ?? "this supervisor";
    setCrewMsg(r.ok ? { ok: true, text: `${name} is now on ${sup}'s crew — listed on their DPR from now on` } : { ok: false, text: r.error ?? "Couldn't add to the crew" });
    if (r.ok) setPick("");
  }
  const { work } = useWork();
  // The Admin enters the DPR for a supervisor (attendance tabs, PPE, work from the plan)
  const all = !!value.allSections;
  const fieldCrew = value.submitterType === "painting_blasting" || value.submitterType === "scaffolding";
  // Owner, 2026-11-14: the supervisor's own crew first, then the others working at this site and
  // plant — labourers not on any crew yet, and the crews of supervisors planned at this plant this
  // month. Only the supervisor's own crew must be marked to submit (docs §36).
  const { crew, others } = useMemo(() => {
    const own = labs.filter((l) => l.active && l.supervisorId === value.submitterId);
    if (!all || value.submitterType === "safety" || value.submitterType === "store") {
      return { crew: value.submitterType === "safety" || value.submitterType === "store" ? labs.filter((l) => l.active && l.siteId === value.siteId) : own, others: [] as typeof own };
    }
    const month = (value.date || "").slice(0, 7);
    const plant = value.plant.trim().toUpperCase();
    const atPlant = new Set(
      plant
        ? work.planLines.filter((p) => p.siteId === value.siteId && p.month === month && p.plant.trim().toUpperCase() === plant).map((p) => p.supervisorId)
        : []
    );
    const ownIds = new Set(own.map((l) => l.id));
    // Crews of the supervisors planned at this plant; people on no crew are found with the search below
    const rest = labs.filter(
      (l) => l.active && !ownIds.has(l.id) && l.siteId === value.siteId && !!l.supervisorId && atPlant.has(l.supervisorId)
    );
    return { crew: own, others: rest };
  }, [labs, work.planLines, value.submitterId, value.submitterType, value.siteId, value.plant, value.date, all]);
  // Owner, 2026-11-16: labour is added to the crew from a pop-up, found by EP number or name — the
  // site's other labourers aren't listed on the DPR itself
  const [find, setFind] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState("");
  const canPick = !readOnly && (canCrew || all) && value.submitterType !== "safety" && value.submitterType !== "store";
  const found = useMemo(() => {
    const q = pick.trim().toLowerCase();
    const crewIds = new Set(crew.map((l) => l.id));
    const marked = new Set(value.labourMarks.map((m) => m.labourerId));
    // Nothing typed: the crews planned at this plant; typed: anyone active on this site
    const pool = q.length < 2 ? others : labs.filter((l) => l.active && l.siteId === value.siteId && (l.name.toLowerCase().includes(q) || l.epNumber.toLowerCase().includes(q)));
    return pool.filter((l) => !crewIds.has(l.id)).slice(0, 30).map((l) => ({ l, marked: marked.has(l.id) }));
  }, [pick, crew, others, labs, value.siteId, value.labourMarks]);
  // The crew, plus anyone else already marked on this DPR (kept even if the plant changes)
  const listed = useMemo(() => {
    const ids = new Set(crew.map((l) => l.id));
    const marked = labs.filter((l) => !ids.has(l.id) && value.labourMarks.some((m) => m.labourerId === l.id));
    const rows = [...crew.map((l) => ({ l, own: true })), ...marked.map((l) => ({ l, own: false }))];
    // Owner, 2026-11-14: the search box narrows the list by name or EP
    const q = find.trim().toLowerCase();
    return q ? rows.filter(({ l }) => l.name.toLowerCase().includes(q) || l.epNumber.toLowerCase().includes(q)) : rows;
  }, [crew, labs, value.labourMarks, find]);

  const equipment = state.equipment.filter((e) => e.siteId === value.siteId);
  // The DPR's site plants (docs §3: every DPR picks one of its site's plants)
  const plants = state.sites.find((x) => x.id === value.siteId)?.plants ?? [];
  const supervisors = state.staff.filter((x) => x.role === "supervisor" && worksAt(x, value.siteId));

  function setOt(labourerId: string, raw: string) {
    const n = raw === "" ? undefined : Math.max(0, Math.min(16, Math.round(Number(raw) * 2) / 2));
    onChange({ ...value, labourMarks: value.labourMarks.map((m) => (m.labourerId === labourerId ? { ...m, otHours: n } : m)) });
  }

  function setMark(labourerId: string, status: AttendanceStatus) {
    const existing = value.labourMarks.find((m) => m.labourerId === labourerId);
    const labourMarks = existing
      ? value.labourMarks.map((m) =>
          m.labourerId === labourerId
            ? {
                ...m,
                status,
                // Owner, 2026-11-14: no in / out times on labour attendance — a status only
                inTime: undefined,
                outTime: undefined,
                otHours: status === "overtime" ? m.otHours : undefined,
              }
            : m
        )
      : [
          ...value.labourMarks,
          {
            labourerId,
            status,
          },
        ];
    onChange({ ...value, labourMarks });
  }

  function setPpe(labourerId: string, ppe: NonNullable<DprLabourMark["ppe"]>) {
    const has = value.labourMarks.some((m) => m.labourerId === labourerId);
    // Owner, 2026-11-14: damaged / due / urgent PPE is a request to the store on this DPR
    const l = labs.find((x) => x.id === labourerId);
    const others = value.requests.filter((r) => r.ppeFor !== labourerId);
    const kept = value.requests.find((r) => r.ppeFor === labourerId);
    const reason: DprRequest["reason"] = ppe === "urgent" ? "urgent" : ppe === "due" ? "replacement" : "damaged";
    const label = PPE_OPTIONS.find((o) => o.value === ppe)?.label ?? ppe;
    const requests =
      ppe === "ok"
        ? others
        : [
            ...others,
            {
              id: kept?.id ?? uid("req"),
              kind: "material" as const,
              category: "Safety & PPE",
              item: kept?.item,
              description: `PPE for ${l?.name ?? "labourer"}${l?.epNumber ? ` (${l.epNumber})` : ""} — ${label}`,
              qty: kept?.qty ?? 1,
              reason,
              urgent: ppe === "urgent",
              ppeFor: labourerId,
            },
          ];
    onChange({
      ...value,
      labourMarks: has
        ? value.labourMarks.map((m) => (m.labourerId === labourerId ? { ...m, ppe } : m))
        : [...value.labourMarks, { labourerId, status: "present", ppe }],
      requests,
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

  /** Change a ticked item's day figures: status, run times, meter, diesel */
  function setEquipment(equipmentId: string, patch: Partial<DprEquipmentMark>) {
    onChange({ ...value, equipmentMarks: value.equipmentMarks.map((e) => (e.equipmentId === equipmentId ? { ...e, ...patch } : e)) });
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

  // Owner, 2026-11-16: one DPR per supervisor · plant · day — say so before anything is typed in
  const twin =
    !readOnly && value.plant.trim() && value.submitterId
      ? work.reports.find((r) => r.id !== value.id && sameDay(r, { ...value, admin: value.enteredBy === "admin" }))
      : undefined;
  return (
    <div className="space-y-4">
      {twin ? (
        <div className="rounded-md border border-[var(--sge-crit)] bg-[var(--sge-paper)] px-3 py-2 text-sm text-[var(--sge-crit)]">
          {state.staff.find((x) => x.id === value.submitterId)?.name ?? "This supervisor"} already has a DPR on {value.plant} for {value.date} ({twin.status.replace("_", " ")}).{" "}
          <a className="font-semibold underline" href={`/dpr/${twin.id}`}>Open that one</a> — a second DPR for the same supervisor and plant won&apos;t save.
        </div>
      ) : null}
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
            {value.permitOk ? (
              // Owner, 2026-11-16: the permit's number once it's in force (TBT is the safety officer's report)
              <div>
                <Label htmlFor="dpr-permit-no">Permit number</Label>
                <Input
                  id="dpr-permit-no"
                  className="mt-1"
                  disabled={readOnly}
                  value={value.permitNo ?? value.permitNos?.join(", ") ?? ""}
                  placeholder="e.g. WP-2611-0457"
                  onChange={(e) => onChange({ ...value, permitNo: e.target.value })}
                />
              </div>
            ) : (
              <div />
            )}
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

      {value.submitterType !== "store" && value.submitterType !== "safety" ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Labour attendance{all ? ` · crew ${crew.length}` : ""}
          </h3>
          {crew.length === 0 ? (
            // B03: a new supervisor has no crew yet; say so instead of an empty panel
            <p className="text-sm text-[var(--sge-ink-3)]">
              No labourers are on this supervisor&apos;s crew yet.{" "}
              {canCrew ? "Click Add labour and find them by EP number or name — they stay on this crew for every DPR. Or use " : "The SIC assigns them in "}
              <a className="text-[var(--sge-brass-ink)] underline" href="/operations?p=crew">
                Operations → Crews
              </a>
              {canCrew ? "." : " (or the supervisor requests them there, if allowed)."}
            </p>
          ) : null}
          {listed.length || canPick ? (
            <div className="mb-2">
              <div className="flex flex-wrap items-center gap-2">
                {listed.length > 5 ? (
                  <Input
                    aria-label="Filter this list by name or EP"
                    className="h-9 min-w-0 flex-1 text-sm"
                    placeholder="Filter this list — name or EP number"
                    value={find}
                    onChange={(e) => setFind(e.target.value)}
                  />
                ) : null}
                {canPick ? (
                  <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { setPick(""); setCrewMsg(null); setPickOpen(true); }}>
                    + Add labour (EP / name)
                  </Button>
                ) : null}
              </div>
              {crewMsg ? (
                <p className={cn("mt-1 text-xs", crewMsg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{crewMsg.text}</p>
              ) : null}
              {find.trim() ? (
                <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
                  {listed.length ? `${listed.length} on this DPR match` : "No one on this DPR matches"}
                  {" · "}
                  <button type="button" className="underline" onClick={() => setFind("")}>clear</button>
                </p>
              ) : null}
            </div>
          ) : null}
          <Dialog open={pickOpen} onOpenChange={setPickOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add labour</DialogTitle>
                <DialogDescription>
                  Find by EP number or name at this site.{" "}
                  {canCrew
                    ? `Add to crew keeps them on ${state.staff.find((x) => x.id === value.submitterId)?.name ?? "this supervisor"}'s crew for every DPR; Today only marks them present on this DPR.`
                    : "Today only marks them present on this DPR."}
                </DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                aria-label="Find labour by EP number or name"
                placeholder="EP number or name — e.g. PP2025 or Ramesh"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              />
              {crewMsg ? (
                <p className={cn("text-xs", crewMsg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{crewMsg.text}</p>
              ) : null}
              <p className="text-[11px] text-[var(--sge-ink-3)]">
                {pick.trim().length < 2
                  ? others.length
                    ? `Crews planned at ${value.plant || "this plant"} this month — or type 2+ characters to search the whole site`
                    : "Type at least 2 characters"
                  : found.length
                    ? `${found.length}${found.length === 30 ? "+" : ""} found`
                    : "No one at this site matches — new labourers are added in Master Data → Labourers"}
              </p>
              <div className="divide-y divide-[var(--sge-line)] rounded-md border border-[var(--sge-line)] empty:hidden">
                {found.map(({ l, marked }) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 text-xs">
                    <span>
                      <span className="font-semibold">{l.name}</span> · {l.epNumber} ·{" "}
                      {l.supervisorId ? `crew of ${state.staff.find((x) => x.id === l.supervisorId)?.name ?? "?"}` : "not on a crew"}
                    </span>
                    <span className="flex gap-1">
                      {canCrew ? (
                        <Button type="button" size="sm" className="h-7" onClick={() => addToCrew(l.id)}>
                          Add to crew
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7"
                        disabled={marked}
                        onClick={() => {
                          setMark(l.id, "present");
                          setCrewMsg({ ok: true, text: `${l.name} marked present on this DPR` });
                        }}
                      >
                        {marked ? "On this DPR" : "Today only"}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
          <div className="space-y-2">
            {listed.map(({ l, own }, i) => {
              const mark = value.labourMarks.find((m) => m.labourerId === l.id);
              const crewOf = l.supervisorId ? state.staff.find((x) => x.id === l.supervisorId)?.name : undefined;
              const heading =
                all && i === 0 && own ? `Crew of ${state.staff.find((x) => x.id === value.submitterId)?.name ?? "this supervisor"}`
                : !own && (i === 0 || listed[i - 1].own) ? "Also on this DPR — not on this crew"
                : null;
              return (
                <div key={l.id}>
                {heading ? (
                  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">{heading}</div>
                ) : null}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-[var(--sge-ink-3)]">
                      {state.tradeCatalogue.find((t) => t.id === l.trade)?.label ?? l.trade} · {l.epNumber}
                      {!own ? <> · {crewOf ? `crew of ${crewOf}` : "not on a crew"}</> : null}
                      {!own && canCrew && !readOnly ? (
                        <button type="button" className="ml-2 text-[11px] font-semibold text-[var(--sge-brass-ink)] underline" onClick={() => addToCrew(l.id)}>
                          Add to this crew
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {all || fieldCrew ? (
                    // Admin DPR (2026-10-27): attendance as tabs and PPE status; owner 2026-11-16: on every
                    // Painting & Blasting / Scaffolding DPR too, whoever fills it

                    <div className="flex flex-wrap items-center gap-2">
                      <div role="group" aria-label={`Attendance ${l.name}`} className="inline-flex overflow-hidden rounded-md border border-[var(--sge-line)] text-xs">
                        {(["present", "absent"] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            disabled={readOnly}
                            aria-pressed={mark?.status === st}
                            onClick={() => setMark(l.id, st)}
                            className={cn("px-2.5 py-1.5 font-semibold", mark?.status === st ? (st === "present" ? "bg-[var(--sge-ok)] text-white" : "bg-[var(--sge-crit)] text-white") : "bg-[var(--sge-paper)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-paper-2)]")}
                          >
                            {st === "present" ? "Present" : "Absent"}
                          </button>
                        ))}
                        <select
                          aria-label={`Other attendance ${l.name}`}
                          disabled={readOnly}
                          className={cn("border-l border-[var(--sge-line)] px-1.5 text-xs", mark && mark.status !== "present" && mark.status !== "absent" ? "bg-[var(--sge-brass-wash)] font-semibold" : "bg-[var(--sge-paper)]")}
                          value={mark && mark.status !== "present" && mark.status !== "absent" ? mark.status : ""}
                          onChange={(e) => e.target.value && setMark(l.id, e.target.value as AttendanceStatus)}
                        >
                          <option value="">More…</option>
                          {ATTENDANCE_OPTIONS.filter((o) => o.value !== "present" && o.value !== "absent").map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      {mark?.status === "overtime" ? (
                        // Owner, 2026-11-18: no in / out times, so overtime is entered as hours (paid daily wage ÷ 8 per hour)
                        <label className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--sge-ink-2)]">
                          OT
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0.5}
                            max={16}
                            step={0.5}
                            disabled={readOnly}
                            aria-label={`Overtime hours ${l.name}`}
                            className="h-8 w-16 text-xs"
                            value={mark.otHours ?? ""}
                            onChange={(e) => setOt(l.id, e.target.value)}
                          />
                          h
                        </label>
                      ) : null}
                      <div role="group" aria-label={`PPE ${l.name}`} className="inline-flex items-center overflow-hidden rounded-md border border-[var(--sge-line)] text-xs">
                        <span className="bg-[var(--sge-paper-2)] px-2 py-1.5 font-semibold text-[var(--sge-ink-3)]">PPE</span>
                        {PPE_OPTIONS.map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            disabled={readOnly}
                            aria-pressed={mark?.ppe === o.value}
                            onClick={() => setPpe(l.id, o.value)}
                            className={cn("px-2.5 py-1.5 font-semibold", mark?.ppe === o.value ? o.on : "bg-[var(--sge-paper)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-paper-2)]")}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
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
                  </div>
                  )}
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
            const machine = MACHINERY.includes(eq.type);
            const hours = marked ? runHours(marked.startTime, marked.endTime) : null;
            return (
              <div
                key={eq.id}
                className="rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <Checkbox
                    disabled={readOnly}
                    checked={!!marked}
                    onCheckedChange={() => toggleEquipment(eq.id)}
                  />
                  <span>
                    {eq.tag} · {eq.type}
                  </span>
                </label>
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
              </div>
              {marked ? (
                // 2026-10-27: the day's figures for a ticked item — status for all, run time + meter for machinery, diesel for compressors
                <div className="mt-2 flex flex-wrap items-end gap-3 border-t border-[var(--sge-line)] pt-2 text-xs">
                  <div>
                    <Label className="text-xs">Status today</Label>
                    <select
                      aria-label={`Status ${eq.tag}`}
                      className="mt-1 h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs"
                      disabled={readOnly}
                      value={marked.status}
                      onChange={(e) => setEquipment(eq.id, { status: e.target.value as DprEquipmentMark["status"] })}
                    >
                      <option value="ok">OK</option>
                      <option value="due">Due</option>
                      <option value="fault">Fault</option>
                    </select>
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <Label className="text-xs">Remark{marked.status === "fault" ? " — what's wrong" : ""}</Label>
                    <Input aria-label={`Remark ${eq.tag}`} disabled={readOnly} className="mt-1 h-8 text-xs" placeholder={marked.status === "fault" ? "e.g. pressure drops, hose leaking" : "optional"} value={marked.note ?? ""} onChange={(e) => setEquipment(eq.id, { note: e.target.value || undefined })} />
                  </div>
                  {machine ? (
                    <>
                      <div>
                        <Label className="text-xs">Start time</Label>
                        <Input aria-label={`Start time ${eq.tag}`} type="time" disabled={readOnly} className="mt-1 h-8 w-[110px] text-xs" value={marked.startTime ?? ""} onChange={(e) => setEquipment(eq.id, { startTime: e.target.value || undefined })} />
                      </div>
                      <div>
                        <Label className="text-xs">End time</Label>
                        <Input aria-label={`End time ${eq.tag}`} type="time" disabled={readOnly} className="mt-1 h-8 w-[110px] text-xs" value={marked.endTime ?? ""} onChange={(e) => setEquipment(eq.id, { endTime: e.target.value || undefined })} />
                      </div>
                      <div>
                        <Label className="text-xs">Meter reading</Label>
                        <Input aria-label={`Meter reading ${eq.tag}`} type="number" min="0" step="any" disabled={readOnly} className="mt-1 h-8 w-[120px] text-xs" value={marked.meterReading ?? ""} onChange={(e) => setEquipment(eq.id, { meterReading: e.target.value === "" ? undefined : Number(e.target.value) })} />
                      </div>
                      {eq.type === "compressor" ? (
                        <div>
                          <Label className="text-xs">Diesel used (L)</Label>
                          <Input aria-label={`Diesel litres ${eq.tag}`} type="number" min="0" step="any" disabled={readOnly} className="mt-1 h-8 w-[110px] text-xs" value={marked.dieselL ?? ""} onChange={(e) => setEquipment(eq.id, { dieselL: e.target.value === "" ? undefined : Number(e.target.value) })} />
                        </div>
                      ) : null}
                      <span className={hours === -1 ? "pb-2 text-[var(--sge-crit)]" : "pb-2 text-[var(--sge-ink-3)]"}>
                        {hours === -1 ? "End must be after start" : hours != null ? `Ran ${hours} h` : ""}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
              </div>
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
                {/* 2026-10-27: pick from the store list — category, then item (or "Other" and type it) */}
                <select
                  aria-label={`Category for request ${idx + 1}`}
                  disabled={readOnly}
                  className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs sm:col-span-2"
                  value={r.category ?? ""}
                  onChange={(e) => {
                    const cat = STORE_CATALOGUE.find((c) => c.name === e.target.value);
                    const requests = value.requests.map((x, i) => (i === idx ? { ...x, category: cat?.name, item: undefined, kind: cat?.kind ?? x.kind, description: x.item && x.description === x.item ? "" : x.description } : x));
                    onChange({ ...value, requests });
                  }}
                >
                  <option value="">Category…</option>
                  {STORE_CATALOGUE.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
                <select
                  aria-label={`Item for request ${idx + 1}`}
                  disabled={readOnly || !r.category}
                  className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs sm:col-span-2"
                  value={r.item ?? ""}
                  onChange={(e) => {
                    const item = e.target.value || undefined;
                    // The item name becomes the description the store reads; a hand-typed one is kept
                    const requests = value.requests.map((x, i) => (i === idx ? { ...x, item, description: item && (!x.description || x.description === x.item) ? item : x.description } : x));
                    onChange({ ...value, requests });
                  }}
                >
                  <option value="">{r.category ? "Item… (or Other: type below)" : "Pick a category first"}</option>
                  {(STORE_CATALOGUE.find((c) => c.name === r.category)?.items ?? []).map((it) => (
                    <option key={it} value={it}>{it}</option>
                  ))}
                </select>
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

      {value.submitterType === "painting_blasting" ? <JobLines report={value} readOnly={readOnly} ensureSaved={ensureSaved} fromPlanAllowed={all} onPlant={(plant) => onChange({ ...value, plant })} /> : null}

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
function JobLines({
  report,
  readOnly,
  ensureSaved,
  fromPlanAllowed,
  onPlant,
}: {
  report: DprReport;
  readOnly?: boolean;
  ensureSaved?: () => { ok: boolean; error?: string; doc?: DprReport };
  fromPlanAllowed?: boolean;
  /** Owner, 2026-11-16: picking a job (or a plan line) before the plant fills in the DPR's plant */
  onPlant?: (plant: string) => void;
}) {
  const { state } = useStore();
  const { work, removeEntry } = useWork();
  const [adding, setAdding] = useState<string>("");
  const [fromPlan, setFromPlan] = useState(false);
  const planLabel = (id?: string) => {
    const l = work.planLines.find((x) => x.id === id);
    return l ? `Plan · ${l.plant} · ${l.serviceCode} · ${state.staff.find((x) => x.id === l.supervisorId)?.name ?? ""}` : "Plan";
  };
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const saved = work.reports.some((r) => r.id === report.id);
  const lines = work.dprs.filter((d) => d.reportId === report.id);
  const plantOf = (jobId: string) => work.planLines.find((l) => l.id === work.jobs.find((j) => j.id === jobId)?.planLineId)?.plant ?? "";
  // No plant yet: every open job of this supervisor on this site (picking one sets the plant)
  const jobs = work.jobs.filter((j) => {
    const line = work.planLines.find((l) => l.id === j.planLineId);
    return j.status === "open" && j.supervisorId === report.submitterId && line?.siteId === report.siteId && (!report.plant || line.plant === report.plant);
  });
  // A job picked before the plant: once the plant is in the form, save the draft and open the job's line
  const [pending, setPending] = useState<{ jobId: string; plant: string; msg?: string } | null>(null);
  useEffect(() => {
    if (!pending || !report.plant || pending.plant !== report.plant) return;
    const p = pending;
    setPending(null);
    if (!saveFirst()) return;
    setAdding(p.jobId);
    if (p.msg) setMsg({ ok: true, msg: p.msg });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, report.plant]);
  function openJob(jobId: string, okMsg?: string, plantHint?: string) {
    // A job started this moment isn't in the list until the next render — its plan line's plant comes along
    const plant = plantHint ?? plantOf(jobId);
    if (!report.plant && plant && onPlant) {
      onPlant(plant);
      setPending({ jobId, plant, msg: okMsg });
      return;
    }
    if (!saveFirst()) return;
    setAdding(jobId);
    if (okMsg) setMsg({ ok: true, msg: okMsg });
  }
  const jobNo = (id: string) => work.jobs.find((j) => j.id === id)?.jobNo ?? id;
  // Owner, 2026-11-16: job lines (and a new job) can be added before the draft is saved — it saves itself first
  const canSave = !!ensureSaved && !readOnly && reportOpen(report);
  const editable = !readOnly && reportOpen(report) && (saved || canSave);
  // Admin DPR: the plan's work can be added without a job
  const planOpen = canSave && !!fromPlanAllowed;
  const [starting, setStarting] = useState(false);
  const job = saved ? jobs.find((j) => j.id === adding) : undefined;
  function saveFirst(): boolean {
    if (saved) return true;
    if (!report.plant) {
      setMsg({ ok: false, msg: "Pick the plant first" });
      return false;
    }
    const r = ensureSaved?.();
    if (!r?.ok) setMsg({ ok: false, msg: r?.error ?? "Save the draft first" });
    return !!r?.ok;
  }
  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
        Painting / blasting — {ensureSaved ? "work lines" : "job lines"}
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
                <td className="py-1.5 font-mono">{e.jobId ? jobNo(e.jobId) : <span className="font-sans">{planLabel(e.planLineId)} <span className="rounded-sm bg-[var(--sge-paper-2)] px-1 text-[10px] uppercase">no job</span></span>}</td>
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
      {planOpen ? (
        <div className="mb-3">
          {fromPlan ? (
            <PlanWorkLineForm report={report} ensureSaved={ensureSaved!} onDone={(m) => setMsg(m)} />
          ) : (
            <Button type="button" size="sm" onClick={() => setFromPlan(true)}>
              + Add work from the plan (no job needed)
            </Button>
          )}
        </div>
      ) : null}
      {!saved && !readOnly && !canSave ? (
        <p className="text-xs text-[var(--sge-ink-3)]">Pick the plant and save the draft, then add job lines here.</p>
      ) : null}
      {editable && !report.plant ? (
        <p className="mb-2 text-xs text-[var(--sge-ink-3)]">No plant picked yet — pick a job or start one and the DPR&apos;s plant fills in from it.</p>
      ) : null}
      {editable ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            {jobs.length ? (
              <div>
                <Label>Add a line for job</Label>
                <select
                  className="mt-1 h-9 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                  value={adding}
                  onChange={(e) => {
                    const id = e.target.value;
                    setStarting(false);
                    if (!id) return setAdding("");
                    openJob(id);
                  }}
                >
                  <option value="">Pick a job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.jobNo}{report.plant ? "" : ` · ${plantOf(j.id)}`} · {j.location}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-xs text-[var(--sge-ink-3)]">No open jobs for this supervisor{report.plant ? ` on ${report.plant}` : " on this site"}.</p>
            )}
            {!starting ? (
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { setStarting(true); setAdding(""); setMsg(null); }}>
                + Start a new job
              </Button>
            ) : null}
          </div>
          {starting ? (
            <DprStartJob
              report={report}
              openJobs={jobs}
              saveFirst={saveFirst}
              onCancel={() => setStarting(false)}
              onStarted={(id, m, plant) => {
                setStarting(false);
                openJob(id, m, plant);
              }}
            />
          ) : null}
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
      ) : null}
      {msg ? <p className={msg.ok ? "mt-2 text-xs text-[var(--sge-ok)]" : "mt-2 text-xs text-[var(--sge-crit)]"}>{msg.msg}</p> : null}
    </Panel>
  );
}

/**
 * Owner, 2026-11-16: start the job from the DPR when it isn't there yet. The plan line is this
 * supervisor's for this plant this month; the store refuses a second open job for the same
 * supervisor, plant and location, and the open ones are shown here so they're used instead.
 */
function DprStartJob({
  report,
  openJobs,
  saveFirst,
  onCancel,
  onStarted,
}: {
  report: DprReport;
  openJobs: { id: string; jobNo: string; location: string }[];
  saveFirst: () => boolean;
  onCancel: () => void;
  onStarted: (jobId: string, msg: string, plant: string) => void;
}) {
  const { work, startJob } = useWork();
  const { state } = useStore();
  const jobPlant = (jobId: string) => work.planLines.find((l) => l.id === work.jobs.find((j) => j.id === jobId)?.planLineId)?.plant;
  const month = report.date.slice(0, 7);
  const plant = report.plant.trim().toUpperCase();
  const lines = work.planLines.filter((l) => l.siteId === report.siteId && l.month === month && l.supervisorId === report.submitterId && (!plant || l.plant.trim().toUpperCase() === plant));
  const [picked, setPicked] = useState(lines[0]?.id ?? "");
  const lineId = lines.some((l) => l.id === picked) ? picked : lines[0]?.id ?? "";
  const line = lines.find((l) => l.id === lineId);
  const item = line ? work.serviceItems.find((x) => x.code === line.serviceCode) : undefined;
  const [location, setLocation] = useState("");
  const [plannedM2, setPlannedM2] = useState("");
  const [plannedEnd, setPlannedEnd] = useState("");
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const chosen = stages ?? item?.defaultStages ?? ["prep", "coat1", "coat2", "final"];
  const where = location.trim().toLowerCase();
  // Same supervisor + plant + location already open → a duplicate
  const samePlant = openJobs.filter((j) => !line || jobPlant(j.id) === line.plant);
  const twin = where ? samePlant.find((j) => j.location.trim().toLowerCase() === where) : undefined;
  const sup = state.staff.find((x) => x.id === report.submitterId)?.name ?? "this supervisor";
  if (!lines.length) {
    return (
      <div className="rounded-md border border-dashed border-[var(--sge-line)] p-3 text-xs text-[var(--sge-ink-2)]">
        {sup} has no plan line {report.plant ? `on ${report.plant}` : "on this site"} for {month}, so a job can&apos;t start yet. The Admin adds the plan line in Work → Plan vs actual (the SIC approves it).{" "}
        <button type="button" className="underline" onClick={onCancel}>Close</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-md border border-[var(--sge-line)] p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">New job · {sup} · {report.plant || line?.plant} · starts {report.date}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Plan line</Label>
          <select className="mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm" value={lineId} onChange={(e) => { setPicked(e.target.value); setStages(null); }}>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>{lineLabel(l, work.serviceItems.find((x) => x.code === l.serviceCode))}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="dpr-job-loc">Location / area</Label>
          <Input id="dpr-job-loc" className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. TT4 NORTH SIDE SR NO. 269–276" />
        </div>
        <div>
          <Label htmlFor="dpr-job-m2">Planned m² (final shade)</Label>
          <Input id="dpr-job-m2" type="number" min={0} className="mt-1" value={plannedM2} onChange={(e) => setPlannedM2(e.target.value)} placeholder="e.g. 450" />
        </div>
        <div>
          <Label htmlFor="dpr-job-end">Planned end date</Label>
          <Input id="dpr-job-end" type="date" className="mt-1" min={report.date} value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>Stages (the last one is the final shade → JMS qty)</Label>
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
      {samePlant.length ? (
        <p className={cn("text-xs", twin ? "font-semibold text-[var(--sge-crit)]" : "text-[var(--sge-ink-3)]")}>
          {twin
            ? `${twin.jobNo} is already open for ${sup} at ${line?.plant} · ${twin.location} — pick it above instead of starting a duplicate.`
            : `Already open for ${sup} on ${line?.plant}: ${samePlant.map((j) => `${j.jobNo} (${j.location})`).join(", ")} — start a new job only for a different location.`}
        </p>
      ) : null}
      {err ? <p className="text-xs text-[var(--sge-crit)]">{err}</p> : null}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!!twin}
          onClick={() => {
            setErr(null);
            if (!location.trim()) return setErr("Give the location / area");
            if (!(Number(plannedM2) > 0) || !plannedEnd) return setErr("Give the planned m² and the planned end date");
            // With the plant already set the draft saves first; otherwise it saves once the job fills the plant in
            if (report.plant && !saveFirst()) return;
            const r = startJob({ planLineId: lineId, location, stages: chosen, startDate: report.date, plannedM2: Number(plannedM2), plannedEnd });
            if (!r.ok) return setErr(r.error);
            onStarted(r.id!, "Job started (its plan goes to the SIC) — add today's line below.", line!.plant);
          }}
        >
          Start job &amp; add today&apos;s line
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
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
