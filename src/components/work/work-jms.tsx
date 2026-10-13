"use client";

import { useState } from "react";
import { formatINR, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { monthLabel, nextJmsStatuses, warnLevel, woUsage, woWarnings } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";
import type { JmsStatus } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, fmtPct, selectCls, tdCls, thCls, useWorkScope } from "./common";


export function WorkJms() {
  const { setJmsStatus } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const months = [...new Set(work.planLines.map((l) => l.month))].sort();
  const [month, setMonth] = useState<string>("all");
  const [msg, setMsg] = useState<string | null>(null);
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
      {msg ? <p className="text-xs text-[var(--sge-ink-2)]">{msg}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="JMS" value={String(rows.length)} />
        <KpiTile label="Quantity" value={`${fmtM2(Math.round(qty))} m²`} tone="ok" />
        <KpiTile
          label="Value"
          value={formatINR(amt)}
          tone="accent"
          hint={rows.some((j) => j.ratePending) ? `Includes ${formatINR(rows.filter((j) => j.ratePending).reduce((t, j) => t + j.amount, 0))} at placeholder rates` : undefined}
        />
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
                    <td className={tdCls + " text-right tabular-nums"}>
                      {j.rate}
                      {j.ratePending ? <div><StatusPill tone="warn">rate pending</StatusPill></div> : null}
                    </td>
                    <td className={tdCls + " text-right tabular-nums"}>{formatINR(j.amount)}</td>
                    <td className={tdCls}>
                      <StatusPill tone={j.status === "PAID" ? "ok" : "accent"}>{j.status}</StatusPill>
                      {j.submissionId ? (
                        <div className="mt-0.5 text-[10px] text-[var(--sge-ink-3)]">RIL {work.submissions.find((x) => x.id === j.submissionId)?.rilJmsNo} · status from the upload</div>
                      ) : (
                        <div className="mt-0.5 text-[10px] text-[var(--sge-warn)]">not submitted to RIL yet</div>
                      )}
                      {s.canConfirm && nextJmsStatuses(j.status, s.isBoss).length ? (
                        // Only the next RIL stage (Owner / Super Admin may also step back one); PAID comes from Payments
                        <select
                          aria-label={`Move JMS ${j.jmsNo} to`}
                          className={selectCls + " mt-1 h-8 w-44 text-xs"}
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const r = setJmsStatus(j.id, e.target.value as JmsStatus);
                            setMsg(r.ok ? `JMS ${j.jmsNo} moved to ${e.target.value}.` : r.error);
                          }}
                        >
                          <option value="">Move to…</option>
                          {nextJmsStatuses(j.status, s.isBoss).map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      ) : null}
                      {j.statusLog && j.statusLog.length > 1 ? (
                        <div className="mt-0.5 text-[10px] text-[var(--sge-ink-3)]">
                          last: {j.statusLog[j.statusLog.length - 1].by} · {j.statusLog[j.statusLog.length - 1].at.slice(0, 10)}
                        </div>
                      ) : null}
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
        // The WO is judged on overall m² and ₹ cap; single items are listed separately
        const warn = woWarnings(u);
        return (
          <Panel key={wo.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-heading text-lg font-bold tracking-wide">WO {wo.woNo}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  FO {wo.foNo} · {s.siteCode(wo.siteId)} · valid {wo.validFrom} → {wo.validTo}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {warn.wo !== "ok" ? (
                  <StatusPill tone={warn.wo === "crit" ? "crit" : "warn"}>
                    {warn.wo === "crit" ? "95% used — request new WO" : "80% used — plan new WO"}
                  </StatusPill>
                ) : <StatusPill tone="ok">Healthy</StatusPill>}
                {warn.items.length ? (
                  <StatusPill tone={warn.items.some((i) => i.level === "crit") ? "crit" : "warn"}>
                    {warn.items.length} item{warn.items.length === 1 ? "" : "s"} over {warn.items.some((i) => i.level === "crit") ? "95" : "80"}%
                  </StatusPill>
                ) : null}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Bar label="Quantity" used={`${fmtM2(Math.round(u.usedM2))} m²`} total={`${fmtM2(u.scopeM2)} m²`} pct={u.m2Pct} />
              <Bar label="Value (cap)" used={formatINR(u.billed)} total={formatINR(wo.capInr)} pct={u.capPct} />
              {u.billedEstimate > 0 ? (
                <p className="text-[11px] text-[var(--sge-ink-3)] sm:col-span-2">
                  {formatINR(u.billedEstimate)} of the billed value is at placeholder rates (ARC list pending).
                </p>
              ) : null}
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
