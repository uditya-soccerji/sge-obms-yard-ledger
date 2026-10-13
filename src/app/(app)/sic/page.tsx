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
import { useStore } from "@/lib/store";
import { useSiteReports } from "@/lib/work/use-reports";
import { workedCount } from "@/lib/attendance";

function SicHomePage() {
  const { state } = useStore();
  const reports = useSiteReports();
  const today = todayDate();
  const pending = reports.filter((d) => d.status === "submitted");
  const todayDocs = reports.filter((d) => d.date === today);
  const attend = state.attendance.filter((a) => a.date === today);
  const present = workedCount(attend, today);
  const jmsReview = state.jmsPackages.filter(
    (p) => p.status === "uploaded" || p.status === "sic_review"
  );
  const financeFlags = state.financeAlerts.filter((a) => a.flaggedToSic && !a.acknowledged);

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="SIC home"
        subtitle="Site POC — DPR approval inbox, JMS verification, attendance derived from approved DPRs."
        action={
          <Link href="/approvals/sic">
            <Button size="sm">Open approval inbox</Button>
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="DPR inbox" value={String(pending.length)} tone="accent" />
        <KpiTile label="DPRs today" value={String(todayDocs.length)} />
        <KpiTile label="Attendance" value={`${present}/${attend.length || "—"}`} tone="ok" />
        <KpiTile label="JMS to review" value={String(jmsReview.length)} tone="warn" />
      </div>

      <Panel>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Pending DPR approvals
          </h3>
          <Link href="/approvals/sic">
            <Button size="sm" variant="outline">Inbox</Button>
          </Link>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="Inbox clear" detail="No submitted DPRs waiting." />
        ) : (
          <div className="space-y-2">
            {pending.map((d) => {
              const sup = state.staff.find((s) => s.id === d.submitterId);
              return (
                <Link
                  key={d.id}
                  href={`/dpr/${d.id}`}
                  className="block rounded-md border border-[var(--sge-line)] px-3 py-2 hover:border-[var(--sge-accent)]/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="accent">{d.submitterType.replace("_", " / ")}</StatusPill>
                    <span className="text-sm font-semibold">
                      {d.date} · {d.plant}
                    </span>
                    <span className="text-xs text-[var(--sge-ink-3)]">{sup?.name}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--sge-ink-2)]">{d.note}</p>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">JMS packages</h3>
          {state.jmsPackages.map((b) => (
            <div key={b.id} className="mb-2 flex justify-between text-sm">
              <span className="truncate pr-2">{b.label}</span>
              <StatusPill
                tone={
                  b.status === "sic_approved"
                    ? "ok"
                    : b.status === "sic_rejected"
                      ? "crit"
                      : "accent"
                }
              >
                {b.status.replace("_", " ")}
              </StatusPill>
            </div>
          ))}
          <Link href="/jms">
            <Button size="sm" variant="outline" className="mt-2">
              Open JMS
            </Button>
          </Link>
        </Panel>
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Equipment</h3>
          {state.equipment.map((e) => (
            <div key={e.id} className="mb-1.5 flex justify-between text-sm">
              <span>
                {e.tag}
                {e.expiryDate ? (
                  <span className="ml-1 font-mono text-[10px] text-[var(--sge-ink-3)]">
                    exp {e.expiryDate}
                  </span>
                ) : null}
              </span>
              <StatusPill
                tone={e.status === "ok" ? "ok" : e.status === "due" ? "warn" : "crit"}
              >
                {e.status}
              </StatusPill>
            </div>
          ))}
        </Panel>
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Finance → SIC flags</h3>
          {financeFlags.length === 0 ? (
            <p className="text-sm text-[var(--sge-ink-3)]">No wage / payment flags.</p>
          ) : (
            financeFlags.map((a) => (
              <div key={a.id} className="mb-2 text-sm">
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-[var(--sge-ink-2)]">{a.detail}</div>
              </div>
            ))
          )}
          <div className="mt-2 text-xs text-[var(--sge-ink-3)]">
            Today expenses{" "}
            {formatINR(
              state.finance
                .filter((f) => f.date === today && f.kind === "expense")
                .reduce((s, f) => s + f.amount, 0)
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("sic", SicHomePage);
