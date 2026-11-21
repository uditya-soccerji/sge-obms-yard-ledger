"use client";
/**
 * Work → Scaffolding (owner, 2026-11-21): start a scaffolding job — plant, sub-con, area · bays,
 * type, supervisor (tagged with that sub-con), scope m³ — which makes or adds to the month's
 * scaffolding plan line in the background. The jobs list follows each job from the DPRs:
 * Erection → Standing → Removal → Closed.
 */
import { useMemo, useState } from "react";
import { EmptyState, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { PlacePicker, type Place } from "@/components/shared/place-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALL_SITES, entrySiteId, worksAt } from "@/lib/site-scope";
import { scaffoldVolume } from "@/lib/paint-calc";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { PLANK_M2, platformM2, typeLabel, SCAFFOLD_PURPOSES, SCAFFOLD_TYPES, STATUS_LABEL, scaffoldProgress, scaffoldStatus, type ScaffoldStatus } from "@/lib/work/scaffold";
import { useWork } from "@/lib/work/store";
import type { ScaffoldType } from "@/lib/work/types";
import { cn } from "@/lib/utils";

const sel = "mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";
const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmt3 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
const TONE: Record<ScaffoldStatus, "default" | "ok" | "warn" | "crit" | "accent"> = { pending: "warn", rejected: "crit", erection: "accent", standing: "ok", removal: "warn", closed: "default" };

export function WorkScaffolding() {
  const { state, fullState } = useStore();
  const { work, startScaffoldJob, decideScaffoldJob, closeScaffoldJob } = useWork();
  const role = state.currentRole;
  const canStart = role === "sic" || role === "owner" || role === "super_admin" || role === "admin";
  const canDecide = role === "sic" || role === "owner" || role === "super_admin";
  const siteId = state.currentSiteId === ALL_SITES ? entrySiteId(state) : state.currentSiteId;
  const site = fullState.sites.find((x) => x.id === siteId);

  const [plant, setPlant] = useState("");
  const [con, setCon] = useState("");
  const [place, setPlace] = useState<Place>({ location: "" });
  const [type, setType] = useState<ScaffoldType>("standing");
  const [sup, setSup] = useState("");
  // Owner, 2026-11-21: each piece has its own platform (planks / plates), scoped separately
  const [calc, setCalc] = useState<{ l: string; b: string; h: string; e: string; planks: string }[]>([{ l: "", b: "", h: "", e: "1", planks: "" }]);
  const [target, setTarget] = useState("");
  const [purposes, setPurposes] = useState<string[]>([SCAFFOLD_PURPOSES[0]]);
  const [otherWork, setOtherWork] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [why, setWhy] = useState<Record<string, string>>({});

  // Scaffolding supervisors on this site, tagged with a sub-con; owners of sub-cons left out (owner, 2026-11-21)
  const scafSups = fullState.staff.filter((x) => x.role === "supervisor" && x.active !== false && x.supervisorType === "scaffolding" && !x.subconOwner && worksAt(x, siteId));
  const contractors = fullState.masterCatalog.contractors.filter((c) => c.active && scafSups.some((x) => x.contractorId === c.id));
  const onPlant = (c: string) => scafSups.some((x) => x.contractorId === c && (x.plants ?? []).includes(plant));
  const conFirst = contractors.filter((c) => onPlant(c.id));
  const conRest = contractors.filter((c) => !onPlant(c.id));
  const supList = scafSups.filter((x) => x.contractorId === con);
  const supFirst = supList.filter((x) => (x.plants ?? []).includes(plant));
  const supRest = supList.filter((x) => !(x.plants ?? []).includes(plant));
  const untagged = fullState.staff.filter((x) => x.role === "supervisor" && x.active !== false && x.supervisorType === "scaffolding" && !x.subconOwner && !x.contractorId && worksAt(x, siteId));

  // Scope from the MIS bays picked
  const rack = place.rackId ? fullState.plantRacks.find((r) => r.id === place.rackId) : undefined;
  const bayScope = useMemo(() => {
    if (!rack || !place.bayFrom) return 0;
    const a = rack.bays.findIndex((b) => b.label === place.bayFrom);
    const b = place.bayTo ? rack.bays.findIndex((x) => x.label === place.bayTo) : a;
    return rack.bays.slice(Math.min(a, b), Math.max(a, b) + 1).reduce((n, x) => n + (x.m3 ?? 0), 0);
  }, [rack, place.bayFrom, place.bayTo]);
  const pieceM3 = (r: { l: string; b: string; h: string; e: string; planks: string }) => scaffoldVolume(Number(r.l) || 0, Number(r.b) || 0, Number(r.h) || 0, Number(r.e) || 0);
  const scopeM3 = Math.round(calc.reduce((n, r) => n + pieceM3(r), 0) * 1000) / 1000;

  const jobs = (work.scaffoldJobs ?? []).filter((j) => state.currentSiteId === ALL_SITES || j.siteId === state.currentSiteId);
  const rows = jobs
    .map((j) => {
      const p = scaffoldProgress(j, work.reports);
      return { j, p, status: scaffoldStatus(j, p) };
    })
    .sort((a, b) => b.j.createdAt.localeCompare(a.j.createdAt));
  const waiting = rows.filter((r) => r.status === "pending");
  const month = today().slice(0, 7);
  const lines = (work.scaffoldPlanLines ?? []).filter((l) => l.month === month && (state.currentSiteId === ALL_SITES || l.siteId === state.currentSiteId));
  const planM3 = lines.reduce((n, l) => n + l.planM3, 0);
  const live = rows.filter((r) => r.j.approval === "approved");
  const erected = live.reduce((n, r) => n + r.p.erected, 0);
  const removed = live.reduce((n, r) => n + r.p.removed, 0);
  const name = (id: string) => fullState.staff.find((x) => x.id === id)?.name ?? id;
  const firm = (id: string) => fullState.masterCatalog.contractors.find((c) => c.id === id)?.name ?? id;

  const reset = () => { setPlace({ location: "" }); setCalc([{ l: "", b: "", h: "", e: "1", planks: "" }]); };
  const totalPlanks = calc.reduce((n, r) => n + (Number(r.planks) || 0), 0);
  const plat = platformM2(totalPlanks);
  const linePlatform = lines.reduce((n, l) => n + (l.platformM2 ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={`Plan · ${month}`} value={`${fmt(planM3)} m³`} hint={`${lines.length} scaffolding plan lines${linePlatform ? ` · + ${linePlatform.toLocaleString("en-IN")} m² platform` : ""}`} />
        <KpiTile label="Erected (DPRs)" value={`${fmt(erected)} m³`} hint={planM3 ? `${Math.round((erected / planM3) * 100)}% of plan` : undefined} tone="ok" />
        <KpiTile label="Removed (DPRs)" value={`${fmt(removed)} m³`} />
        <KpiTile label="Jobs open" value={String(rows.filter((r) => ["erection", "standing", "removal"].includes(r.status)).length)} hint={waiting.length ? `${waiting.length} waiting for the SIC` : undefined} tone={waiting.length ? "warn" : "default"} />
      </div>

      {canStart ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Start a scaffolding job · {site?.code ?? siteId}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <Label htmlFor="sj-plant">1 · Plant</Label>
              <select id="sj-plant" className={sel} value={plant} onChange={(e) => { setPlant(e.target.value); setPlace({ location: "" }); setSup(""); setMsg(null); }}>
                <option value="">Pick a plant…</option>
                {(site?.plants ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="sj-con">2 · Sub-contractor</Label>
              <select id="sj-con" className={sel} value={con} onChange={(e) => { setCon(e.target.value); setSup(""); }}>
                <option value="">Pick the sub-con…</option>
                {conFirst.length ? <optgroup label={`Work on ${plant}`}>{conFirst.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null}
                {conRest.length ? <optgroup label={conFirst.length ? "Other sub-cons" : "Sub-cons"}>{conRest.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup> : null}
              </select>
            </div>
            <PlacePicker
              className="lg:col-span-2"
              idPrefix="sj"
              siteId={siteId}
              plant={plant}
              value={place}
              onChange={(p) => setPlace(p)}
            />
            <div>
              <span className="mb-1 block text-xs font-medium">5 · Type of scaffolding</span>
              <div className="flex gap-2" role="group" aria-label="Type of scaffolding">
                {SCAFFOLD_TYPES.map((t) => (
                  <button key={t.id} type="button" aria-pressed={type === t.id} onClick={() => setType(t.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", type === t.id ? "border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]" : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="sj-sup">6 · Supervisor (tagged with this sub-con)</Label>
              <select id="sj-sup" className={sel} value={sup} disabled={!con} onChange={(e) => setSup(e.target.value)}>
                <option value="">{con ? "Pick supervisor…" : "Pick the sub-con first"}</option>
                {supFirst.length ? <optgroup label={`On ${plant}`}>{supFirst.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup> : null}
                {supRest.length ? <optgroup label={supFirst.length ? "Also with this sub-con" : "With this sub-con"}>{supRest.map((x) => <option key={x.id} value={x.id}>{x.name}{x.plants?.length ? ` · ${x.plants.join(", ")}` : ""}</option>)}</optgroup> : null}
              </select>
            </div>
            {/* Owner, 2026-11-21: scope from the Scaffold calc — L × B × H × E per piece, summed */}
            <div className="lg:col-span-2">
              <span className="block text-sm font-medium">Job scope · Scaffold calc (L × B × H × E)</span>
              <div className="mt-1 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm [&_td]:px-1.5 [&_td]:py-1 [&_th]:px-1.5 [&_th]:py-1">
                  <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                    <tr><th>Piece</th><th>L (m)</th><th>B (m)</th><th>H (m)</th><th>E (factor)</th><th className="text-right">m³</th><th>Platform planks</th><th className="text-right">Platform m²</th><th /></tr>
                  </thead>
                  <tbody>
                    {calc.map((row, i) => (
                      <tr key={i}>
                        <td className="whitespace-nowrap text-xs text-[var(--sge-ink-3)]">{i + 1}</td>
                        {(["l", "b", "h", "e"] as const).map((k) => (
                          <td key={k}>
                            <Input
                              id={`sj-calc-${i}-${k}`}
                              aria-label={`Piece ${i + 1} ${k.toUpperCase()}`}
                              type="number"
                              min={0}
                              step="any"
                              className="h-8"
                              value={row[k]}
                              onChange={(e) => setCalc(calc.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))}
                            />
                          </td>
                        ))}
                        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{pieceM3(row) ? fmt3(pieceM3(row)) : "—"}</td>
                        <td>
                          <Input
                            id={`sj-calc-${i}-planks`}
                            aria-label={`Piece ${i + 1} platform planks`}
                            type="number"
                            min={0}
                            step={1}
                            className="h-8 w-24"
                            value={row.planks}
                            placeholder="0"
                            onChange={(e) => setCalc(calc.map((r, j) => (j === i ? { ...r, planks: e.target.value.replace(/[^\d]/g, "") } : r)))}
                          />
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{Number(row.planks) ? fmt3(platformM2(Number(row.planks))) : "—"}</td>
                        <td>{calc.length > 1 ? <button type="button" className="text-xs text-[var(--sge-ink-3)] underline" onClick={() => setCalc(calc.filter((_, j) => j !== i))}>Remove</button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                <button type="button" className="font-semibold text-[var(--sge-brass-ink)] underline" onClick={() => setCalc([...calc, { l: "", b: "", h: "", e: "1", planks: "" }])}>+ Add piece</button>
                <span className="font-semibold">Job scope: {scopeM3 ? `${fmt3(scopeM3)} m³` : "—"}{plat ? ` + ${fmt3(plat)} m² platform (${totalPlanks} planks)` : ""}</span>
                {bayScope ? <span className="text-[var(--sge-ink-3)]">MIS scope for these bays: {fmt(bayScope)} m³ (to compare)</span> : null}
              </div>
            </div>
            <p className="text-xs text-[var(--sge-ink-3)] lg:col-span-2">Platform: 1 plank / plate = 2 m × 0.3 m = {PLANK_M2} m². Each piece has its own platform; the job adds them up.</p>
            <div className="flex items-end">
              <div className="w-full rounded-sm bg-[var(--sge-paper-2)] px-3 py-2 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">Overall scope</span>
                <div className="font-semibold tabular-nums">{scopeM3 ? `${fmt3(scopeM3)} m³` : "— m³"}{plat ? ` + ${plat.toLocaleString("en-IN")} m² platform` : ""}</div>
              </div>
            </div>
            <div>
              <Label htmlFor="sj-target">Target date</Label>
              <Input id="sj-target" type="date" className="mt-1" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            {/* Owner, 2026-11-21: several kinds of work; Blasting & painting is always offered first */}
            <div className="lg:col-span-2">
              <span className="block text-sm font-medium">For which work (pick all that apply)</span>
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="For which work">
                {[...SCAFFOLD_PURPOSES, ...purposes.filter((p) => !SCAFFOLD_PURPOSES.includes(p))].map((p) => {
                  const on = purposes.includes(p);
                  return (
                    <button key={p} type="button" aria-pressed={on} onClick={() => setPurposes(on ? purposes.filter((x) => x !== p) : [...purposes, p])} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", on ? "border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]" : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}>
                      {p}
                    </button>
                  );
                })}
                <span className="inline-flex items-center gap-1">
                  <Input id="sj-purpose-other" aria-label="Other work" className="h-8 w-40" value={otherWork} onChange={(e) => setOtherWork(e.target.value)} placeholder="Other work…" />
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--sge-brass-ink)] underline"
                    onClick={() => { const w = otherWork.trim(); if (w && !purposes.includes(w)) setPurposes([...purposes, w]); setOtherWork(""); }}
                  >
                    Add
                  </button>
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--sge-ink-3)]">The permit number goes on the DPR line when the work is reported.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                const r = startScaffoldJob({
                  siteId,
                  plant,
                  contractorId: con,
                  supervisorId: sup,
                  type,
                  location: place.location,
                  ...(place.rackId ? { rackId: place.rackId } : {}),
                  ...(place.bayFrom ? { bayFrom: place.bayFrom } : {}),
                  ...(place.bayTo ? { bayTo: place.bayTo } : {}),
                  scopeM3,
                  scopeCalc: calc.filter((r) => pieceM3(r) > 0 || Number(r.planks) > 0).map((r) => ({ l: Number(r.l) || 0, b: Number(r.b) || 0, h: Number(r.h) || 0, e: Number(r.e) || 0, ...(Number(r.planks) ? { planks: Number(r.planks) } : {}) })),
                  ...(totalPlanks > 0 ? { platformPlanks: totalPlanks } : {}),
                  purposes,
                  purpose: purposes.join(", "),
                  targetDate: target,
                });
                if (!r.ok) return setMsg({ ok: false, text: r.error });
                setMsg({ ok: true, text: r.requested ? "Job saved and sent to the SIC; it joins the plan once approved." : "Job started; the plan line is updated." });
                reset();
              }}
            >
              Start job
            </Button>
            {msg ? <span className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</span> : null}
          </div>
          {untagged.length ? (
            <p className="mt-2 text-xs text-[var(--sge-warn)]">Not shown (no sub-con in HR → Staff): {untagged.map((x) => x.name).join(", ")}.</p>
          ) : null}
        </Panel>
      ) : null}

      {canDecide && waiting.length ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Waiting for the SIC · {waiting.length}</h3>
          <ul className="divide-y divide-[var(--sge-line)]">
            {waiting.map(({ j }) => (
              <li key={j.id} className="flex flex-wrap items-end justify-between gap-2 py-2 text-sm">
                <span className="min-w-0"><b>{j.jobNo}</b> · {j.plant} · {j.location} · {typeLabel(j.type)} · {fmt(j.scopeM3)} m³ · {name(j.supervisorId)} ({firm(j.contractorId)}) <span className="text-xs text-[var(--sge-ink-3)]">by {j.createdBy}</span></span>
                <span className="flex flex-wrap items-center gap-2">
                  <input aria-label="Reason, if rejecting" className="h-8 w-44 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-xs" placeholder="Reason, if rejecting" value={why[j.id] ?? ""} onChange={(e) => setWhy({ ...why, [j.id]: e.target.value })} />
                  <Button size="sm" variant="ghost" onClick={() => { const r = decideScaffoldJob(j.id, false, why[j.id]); if (!r.ok) setMsg({ ok: false, text: r.error }); }}>Reject</Button>
                  <Button size="sm" onClick={() => { const r = decideScaffoldJob(j.id, true); if (!r.ok) setMsg({ ok: false, text: r.error }); }}>Approve</Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Scaffolding jobs</h3>
        {rows.length === 0 ? (
          <EmptyState title="No scaffolding jobs yet" detail="Start one above. Supervisors pick the job on their DPR's scaffold line, and the m³ count against it." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2">
              <thead className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                <tr><th>Job</th><th>Plant</th><th>Where</th><th>Type</th><th>Supervisor · sub-con</th><th className="text-right">Scope</th><th className="text-right">Erected</th><th className="text-right">Removed</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map(({ j, p, status }) => (
                  <tr key={j.id} className="border-t border-[var(--sge-line)] align-top">
                    <td className="whitespace-nowrap font-mono text-xs">{j.jobNo}</td>
                    <td>{j.plant}</td>
                    <td className="max-w-[260px]">{j.location}<div className="text-xs text-[var(--sge-ink-3)]">{j.purpose} · target {j.targetDate}{p.permits.length ? ` · permit ${p.permits.join(", ")}` : " · permit: from the DPR"}</div></td>
                    <td>{typeLabel(j.type)}</td>
                    <td>{name(j.supervisorId)}<div className="text-xs text-[var(--sge-ink-3)]">{firm(j.contractorId)}</div></td>
                    <td className="whitespace-nowrap text-right tabular-nums">{fmt3(j.scopeM3)} m³{j.platformPlanks ? <div className="text-xs text-[var(--sge-ink-3)]">+ {platformM2(j.platformPlanks).toLocaleString("en-IN")} m² platform ({j.platformPlanks} planks)</div> : null}
                      {(j.scopeCalc?.length ?? 0) > 1 ? (
                        <div className="mt-1 space-y-0.5 text-[11px] text-[var(--sge-ink-3)]">
                          {j.scopeCalc!.map((c, i) => (
                            <div key={i}>Piece {i + 1}: {fmt3(scaffoldVolume(c.l, c.b, c.h, c.e))} m³{c.planks ? ` + ${fmt3(platformM2(c.planks))} m²` : ""}</div>
                          ))}
                        </div>
                      ) : null}</td>
                    <td className="text-right tabular-nums">{fmt(p.erected)}</td>
                    <td className="text-right tabular-nums">{fmt(p.removed)}</td>
                    <td><StatusPill tone={TONE[status]}>{STATUS_LABEL[status]}</StatusPill>{j.approvalNote ? <div className="text-xs text-[var(--sge-ink-3)]">{j.approvalNote}</div> : null}</td>
                    <td className="whitespace-nowrap text-right">
                      {canStart && (status === "standing" || status === "removal" || status === "erection") ? <Button size="sm" variant="ghost" onClick={() => closeScaffoldJob(j.id, true)}>Close</Button> : null}
                      {canStart && status === "closed" ? <Button size="sm" variant="ghost" onClick={() => closeScaffoldJob(j.id, false)}>Reopen</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
