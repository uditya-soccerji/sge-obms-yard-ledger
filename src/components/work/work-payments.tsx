"use client";

import { useState } from "react";
import { formatINR, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { monthLabel, paymentRows, paymentSummary, type PaymentRow } from "@/lib/work/logic";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";
import type { JmsPayment } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";
import { WorkExcelTransfer } from "./work-excel-transfer";

const REASONS: { id: NonNullable<JmsPayment["reason"]>; label: string }[] = [
  { id: "deduction", label: "Deduction" },
  { id: "recovery", label: "Recovery" },
  { id: "short_paid", label: "Short-paid" },
  { id: "rate_change", label: "Rate change" },
  { id: "other", label: "Other" },
];
const reasonLabel = (r?: string) => REASONS.find((x) => x.id === r)?.label ?? "—";

type Filter = "all" | "diff" | "unpaid" | "full";

/** Approved (SIC) vs received (bank) for every JMS — docs §18. */
export function WorkPayments() {
  const s = useWorkScope();
  const { work } = s;
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  // docs §24: Finance sees a JMS once the Admin has entered its number and amount
  const all = paymentRows(
    work.jms.filter((j) => s.lineIds.has(j.planLineId) && j.adminStatus !== "pending_admin").map((j) => (j.rilJmsNo ? { ...j, jmsNo: j.rilJmsNo } : j)),
    today()
  );
  const sum = paymentSummary(all);
  const rows = all
    .filter((r) =>
      filter === "diff" ? (r.gap ?? 0) <= -1 || (r.gap ?? 0) >= 1 : filter === "unpaid" ? r.received == null : filter === "full" ? r.received != null && Math.abs(r.gap ?? 0) < 1 : true
    )
    .sort((a, b) => (a.received == null ? -1 : 0) - (b.received == null ? -1 : 0) || (a.gap ?? 0) - (b.gap ?? 0));

  return (
    <div className="space-y-4">
      <WorkExcelTransfer kind="payments" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile
          label="Approved by SIC"
          value={formatINR(sum.approved)}
          hint={sum.approvedEstimate > 0 ? `${all.length} JMS · ${formatINR(sum.approvedEstimate)} at placeholder rates` : `${all.length} JMS`}
        />
        <KpiTile label="Received in bank" value={formatINR(sum.received)} tone="ok" hint={`${all.length - sum.unpaidCount} paid`} />
        <KpiTile label="Gap on paid JMS" value={formatINR(sum.gap)} tone={sum.gap < -0.5 ? "crit" : "default"} hint={`${sum.shortCount} short`} />
        <KpiTile label="Approved, not yet received" value={formatINR(sum.unpaidValue)} tone="warn" hint={`${sum.unpaidCount} JMS`} />
        <KpiTile label="Avg days to payment" value={`${sum.avgDays} d`} hint="SIC approval → bank" />
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["all", "All"],
            ["diff", "Amount differs"],
            ["unpaid", "Not received"],
            ["full", "Paid in full"],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]",
              filter === id ? "bg-[var(--sge-night)] text-white" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Msg text={msg} />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>JMS</th>
                <th className={thCls}>Plant · service</th>
                <th className={thCls}>SIC approved</th>
                <th className={thCls + " text-right"}>Approved ₹</th>
                <th className={thCls + " text-right"}>Received ₹</th>
                <th className={thCls + " text-right"}>Difference</th>
                <th className={thCls + " text-right"}>Days</th>
                <th className={thCls}>Reason</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <PayRow key={r.jms.id} r={r} editing={editing === r.jms.id} onEdit={(on) => setEditing(on ? r.jms.id : null)} onMsg={setMsg} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function PayRow({
  r,
  editing,
  onEdit,
  onMsg,
}: {
  r: PaymentRow;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onMsg: (m: { ok: boolean; msg: string }) => void;
}) {
  const { recordPayment } = useWork();
  const s = useWorkScope();
  const line = s.line(r.jms.planLineId);
  const it = s.item(r.jms.serviceCode);
  const [on, setOn] = useState(r.jms.payment?.receivedOn ?? today());
  const [amt, setAmt] = useState(String(r.jms.payment?.amount ?? r.jms.amount));
  const [reason, setReason] = useState<JmsPayment["reason"] | "">(r.jms.payment?.reason ?? "");
  const [note, setNote] = useState(r.jms.payment?.note ?? "");
  const [clearing, setClearing] = useState<string | null>(null);
  const diff = (Number(amt) || 0) - r.jms.amount;

  return (
    <>
      <tr className="border-b border-[var(--sge-line)]">
        <td className={tdCls + " font-mono font-semibold"}>
          {r.jms.jmsNo}
          <div className="font-sans text-[10px] font-normal text-[var(--sge-ink-3)]">{fmtM2(r.jms.qty)} m² · {line ? monthLabel(line.month) : ""}</div>
        </td>
        <td className={tdCls + " text-xs"}>
          <b>{line?.plant}</b> · {it?.mps}
          {r.jms.ratePending ? <span className="ml-1"><StatusPill tone="warn">rate pending</StatusPill></span> : null}
          {s.allSites && line ? <div className="text-[10px] text-[var(--sge-ink-3)]">{s.siteCode(line.siteId)}</div> : null}
        </td>
        <td className={tdCls + " text-xs"}>{r.jms.confirmedOn}</td>
        <td className={tdCls + " text-right tabular-nums"}>{formatINR(r.approved)}</td>
        <td className={tdCls + " text-right tabular-nums"}>
          {r.received != null ? formatINR(r.received) : <StatusPill tone="warn">Not received</StatusPill>}
          {r.jms.payment ? <div className="text-[10px] text-[var(--sge-ink-3)]">{r.jms.payment.receivedOn}</div> : null}
        </td>
        <td className={tdCls + " text-right tabular-nums"}>
          {r.gap == null ? (
            "—"
          ) : Math.abs(r.gap) < 1 ? (
            <StatusPill tone="ok">Matches</StatusPill>
          ) : (
            <span className={r.gap < 0 ? "font-semibold text-[var(--sge-crit)]" : "text-[var(--sge-ok)]"}>
              {formatINR(r.gap)}
              <div className="text-[10px]">{((r.gapPct ?? 0) * 100).toFixed(2)}%</div>
            </span>
          )}
        </td>
        <td className={tdCls + " text-right tabular-nums"}>
          {r.daysToPay != null ? `${r.daysToPay} d` : <span className={(r.waiting ?? 0) > 45 ? "font-semibold text-[var(--sge-crit)]" : ""}>{r.waiting} d waiting</span>}
        </td>
        <td className={tdCls + " text-xs"}>
          {reasonLabel(r.jms.payment?.reason)}
          {r.jms.payment?.note ? <div className="text-[10px] text-[var(--sge-ink-3)]">{r.jms.payment.note}</div> : null}
        </td>
        <td className={tdCls}>
          {s.canMoney ? (
            <Button size="sm" variant="outline" onClick={() => onEdit(!editing)}>
              {editing ? "Cancel" : r.jms.payment ? "Edit" : "Record payment"}
            </Button>
          ) : null}
        </td>
      </tr>
      {editing ? (
        <tr className="border-b border-[var(--sge-line)] bg-[var(--sge-brass-wash)]/40">
          <td colSpan={9} className="px-2.5 py-3">
            <form
              className="grid items-end gap-3 sm:grid-cols-6"
              onSubmit={(e) => {
                e.preventDefault();
                const res = recordPayment(r.jms.id, { receivedOn: on, amount: Number(amt), reason: reason || undefined, note: note.trim() || undefined });
                if (!res.ok) return onMsg({ ok: false, msg: res.error });
                onMsg({ ok: true, msg: `Payment recorded for JMS ${r.jms.jmsNo}.` });
                onEdit(false);
              }}
            >
              <label className="text-xs">
                Date received
                <Input type="date" className="mt-1" max={today()} value={on} onChange={(e) => setOn(e.target.value)} />
              </label>
              <label className="text-xs">
                Amount received ₹
                <Input type="number" step="0.01" min="0" className="mt-1" value={amt} onChange={(e) => setAmt(e.target.value)} />
              </label>
              <div className="text-xs">
                Difference
                <div className={cn("mt-2 font-mono", diff <= -1 ? "text-[var(--sge-crit)]" : "")}>{formatINR(diff)}</div>
              </div>
              <label className="text-xs">
                Reason {Math.abs(diff) >= 1 ? "(required)" : ""}
                <select className={selectCls + " mt-1"} value={reason} onChange={(e) => setReason(e.target.value as JmsPayment["reason"] | "")}>
                  <option value="">—</option>
                  {REASONS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
              </label>
              <label className="text-xs">
                Note
                <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 2% TDS" />
              </label>
              <div className="flex gap-2">
                <Button type="submit">Save</Button>
                {r.jms.payment ? (
                  <Button type="button" variant="ghost" onClick={() => setClearing(clearing == null ? "" : null)}>
                    {clearing == null ? "Clear…" : "Keep"}
                  </Button>
                ) : null}
              </div>
              {clearing != null ? (
                <div className="flex items-end gap-2 sm:col-span-6">
                  <label className="min-w-[240px] flex-1 text-xs">
                    Why clear this payment? (logged)
                    <Input className="mt-1" value={clearing} onChange={(e) => setClearing(e.target.value)} placeholder="e.g. entered against the wrong JMS" />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const res = recordPayment(r.jms.id, null, clearing);
                      if (!res.ok) return onMsg({ ok: false, msg: res.error });
                      onMsg({ ok: true, msg: `Payment cleared for JMS ${r.jms.jmsNo}.` });
                      setClearing(null);
                      onEdit(false);
                    }}
                  >
                    Clear payment
                  </Button>
                </div>
              ) : null}
            </form>
          </td>
        </tr>
      ) : null}
    </>
  );
}
