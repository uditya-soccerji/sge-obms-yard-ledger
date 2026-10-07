"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  allowedDprSubmitterTypes,
  defaultDprSubmitterType,
} from "@/lib/paint-lifecycle";
import { plantScopeFor } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import type { DprStatus, DprSubmitterType } from "@/lib/types";

const STATUS_TONE: Record<
  DprStatus,
  "default" | "ok" | "warn" | "crit" | "accent"
> = {
  draft: "default",
  submitted: "accent",
  sic_approved: "ok",
  sic_rejected: "crit",
  locked: "warn",
};

const TYPE_LABEL: Record<DprSubmitterType, string> = {
  painting_blasting: "Painting / Blasting",
  scaffolding: "Scaffolding",
  safety: "Safety",
  store: "Store",
};

export default function DprDeskPage() {
  const { state, currentAccount } = useStore();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const role = state.currentRole;
  const userId = state.currentUserId;
  const staff = state.staff.find((s) => s.id === userId);
  const scope = plantScopeFor(currentAccount, role);
  const allowedTypes = allowedDprSubmitterTypes(role, staff);
  const lockedType =
    allowedTypes === "all" ? null : defaultDprSubmitterType(role, staff);

  const visible = useMemo(() => {
    let docs = state.dprDocuments;
    if (role === "supervisor" || role === "store" || role === "safety") {
      docs = docs.filter((d) => d.submitterId === userId);
      if (lockedType) {
        docs = docs.filter((d) => d.submitterType === lockedType);
      }
    }
    if (scope !== "all") {
      docs = docs.filter((d) => scope.includes(d.plant));
    }
    if (typeFilter !== "all") {
      docs = docs.filter(
        (d) => d.submitterType === (typeFilter as DprSubmitterType)
      );
    }
    if (statusFilter !== "all") {
      docs = docs.filter((d) => d.status === (statusFilter as DprStatus));
    }
    return [...docs].sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [
    state.dprDocuments,
    role,
    userId,
    typeFilter,
    statusFilter,
    scope,
    lockedType,
  ]);

  const pending = state.dprDocuments.filter(
    (d) => d.status === "submitted"
  ).length;
  const approved = state.dprDocuments.filter(
    (d) => d.status === "sic_approved"
  ).length;

  const canCreate =
    role === "supervisor" ||
    role === "store" ||
    role === "safety" ||
    role === "admin" ||
    role === "owner" ||
    role === "super_admin";

  const typeOptions: DprSubmitterType[] =
    allowedTypes === "all"
      ? ["painting_blasting", "scaffolding", "safety", "store"]
      : allowedTypes;

  const subtitle =
    lockedType != null
      ? `Your ${TYPE_LABEL[lockedType]} sworn records only — labour, equipment, requests, next-day plan.`
      : "Daily sworn records — labour, equipment, requests, next-day plan. SIC verifies before attendance / rating.";

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="DPR desk"
        subtitle={subtitle}
        action={
          canCreate ? (
            <Link href="/dpr/new">
              <Button size="sm">New DPR</Button>
            </Link>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Visible DPRs" value={String(visible.length)} />
        <KpiTile label="Awaiting SIC" value={String(pending)} tone="accent" />
        <KpiTile label="SIC approved" value={String(approved)} tone="ok" />
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap gap-2">
          {allowedTypes === "all" ? (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex h-8 items-center rounded-md border border-[var(--sge-line)] px-3 text-xs font-medium">
              Type: {lockedType ? TYPE_LABEL[lockedType] : "—"}
            </div>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="sic_approved">SIC approved</SelectItem>
              <SelectItem value="sic_rejected">SIC rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="No DPRs match"
            detail="Create a new DPR or clear filters."
          />
        ) : (
          <div className="space-y-2">
            {visible.map((d) => {
              const submitter = state.staff.find((s) => s.id === d.submitterId);
              const labourPresent = d.labourMarks.filter(
                (m) => m.status === "present" || m.status === "half"
              ).length;
              return (
                <Link
                  key={d.id}
                  href={`/dpr/${d.id}`}
                  className="block rounded-md border border-[var(--sge-line)] px-3 py-2.5 transition hover:border-[var(--sge-accent)]/40 hover:bg-[var(--sge-accent-wash)]/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={STATUS_TONE[d.status]}>
                      {d.status.replace("_", " ")}
                    </StatusPill>
                    <StatusPill>{TYPE_LABEL[d.submitterType]}</StatusPill>
                    <span className="text-sm font-semibold">
                      {d.date} · {d.plant}
                    </span>
                    <span className="text-xs text-[var(--sge-ink-3)]">
                      {submitter?.name}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm text-[var(--sge-ink-2)]">
                    {d.note || d.nextDayPlan || "—"}
                  </p>
                  <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                    labour {labourPresent}/{d.labourMarks.length}
                    {d.paintWork?.length
                      ? ` · paint lines ${d.paintWork.length}`
                      : ""}
                    {d.scaffoldWork?.length
                      ? ` · scaffold ${d.scaffoldWork.reduce((n, w) => n + w.standingM3, 0)} m³`
                      : ""}
                    {d.requests.length ? ` · req ${d.requests.length}` : ""}
                    {d.telegramDraftLines.length
                      ? ` · TG ${d.telegramDraftLines.length}`
                      : ""}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
