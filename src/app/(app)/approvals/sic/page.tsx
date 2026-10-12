"use client";

import { guarded } from "@/components/shared/require-module";
import Link from "next/link";
import { useState } from "react";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";

function SicApprovalsPage() {
  const { state, reviewDpr } = useStore();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const pending = state.dprDocuments.filter((d) => d.status === "submitted");
  const recent = state.dprDocuments
    .filter((d) => d.status === "sic_approved" || d.status === "sic_rejected")
    .slice(0, 8);

  function act(id: string, decision: "sic_approved" | "sic_rejected") {
    const r = reviewDpr(id, decision, notes[id] ?? "");
    if (!r.ok) {
      setMsg(r.error ?? "Review blocked");
      return;
    }
    setMsg(
      decision === "sic_approved"
        ? "Approved — labour attendance derived for ACPL."
        : "Rejected — sent back to the supervisor with your reason."
    );
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="SIC approval inbox"
        subtitle="Approve or reject supervisor / store / safety DPRs. Approved DPRs feed attendance & JMS matching."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Pending" value={String(pending.length)} tone="accent" />
        <KpiTile
          label="Approved (seed+)"
          value={String(
            state.dprDocuments.filter((d) => d.status === "sic_approved").length
          )}
          tone="ok"
        />
        <KpiTile
          label="Rejected"
          value={String(
            state.dprDocuments.filter((d) => d.status === "sic_rejected").length
          )}
          tone="warn"
        />
      </div>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Awaiting review
        </h3>
        {pending.length === 0 ? (
          <EmptyState
            title="Inbox clear"
            detail="No submitted DPRs waiting. Supervisors submit from the DPR desk."
          />
        ) : (
          <div className="space-y-4">
            {pending.map((d) => {
              const name = state.staff.find((s) => s.id === d.submitterId)?.name;
              return (
                <div
                  key={d.id}
                  className="rounded-md border border-[var(--sge-line)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="accent">
                          {d.submitterType.replace("_", " / ")}
                        </StatusPill>
                        <span className="text-sm font-semibold">
                          {d.date} · {d.plant}
                        </span>
                        <span className="text-xs text-[var(--sge-ink-3)]">
                          {name}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--sge-ink-2)]">
                        {d.note}
                      </p>
                      <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                        labour {d.labourMarks.length} · equipment{" "}
                        {d.equipmentMarks.length} · requests {d.requests.length}
                      </div>
                    </div>
                    <Link href={`/dpr/${d.id}`}>
                      <Button size="sm" variant="outline">
                        Open
                      </Button>
                    </Link>
                  </div>
                  <div className="mt-3">
                    <Label>Note</Label>
                    <Textarea
                      className="mt-1 mb-2"
                      rows={2}
                      value={notes[d.id] ?? ""}
                      onChange={(e) =>
                        setNotes((n) => ({ ...n, [d.id]: e.target.value }))
                      }
                      placeholder="Approval note, or the reason for rejecting (required)"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => act(d.id, "sic_approved")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act(d.id, "sic_rejected")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Recent decisions</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">None yet.</p>
        ) : (
          recent.map((d) => (
            <div
              key={d.id}
              className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sge-line)] py-2 text-sm last:border-0"
            >
              <span>
                {d.date} · {d.plant} ·{" "}
                {state.staff.find((s) => s.id === d.submitterId)?.name}
              </span>
              <StatusPill
                tone={d.status === "sic_approved" ? "ok" : "crit"}
              >
                {d.status.replace("sic_", "")}
              </StatusPill>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("approvals", SicApprovalsPage);
