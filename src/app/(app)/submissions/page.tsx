"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { canViewModule } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import { useSiteReports } from "@/lib/work/use-reports";
import type { ReportStatus } from "@/lib/work/types";
import type { JmsPackageStatus } from "@/lib/types";

const DPR_TONE: Record<ReportStatus, "ok" | "warn" | "accent" | "crit" | "default"> = {
  draft: "default",
  submitted: "warn",
  sic_approved: "ok",
  sic_rejected: "crit",
};

const JMS_TONE: Record<JmsPackageStatus, "ok" | "warn" | "accent" | "crit" | "default"> = {
  draft: "default",
  uploaded: "warn",
  sic_review: "accent",
  sic_approved: "ok",
  sic_rejected: "crit",
};

export default function MySubmissionsPage() {
  const { state, currentAccount } = useStore();
  const reports = useSiteReports();
  const canView = canViewModule(currentAccount, state.currentRole, "submissions");
  const userId = state.currentUserId;
  const accountId = state.currentAccountId;

  const myDprs = useMemo(() => {
    if (!userId) return [];
    return reports
      .filter((d) => d.submitterId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [reports, userId]);

  const myJms = useMemo(() => {
    if (!userId && !accountId) return [];
    return state.jmsPackages
      .filter((p) => p.uploadedBy === userId || p.uploadedBy === accountId)
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  }, [state.jmsPackages, userId, accountId]);

  const awaiting = myDprs.filter((d) => d.status === "submitted").length;
  const drafts = myDprs.filter((d) => d.status === "draft" || d.status === "sic_rejected").length;

  if (!canView) {
    return (
      <EmptyState
        title="No submissions view"
        detail="Your role does not include My submissions."
      />
    );
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="My submissions"
        subtitle="Your drafts and packages awaiting SIC — DPR freeze applies once submitted until reject."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Drafts / rejected" value={String(drafts)} />
        <KpiTile label="Awaiting SIC" value={String(awaiting)} tone="warn" />
        <KpiTile label="JMS packages" value={String(myJms.length)} />
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold">DPR packages</h3>
          <Link href="/dpr/new">
            <Button size="sm">New DPR</Button>
          </Link>
        </div>
        {myDprs.length === 0 ? (
          <EmptyState
            title="No DPR submissions yet"
            detail="Create a DPR from the desk — Excel/own-module uploads also land here after submit."
          />
        ) : (
          <div className="space-y-2">
            {myDprs.map((d) => (
              <Link
                key={d.id}
                href={`/dpr/${d.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2 transition hover:border-[var(--sge-accent)]/40"
              >
                <div>
                  <div className="text-sm font-medium">
                    {d.date} · {d.plant} · {d.submitterType}
                  </div>
                  <div className="text-xs text-[var(--sge-ink-3)]">
                    {d.id} · updated {d.updatedAt.slice(0, 16).replace("T", " ")}
                    {d.status === "submitted"
                      ? " · frozen until SIC review"
                      : ""}
                  </div>
                </div>
                <StatusPill tone={DPR_TONE[d.status]}>{d.status}</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">JMS / upload packages</h3>
        {myJms.length === 0 ? (
          <EmptyState
            title="No upload packages"
            detail="Admin Excel/JMS uploads you own appear here while awaiting SIC."
          />
        ) : (
          <div className="space-y-2">
            {myJms.map((p) => (
              <Link
                key={p.id}
                href="/jms"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-[var(--sge-ink-3)]">
                    {p.period} · {p.lines.length} lines
                  </div>
                </div>
                <StatusPill tone={JMS_TONE[p.status]}>{p.status}</StatusPill>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
