"use client";

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
import type { WageLedgerEntry } from "@/lib/types";

export default function FinancePage() {
  const {
    state,
    addFinance,
    markJmsPayment,
    addWageEntry,
    acknowledgeFinanceAlert,
    flagFinanceAlertToSic,
  } = useStore();
  const isFinanceHome = state.currentRole === "finance";
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [category, setCategory] = useState("Transport");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("2026-10-05");
  const [wageKind, setWageKind] =
    useState<WageLedgerEntry["kind"]>("advance");
  const [wageAmount, setWageAmount] = useState("");
  const [wageNote, setWageNote] = useState("");
  const [wageLabourerPick, setWageLabourer] = useState("");
  const wageLabourer = wageLabourerPick || state.labourers[0]?.id || "";
  const allSites = state.currentSiteId === ALL_SITES;
  // In All sites the form asks which site; it starts on the header pick
  const [entrySitePick, setEntrySitePick] = useState("");
  const entrySite = entrySitePick || entrySiteId(state);
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? "";
  const [flagSic, setFlagSic] = useState(false);

  const today = "2026-10-05";
  const todayEntries = state.finance.filter((f) => f.date === today);
  const expenseToday = todayEntries
    .filter((f) => f.kind === "expense")
    .reduce((s, f) => s + f.amount, 0);
  const incomeToday = todayEntries
    .filter((f) => f.kind === "income")
    .reduce((s, f) => s + f.amount, 0);
  const expectedJms = state.jmsPackages.reduce(
    (s, p) => s + p.expectedIncome,
    0
  );
  const unpaid = state.jmsPackages.filter((p) => !p.paymentReceived);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || !description.trim()) return;
    addFinance({
      date,
      kind,
      category,
      amount: n,
      description,
      siteId: entrySite,
    });
    setAmount("");
    setDescription("");
  }

  function submitWage(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(wageAmount);
    if (!n) return;
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
            JMS payment tracking
          </h3>
          <Link href="/jms">
            <Button size="sm" variant="outline">
              Open JMS
            </Button>
          </Link>
        </div>
        {state.jmsPackages.length === 0 ? (
          <EmptyState
            title="No JMS packages"
            detail="Admin upload notifies Finance automatically."
          />
        ) : (
          state.jmsPackages.map((p) => (
            <div
              key={p.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{p.label}</div>
                <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                  expected {formatINR(p.expectedIncome)} · {p.status}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill tone={p.paymentReceived ? "ok" : "warn"}>
                  {p.paymentReceived ? "received" : "due"}
                </StatusPill>
                {!p.paymentReceived ? (
                  <Button
                    size="sm"
                    onClick={() => markJmsPayment(p.id, true)}
                  >
                    Mark received
                  </Button>
                ) : null}
                {!p.paymentReceived ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markJmsPayment(p.id, false, "Still outstanding")}
                  >
                    Flag due → SIC
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
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
                    <SelectValue />
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
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Input
                className="mt-1"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input
                type="number"
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
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
