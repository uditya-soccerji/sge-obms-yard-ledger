"use client";

import { guarded } from "@/components/shared/require-module";
import { today as todayDate } from "@/lib/today";
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
import { useSiteReports } from "@/lib/work/use-reports";
import { useWork } from "@/lib/work/store";
import { reportArea } from "@/lib/work/reports";
import { supervisorRatings } from "@/lib/work/jms-compare";
import { stepVariance } from "@/lib/work/paint-steps";
import { supervisorPaint } from "@/lib/work/logic";
import { workedCount } from "@/lib/attendance";

function OwnerHomePage() {
  const { state } = useStore();
  const reports = useSiteReports();
  const { work } = useWork();
  const today = todayDate();
  const allSites = state.currentSiteId === ALL_SITES;
  const siteName = state.sites.find((s) => s.id === state.currentSiteId)?.name;
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? "";
  const attendToday = state.attendance.filter((a) => a.date === today);
  const present = workedCount(attendToday, today);
  const totalActive = state.labourers.filter((l) => l.active).length;
  const todayFin = state.finance.filter((f) => f.date === today);
  const expenseToday = todayFin.filter((f) => f.kind === "expense").reduce((s, f) => s + f.amount, 0);
  const incomeToday = todayFin.filter((f) => f.kind === "income").reduce((s, f) => s + f.amount, 0);
  // Painting m² today from the job lines on today's reports (one DPR model)
  const paintToday = Math.round(reports.filter((r) => r.date === today).reduce((s, r) => s + reportArea(work, r.id, true), 0) * 1000) / 1000;

  const pendingSic = reports.filter((d) => d.status === "submitted").length;
  const acplFlags = state.acplMatches.filter(
    (m) => m.resolveStatus === "open" && m.flag !== "match"
  ).length;
  // Ratings and JMS money come from Work (internal vs submitted JMS)
  const ratings = supervisorRatings(work);
  const avgRating = ratings.length ? (ratings.reduce((s, r) => s + r.score, 0) / ratings.length).toFixed(1) : "—";
  const unpaidJms = work.jms.filter((j) => !j.payment).reduce((s, j) => s + j.amount, 0);
  const financeOpen = state.financeAlerts.filter((a) => !a.acknowledged).length;

  // Paint (Work): our 942 reco vs RIL's litres where given, and supervisors short of paint
  const siteOfStaff = (id: string) => state.staff.find((x) => x.id === id)?.siteId;
  const varianceSteps = work.paintSteps
    .filter((st) => st.step === "942" && st.rilLitres != null && (allSites || siteOfStaff(st.supervisorId) === state.currentSiteId))
    .map((st) => ({ st, v: stepVariance(st, state.masterCatalog.materials) }));
  const paintFlags = supervisorPaint(work).filter((r) => r.flag === "negative" || r.flag === "low" || r.flag === "no_stock").filter((r) => allSites || siteOfStaff(r.supervisorId) === state.currentSiteId);
  const waitingRil = work.paintSteps.filter((st) => !st.rilRef && (allSites || siteOfStaff(st.supervisorId) === state.currentSiteId)).length;

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
        <KpiTile label="Avg JMS rating" value={String(avgRating)} hint={`${ratings.length} supervisors`} tone="accent" />
        <KpiTile label="JMS approved, unpaid" value={formatINR(unpaidJms)} />
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
              <span>JMS submitted to RIL</span>
              <StatusPill>{work.submissions.length}</StatusPill>
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
            Our month reco (942 = DPR use) vs RIL&apos;s litres, where RIL gave a figure. {waitingRil} step(s) still wait for RIL&apos;s number.
          </p>
          {varianceSteps.length === 0 ? (
            <EmptyState title="No RIL litres yet" detail="Store types RIL's 942 litres against our reco on the Store page." />
          ) : (
            <div className="space-y-2">
              {varianceSteps.map(({ st, v }) => (
                <div key={st.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">
                      {allSites ? (
                        <span className="mr-1.5 font-heading text-xs tracking-wide text-[var(--sge-brass-ink)]">{siteCode(siteOfStaff(st.supervisorId) ?? "")}</span>
                      ) : null}
                      {state.staff.find((x) => x.id === st.supervisorId)?.name} · {st.month}
                    </div>
                    <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                      SAP {st.sap} · ours {st.litres} L · RIL {st.rilLitres} L{st.rilRef ? ` · 942 ${st.rilRef}` : ""}
                    </div>
                  </div>
                  <StatusPill tone={v?.over ? "crit" : "ok"}>{v ? v.pct.toFixed(1) : "0"}% (±{v?.tolerance ?? 8}%)</StatusPill>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Paint short or overdrawn
          </h3>
          <div className="space-y-2">
            {paintFlags.length === 0 ? <p className="text-sm text-[var(--sge-ink-3)]">Every supervisor has enough paint for the remaining scope.</p> : null}
            {paintFlags.map((r) => (
              <div key={r.supervisorId + r.sap} className="rounded-md border border-[var(--sge-line)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{state.staff.find((x) => x.id === r.supervisorId)?.name} · {r.name}</div>
                  <StatusPill tone={r.flag === "low" ? "warn" : "crit"}>{r.flag === "no_stock" ? "no stock" : r.flag}</StatusPill>
                </div>
                <p className="mt-1 text-xs text-[var(--sge-ink-2)]">Balance {r.balance} L · still needed {Math.round(r.needed)} L for the remaining plan</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Work ratings
          </h3>
          {ratings.length === 0 ? (
            <EmptyState
              title="No ratings yet"
              detail="Ratings appear once internal JMS are linked to their RIL submissions (JMS page)."
            />
          ) : (
            ratings.map((r) => (
              <div key={r.supervisorId} className="mb-2 flex justify-between text-sm">
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
              {reports
                .filter((d) => d.date === today)
                .map((d) => (
                  <li key={d.id}>
                    {d.submitterType} · {d.plant} · {d.status} · {d.note.slice(0, 60)}
                  </li>
                ))}
            </ul>
          </TabsContent>
          <TabsContent value="weekly" className="mt-3 text-sm text-[var(--sge-ink-2)]">
            Week roll-up: DPR docs {reports.length} · JMS expected{" "}
            {formatINR(unpaidJms)} approved, unpaid ·
            ACPL flags {acplFlags}.
          </TabsContent>
          <TabsContent value="monthly" className="mt-3 text-sm text-[var(--sge-ink-2)]">
            {today.slice(0, 7)} JMS approved{" "}
            {formatINR(work.jms.filter((j) => j.confirmedOn.startsWith(today.slice(0, 7))).reduce((s, j) => s + j.amount, 0))}
            ; payments are recorded in Work → Payments.
          </TabsContent>
        </Tabs>
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("owner", OwnerHomePage);
