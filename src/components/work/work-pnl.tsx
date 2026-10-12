"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { formatINR, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { monthLabel, perUnit, pnlRows, rollUp, type JobPnl, type PnlTotals } from "@/lib/work/logic";
import { WORK_TODAY } from "@/lib/work/seed";
import { useWork } from "@/lib/work/store";
import type { ExpenseKind } from "@/lib/work/types";
import { cn } from "@/lib/utils";
import { fmtM2, Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";

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
  const rows = pnlRows(work, s.wageOf, month).filter((r) => s.inSite(r.siteId));
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

function Expenses() {
  const { addExpense, removeExpense } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const [f, setF] = useState({ kind: "fixed" as ExpenseKind, siteId: "", month: "", category: "", amount: "", jobId: "", note: "" });
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
              date: WORK_TODAY,
              month: costMonth,
              siteId: site,
              kind: f.kind,
              category: f.category,
              amount: Number(f.amount),
              jobId: f.kind === "direct" ? f.jobId || undefined : undefined,
              note: f.note.trim() || undefined,
            });
            setMsg(r.ok ? { ok: true, msg: "Cost added." } : { ok: false, msg: r.error });
            if (r.ok) setF((x) => ({ ...x, category: "", amount: "", note: "" }));
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
            <Label>Category</Label>
            <Input className="mt-1" list="cost-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Diesel" />
            <datalist id="cost-cats">
              {["Staff salaries", "Compressor rent", "Bus rent", "Car rent", "Diesel", "Machinery", "PPE items", "Copper slag abrasive", "Thinner + rollers", "Scaffold hire"].map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <Label>Amount ₹</Label>
            <Input type="number" min="0" step="0.01" className="mt-1" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
          <div>
            <Label>Note</Label>
            <Input className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          <Button type="submit">Add cost</Button>
        </form>
      ) : null}
      <Msg text={msg} />
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--sge-line)]">
              <th className={thCls}>Type</th>
              <th className={thCls}>Category</th>
              <th className={thCls}>For</th>
              <th className={thCls + " text-right"}>Amount</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody>
            {list.map((x) => {
              const job = x.jobId ? work.jobs.find((j) => j.id === x.jobId) : undefined;
              return (
                <tr key={x.id} className="border-b border-[var(--sge-line)]">
                  <td className={tdCls}><StatusPill tone={x.kind === "fixed" ? "default" : "accent"}>{x.kind}</StatusPill></td>
                  <td className={tdCls}>{x.category}{x.note ? <div className="text-[10px] text-[var(--sge-ink-3)]">{x.note}</div> : null}</td>
                  <td className={tdCls + " text-xs"}>{job ? `${job.jobNo} · ${job.location}` : `${s.siteCode(x.siteId)} · ${monthLabel(x.month)}`}</td>
                  <td className={tdCls + " text-right tabular-nums"}>{formatINR(x.amount)}</td>
                  <td className={tdCls}>
                    {s.canMoney ? (
                      <button type="button" aria-label="Remove cost" onClick={() => removeExpense(x.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-[var(--sge-ink-3)]" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
