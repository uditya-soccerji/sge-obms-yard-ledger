"use client";

import React, { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatINR, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canVoidExpense, EXPENSE_CATEGORIES, monthLabel, PAYMENT_MODES, perUnit, pnlRows, rollUp, type JobPnl, type PnlTotals } from "@/lib/work/logic";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";
import type { ExpenseKind, PaymentMode } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";
import { WorkExcelTransfer } from "./work-excel-transfer";

type View = "job" | "supervisor" | "service" | "site_month";
type Basis = "cash" | "earned";

const VIEWS: [View, string][] = [
  ["service", "Per m² by service item"],
  ["supervisor", "By supervisor"],
  ["job", "By job"],
  ["site_month", "By site & month"],
];

const money = (n: number | null) => (n == null ? "—" : formatINR(Math.round(n)));

/** Management P&L (docs §18): cash basis by default, earned basis to compare. */
export function WorkPnl() {
  const s = useWorkScope();
  const { work } = s;
  const [view, setView] = useState<View>("service");
  const [basis, setBasis] = useState<Basis>("cash");
  const [month, setMonth] = useState<string>("all");
  const months = [...new Set(work.planLines.map((l) => l.month))].sort();

  // Each figure lands in the month it happened (docs §18): cash = received that month,
  // earned = approved that month, costs = incurred that month
  const rows = pnlRows(work, s.wageOf, month, s.labourPay).filter((r) => s.inSite(r.siteId));
  const profitOf = (t: { profit: number; earnedProfit: number }) => (basis === "cash" ? t.profit : t.earnedProfit);
  const incomeOf = (t: { income: number; earned: number }) => (basis === "cash" ? t.income : t.earned);
  // m² that matches the basis: paid m² for cash, approved m² for earned
  const qtyOf = (t: { qty: number; paidQty: number }) => (basis === "cash" ? t.paidQty : t.qty);
  const tot = rollUp(rows, () => "all")[0];

  const keyOf: Record<View, (r: JobPnl) => string> = {
    job: (r) => r.jobId,
    supervisor: (r) => r.supervisorId,
    service: (r) => r.serviceCode,
    site_month: (r) => `${r.siteId}|${r.month}`,
  };
  const labelOf = (key: string) => {
    if (key.startsWith("unalloc|")) {
      const [, site, m] = key.split("|");
      return { main: "Unallocated overhead", sub: `${s.siteCode(site)} · ${monthLabel(m)} · no DPR crew that month to share it over` };
    }
    if (key === "" && view !== "site_month") return { main: "Unallocated overhead", sub: "Fixed costs in months with no DPR crew" };
    if (view === "job") {
      const j = work.jobs.find((x) => x.id === key);
      const l = j && s.line(j.planLineId);
      return { main: j?.jobNo ?? key, sub: `${l?.plant ?? ""} · ${j?.location ?? ""}` };
    }
    if (view === "supervisor") return { main: s.staffName(key), sub: "" };
    if (view === "service") {
      const it = s.item(key);
      return { main: `${it?.mps} · ${key}`, sub: `${it?.description ?? ""} · ₹${it?.rate}/m²` };
    }
    const [site, m] = key.split("|");
    return { main: `${s.siteCode(site)} · ${monthLabel(m)}`, sub: "" };
  };
  const groups = rollUp(rows, keyOf[view])
    .filter((g) => qtyOf(g) > 0 || incomeOf(g) > 0 || g.labour > 0 || g.direct > 0 || g.overhead > 0)
    .sort((a, b) => profitOf(a) - profitOf(b));

  return (
    <div className="space-y-4">
      <WorkExcelTransfer kind="expenses" />
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Month</Label>
          <select className={selectCls + " mt-1 w-40"} value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
        <div className="flex overflow-hidden rounded-sm border border-[var(--sge-line)]">
          {(
            [
              ["cash", "Cash (received)"],
              ["earned", "Earned (SIC approved)"],
            ] as [Basis, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasis(id)}
              className={cn("px-3 py-2 text-xs font-semibold", basis === id ? "bg-[var(--sge-night)] text-white" : "bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="max-w-md text-[11px] text-[var(--sge-ink-3)]">
          Each figure sits in the month it happened: cash income when received, earned when SIC approved, costs when incurred. Labour = DPR crew × daily wage (split days shared). Fixed costs are shared over jobs by labour-days; a month with no crew shows them as unallocated overhead.
        </p>
      </div>

      {tot ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <KpiTile label={basis === "cash" ? "Income received" : "Earned (approved)"} value={money(incomeOf(tot))} tone="ok" />
          <KpiTile label="Labour" value={money(tot.labour)} hint={`${fmtM2(Math.round(tot.labourDays))} labour-days`} />
          <KpiTile label="Direct + overhead" value={money(tot.direct + tot.overhead)} />
          <KpiTile label="Profit / loss" value={money(profitOf(tot))} tone={profitOf(tot) < 0 ? "crit" : "accent"} />
          <KpiTile label="Per m²" value={money(perUnit(profitOf(tot), qtyOf(tot)))} hint={`${fmtM2(Math.round(qtyOf(tot)))} m² ${basis === "cash" ? "paid" : "approved"}`} />
          <KpiTile label="Per labour-day" value={money(perUnit(profitOf(tot), tot.labourDays))} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]",
              view === id ? "bg-[var(--sge-night)] text-white" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>{VIEWS.find((v) => v[0] === view)?.[1].replace(/^Per m² by |^By /, "")}</th>
                <th className={thCls + " text-right"}>m²</th>
                <th className={thCls + " text-right"}>{basis === "cash" ? "Received" : "Approved"}</th>
                <th className={thCls + " text-right"}>Labour</th>
                <th className={thCls + " text-right"}>Lab.-days</th>
                <th className={thCls + " text-right"}>Direct</th>
                <th className={thCls + " text-right"}>Overhead</th>
                <th className={thCls + " text-right"}>Profit / loss</th>
                <th className={thCls + " text-right"}>Per m²</th>
                <th className={thCls + " text-right"}>Per lab.-day</th>
                <th className={thCls + " text-right"}>Margin</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <PnlRow key={g.key} g={g} label={labelOf(g.key)} income={incomeOf(g)} profit={profitOf(g)} qty={qtyOf(g)} />
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-sm text-[var(--sge-ink-3)]">No jobs with costs or JMS in this selection.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-[var(--sge-ink-3)]">
          August labour is estimated from typical output per MPS (history has no DPR crews). September uses the DPR crew lists. Sorted worst first.
        </p>
      </Panel>

      <Expenses />
    </div>
  );
}

function PnlRow({ g, label, income, profit, qty }: { g: PnlTotals; label: { main: string; sub: string }; income: number; profit: number; qty: number }) {
  const margin = income > 0 ? profit / income : null;
  return (
    <tr className="border-b border-[var(--sge-line)]">
      <td className={tdCls}>
        <div className="font-medium">{label.main}</div>
        {label.sub ? <div className="text-[10px] text-[var(--sge-ink-3)]">{label.sub}</div> : null}
      </td>
      <td className={tdCls + " text-right tabular-nums"}>{qty ? fmtM2(Math.round(qty * 10) / 10) : "—"}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(income)}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(g.labour)}</td>
      <td className={tdCls + " text-right tabular-nums"}>{g.labourDays ? fmtM2(Math.round(g.labourDays * 10) / 10) : "—"}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(g.direct)}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(g.overhead)}</td>
      <td className={cn(tdCls, "text-right font-semibold tabular-nums", profit < 0 ? "text-[var(--sge-crit)]" : "text-[var(--sge-ok)]")}>{money(profit)}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(perUnit(profit, qty))}</td>
      <td className={tdCls + " text-right tabular-nums"}>{money(perUnit(profit, g.labourDays))}</td>
      <td className={tdCls + " text-right"}>
        {margin == null ? <StatusPill tone="warn">No income</StatusPill> : <StatusPill tone={margin < 0 ? "crit" : margin < 0.1 ? "warn" : "ok"}>{(margin * 100).toFixed(1)}%</StatusPill>}
      </td>
    </tr>
  );
}

/** The cost ledger (docs §8, §18): used on the P&L tab and the Finance page. */
export function CostLedger() {
  return <Expenses />;
}

function Expenses() {
  const { addExpense, removeExpense, editExpense } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const { fullState, currentAccount } = useStore();
  // Cost being voided, and the reason typed for it
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  // Cost being edited (amount, category, vendor, mode, remark)
  const [editing, setEditing] = useState<{ id: string; amount: string; category: string; vendor: string; paymentMode: PaymentMode | ""; note: string } | null>(null);
  const vendors = fullState.vendors.filter((v) => v.status === "active").map((v) => v.name);
  const nowTime = () => new Date().toTimeString().slice(0, 5);
  const blank = { kind: "fixed" as ExpenseKind, siteId: "", month: "", date: today(), time: nowTime(), category: "", amount: "", jobId: "", vendor: "", paymentMode: "" as PaymentMode | "", note: "", billFile: "", billPending: false };
  const [f, setF] = useState(blank);
  // A new file input after each save, so the last bill's name doesn't carry over
  const [fileKey, setFileKey] = useState(0);
  // Site follows the header; only All sites picks one here
  const site = s.allSites ? f.siteId || s.entrySite : s.currentSiteId;
  const costMonth = f.month || s.monthOf(site);
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  // Jobs on this site that are live or have DPR history (imported August jobs have none)
  const jobs = work.jobs.filter(
    (j) => s.line(j.planLineId)?.siteId === site && (j.status !== "closed" || work.dprs.some((d) => d.jobId === j.id))
  );
  const list = work.expenses.filter((x) => s.inSite(x.siteId)).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold">Costs</h3>
      {s.canMoney ? (
        <form
          className="mb-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-7"
          onSubmit={(e) => {
            e.preventDefault();
            const r = addExpense({
              date: f.date,
              time: f.time,
              month: costMonth,
              siteId: site,
              kind: f.kind,
              category: f.category,
              amount: Number(f.amount),
              jobId: f.kind === "direct" ? f.jobId || undefined : undefined,
              vendor: f.vendor,
              paymentMode: f.paymentMode || undefined,
              note: f.note,
              billFile: f.billFile || undefined,
              billPending: f.billFile ? undefined : f.billPending || undefined,
            });
            setMsg(r.ok ? { ok: true, msg: "Cost added." } : { ok: false, msg: r.error });
            if (r.ok) {
              setF((x) => ({ ...blank, kind: x.kind, siteId: x.siteId, month: x.month, date: x.date }));
              setFileKey((k) => k + 1);
            }
          }}
        >
          <div>
            <Label>Type</Label>
            <select className={selectCls + " mt-1"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as ExpenseKind })}>
              <option value="fixed">Fixed (site, month)</option>
              <option value="direct">Direct (one job)</option>
            </select>
          </div>
          {s.allSites ? (
            <div>
              <Label>Site</Label>
              <select className={selectCls + " mt-1"} value={site} onChange={(e) => setF({ ...f, siteId: e.target.value, jobId: "" })}>
                {s.sites.filter((x) => x.enabled).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
              </select>
            </div>
          ) : null}
          {f.kind === "fixed" ? (
            <div>
              <Label>Month</Label>
              <Input type="month" className="mt-1" value={costMonth} onChange={(e) => setF({ ...f, month: e.target.value })} />
            </div>
          ) : (
            <div>
              <Label>Job</Label>
              <select className={selectCls + " mt-1"} value={f.jobId} onChange={(e) => setF({ ...f, jobId: e.target.value })}>
                <option value="">Pick a job…</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNo} · {s.line(j.planLineId)?.plant} · {j.location}</option>)}
              </select>
            </div>
          )}
          <div>
            <Label>Date</Label>
            <Input type="date" className="mt-1" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div>
            <Label>Time</Label>
            <Input type="time" className="mt-1" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <select className={selectCls + " mt-1"} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">Pick…</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label>Amount ₹</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
          <div>
            <Label>Vendor (paid to)</Label>
            <Input className="mt-1" list="cost-vendors" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="e.g. Om Transport" />
            <datalist id="cost-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
          </div>
          <div>
            <Label>Payment mode</Label>
            <select className={selectCls + " mt-1"} value={f.paymentMode} onChange={(e) => setF({ ...f, paymentMode: e.target.value as PaymentMode | "" })}>
              <option value="">Pick…</option>
              {PAYMENT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2">
            <Label>Remark</Label>
            <Input className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="What it was for" />
          </div>
          <div className="lg:col-span-2">
            <Label>Bill / receipt</Label>
            <Input
              key={fileKey}
              type="file"
              accept="image/*,application/pdf"
              className="mt-1"
              onChange={(e) => setF({ ...f, billFile: e.target.files?.[0]?.name ?? "", billPending: false })}
            />
            <label className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--sge-ink-2)]">
              <input type="checkbox" checked={f.billPending} disabled={!!f.billFile} onChange={(e) => setF({ ...f, billPending: e.target.checked })} />
              Bill to follow (flagged until attached)
            </label>
          </div>
          <Button type="submit">Add cost</Button>
          <p className="text-[11px] text-[var(--sge-ink-3)] sm:col-span-2 lg:col-span-7">
            Only the bill&apos;s file name is kept for now; the file itself will be stored once bills move to the shared database.
          </p>
        </form>
      ) : null}
      <Msg text={msg} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--sge-line)]">
              <th className={thCls}>Type</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>Paid to</th>
              <th className={thCls}>For</th>
              <th className={thCls + " text-right"}>Amount</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const job = x.jobId ? work.jobs.find((j) => j.id === x.jobId) : undefined;
              return (
                <React.Fragment key={x.id}>
                <tr className={cn("border-b border-[var(--sge-line)]", x.voided && "text-[var(--sge-ink-3)] line-through")}>
                  <td className={tdCls}><StatusPill tone={x.kind === "fixed" ? "default" : "accent"}>{x.kind}</StatusPill></td>
                  <td className={tdCls}>{x.category}{x.note ? <div className="text-[10px] text-[var(--sge-ink-3)]">{x.note}</div> : null}</td>
                  <td className={tdCls + " text-xs"}>
                    {x.vendor ?? "—"}
                    {x.paymentMode ? <span className="text-[var(--sge-ink-3)]"> · {PAYMENT_MODES.find((m) => m.id === x.paymentMode)?.label}</span> : null}
                    <div className="text-[10px] text-[var(--sge-ink-3)]">
                      {x.date}{x.time ? ` ${x.time}` : ""}{x.enteredByName ? ` · by ${x.enteredByName}` : ""}
                    </div>
                    {x.billPending ? <StatusPill tone="warn">Bill to follow</StatusPill> : x.billFile ? <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{x.billFile}</div> : null}
                  </td>
                  <td className={tdCls + " text-xs"}>{job ? `${job.jobNo} · ${job.location}` : `${s.siteCode(x.siteId)} · ${monthLabel(x.month)}`}</td>
                  <td className={tdCls + " text-right tabular-nums"}>{formatINR(x.amount)}</td>
                  <td className={tdCls}>
                    {x.voided ? (
                      <span className="text-[10px] no-underline" title={x.voided.reason}>voided by {x.voided.by}</span>
                    ) : s.canMoney && canVoidExpense(x, { accountId: currentAccount?.id ?? "", role: s.role }, today()) ? (
                      <span className="flex items-center gap-2">
                        <button type="button" className="text-[11px] text-[var(--sge-brass-ink)] underline" onClick={() => setEditing({ id: x.id, amount: String(x.amount), category: x.category, vendor: x.vendor ?? "", paymentMode: x.paymentMode ?? "", note: x.note ?? "" })}>
                          Edit
                        </button>
                        <button type="button" aria-label="Void cost" title="Void (kept on record, leaves the P&L)" onClick={() => setVoiding({ id: x.id, reason: "" })}>
                          <Trash2 className="h-3.5 w-3.5 text-[var(--sge-ink-3)]" />
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
                {x.edits?.length ? (
                  <tr className="border-b border-[var(--sge-line)]">
                    <td colSpan={6} className="px-2.5 pb-1.5 text-[10px] text-[var(--sge-ink-3)]">
                      {x.edits.map((e) => `Edited ${e.at.slice(0, 10)} by ${e.by}: ${e.changes}`).join(" · ")}
                    </td>
                  </tr>
                ) : null}
                {editing?.id === x.id ? (
                  <tr className="border-b border-[var(--sge-line)] bg-[var(--sge-brass-wash)]/40">
                    <td colSpan={6} className="px-2.5 py-2">
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const r = editExpense(x.id, { amount: Number(editing.amount), category: editing.category, vendor: editing.vendor, paymentMode: editing.paymentMode || undefined, note: editing.note });
                          setMsg(r.ok ? { ok: true, msg: "Cost changed — the edit is logged." } : { ok: false, msg: r.error });
                          if (r.ok) setEditing(null);
                        }}
                      >
                        <label className="text-xs">Amount ₹<Input className="mt-1 w-28" type="number" min="0" step="0.01" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></label>
                        <label className="text-xs">Category
                          <select className={selectCls + " mt-1"} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </label>
                        <label className="text-xs">Paid to<Input className="mt-1 w-40" value={editing.vendor} onChange={(e) => setEditing({ ...editing, vendor: e.target.value })} /></label>
                        <label className="text-xs">Mode
                          <select className={selectCls + " mt-1"} value={editing.paymentMode} onChange={(e) => setEditing({ ...editing, paymentMode: e.target.value as PaymentMode | "" })}>
                            {PAYMENT_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                          </select>
                        </label>
                        <label className="min-w-[200px] flex-1 text-xs">Remark<Input className="mt-1" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></label>
                        <Button type="submit" size="sm">Save change</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </form>
                    </td>
                  </tr>
                ) : null}
                {voiding?.id === x.id ? (
                  <tr className="border-b border-[var(--sge-line)] bg-[var(--sge-crit-wash)]/40">
                    <td colSpan={6} className="px-2.5 py-2">
                      <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const r = removeExpense(x.id, voiding.reason);
                          setMsg(r.ok ? { ok: true, msg: "Cost voided — it stays on record and leaves the P&L." } : { ok: false, msg: r.error });
                          if (r.ok) setVoiding(null);
                        }}
                      >
                        <label className="min-w-[240px] flex-1 text-xs">
                          Why void this cost? (logged)
                          <Input className="mt-1" value={voiding.reason} onChange={(e) => setVoiding({ id: x.id, reason: e.target.value })} placeholder="e.g. entered twice" />
                        </label>
                        <Button type="submit" size="sm" variant="outline">Void cost</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setVoiding(null)}>Keep</Button>
                      </form>
                    </td>
                  </tr>
                ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
