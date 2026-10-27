"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { useSiteReports } from "@/lib/work/use-reports";

/**
 * 2026-10-27: PPE marked Damaged / Urgent required on submitted DPRs, for the store keeper.
 * Urgent first, then newest; "Handled" once issued or replaced.
 */
export function PpeFromDprs() {
  const { state } = useStore();
  const { handlePpe } = useWork();
  const reports = useSiteReports();
  const [msg, setMsg] = useState<string | null>(null);
  const canHandle = state.currentRole === "store" || state.currentRole === "owner" || state.currentRole === "super_admin";
  const labourer = (id: string) => state.labourers.find((l) => l.id === id);
  const rows = reports
    .filter((r) => r.status === "submitted" || r.status === "sic_approved")
    .flatMap((r) => r.labourMarks.filter((m) => (m.ppe === "damaged" || m.ppe === "urgent") && !m.ppeHandledAt).map((m) => ({ r, m })))
    .sort((a, b) => Number(b.m.ppe === "urgent") - Number(a.m.ppe === "urgent") || b.r.date.localeCompare(a.r.date));
  const urgent = rows.filter((x) => x.m.ppe === "urgent").length;

  return (
    <Panel>
      <h3 className="mb-2 flex flex-wrap items-center gap-2 font-heading text-sm font-bold">
        PPE from DPRs
        {rows.length ? <StatusPill tone={urgent ? "crit" : "warn"}>{urgent} urgent · {rows.length - urgent} damaged</StatusPill> : null}
      </h3>
      {msg ? <p className="mb-2 text-xs text-[var(--sge-crit)]">{msg}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="No PPE waiting" detail="Damaged or urgently needed PPE marked on a submitted DPR shows here." />
      ) : (
        <div className="divide-y divide-[var(--sge-line)]">
          {rows.map(({ r, m }) => {
            const l = labourer(m.labourerId);
            return (
              <div key={`${r.id}-${m.labourerId}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <StatusPill tone={m.ppe === "urgent" ? "crit" : "warn"}>{m.ppe === "urgent" ? "Urgent required" : "Damaged"}</StatusPill>
                <span className="font-semibold">{l?.name ?? m.labourerId}</span>
                <span className="text-xs text-[var(--sge-ink-3)]">{l?.epNumber} · {r.plant || "—"} ·</span>
                <Link className="text-xs text-[var(--sge-brass-ink)] underline" href={`/dpr/${r.id}`}>DPR {r.date}</Link>
                {canHandle ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => {
                      const res = handlePpe(r.id, m.labourerId);
                      setMsg(res.ok ? null : res.error);
                    }}
                  >
                    Handled
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
