"use client";

import { guarded } from "@/components/shared/require-module";
import Link from "next/link";
import {
  EmptyState,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaintBoard } from "@/components/work/paint-board";
import { OpsExcelTransfer } from "@/components/ops/ops-excel-transfer";
import { PpeFromDprs } from "@/components/store/ppe-from-dprs";
import { useStore } from "@/lib/store";
import { useSiteReports } from "@/lib/work/use-reports";
import { useState } from "react";

function StoreHomePage() {
  const { state, setEquipmentStatus } = useStore();
  const reports = useSiteReports();
  const [boardMsg, setBoardMsg] = useState<string | null>(null);
  const [faults, setFaults] = useState<Record<string, string>>({});
  const isStore = state.currentRole === "store" || state.currentRole === "super_admin";

  const storeDprs = reports.filter((d) => d.submitterType === "store");

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Store Keeper"
        subtitle="Store DPR, the paint board (PR → PO → RIL / SGE store → our 941 issue → DPR use → 942 reco → 261 post, RIL numbers for reference) and equipment."
        action={
          <div className="flex gap-2">
            <Link href="/dpr/new">
              <Button size="sm">Store DPR</Button>
            </Link>
            <Link href="/dpr">
              <Button size="sm" variant="outline">
                DPR desk
              </Button>
            </Link>
          </div>
        }
      />

      <PpeFromDprs />

      <OpsExcelTransfer kind="equipment" />

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Store DPRs</h3>
        {storeDprs.length === 0 ? (
          <EmptyState
            title="No store DPR"
            detail="Submit daily store sworn record for SIC."
          />
        ) : (
          storeDprs.map((d) => (
            <Link
              key={d.id}
              href={`/dpr/${d.id}`}
              className="mb-2 flex items-center justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <span>
                {d.date} · {d.plant} · {d.note.slice(0, 48)}
              </span>
              <StatusPill
                tone={
                  d.status === "sic_approved"
                    ? "ok"
                    : d.status === "submitted"
                      ? "accent"
                      : "default"
                }
              >
                {d.status.replace("_", " ")}
              </StatusPill>
            </Link>
          ))
        )}
      </Panel>

      <PaintBoard />

      {boardMsg ? (
        <div className="rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">{boardMsg}</div>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Equipment checklist — hopper / compressor / airless / harness
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {state.equipment.map((eq) => (
            <div
              key={eq.id}
              className="rounded-md border border-[var(--sge-line)] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{eq.tag}</div>
                  <div className="text-xs capitalize text-[var(--sge-ink-3)]">
                    {eq.type} · checked {eq.lastCheck}
                  </div>
                </div>
                <StatusPill
                  tone={
                    eq.status === "ok"
                      ? "ok"
                      : eq.status === "due"
                        ? "warn"
                        : "crit"
                  }
                >
                  {eq.status}
                </StatusPill>
              </div>
              {eq.faultNote ? (
                <div className="mb-2 text-xs text-[var(--sge-crit)]">Fault: {eq.faultNote}</div>
              ) : null}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {eq.status !== "fault" ? (
                  <>
                    <Input
                      className="h-7 flex-1 text-xs"
                      placeholder="What's wrong? (to report a fault)"
                      value={faults[eq.id] ?? ""}
                      onChange={(e) => setFaults((f) => ({ ...f, [eq.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        const res = setEquipmentStatus(eq.id, "fault", faults[eq.id]);
                        setBoardMsg(res.ok ? null : res.error ?? null);
                        if (res.ok) setFaults((f) => ({ ...f, [eq.id]: "" }));
                      }}
                    >
                      Report fault
                    </Button>
                  </>
                ) : null}
                {isStore && eq.status !== "ok" ? (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setEquipmentStatus(eq.id, "ok")}>
                    Mark repaired / checked
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-1 text-sm">
                {eq.checklist.map((c) => (
                  <li key={c.item} className="flex justify-between">
                    <span>{c.item}</span>
                    <span>{c.ok ? "✓" : "✗"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("store", StoreHomePage);
