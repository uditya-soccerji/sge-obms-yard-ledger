"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { JmsLine } from "@/lib/types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function JmsPage() {
  const {
    state,
    uploadJmsPackage,
    matchJmsLines,
    reviewJmsPackage,
    computeRatings,
    markJmsPayment,
  } = useStore();
  const [label, setLabel] = useState("JMS Oct W2 — CPP");
  const [period, setPeriod] = useState("2026-10-W2");
  const [paste, setPaste] = useState(
    `Pipe rack B-12 painting,CPP,painting,400,m2,450
V-204 blasting,CPP,blasting,150,m2,380
FS-01 scaffold,CPP,scaffolding,840,m3,85`
  );
  const [sicNote, setSicNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const pkgs = state.jmsPackages;
  const ratings = state.workRatings;

  function parseLines(text: string): JmsLine[] {
    return text
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [description, plant, activity, qty, unit, rate] = line
          .split(",")
          .map((p) => p.trim());
        const q = Number(qty) || 0;
        const r = Number(rate) || 0;
        return {
          id: uid("jl"),
          description: description || "Line",
          plant: plant || "CPP",
          activity: (activity as JmsLine["activity"]) || "painting",
          qty: q,
          unit: (unit as "m2" | "m3") || "m2",
          rateInr: r,
          amountInr: q * r,
        };
      });
  }

  function handleUpload() {
    const lines = parseLines(paste);
    if (!lines.length) return;
    const id = uploadJmsPackage({
      label,
      period,
      uploadedAt: "2026-10-05",
      uploadedBy: state.currentUserId ?? "st-admin",
      status: "uploaded",
      lines,
    });
    setMsg(`JMS package uploaded (${id}) — Finance notified.`);
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="JMS & work ratings"
        subtitle="Admin uploads measured / billed JMS → match to supervisor DPR work → SIC verify → incentive ratings."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="Packages" value={String(pkgs.length)} />
        <KpiTile
          label="Expected income"
          value={formatINR(pkgs.reduce((s, p) => s + p.expectedIncome, 0))}
          tone="accent"
        />
        <KpiTile label="Ratings" value={String(ratings.length)} tone="ok" />
        <KpiTile
          label="Unpaid JMS"
          value={String(pkgs.filter((p) => !p.paymentReceived).length)}
          tone="warn"
        />
      </div>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      {(state.currentRole === "admin" ||
        state.currentRole === "owner" ||
        state.currentRole === "hr") && (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Upload JMS (CSV paste)
          </h3>
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Label</Label>
              <Input
                className="mt-1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <Label>Period</Label>
              <Input
                className="mt-1"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </div>
          <Label>Lines: desc, plant, activity, qty, unit, rate (rate 0 → rate book)</Label>
          <Textarea
            className="mt-1 mb-3 font-mono text-xs"
            rows={5}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <Button type="button" onClick={handleUpload}>
            Upload & notify Finance
          </Button>
        </Panel>
      )}

      {pkgs.length === 0 ? (
        <EmptyState
          title="No JMS packages"
          detail="Admin uploads measured work sheets here."
        />
      ) : (
        pkgs.map((pkg) => (
          <Panel key={pkg.id}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-base font-bold">{pkg.label}</h3>
                  <StatusPill
                    tone={
                      pkg.status === "sic_approved"
                        ? "ok"
                        : pkg.status === "sic_rejected"
                          ? "crit"
                          : "accent"
                    }
                  >
                    {pkg.status.replace("_", " ")}
                  </StatusPill>
                  {pkg.paymentReceived ? (
                    <StatusPill tone="ok">paid</StatusPill>
                  ) : (
                    <StatusPill tone="warn">payment due</StatusPill>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs text-[var(--sge-ink-3)]">
                  {pkg.period} · expected {formatINR(pkg.expectedIncome)} · by{" "}
                  {pkg.uploadedBy}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    matchJmsLines(pkg.id);
                    setMsg("Lines matched to DPR work.");
                  }}
                >
                  Match → DPR
                </Button>
                {(state.currentRole === "sic" ||
                  state.currentRole === "owner") && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        reviewJmsPackage(
                          pkg.id,
                          "sic_approved",
                          sicNote || "Verified vs DPR"
                        );
                        setMsg("JMS SIC-approved — Finance notified.");
                      }}
                    >
                      SIC approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        reviewJmsPackage(
                          pkg.id,
                          "sic_rejected",
                          sicNote || "Qty mismatch"
                        );
                        setMsg("JMS rejected.");
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    computeRatings(pkg.id);
                    setMsg("Work ratings + incentive drafts computed.");
                  }}
                >
                  Compute ratings
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    markJmsPayment(pkg.id, true, "Bank credit noted");
                    setMsg("Payment marked received.");
                  }}
                >
                  Mark paid
                </Button>
              </div>
            </div>

            {(state.currentRole === "sic" || state.currentRole === "owner") && (
              <div className="mb-3">
                <Label>SIC note</Label>
                <Textarea
                  className="mt-1"
                  rows={2}
                  value={sicNote}
                  onChange={(e) => setSicNote(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              {pkg.lines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{line.description}</span>
                    <span className="font-mono">
                      {line.qty} {line.unit} · {formatINR(line.amountInr)}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                    {line.activity} · {line.plant}
                    {line.matchedDprId
                      ? ` · matched ${line.matchedDprId} claimed ${line.dprClaimedQty} ratio ${((line.matchRatio ?? 0) * 100).toFixed(0)}%`
                      : " · unmatched"}
                  </div>
                </div>
              ))}
            </div>

            {ratings.filter((r) => r.jmsPackageId === pkg.id).length > 0 ? (
              <div className="mt-4 border-t border-[var(--sge-line)] pt-3">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                  Work ratings
                </h4>
                {ratings
                  .filter((r) => r.jmsPackageId === pkg.id)
                  .map((r) => {
                    const name = state.staff.find(
                      (s) => s.id === r.supervisorId
                    )?.name;
                    return (
                      <div
                        key={r.id}
                        className="mb-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{name}</span>
                          <StatusPill tone="accent">score {r.score}/5</StatusPill>
                          <span className="font-mono text-xs text-[var(--sge-ink-3)]">
                            supv {formatINR(r.suggestedSupervisorIncentive)} ·
                            labour pool {formatINR(r.suggestedLabourIncentive)}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--sge-ink-2)]">
                          JMS {r.jmsAcceptedQty} / DPR {r.dprClaimedQty} · att{" "}
                          {r.attendanceIntegrity} · eq {r.equipmentCare} · req{" "}
                          {r.requestHygiene}
                          {r.qualityFlags.length
                            ? ` · flags: ${r.qualityFlags.join(", ")}`
                            : ""}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : null}
          </Panel>
        ))
      )}
    </div>
  );
}
