"use client";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SiteComparison } from "@/components/owner/site-comparison";
import { MoneyCard } from "@/components/work/money-card";
import { ALL_SITES } from "@/lib/site-scope";
import { useStore } from "@/lib/store";

export default function OwnerHomePage() {
  const { state } = useStore();
  const today = "2026-10-05";
  const allSites = state.currentSiteId === ALL_SITES;
  const siteName = state.sites.find((s) => s.id === state.currentSiteId)?.name;
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? "";
  const attendToday = state.attendance.filter((a) => a.date === today);
  const present = attendToday.filter((a) => a.status === "present" || a.status === "half").length;
  const totalActive = state.labourers.filter((l) => l.active).length;
  const todayFin = state.finance.filter((f) => f.date === today);
  const expenseToday = todayFin.filter((f) => f.kind === "expense").reduce((s, f) => s + f.amount, 0);
  const incomeToday = todayFin.filter((f) => f.kind === "income").reduce((s, f) => s + f.amount, 0);
  const paintToday = state.dprs
    .filter((d) => d.date === today && d.type === "painting")
    .reduce((s, d) => s + (d.areaM2 ?? 0), 0);

  const pendingSic = state.dprDocuments.filter((d) => d.status === "submitted").length;
  const acplFlags = state.acplMatches.filter(
    (m) => m.resolveStatus === "open" && m.flag !== "match"
  ).length;
  const avgRating =
    state.workRatings.length > 0
      ? (
          state.workRatings.reduce((s, r) => s + r.score, 0) /
          state.workRatings.length
        ).toFixed(1)
      : "—";
  const financeOpen = state.financeAlerts.filter((a) => !a.acknowledged).length;

  const varianceLines = state.paintStock.filter(
    (p) =>
      (p.stage === "posted" || p.rilPosted != null) &&
      p.sgeUsed != null &&
      (p.rilPosted ?? 0) > 0
  );

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title={allSites ? "Owner dashboard · All sites" : `Owner dashboard · ${siteName ?? "Site"}`}
        subtitle="Daily performance gist — SIC pending, ACPL flags, JMS ratings, finance alerts. Paint variance owner-only."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/approvals/sic">
              <Button size="sm" variant="outline">SIC inbox</Button>
            </Link>
            <Link href="/finance">
              <Button size="sm">Finance</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Attendance today" value={`${present}/${totalActive}`} hint="Present + half day" tone="ok" />
        <KpiTile label="Painted today" value={`${paintToday} m²`} hint="From painting DPRs" tone="accent" />
        <KpiTile label="Pending SIC DPRs" value={String(pendingSic)} tone="warn" />
        <KpiTile label="Finance alerts" value={String(financeOpen)} hint={`ACPL flags ${acplFlags}`} tone="crit" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="ACPL open flags" value={String(acplFlags)} tone="warn" />
        <KpiTile label="Avg JMS rating" value={String(avgRating)} hint={`${state.workRatings.length} scores`} tone="accent" />
        <KpiTile label="JMS expected" value={formatINR(state.jmsPackages.reduce((s, p) => s + p.expectedIncome, 0))} />
      </div>

      <MoneyCard />

      {allSites ? <SiteComparison /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Verification pulse
          </h3>
          <div className="space-y-2 text-sm">
            <Link href="/approvals/sic" className="flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 hover:bg-[var(--sge-accent-wash)]/40">
              <span>SIC DPR approvals</span>
              <StatusPill tone="accent">{pendingSic} pending</StatusPill>
            </Link>
            <Link href="/attendance/acpl" className="flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 hover:bg-[var(--sge-accent-wash)]/40">
              <span>ACPL match flags</span>
              <StatusPill tone="warn">{acplFlags} open</StatusPill>
            </Link>
            <Link href="/jms" className="flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 hover:bg-[var(--sge-accent-wash)]/40">
              <span>JMS packages</span>
              <StatusPill>{state.jmsPackages.length}</StatusPill>
            </Link>
            <Link href="/finance" className="flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 hover:bg-[var(--sge-accent-wash)]/40">
              <span>Finance alerts</span>
              <StatusPill tone={financeOpen ? "crit" : "ok"}>{financeOpen}</StatusPill>
            </Link>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Paint variance (owner-only)
          </h3>
          <p className="mb-2 text-[11px] text-[var(--sge-ink-3)]">
            SGE used (DPR×MPS) vs RIL posted after 942/261 — not batch/SAP codes.
          </p>
          {varianceLines.length === 0 ? (
            <EmptyState title="No variance lines" detail="Lines with RIL 942/261 posted litres vs SGE used appear here." />
          ) : (
            <div className="space-y-2">
              {varianceLines.map((line) => {
                const pct =
                  line.rilPosted && line.sgeUsed != null
                    ? (((line.sgeUsed - line.rilPosted) / line.rilPosted) * 100).toFixed(1)
                    : "0";
                const hot = Math.abs(Number(pct)) >= 8;
                return (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {allSites ? (
                          <span className="mr-1.5 font-heading text-xs tracking-wide text-[var(--sge-brass-ink)]">
                            {siteCode(line.siteId)}
                          </span>
                        ) : null}
                        {line.description}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                        SAP {line.sapCode} · RIL {line.rilPosted}L · SGE {line.sgeUsed}L
                        {line.movement942 ? ` · 942 ${line.movement942}` : ""}
                        {line.movement261 ? ` · 261 ${line.movement261}` : ""}
                      </div>
                    </div>
                    <StatusPill tone={hot ? "crit" : "ok"}>{pct}%</StatusPill>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Prediction thresholds
          </h3>
          <div className="space-y-2">
            {state.predictions.map((p) => (
              <div
                key={p.id}
                className="rounded-md border border-[var(--sge-line)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">
                    {allSites && p.siteId ? (
                      <span className="mr-1.5 font-heading text-xs tracking-wide text-[var(--sge-brass-ink)]">
                        {siteCode(p.siteId)}
                      </span>
                    ) : null}
                    {p.title}
                  </div>
                  <StatusPill tone={p.severity === "crit" ? "crit" : "warn"}>
                    {p.kind.replace("_", " ")}
                  </StatusPill>
                </div>
                <p className="mt-1 text-xs text-[var(--sge-ink-2)]">{p.detail}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Work ratings
          </h3>
          {state.workRatings.length === 0 ? (
            <EmptyState
              title="No ratings yet"
              detail="Run Compute ratings on a JMS package after matching."
            />
          ) : (
            state.workRatings.map((r) => (
              <div key={r.id} className="mb-2 flex justify-between text-sm">
                <span>
                  {state.staff.find((s) => s.id === r.supervisorId)?.name}
                </span>
                <StatusPill tone="accent">{r.score}/5</StatusPill>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel>
        <SectionHeader
          title="RIL report packs"
          subtitle="In-app gist views — PDF export later."
        />
        <Tabs defaultValue="daily">
          <TabsList>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily" className="mt-3 space-y-2">
            <p className="text-sm text-[var(--sge-ink-2)]">
              {today}: {present} labourers on site · {paintToday} m² painting ·{" "}
              {pendingSic} DPRs awaiting SIC · standing{" "}
              {formatINR(incomeToday - expenseToday)}.
            </p>
            <ul className="list-inside list-disc text-sm text-[var(--sge-ink-2)]">
              {state.dprDocuments
                .filter((d) => d.date === today)
                .map((d) => (
                  <li key={d.id}>
                    {d.submitterType} · {d.plant} · {d.status} · {d.note.slice(0, 60)}
                  </li>
                ))}
            </ul>
          </TabsContent>
          <TabsContent value="weekly" className="mt-3 text-sm text-[var(--sge-ink-2)]">
            Week roll-up: DPR docs {state.dprDocuments.length} · JMS expected{" "}
            {formatINR(state.jmsPackages.reduce((s, p) => s + p.expectedIncome, 0))} ·
            ACPL flags {acplFlags}.
          </TabsContent>
          <TabsContent value="monthly" className="mt-3 text-sm text-[var(--sge-ink-2)]">
            September RA bills{" "}
            {formatINR(
              state.billing
                .filter((b) => b.period === "Sep 2026")
                .reduce((s, b) => s + b.amount, 0)
            )}
            ; JMS payment tracking live on Finance.
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}
