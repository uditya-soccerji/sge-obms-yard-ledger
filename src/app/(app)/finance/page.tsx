"use client";

import { guarded } from "@/components/shared/require-module";
import { nowTime, today as todayDate } from "@/lib/today";

/** Fixed list so the ledger can be totalled by category (docs §8) */
const FINANCE_CATEGORIES = ["Transport", "Food", "Materials", "Tools & spares", "Fuel", "Rent", "Labour", "Client payment", "Other"];
import { useState } from "react";
import Link from "next/link";
import {
  EmptyState,
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALL_SITES, entrySiteId } from "@/lib/site-scope";
import { MoneyCard } from "@/components/work/money-card";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import type { WageLedgerEntry } from "@/lib/types";

function FinancePage() {
  const {
    state,
    addFinance,
    addWageEntry,
    acknowledgeFinanceAlert,
    flagFinanceAlertToSic,
  } = useStore();
  const isFinanceHome = state.currentRole === "finance";
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [payMode, setPayMode] = useState<"" | "cash" | "upi" | "bank" | "credit">("");
  const [time, setTime] = useState(nowTime);
  const [finMsg, setFinMsg] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayDate);
  const [wageKind, setWageKind] =
    useState<WageLedgerEntry["kind"]>("advance");
  const [wageAmount, setWageAmount] = useState("");
  const [wageNote, setWageNote] = useState("");
  const [wageLabourerPick, setWageLabourer] = useState("");
  // No default labourer — a wage line must name who it is for
  const wageLabourer = wageLabourerPick;
  const [wageMsg, setWageMsg] = useState<string | null>(null);
  const allSites = state.currentSiteId === ALL_SITES;
  // In All sites the form asks which site; it starts on the header pick
  const [entrySitePick, setEntrySitePick] = useState("");
  const entrySite = entrySitePick || entrySiteId(state);
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? "";
  const [flagSic, setFlagSic] = useState(false);

  const today = todayDate();
  const todayEntries = state.finance.filter((f) => f.date === today);
  const expenseToday = todayEntries
    .filter((f) => f.kind === "expense")
    .reduce((s, f) => s + f.amount, 0);
  const incomeToday = todayEntries
    .filter((f) => f.kind === "income")
    .reduce((s, f) => s + f.amount, 0);
  // Internal JMS approved by SIC and not paid yet (Work is the one JMS record)
  const { work } = useWork();
  const siteOfJms = (planLineId: string) => work.planLines.find((l) => l.id === planLineId)?.siteId ?? "";
  const unpaid = work.jms.filter((j) => !j.payment && (state.currentSiteId === "all" || siteOfJms(j.planLineId) === state.currentSiteId));
  const expectedJms = unpaid.reduce((s, j) => s + j.amount, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = addFinance({
      date,
      time,
      kind,
      category,
      amount: Number(amount),
      vendor,
      paymentMode: payMode || undefined,
      description,
      siteId: entrySite,
    });
    setFinMsg(res.ok ? "Saved." : res.error ?? "Couldn't save");
    if (!res.ok) return;
    setAmount("");
    setVendor("");
    setDescription("");
  }

  function submitWage(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(wageAmount);
    if (!wageLabourer) return setWageMsg("Pick the labourer");
    if (!(n > 0)) return setWageMsg("Amount must be above zero");
    setWageMsg(null);
    addWageEntry({
      labourerId: wageLabourer,
      date: today,
      kind: wageKind,
      amount: n,
      note: wageNote || wageKind,
      flaggedToSic: flagSic,
    });
    setWageAmount("");
    setWageNote("");
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title={isFinanceHome ? "Finance home" : "Finance"}
        subtitle={
          isFinanceHome
            ? "Your desk — JMS payments, wage ledger, OT/advances, anomaly flags to SIC."
            : "JMS income expected vs received, wage / bonus / advance / OT ledger, alerts to SIC."
        }
      />

      {/* Accounting lives with the JMS data in Work: approved vs received + P&L */}
      <MoneyCard />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Today expenses"
          value={formatINR(expenseToday)}
          tone="warn"
        />
        <KpiTile
          label="Today income"
          value={formatINR(incomeToday)}
          tone="ok"
        />
        <KpiTile
          label="JMS expected"
          value={formatINR(expectedJms)}
          hint={`${unpaid.length} unpaid`}
          tone="accent"
        />
        <KpiTile
          label="Open alerts"
          value={String(
            state.financeAlerts.filter((a) => !a.acknowledged).length
          )}
          tone="crit"
        />
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold">
            JMS approved, not paid yet
          </h3>
          <Link href="/jms">
            <Button size="sm" variant="outline">
              Open JMS
            </Button>
          </Link>
        </div>
        {unpaid.length === 0 ? (
          <EmptyState title="Nothing due" detail="Every SIC-approved JMS has its payment recorded." />
        ) : (
          <div className="space-y-1">
            {unpaid
              .slice()
              .sort((a, b) => a.confirmedOn.localeCompare(b.confirmedOn))
              .slice(0, 12)
              .map((j) => (
                <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-1.5 text-sm">
                  <span>
                    JMS {j.jmsNo} · {j.serviceCode} · {j.qty} m²
                    <span className="ml-1 font-mono text-[11px] text-[var(--sge-ink-3)]">approved {j.confirmedOn} · {j.status}</span>
                  </span>
                  <span className="font-mono">{formatINR(j.amount)}</span>
                </div>
              ))}
            {unpaid.length > 12 ? <p className="text-xs text-[var(--sge-ink-3)]">… and {unpaid.length - 12} more</p> : null}
          </div>
        )}
        <Link href="/work?t=payments">
          <Button size="sm" className="mt-3">Record payments in Work → Payments</Button>
        </Link>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Alerts</h3>
        {state.financeAlerts.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">None.</p>
        ) : (
          state.financeAlerts.map((a) => (
            <div
              key={a.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-[var(--sge-ink-2)]">{a.detail}</div>
              </div>
              <div className="flex gap-1">
                {!a.acknowledged ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => acknowledgeFinanceAlert(a.id)}
                  >
                    Ack
                  </Button>
                ) : (
                  <StatusPill tone="ok">acked</StatusPill>
                )}
                {!a.flaggedToSic ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => flagFinanceAlertToSic(a.id)}
                  >
                    → SIC
                  </Button>
                ) : (
                  <StatusPill tone="warn">SIC</StatusPill>
                )}
              </div>
            </div>
          ))
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Wage / bonus / advance / OT
          </h3>
          <form onSubmit={submitWage} className="mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Labourer</Label>
                <Select value={wageLabourer} onValueChange={setWageLabourer}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.labourers
                      .filter((l) => l.active)
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Kind</Label>
                <Select
                  value={wageKind}
                  onValueChange={(v) =>
                    setWageKind(v as WageLedgerEntry["kind"])
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      [
                        "salary",
                        "bonus",
                        "advance",
                        "ot",
                        "incentive",
                      ] as const
                    ).map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                className="mt-1"
                value={wageAmount}
                onChange={(e) => setWageAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Note</Label>
              <Input
                className="mt-1"
                value={wageNote}
                onChange={(e) => setWageNote(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={flagSic}
                onChange={(e) => setFlagSic(e.target.checked)}
              />
              Flag anomaly to SIC
            </label>
            {wageMsg ? <div className="text-xs text-[var(--sge-crit)]">{wageMsg}</div> : null}
            <Button type="submit">Add wage line</Button>
          </form>
          <div className="max-h-[280px] space-y-2 overflow-y-auto">
            {state.wageLedger.map((w) => (
              <div
                key={w.id}
                className="flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <div>
                  <StatusPill>{w.kind}</StatusPill>{" "}
                  {state.labourers.find((l) => l.id === w.labourerId)?.name ??
                    state.staff.find((s) => s.id === w.staffId)?.name}
                  <div className="text-xs text-[var(--sge-ink-3)]">{w.note}</div>
                </div>
                <span className="font-mono">{formatINR(w.amount)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Add ledger entry</h3>
          <form onSubmit={submit} className="space-y-3">
            {allSites ? (
              <div>
                <Label>Site</Label>
                <Select value={entrySite} onValueChange={setEntrySitePick}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {state.sites
                      .filter((s) => s.enabled)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kind</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as "expense" | "income")}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input
                  type="date"
                  className="mt-1"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" className="mt-1" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    {FINANCE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment mode</Label>
                <Select value={payMode} onValueChange={(v) => setPayMode(v as typeof payMode)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank">Bank transfer</SelectItem>
                    <SelectItem value="credit">On credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>{kind === "income" ? "Received from" : "Paid to"}</Label>
              <Input className="mt-1" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input
                type="number"
                min={1}
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Remark</Label>
              <Textarea
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {finMsg ? <div className={finMsg === "Saved." ? "text-xs text-[var(--sge-ok)]" : "text-xs text-[var(--sge-crit)]"}>{finMsg}</div> : null}
            <Button type="submit">Save entry</Button>
          </form>
          <div className="mt-4 max-h-[240px] space-y-2 overflow-y-auto border-t border-[var(--sge-line)] pt-3">
            {state.finance.map((f) => (
              <div
                key={f.id}
                className="flex justify-between text-sm"
              >
                <span>
                  <StatusPill tone={f.kind === "income" ? "ok" : "warn"}>
                    {f.kind}
                  </StatusPill>{" "}
                  {allSites ? (
                    <span className="mr-1 font-heading text-xs tracking-wide text-[var(--sge-brass-ink)]">
                      {siteCode(f.siteId)}
                    </span>
                  ) : null}
                  {f.category}
                  {f.vendor ? <span className="text-[var(--sge-ink-3)]"> · {f.vendor}</span> : null}
                </span>
                <span className="font-mono">{formatINR(f.amount)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("finance", FinancePage);
