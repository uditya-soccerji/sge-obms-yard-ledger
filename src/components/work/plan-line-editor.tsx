"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlanLine, WorkState } from "@/lib/work/types";
import { useWork } from "@/lib/work/store";
import { selectCls } from "./common";

/**
 * 2026-10-27: change one plan line in place (Admin / SIC / Owner / SA, open month).
 * Plant and service item lock once jobs, work lines or JMS are on the line.
 */
export function PlanLineEditor({
  line,
  plants,
  supervisors,
  serviceItems,
  onDone,
}: {
  line: PlanLine;
  plants: string[];
  supervisors: { id: string; name: string }[];
  serviceItems: WorkState["serviceItems"];
  onDone: (m: { ok: boolean; msg: string } | null) => void;
}) {
  const { work, updatePlanLine, removePlanLine } = useWork();
  const used = work.jobs.some((j) => j.planLineId === line.id) || work.jms.some((j) => j.planLineId === line.id) || work.dprs.some((e) => !e.jobId && e.planLineId === line.id);
  const [plant, setPlant] = useState(line.plant);
  const [serviceCode, setServiceCode] = useState(line.serviceCode);
  const [planM2, setPlanM2] = useState(String(line.planM2));
  const [supervisorId, setSupervisorId] = useState(line.supervisorId);
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 rounded-sm border border-[var(--sge-brass)]/40 bg-[var(--sge-brass-wash)]/40 p-3 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        const it = serviceItems.find((x) => x.code === serviceCode);
        // The job name follows the service item only when the item itself changes
        const jobType = serviceCode !== line.serviceCode ? it?.description.replace(/^APLY\s*/i, "") ?? line.jobType : line.jobType;
        const r = updatePlanLine(line.id, { plant, serviceCode, jobType, planM2: Number(planM2), supervisorId });
        if (!r.ok) return setErr(r.error);
        onDone({ ok: true, msg: `Plan line saved: ${plant} · ${serviceCode}.` });
      }}
    >
      <div>
        <Label>Plant</Label>
        <select aria-label="Plant" className={selectCls + " mt-1"} value={plant} disabled={used} onChange={(e) => setPlant(e.target.value)}>
          {(plants.includes(line.plant) ? plants : [line.plant, ...plants]).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      <div className="lg:col-span-2">
        <Label>Service item</Label>
        <select aria-label="Service item" className={selectCls + " mt-1"} value={serviceCode} disabled={used} onChange={(e) => setServiceCode(e.target.value)}>
          {serviceItems.map((x) => <option key={x.code} value={x.code}>{x.mps} · {x.description}</option>)}
        </select>
      </div>
      <div>
        <Label>Plan m² (new this month{line.carriedM2 > 0 ? ` · +${line.carriedM2} carried` : ""})</Label>
        <Input aria-label="Plan m²" className="mt-1" type="number" min="0" step="any" value={planM2} onChange={(e) => setPlanM2(e.target.value)} />
      </div>
      <div>
        <Label>Supervisor</Label>
        <select aria-label="Supervisor" className={selectCls + " mt-1"} value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
          {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      {used ? <p className="text-xs text-[var(--sge-ink-3)] lg:col-span-5">Jobs or work lines are on this line, so the plant and service item stay as they are.</p> : null}
      {err ? <p className="text-xs text-[var(--sge-crit)] lg:col-span-5">{err}</p> : null}
      <div className="flex flex-wrap gap-2 lg:col-span-5">
        <Button type="submit" size="sm">Save changes</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => onDone(null)}>Cancel</Button>
        {!used && line.carriedM2 === 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-[var(--sge-crit)]"
            onClick={() => {
              if (!window.confirm(`Remove the plan line ${line.plant} · ${line.serviceCode} (${line.planM2} m²)?`)) return;
              const r = removePlanLine(line.id);
              if (!r.ok) return setErr(r.error);
              onDone({ ok: true, msg: `Plan line removed: ${line.plant} · ${line.serviceCode}.` });
            }}
          >
            Remove line
          </Button>
        ) : null}
      </div>
    </form>
  );
}
