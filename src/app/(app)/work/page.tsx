"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, SectionHeader } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { WorkJms, WorkOrders } from "@/components/work/work-jms";
import { WorkJobs } from "@/components/work/work-jobs";
import { WorkPaint } from "@/components/work/work-paint";
import { WorkPlan } from "@/components/work/work-plan";
import { canAccessWork } from "@/lib/desk";
import { ALL_SITES } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "plan", label: "Plan vs actual" },
  { id: "jobs", label: "Jobs & DPR" },
  { id: "jms", label: "JMS" },
  { id: "wo", label: "Work order" },
  { id: "paint", label: "Paint stock" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function WorkInner() {
  const { state } = useStore();
  const { hydrated, resetWork } = useWork();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.find((t) => t.id === params.get("t"))?.id ?? "plan") as TabId;
  const siteName = state.currentSiteId === ALL_SITES ? "All sites" : state.sites.find((s) => s.id === state.currentSiteId)?.name;

  if (!canAccessWork(state.currentRole)) {
    return <EmptyState title="Work is for supervisors, SIC, Admin, Owner and Super Admin" detail="Switch to one of those seats to open it." />;
  }
  if (!hydrated) return <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">Loading work…</div>;

  return (
    <div className="sge-enter space-y-4">
      <SectionHeader
        title={`Work · ${siteName}`}
        subtitle="Work order → monthly plan → jobs → DPR (with measurements) → JMS at final shade. Actual = sum of JMS; remaining work carries forward."
        action={
          state.currentRole === "super_admin" || state.currentRole === "owner" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (window.confirm("Reset the work demo data (plans, jobs, DPRs, JMS, paint) to the seed?")) resetWork();
              }}
            >
              Reset work demo
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap gap-1 border-b border-[var(--sge-line)] pb-2">
        {TABS.map((t) => (
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
      {tab === "wo" ? <WorkOrders /> : null}
      {tab === "paint" ? <WorkPaint /> : null}
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
