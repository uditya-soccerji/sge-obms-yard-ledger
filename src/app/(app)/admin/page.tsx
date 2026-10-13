"use client";

import { guarded } from "@/components/shared/require-module";
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
import { useStore } from "@/lib/store";
import { useSiteReports } from "@/lib/work/use-reports";

function AdminHomePage() {
  const { state } = useStore();
  const reports = useSiteReports();
  const pendingDpr = reports.filter((d) => d.status === "submitted")
    .length;
  const openAcpl = state.acplMatches.filter(
    (m) => m.resolveStatus === "open" && m.flag !== "match"
  ).length;
  const jmsOpen = state.jmsPackages.filter(
    (p) => p.status === "uploaded" || p.status === "sic_review"
  ).length;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Admin home"
        subtitle="Excel / paste upload and data entry across ACPL, JMS, rate cards, and master labour. Creates verification packages for SIC."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="SIC DPR queue" value={String(pendingDpr)} tone="accent" />
        <KpiTile label="ACPL open flags" value={String(openAcpl)} tone="warn" />
        <KpiTile label="JMS in flight" value={String(jmsOpen)} />
        <KpiTile
          label="Rate book lines"
          value={String(state.rateLines.length)}
          tone="ok"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/attendance/acpl",
            title: "Upload ACPL punching",
            detail: "CSV / paste → match vs approved DPRs",
          },
          {
            href: "/jms",
            title: "Upload JMS sheet",
            detail: "Measured work → SIC verification package",
          },
          {
            href: "/admin/rates",
            title: "Rate book",
            detail: "PO rates · history · latest wins",
          },
          {
            href: "/admin/trades",
            title: "Trade catalogue",
            detail: "Trades & sub-categories for labour",
          },
          {
            href: "/calculators/estimate",
            title: "Edit rate cards",
            detail: "₹/m² · ₹/m³ for cost estimator",
          },
          {
            href: "/dpr/new",
            title: "Enter DPR (any type)",
            detail: "Admin can draft across modules",
          },
          {
            href: "/hr",
            title: "Master labour / staff",
            detail: "Registers via HR desk",
          },
          {
            href: "/finance",
            title: "Finance follow-up",
            detail: "JMS income & wage ledger",
          },
        ].map((card) => (
          <Link key={card.href} href={card.href}>
            <Panel className="h-full transition hover:border-[var(--sge-accent)]/40">
              <div className="font-heading text-sm font-bold">{card.title}</div>
              <p className="mt-1 text-sm text-[var(--sge-ink-2)]">
                {card.detail}
              </p>
              <Button size="sm" variant="outline" className="mt-3">
                Open
              </Button>
            </Panel>
          </Link>
        ))}
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Finance notifications
        </h3>
        {state.financeAlerts.length === 0 ? (
          <EmptyState
            title="No alerts"
            detail="JMS uploads and payment anomalies appear here."
          />
        ) : (
          state.financeAlerts.slice(0, 5).map((a) => (
            <div
              key={a.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-[var(--sge-ink-2)]">{a.detail}</div>
              </div>
              <StatusPill tone={a.acknowledged ? "ok" : "warn"}>
                {a.kind.replace("_", " ")}
              </StatusPill>
            </div>
          ))
        )}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Labour master (seed)</h3>
        <div className="text-sm text-[var(--sge-ink-2)]">
          {state.labourers.filter((l) => l.active).length} active labourers · avg
          daily wage{" "}
          {formatINR(
            Math.round(
              state.labourers
                .filter((l) => l.active)
                .reduce((s, l) => s + l.wageDaily, 0) /
                Math.max(1, state.labourers.filter((l) => l.active).length)
            )
          )}
        </div>
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("admin", AdminHomePage);
