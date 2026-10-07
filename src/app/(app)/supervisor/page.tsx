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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { AttendanceStatus } from "@/lib/types";

export default function SupervisorHomePage() {
  const { state, markAttendance } = useStore();
  const today = "2026-10-05";

  const supervisorId =
    state.currentUserId &&
    state.staff.find((s) => s.id === state.currentUserId)?.role === "supervisor"
      ? state.currentUserId
      : "st-sup1";

  const staff = state.staff.find((s) => s.id === supervisorId);
  const myCrew = useMemo(
    () => state.labourers.filter((l) => l.supervisorId === supervisorId && l.active),
    [state.labourers, supervisorId]
  );

  const isPaintSup = staff?.supervisorType === "painting_blasting";
  const isScaffoldSup = staff?.supervisorType === "scaffolding";
  const myDprType =
    staff?.supervisorType === "scaffolding"
      ? ("scaffolding" as const)
      : staff?.supervisorType === "safety"
        ? ("safety" as const)
        : ("painting_blasting" as const);

  const myPaint = state.paintStock.filter(
    (p) =>
      isPaintSup &&
      (p.issuedTo === supervisorId || p.issuedTo === "st-sup1") &&
      (p.stage === "issued" || p.stage === "consumed" || p.stage === "reco")
  );

  const myDocs = state.dprDocuments.filter(
    (d) => d.submitterId === supervisorId && d.submitterType === myDprType
  );
  const myPlans = state.workPlans.filter((d) => d.supervisorId === supervisorId);
  const pending = myDocs.filter((d) => d.status === "submitted" || d.status === "draft");

  const typeBlurb = isScaffoldSup
    ? "Scaffolding supervisor — scaffold DPR only (erect / dismantle / standing m³)."
    : isPaintSup
      ? "Painting & blasting supervisor — paint/blast DPR + issued paint (941), not safety/scaffold forms."
      : `${staff?.supervisorType?.replace("_", " / ") ?? "Supervisor"} — role-scoped daily DPR.`;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Supervisor home"
        subtitle={typeBlurb}
        action={
          <div className="flex gap-2">
            <Link href="/dpr/new">
              <Button size="sm">New DPR</Button>
            </Link>
            <Link href="/dpr">
              <Button size="sm" variant="outline">DPR desk</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="My crew" value={String(myCrew.length)} />
        <KpiTile label="My DPRs" value={String(myDocs.length)} tone="accent" />
        <KpiTile label="Open / submitted" value={String(pending.length)} tone="warn" />
        {isPaintSup ? (
          <KpiTile label="Paint issued" value={String(myPaint.length)} />
        ) : (
          <KpiTile
            label={isScaffoldSup ? "Scaffold plans" : "Work plans"}
            value={String(myPlans.length)}
          />
        )}
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          My DPRs
        </h3>
        {myDocs.length === 0 ? (
          <EmptyState title="No DPR yet" detail="Create today's sworn record from New DPR." />
        ) : (
          myDocs.map((d) => (
            <Link
              key={d.id}
              href={`/dpr/${d.id}`}
              className="mb-2 block rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm hover:border-[var(--sge-accent)]/40"
            >
              <div className="flex gap-2">
                <StatusPill
                  tone={
                    d.status === "sic_approved"
                      ? "ok"
                      : d.status === "submitted"
                        ? "accent"
                        : d.status === "sic_rejected"
                          ? "crit"
                          : "default"
                  }
                >
                  {d.status.replace("_", " ")}
                </StatusPill>
                <span className="font-medium">
                  {d.date} · {d.plant}
                </span>
              </div>
              <p className="mt-1 text-[var(--sge-ink-2)]">{d.note}</p>
              <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                labour {d.labourMarks.length} · eq {d.equipmentMarks.length} · req{" "}
                {d.requests.length}
                {d.paintWork?.length
                  ? ` · ${d.paintWork.reduce((n, w) => n + w.areaM2, 0)} m²`
                  : ""}
                {d.scaffoldWork?.length
                  ? ` · ${d.scaffoldWork.reduce((n, w) => n + w.standingM3, 0)} m³`
                  : ""}
              </div>
            </Link>
          ))
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Quick attendance — my crew
        </h3>
        <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
          Prefer marking attendance inside the DPR form — SIC approval derives the official record.
        </p>
        {myCrew.length === 0 ? (
          <EmptyState title="No crew assigned" detail="Labourers linked to this supervisor will show here." />
        ) : (
          <div className="space-y-2">
            {myCrew.map((l) => {
              const att = state.attendance.find(
                (a) => a.labourerId === l.id && a.date === today
              );
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-[var(--sge-ink-3)]">
                      {l.trade} · {l.epNumber}
                    </div>
                  </div>
                  <Select
                    value={att?.status ?? ""}
                    onValueChange={(v) =>
                      markAttendance(l.id, v as AttendanceStatus)
                    }
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Mark" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["present", "absent", "half", "leave"] as const).map(
                        (s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Work plan</h3>
          {myPlans.map((p) => (
            <div
              key={p.id}
              className="mb-2 flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{p.task}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  {p.date} · {p.plant}
                  {p.targetM2 ? ` · target ${p.targetM2} m²` : ""}
                </div>
              </div>
              <StatusPill
                tone={
                  p.status === "done"
                    ? "ok"
                    : p.status === "in_progress"
                      ? "accent"
                      : "warn"
                }
              >
                {p.status.replace("_", " ")}
              </StatusPill>
            </div>
          ))}
        </Panel>

        {isPaintSup ? (
          <Panel>
            <h3 className="mb-2 font-heading text-sm font-bold">
              Paint issued to me (941)
            </h3>
            {myPaint.length === 0 ? (
              <EmptyState
                title="No paint issued"
                detail="Store Keeper issues FEFO batches with RIL movement 941."
              />
            ) : (
              myPaint.map((p) => (
                <div
                  key={p.id}
                  className="mb-1.5 flex justify-between gap-2 text-sm"
                >
                  <span>
                    {p.description}
                    <span className="ml-2 font-mono text-[11px] text-[var(--sge-ink-3)]">
                      {p.batch}
                      {p.movement941 ? ` · 941 ${p.movement941}` : ""}
                    </span>
                  </span>
                  <span className="font-mono">{p.qtyLitres} L</span>
                </div>
              ))
            )}
          </Panel>
        ) : (
          <Panel>
            <h3 className="mb-2 font-heading text-sm font-bold">
              Role note
            </h3>
            <p className="text-sm text-[var(--sge-ink-2)]">
              {isScaffoldSup
                ? "Scaffold DPR only — no paint lifecycle body on your forms."
                : "Your DPR type is locked to your supervisor role."}
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
