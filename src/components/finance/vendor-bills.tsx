"use client";

import { useState } from "react";
import { EmptyState, formatINR, KpiTile, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadXlsxWithHeaders } from "@/lib/excel-io";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import type { VendorBill } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATS: { value: VendorBill["category"]; label: string }[] = [
  { value: "paint", label: "Paint" },
  { value: "scaffold_hire", label: "Scaffold hire" },
  { value: "transport", label: "Transport" },
  { value: "consumables", label: "Consumables" },
  { value: "other", label: "Other" },
];
const sel = "h-9 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";

/** Supplier / vendor bills to pay (round 2, §27): enter, mark paid, overdue first, export */
export function VendorBills() {
  const { state, fullState, addVendorBill, payVendorBill } = useStore();
  const [f, setF] = useState({ vendor: "", billNo: "", billDate: today(), category: "paint" as VendorBill["category"], amount: "", dueDate: "", note: "" });
  const [pay, setPay] = useState<Record<string, { on: string; mode: string }>>({});
  const [filter, setFilter] = useState<"unpaid" | "paid" | "all">("unpaid");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const t = today();
  const site = (id: string) => fullState.sites.find((s) => s.id === id)?.code ?? id;
  const all = state.vendorBills;
  const rows = all
    .filter((b) => filter === "all" || b.status === filter)
    .sort((a, b) => (a.status === b.status ? (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9") : a.status === "unpaid" ? -1 : 1));
  const unpaid = all.filter((b) => b.status === "unpaid");
  const overdue = unpaid.filter((b) => b.dueDate && b.dueDate < t);

  function add() {
    const r = addVendorBill({ vendor: f.vendor, billNo: f.billNo, billDate: f.billDate, category: f.category, amount: Number(f.amount), dueDate: f.dueDate || undefined, note: f.note });
    setMsg(r.ok ? { ok: true, text: `${f.vendor} bill ${f.billNo} added` } : { ok: false, text: r.error ?? "Not saved" });
    if (r.ok) setF({ ...f, billNo: "", amount: "", note: "" });
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Vendor bills" subtitle="Bills to pay for paint, scaffold hire, transport and consumables. The same vendor's bill no. can be entered once." />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Unpaid" value={formatINR(unpaid.reduce((s, b) => s + b.amount, 0))} hint={`${unpaid.length} bills`} tone="warn" />
        <KpiTile label="Overdue" value={formatINR(overdue.reduce((s, b) => s + b.amount, 0))} hint={`${overdue.length} bills`} tone={overdue.length ? "crit" : undefined} />
        <KpiTile label="Paid this month" value={formatINR(all.filter((b) => b.status === "paid" && b.paidOn?.startsWith(t.slice(0, 7))).reduce((s, b) => s + b.amount, 0))} tone="ok" />
      </div>
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Enter a bill</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">Vendor<Input className="mt-1 h-9 w-44" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></label>
          <label className="text-xs">Bill no.<Input className="mt-1 h-9 w-28" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></label>
          <label className="text-xs">Bill date<Input type="date" className="mt-1 h-9 w-40" max={t} value={f.billDate} onChange={(e) => setF({ ...f, billDate: e.target.value })} /></label>
          <label className="text-xs">Category<select className={cn(sel, "mt-1 block")} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as VendorBill["category"] })}>{CATS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
          <label className="text-xs">Amount ₹<Input type="number" min={0} className="mt-1 h-9 w-28" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
          <label className="text-xs">Due<Input type="date" className="mt-1 h-9 w-40" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
          <label className="text-xs">Note<Input className="mt-1 h-9 w-44" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <Button size="sm" onClick={add}>Add bill</Button>
        </div>
        {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      </Panel>
      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["unpaid", "paid", "all"] as const).map((x) => (
            <button key={x} type="button" onClick={() => setFilter(x)} className={cn("rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase", filter === x ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]")}>{x}</button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!rows.length}
            onClick={() =>
              downloadXlsxWithHeaders(`vendor-bills-${t}`, "Vendor bills", ["Site", "Vendor", "Bill no.", "Bill date", "Category", "Amount", "Due", "Status", "Paid on", "Mode", "Note"], rows.map((b) => ({ Site: site(b.siteId), Vendor: b.vendor, "Bill no.": b.billNo, "Bill date": b.billDate, Category: CATS.find((c) => c.value === b.category)?.label, Amount: b.amount, Due: b.dueDate, Status: b.status, "Paid on": b.paidOn, Mode: b.paidMode, Note: b.note })))
            }
          >
            Export to Excel
          </Button>
        </div>
        {rows.length === 0 ? <EmptyState title="No bills here" detail="Enter supplier bills above." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]"><tr><th className="py-1">Vendor</th><th>Bill</th><th>Category</th><th className="text-right">Amount</th><th>Due</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => {
                  const p = pay[b.id] ?? { on: t, mode: "Bank" };
                  return (
                    <tr key={b.id} className="border-t border-[var(--sge-line)]">
                      <td className="py-1.5 font-semibold">{b.vendor} <span className="text-xs font-normal text-[var(--sge-ink-3)]">{site(b.siteId)}</span></td>
                      <td className="font-mono text-xs">{b.billNo} · {b.billDate}</td>
                      <td>{CATS.find((c) => c.value === b.category)?.label}</td>
                      <td className="text-right font-mono">{formatINR(b.amount)}</td>
                      <td className="font-mono text-xs">{b.dueDate ?? "—"}</td>
                      <td>{b.status === "paid" ? <StatusPill tone="ok">paid {b.paidOn}</StatusPill> : b.dueDate && b.dueDate < t ? <StatusPill tone="crit">overdue</StatusPill> : <StatusPill tone="warn">unpaid</StatusPill>}</td>
                      <td className="whitespace-nowrap text-right">
                        {b.status === "unpaid" ? (
                          <>
                            <Input aria-label={`Paid on for ${b.billNo}`} type="date" className="inline-flex h-8 w-36" max={t} value={p.on} onChange={(e) => setPay({ ...pay, [b.id]: { ...p, on: e.target.value } })} />
                            <select aria-label={`Mode for ${b.billNo}`} className={cn(sel, "ml-1 h-8")} value={p.mode} onChange={(e) => setPay({ ...pay, [b.id]: { ...p, mode: e.target.value } })}>
                              {["Bank", "UPI", "Cash", "Cheque"].map((m) => <option key={m}>{m}</option>)}
                            </select>
                            <Button size="sm" className="ml-1 h-8" onClick={() => { const r = payVendorBill(b.id, p.on, p.mode); setMsg(r.ok ? { ok: true, text: `${b.vendor} ${b.billNo} marked paid` } : { ok: false, text: r.error ?? "Not saved" }); }}>Mark paid</Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
