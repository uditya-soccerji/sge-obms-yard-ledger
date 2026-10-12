"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, SectionHeader } from "@/components/shared/ui-bits";
import { TestTools } from "@/components/work/test-tools";
import { WorkActivity } from "@/components/work/work-activity";
import { WorkJms, WorkOrders } from "@/components/work/work-jms";
import { WorkJobs } from "@/components/work/work-jobs";
import { WorkPaint } from "@/components/work/work-paint";
import { WorkPayments } from "@/components/work/work-payments";
import { WorkPlan } from "@/components/work/work-plan";
import { WorkPnl } from "@/components/work/work-pnl";
import { canAccessWork } from "@/lib/desk";
import { workTabsFor } from "@/lib/work/permissions";
import { ALL_SITES } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "plan", label: "Plan vs actual", money: false, boss: false },
  { id: "jobs", label: "Jobs & DPR", money: false, boss: false },
  { id: "jms", label: "JMS", money: false, boss: false },
  { id: "payments", label: "Payments", money: true, boss: false },
  { id: "pnl", label: "P&L", money: true, boss: false },
  { id: "wo", label: "Work order", money: false, boss: false },
  { id: "paint", label: "Paint stock", money: false, boss: false },
  { id: "activity", label: "Activity log", money: false, boss: true },
] as const;
type TabId = (typeof TABS)[number]["id"];

function WorkInner() {
  const { state } = useStore();
  const { hydrated } = useWork();
  const params = useSearchParams();
  const router = useRouter();
  const role = state.currentRole;
  const canMoney = role === "owner" || role === "super_admin" || role === "finance";
  const isBoss = role === "owner" || role === "super_admin";
  const only = workTabsFor(role);
  const tabs = TABS.filter((t) => (!t.money || canMoney) && (!t.boss || isBoss) && (only === "all" || only.includes(t.id)));
  const fallback: TabId = role === "finance" ? "payments" : (tabs[0]?.id ?? "plan");
  const tab = (tabs.find((t) => t.id === params.get("t"))?.id ?? fallback) as TabId;
  const siteName = state.currentSiteId === ALL_SITES ? "All sites" : state.sites.find((s) => s.id === state.currentSiteId)?.name;

  if (!canAccessWork(role)) {
    return <EmptyState title="Work is for supervisors, SIC, Admin, Store, Finance, Owner and Super Admin" detail="Switch to one of those seats to open it." />;
  }
  if (!hydrated) return <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">Loading work…</div>;

  return (
    <div className="sge-enter space-y-4">
      <SectionHeader
        title={`Work · ${siteName}`}
        subtitle="Work order → monthly plan → jobs → DPR (with measurements) → JMS at final shade → payment received. Actual = sum of JMS; remaining work carries forward."
      />
      <TestTools />
      <div className="flex flex-wrap gap-1 border-b border-[var(--sge-line)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.replace(`/work?t=${t.id}`)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
              tab === t.id ? "bg-[var(--sge-night)] text-white" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "plan" ? <WorkPlan /> : null}
      {tab === "jobs" ? <WorkJobs /> : null}
      {tab === "jms" ? <WorkJms /> : null}
      {tab === "payments" ? <WorkPayments /> : null}
      {tab === "pnl" ? <WorkPnl /> : null}
      {tab === "wo" ? <WorkOrders /> : null}
      {tab === "paint" ? <WorkPaint /> : null}
      {tab === "activity" ? <WorkActivity /> : null}
    </div>
  );
}

export default function WorkPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">Opening work…</div>}>
      <WorkInner />
    </Suspense>
  );
}
