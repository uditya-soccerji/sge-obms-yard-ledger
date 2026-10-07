"use client";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import type { AttendanceStatus } from "@/lib/types";

export default function HrHomePage() {
  const { state, markAttendance } = useStore();
  const today = "2026-10-05";
  const [msg, setMsg] = useState<string | null>(null);

  const attendToday = state.attendance.filter((a) => a.date === today);
  const present = attendToday.filter(
    (a) => a.status === "present" || a.status === "half"
  ).length;
  const acplFlags = state.acplMatches.filter(
    (m) => m.resolveStatus === "open" && m.flag !== "match"
  ).length;
  const fromDpr = state.attendance.filter((a) => a.sourceDprId).length;

  function setStatus(labourerId: string, status: AttendanceStatus) {
    markAttendance(labourerId, status);
    const name = state.labourers.find((l) => l.id === labourerId)?.name;
    setMsg(`Marked ${name} as ${status}`);
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="HR home"
        subtitle="Attendance from SIC-approved DPRs + ACPL match resolve. Labourer & staff registers, compliance."
        action={
          <Link href="/attendance/acpl">
            <Button size="sm">ACPL match desk</Button>
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Present today" value={`${present}`} tone="ok" />
        <KpiTile
          label="Active labourers"
          value={String(state.labourers.filter((l) => l.active).length)}
        />
        <KpiTile label="From approved DPR" value={String(fromDpr)} tone="accent" />
        <KpiTile label="ACPL open flags" value={String(acplFlags)} tone="warn" />
      </div>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Daily attendance entry
        </h3>
        <div className="space-y-2">
          {state.labourers
            .filter((l) => l.active)
            .map((l) => {
              const att = attendToday.find((a) => a.labourerId === l.id);
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
                >
                  <div>
                    <div className="text-sm font-semibold">{l.name}</div>
                    <div className="text-xs text-[var(--sge-ink-3)]">
                      {l.trade} · EP {l.epNumber}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {att ? (
                      <StatusPill
                        tone={
                          att.status === "present"
                            ? "ok"
                            : att.status === "absent"
                              ? "crit"
                              : "warn"
                        }
                      >
                        {att.status}
                      </StatusPill>
                    ) : (
                      <StatusPill>unset</StatusPill>
                    )}
                    <Select
                      value={att?.status ?? ""}
                      onValueChange={(v) =>
                        setStatus(l.id, v as AttendanceStatus)
                      }
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue placeholder="Mark" />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          ["present", "absent", "half", "leave", "off"] as const
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Labourer register</h3>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--sge-surface)] text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr>
                  <th className="py-1">Name</th>
                  <th>Trade</th>
                  <th>EP</th>
                  <th>Gate</th>
                </tr>
              </thead>
              <tbody>
                {state.labourers.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--sge-line)]">
                    <td className="py-1.5">
                      {l.name}
                      {!l.active ? (
                        <span className="ml-1 text-[10px] text-[var(--sge-crit)]">
                          inactive
                        </span>
                      ) : null}
                    </td>
                    <td>{l.trade}</td>
                    <td className="font-mono text-xs">{l.epNumber}</td>
                    <td className="font-mono text-xs">{l.gatePass}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Staff register</h3>
          {state.staff.map((s) => (
            <div
              key={s.id}
              className="flex justify-between border-b border-[var(--sge-line)] py-1.5 text-sm last:border-0"
            >
              <span>
                {s.name}
                <span className="ml-2 text-xs text-[var(--sge-ink-3)]">
                  {s.designation}
                </span>
              </span>
              <StatusPill>{s.role}</StatusPill>
            </div>
          ))}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Material transfer view</h3>
          {state.transfers.length === 0 ? (
            <EmptyState title="No transfers" detail="HR can view transfers logged by store." />
          ) : (
            state.transfers.map((t) => (
              <div
                key={t.id}
                className="mb-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {t.fromLoc} → {t.toLoc}
                </div>
                <div className="font-mono text-xs text-[var(--sge-ink-3)]">
                  {t.date} · SAP {t.sapCode} · {t.qty} L · {t.note}
                </div>
              </div>
            ))
          )}
        </Panel>
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Compliance uploads (mock)</h3>
          {state.compliance.map((c) => (
            <div
              key={c.id}
              className="mb-2 flex items-center justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  {c.category} · {c.uploadedAt}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled>
                Upload mock
              </Button>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
