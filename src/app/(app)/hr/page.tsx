"use client";

import { useWork } from "@/lib/work/store";
import { PayUploadPanel } from "@/components/hr/pay-upload";
import { PassExpiryPanel } from "@/components/hr/pass-expiry-panel";
import { guarded } from "@/components/shared/require-module";
import { today as todayDate } from "@/lib/today";
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
import { Input } from "@/components/ui/input";
import { ATTENDANCE_OPTIONS, attendanceLabel, workedCount } from "@/lib/attendance";
import { daysAgo } from "@/lib/today";
import type { AttendanceStatus } from "@/lib/types";
import { OpsExcelTransferStack } from "@/components/ops/ops-excel-transfer";

function HrHomePage() {
  const { state, markAttendance } = useStore();
  const { notify } = useWork();
  const today = todayDate();
  const [msg, setMsg] = useState<string | null>(null);
  // HR marks today or yesterday (docs §4); correcting a DPR mark needs a note
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");

  const attendToday = state.attendance.filter((a) => a.date === day);
  const present = workedCount(state.attendance, today);
  const acplFlags = state.acplMatches.filter(
    (m) => m.resolveStatus === "open" && m.flag !== "match"
  ).length;
  const fromDpr = state.attendance.filter((a) => a.sourceDprId).length;

  function setStatus(labourerId: string, status: AttendanceStatus) {
    const lab = state.labourers.find((l) => l.id === labourerId);
    const name = lab?.name;
    const before = state.attendance.find((a) => a.labourerId === labourerId && a.date === day);
    const r = markAttendance(labourerId, status, note, day);
    setMsg(r.ok ? `Marked ${name} as ${attendanceLabel(status)} for ${day}` : r.error ?? "Not saved");
    // Round 2 (§27): a correction of a submitted DPR's mark tells the supervisor and the SIC
    if (r.ok && before?.sourceDprId && before.status !== status) {
      notify({ kind: "attendance_corrected", problem: true, siteId: lab?.siteId ?? before.siteId, subjectStaffId: lab?.supervisorId || undefined, title: `HR corrected ${name}'s attendance ${day}`, detail: `${attendanceLabel(before.status)} → ${attendanceLabel(status)} · ${note.trim()}`, tab: "/home", refId: before.id });
    }
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

      <OpsExcelTransferStack kinds={["attendance", "wageLedger"]} />

      {/* docs §24: RIL passes expiring within 10 days */}
      <PassExpiryPanel />
      {/* docs §24: monthly pay upload (Admin / HR); Finance is told */}
      <PayUploadPanel />

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
        <div className="mb-3 flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="text-xs text-[var(--sge-ink-3)]">Date</span>
            <Input type="date" className="mt-1 w-40" min={daysAgo(1)} max={today} value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <label className="min-w-[240px] flex-1">
            <span className="text-xs text-[var(--sge-ink-3)]">Note (required to correct a mark from an approved DPR)</span>
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. gate record shows half day" />
          </label>
        </div>
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
                        {attendanceLabel(att.status)}
                        {att.sourceDprId ? " · DPR" : ""}
                        {att.correctedFrom ? ` (was ${attendanceLabel(att.correctedFrom)})` : ""}
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
                        {ATTENDANCE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
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

// Route guard: only roles that may use this page get past the URL
export default guarded("hr", HrHomePage);
