"use client";

import Link from "next/link";
import { formatINR, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { paymentRows, paymentSummary, perUnit, pnlRows, rollUp, worstPayments } from "@/lib/work/logic";
import { today } from "@/lib/today";
import { useWorkScope } from "./common";

/** Dashboard card: SIC-approved vs received in bank, plus the P&L headline. */
export function MoneyCard() {
  const s = useWorkScope();
  const { work } = s;
  const rows = paymentRows(work.jms.filter((j) => s.lineIds.has(j.planLineId)), today());
  const sum = paymentSummary(rows);
  // Biggest shortfalls first, then the longest unpaid
  const worst = worstPayments(rows, 4);
  const pnl = rollUp(pnlRows(work, s.wageOf).filter((r) => s.inSite(r.siteId)), () => "all")[0];
  // Cash basis per m² uses the m² that has been paid for
  const perM2 = pnl ? perUnit(pnl.profit, pnl.paidQty) : null;

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide">Approved vs received</h3>
        <div className="flex gap-2">
          <Link href="/work?t=payments"><Button size="sm" variant="outline">Payments</Button></Link>
          <Link href="/work?t=pnl"><Button size="sm">P&amp;L</Button></Link>
        </div>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <Fig label="SIC approved" value={formatINR(sum.approved)} />
        <Fig label="Received" value={formatINR(sum.received)} />
        <Fig label="Gap on paid" value={formatINR(sum.gap)} tone={sum.gap < -0.5 ? "crit" : undefined} />
        <Fig label="Not yet received" value={`${formatINR(sum.unpaidValue)} · ${sum.unpaidCount}`} tone="warn" />
        <Fig label="Avg days to pay" value={`${sum.avgDays} d`} />
      </div>
      {pnl ? (
        <p className="mt-3 text-xs text-[var(--sge-ink-2)]">
          P&amp;L (cash basis): <b className={pnl.profit < 0 ? "text-[var(--sge-crit)]" : "text-[var(--sge-ok)]"}>{formatINR(Math.round(pnl.profit))}</b>
          {perM2 != null ? <> · {formatINR(Math.round(perM2))} per m²</> : null} · earned basis {formatINR(Math.round(pnl.earnedProfit))}
        </p>
      ) : null}
      {worst.length ? (
        <ul className="mt-3 space-y-1 text-xs">
          {worst.map((r) => (
            <li key={r.jms.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[var(--sge-line)] px-2.5 py-1.5">
              <span>
                JMS <b className="font-mono">{r.jms.jmsNo}</b> · {s.line(r.jms.planLineId)?.plant}
              </span>
              {r.gap != null ? (
                <StatusPill tone="crit">{formatINR(r.gap)}</StatusPill>
              ) : (
                <StatusPill tone="warn">{r.waiting} days unpaid</StatusPill>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: "crit" | "warn" }) {
  return (
    <div className="rounded-sm bg-[var(--sge-paper-2)] px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-3)]">{label}</div>
      <div className={"mt-0.5 font-heading text-base tabular-nums " + (tone === "crit" ? "text-[var(--sge-crit)]" : tone === "warn" ? "text-[var(--sge-warn)]" : "")}>{value}</div>
    </div>
  );
}
