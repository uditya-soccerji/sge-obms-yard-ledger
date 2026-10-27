"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtM2, selectCls } from "@/components/work/common";
import { useStore } from "@/lib/store";
import { memberArea, round3, validMembers } from "@/lib/work/logic";
import { STAGES, type DprReport, type Member, type Stage } from "@/lib/work/types";
import { mpsKey, normFor, type Method } from "@/lib/mps-norms";
import { NormLine } from "@/components/work/work-jobs";
import { useWork } from "@/lib/work/store";

const blankMember = (): Member => ({ name: "", nos: 1, side: 1, length: 0, cf: 0 });

/**
 * Admin DPR (2026-10-27): pick the work straight from the month's plan — no job needed —
 * and save the line. It counts as progress on that plan line; a job can be attached later.
 * `ensureSaved` saves the DPR draft first if it isn't saved yet.
 */
export function PlanWorkLineForm({
  report,
  ensureSaved,
  onDone,
}: {
  report: DprReport;
  ensureSaved: () => { ok: boolean; error?: string; doc?: DprReport };
  onDone: (m: { ok: boolean; msg: string }) => void;
}) {
  const { state } = useStore();
  const { work, addPlanEntry } = useWork();
  const month = report.date.slice(0, 7);
  // Every plan line on the DPR's site for that month — any plant, any supervisor
  const lines = work.planLines
    .filter((l) => l.siteId === report.siteId && l.month === month)
    .sort((a, b) => a.plant.localeCompare(b.plant) || a.serviceCode.localeCompare(b.serviceCode));
  const staffName = (id: string) => state.staff.find((x) => x.id === id)?.name ?? id;
  const [lineId, setLineId] = useState("");
  const line = lines.find((l) => l.id === lineId);
  const item = line ? work.serviceItems.find((x) => x.code === line.serviceCode) : undefined;
  const [stage, setStage] = useState<Stage>("prep");
  const [members, setMembers] = useState<Member[]>([blankMember()]);
  const [paintSap, setPaintSap] = useState("");
  const [litres, setLitres] = useState("");
  const [dft, setDft] = useState("");
  const [crew, setCrew] = useState<string[]>([]);
  const [method, setMethod] = useState<Method>("brush");
  const [err, setErr] = useState<string | null>(null);
  const roster = line ? state.labourers.filter((l) => l.active && l.supervisorId === line.supervisorId) : [];
  const area = round3(validMembers(members).members.reduce((t, m) => t + m.nos * m.side * m.length * m.cf, 0));
  // 2026-10-27: the RIL MPS norm for this work's MPS, the stage's coat and brush / spray
  const mpsNorm = normFor(item?.mps, stage, method);
  const norm = mpsNorm?.norm ?? item?.paints.find((p) => p.sap === (paintSap || item?.paints[0]?.sap))?.normL ?? 0;
  const expected = round3(area * norm);
  const lit = Number(litres) || 0;
  const off = expected > 0 && lit > 0 ? lit / expected - 1 : 0;
  const set = (i: number, k: keyof Member, v: string) => setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, [k]: k === "name" ? v : Number(v) } : m)));

  if (!lines.length) {
    return <p className="text-xs text-[var(--sge-ink-3)]">No plan lines on this site for {month} yet — add them in Work → Plan.</p>;
  }

  return (
    <form
      className="space-y-3 rounded-sm border border-[var(--sge-brass)]/40 bg-[var(--sge-brass-wash)]/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!line) return setErr("Pick the work from the plan");
        const rows = validMembers(members);
        if (rows.error) return setErr(rows.error);
        const saved = ensureSaved();
        if (!saved.ok) return setErr(saved.error ?? "Couldn't save the DPR");
        const lit = Number(litres) || 0;
        const r = addPlanEntry({ date: report.date, planLineId: line.id, reportId: report.id, stage, members, paintSap: lit > 0 ? paintSap || item?.paints[0]?.sap : undefined, litres: lit, dft: Number(dft) || undefined, crew, method, draft: saved.doc });
        if (!r.ok) return setErr(r.error);
        setErr(null);
        setMembers([blankMember()]);
        setLitres("");
        setDft("");
        onDone({ ok: true, msg: `Saved: ${fmtM2(area)} m² ${STAGES.find((x) => x.id === stage)?.label} on ${line.plant} · ${line.serviceCode} (from the plan, no job).` });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Label>Work from the {month} plan</Label>
          <select
            className={selectCls + " mt-1"}
            value={lineId}
            onChange={(e) => {
              setLineId(e.target.value);
              setCrew([]);
              setPaintSap("");
            }}
          >
            <option value="">Pick the work…</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.plant} · {l.serviceCode} · {l.jobType} · {staffName(l.supervisorId)} · plan {round3(l.planM2 + l.carriedM2)} m²
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Stage</Label>
          <select className={selectCls + " mt-1"} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            {STAGES.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
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
                  <td className="py-0.5 pr-1"><Input className="h-8" aria-label={`Member ${i + 1}`} value={m.name} placeholder="e.g. ISMB 350 X 140" onChange={(e) => set(i, "name", e.target.value)} /></td>
                  {(["nos", "side", "length", "cf"] as const).map((k) => (
                    <td key={k} className="py-0.5 pr-1"><Input className="h-8" aria-label={`${k.toUpperCase()} row ${i + 1}`} type="number" min="0" step="any" value={m[k] || ""} onChange={(e) => set(i, k, e.target.value)} /></td>
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
        <div className="mt-1 flex items-center justify-between text-xs">
          <Button type="button" size="sm" variant="ghost" onClick={() => setMembers((ms) => [...ms, blankMember()])}>+ Add row</Button>
          <span>Total <b className="font-mono">{fmtM2(area)} m²</b></span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label>Paint used</Label>
          <select className={selectCls + " mt-1"} value={paintSap || item?.paints[0]?.sap || ""} onChange={(e) => setPaintSap(e.target.value)} disabled={!item?.paints.length}>
            {item?.paints.length ? item.paints.map((p) => <option key={p.sap} value={p.sap}>{p.name} · {p.sap} · norm {p.normL} L/m²</option>) : <option value="">No paint on this item</option>}
          </select>
        </div>
        <div>
          <Label>Litres</Label>
          <Input aria-label="Litres" className="mt-1" type="number" min="0" step="any" value={litres} onChange={(e) => setLitres(e.target.value)} />
          {stage !== "prep" ? <NormLine area={area} expected={expected} lit={lit} off={off} norm={norm} source={mpsNorm ? `${mpsKey(item?.mps)} ${mpsNorm.coat.coat} coat, ${method}` : "service item"} /> : null}
        </div>
        <div>
          <Label>Applied by</Label>
          <select aria-label="Applied by" className={selectCls + " mt-1"} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            <option value="brush">Brush / roller</option>
            <option value="spray">Spray</option>
          </select>
        </div>
        <div>
          <Label>Actual DFT (µm)</Label>
          <Input className="mt-1" type="number" min="0" step="any" value={dft} placeholder="at final shade" onChange={(e) => setDft(e.target.value)} />
        </div>
      </div>

      {line ? (
        <div>
          <Label>Crew on this work ({staffName(line.supervisorId)}&apos;s labourers)</Label>
          {roster.length === 0 ? (
            <p className="mt-1 text-xs text-[var(--sge-ink-3)]">No labourers on this supervisor&apos;s crew.</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {roster.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={crew.includes(l.id)} onChange={(e) => setCrew((c) => (e.target.checked ? [...c, l.id] : c.filter((x) => x !== l.id)))} />
                  {l.name}
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {err ? <p className="text-xs text-[var(--sge-crit)]">{err}</p> : null}
      <Button type="submit" size="sm">Save work line</Button>
    </form>
  );
}
