"use client";

import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { showDate } from "@/lib/gate-pass";
import { daysUntil } from "@/lib/gate-pass";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";

/**
 * Safety's site view (round 2, §27): permits and toolbox talks on every DPR of a
 * day, PPE / harness expiry, and who is on which crew. Read only.
 */
export function SafetySiteView() {
  const { state } = useStore();
  const { work } = useWork();
  const [day, setDay] = useState(today());
  const sites = new Set(state.sites.map((s) => s.id));
  const name = (id: string) => state.staff.find((s) => s.id === id)?.name ?? state.labourers.find((l) => l.id === id)?.name ?? id;

  const dprs = work.reports
    .filter((r) => r.date === day && sites.has(r.siteId) && r.submitterType !== "safety")
    .sort((a, b) => Number(!!a.permitOk && !!a.tbtDone) - Number(!!b.permitOk && !!b.tbtDone));
  const missing = dprs.filter((r) => !r.permitOk || !r.tbtDone).length;

  const kit = state.equipment
    .filter((e) => e.expiryDate)
    .map((e) => ({ e, days: daysUntil(e.expiryDate!, today()) }))
    .sort((a, b) => a.days - b.days);
  const due = kit.filter((k) => k.days <= 30);

  const sups = state.staff.filter((s) => s.role === "supervisor" && sites.has(s.siteId) && s.active !== false);
  const crewOf = (id: string) => state.labourers.filter((l) => l.active && l.supervisorId === id);

  return (
    <div className="space-y-4">
      <SectionHeader title="Site safety view" subtitle="Permits and toolbox talks on the day's DPRs, PPE and harness expiry, and the crews. Read only." />

      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="font-heading text-sm font-bold">Permits &amp; TBT</h3>
          <Input type="date" aria-label="Day" className="h-8 w-40" max={today()} value={day} onChange={(e) => setDay(e.target.value)} />
          {missing ? <StatusPill tone="crit">{missing} without permit / TBT</StatusPill> : dprs.length ? <StatusPill tone="ok">all confirmed</StatusPill> : null}
        </div>
        {dprs.length === 0 ? (
          <EmptyState title="No DPRs that day" detail="DPRs appear here as supervisors save or submit them." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr><th className="py-1">Supervisor</th><th>Plant</th><th>Crew</th><th>Permit</th><th>TBT</th><th>DPR</th></tr>
            </thead>
            <tbody>
              {dprs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5">{name(r.submitterId)}</td>
                  <td>{r.plant || "—"}</td>
                  <td>{r.labourMarks.length}</td>
                  <td><StatusPill tone={r.permitOk ? "ok" : "crit"}>{r.permitOk ? "yes" : "no"}</StatusPill></td>
                  <td><StatusPill tone={r.tbtDone ? "ok" : "crit"}>{r.tbtDone ? "yes" : "no"}</StatusPill></td>
                  <td className="text-xs text-[var(--sge-ink-3)]">{r.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="font-heading text-sm font-bold">PPE &amp; harness expiry</h3>
          {due.length ? <StatusPill tone="warn">{due.length} expired or within 30 days</StatusPill> : null}
        </div>
        {kit.length === 0 ? (
          <EmptyState title="No expiry dates" detail="Equipment with an expiry date shows here." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr><th className="py-1">Item</th><th>Type</th><th>Expiry</th><th>Left</th><th>With</th></tr>
            </thead>
            <tbody>
              {kit.slice(0, 60).map(({ e, days }) => (
                <tr key={e.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5 font-mono text-xs">{e.tag}</td>
                  <td>{e.type}</td>
                  <td className="font-mono text-xs">{showDate(e.expiryDate)}</td>
                  <td><StatusPill tone={days < 0 ? "crit" : days <= 30 ? "warn" : "ok"}>{days < 0 ? `expired ${-days} d` : `${days} d`}</StatusPill></td>
                  <td className="text-[var(--sge-ink-2)]">{e.assignedTo ? name(e.assignedTo) : "store"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Crews</h3>
        {sups.length === 0 ? (
          <EmptyState title="No supervisors on this site" detail="Switch site to see other crews." />
        ) : (
          <div className="space-y-2">
            {sups.map((s) => {
              const crew = crewOf(s.id);
              return (
                <details key={s.id} className="rounded-md border border-[var(--sge-line)] px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold">
                    {s.name} <span className="font-normal text-[var(--sge-ink-3)]">· {crew.length} on crew</span>
                  </summary>
                  <div className="mt-2 grid gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {crew.map((l) => (
                      <span key={l.id}>
                        {l.name} <span className="font-mono text-xs text-[var(--sge-ink-3)]">{l.epNumber}</span>
                      </span>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
