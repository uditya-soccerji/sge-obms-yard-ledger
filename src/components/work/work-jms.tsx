"use client";

import { useState } from "react";
import { formatINR, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { monthLabel, warnLevel, woUsage } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";
import type { JmsStatus } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, fmtPct, selectCls, tdCls, thCls, useWorkScope } from "./common";

const JMS_FLOW: JmsStatus[] = ["JMS SUBMITTED", "QSD APR", "A1 APR", "A2 APR", "A3 APR", "INVOICE UPLOADED", "PAID"];

export function WorkJms() {
  const { setJmsStatus } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const months = [...new Set(work.planLines.map((l) => l.month))].sort();
  const [month, setMonth] = useState<string>("all");
  const rows = work.jms
    .filter((j) => s.lineIds.has(j.planLineId))
    .filter((j) => month === "all" || s.line(j.planLineId)?.month === month)
    .sort((a, b) => b.jmsNo.localeCompare(a.jmsNo));
  const qty = rows.reduce((t, j) => t + j.qty, 0);
  const amt = rows.reduce((t, j) => t + j.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Plan month</div>
          <select className={selectCls + " mt-1 w-44"} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <p className="max-w-xl text-xs text-[var(--sge-ink-3)]">
          A JMS is created when SIC confirms a closed job. Its quantity is the job&apos;s final-shade m²; amount = qty × WO rate.
          Status here mirrors the RIL flow and will be updated from the JMS detail-book upload.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="JMS" value={String(rows.length)} />
        <KpiTile label="Quantity" value={`${fmtM2(Math.round(qty))} m²`} tone="ok" />
        <KpiTile label="Value" value={formatINR(amt)} tone="accent" />
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>JMS no.</th>
                <th className={thCls}>Job</th>
                <th className={thCls}>Plant · service</th>
                <th className={thCls}>Period</th>
                <th className={thCls + " text-right"}>Qty m²</th>
                <th className={thCls + " text-right"}>Rate</th>
                <th className={thCls + " text-right"}>Amount</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const job = work.jobs.find((x) => x.id === j.jobId);
                const line = s.line(j.planLineId);
                const it = s.item(j.serviceCode);
                return (
                  <tr key={j.id} className="border-b border-[var(--sge-line)]">
                    <td className={tdCls + " font-mono font-semibold"}>{j.jmsNo}</td>
                    <td className={tdCls + " text-xs"}>
                      {job?.jobNo}
                      <div className="text-[var(--sge-ink-3)]">{job?.location}</div>
                    </td>
                    <td className={tdCls + " text-xs"}>
                      <b>{line?.plant}</b> · {it?.mps}
                      <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{j.serviceCode}</div>
                    </td>
                    <td className={tdCls + " text-xs"}>{j.periodFrom} → {j.periodTo}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtM2(j.qty)}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{j.rate}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{formatINR(j.amount)}</td>
                    <td className={tdCls}>
                      {s.canConfirm ? (
                        <select className={selectCls + " h-8 w-40 text-xs"} value={j.status} onChange={(e) => setJmsStatus(j.id, e.target.value as JmsStatus)}>
                          {JMS_FLOW.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      ) : (
                        <StatusPill tone={j.status === "PAID" ? "ok" : "accent"}>{j.status}</StatusPill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function WorkOrders() {
  const s = useWorkScope();
  const wos = s.work.workOrders.filter((w) => s.inSite(w.siteId));
  if (wos.length === 0) return <p className="text-sm text-[var(--sge-ink-3)]">No work order for this site yet.</p>;
  return (
    <div className="space-y-4">
      {wos.map((wo) => {
        const u = woUsage(wo.id, s.work)!;
        // Worst of: overall m², ₹ cap, or any single service item
        const lvM2 = warnLevel(Math.max(u.m2Pct, ...u.items.map((i) => i.pct)));
        const lvInr = warnLevel(u.capPct);
        return (
          <Panel key={wo.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-heading text-lg font-bold tracking-wide">WO {wo.woNo}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  FO {wo.foNo} · {s.siteCode(wo.siteId)} · valid {wo.validFrom} → {wo.validTo}
                </div>
              </div>
              {lvM2 !== "ok" || lvInr !== "ok" ? (
                <StatusPill tone={lvM2 === "crit" || lvInr === "crit" ? "crit" : "warn"}>
                  {lvM2 === "crit" || lvInr === "crit" ? "95% used — request new WO" : "80% used — plan new WO"}
                </StatusPill>
              ) : <StatusPill tone="ok">Healthy</StatusPill>}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Bar label="Quantity" used={`${fmtM2(Math.round(u.usedM2))} m²`} total={`${fmtM2(u.scopeM2)} m²`} pct={u.m2Pct} />
              <Bar label="Value (cap)" used={formatINR(u.billed)} total={formatINR(wo.capInr)} pct={u.capPct} />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--sge-line)]">
                    <th className={thCls}>Service item</th>
                    <th className={thCls + " text-right"}>Scope m²</th>
                    <th className={thCls + " text-right"}>Used (JMS)</th>
                    <th className={thCls + " text-right"}>Balance</th>
                    <th className={thCls}>Used %</th>
                  </tr>
                </thead>
                <tbody>
                  {u.items.map((i) => {
                    const it = s.item(i.code);
                    const lv = warnLevel(i.pct);
                    return (
                      <tr key={i.code} className="border-b border-[var(--sge-line)]">
                        <td className={tdCls}>
                          <b>{it?.mps}</b> · {it?.description}
                          <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{i.code} · ₹{it?.rate}{it?.ratePending ? " (pending)" : ""}</div>
                        </td>
                        <td className={tdCls + " text-right tabular-nums"}>{fmtM2(i.scope)}</td>
                        <td className={tdCls + " text-right tabular-nums"}>{fmtM2(i.used)}</td>
                        <td className={tdCls + " text-right font-semibold tabular-nums"}>{fmtM2(i.balance)}</td>
                        <td className={tdCls}>
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-28 overflow-hidden rounded-sm bg-[var(--sge-paper-2)]">
                              <div className={cn("h-full", lv === "crit" ? "bg-[var(--sge-crit)]" : lv === "warn" ? "bg-[var(--sge-brass)]" : "bg-[var(--sge-ok)]")} style={{ width: `${Math.min(100, i.pct * 100)}%` }} />
                            </div>
                            <span className="font-mono text-xs">{fmtPct(i.pct)}</span>
                            {lv !== "ok" ? <StatusPill tone={lv === "crit" ? "crit" : "warn"}>{lv === "crit" ? "95%+" : "80%+"}</StatusPill> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

function Bar({ label, used, total, pct }: { label: string; used: string; total: string; pct: number }) {
  const lv = warnLevel(pct);
  return (
    <div className="rounded-sm border border-[var(--sge-line)] p-3">
      <div className="flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-3)]">
        <span>{label}</span>
        <span>{fmtPct(pct)} used</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-sm bg-[var(--sge-paper-2)]">
        <div className={cn("h-full", lv === "crit" ? "bg-[var(--sge-crit)]" : lv === "warn" ? "bg-[var(--sge-brass)]" : "bg-[var(--sge-ok)]")} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
      <div className="mt-1.5 text-xs">
        <b className="tabular-nums">{used}</b> of {total}
      </div>
    </div>
  );
}
