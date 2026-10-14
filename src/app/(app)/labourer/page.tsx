"use client";

import { guarded } from "@/components/shared/require-module";
import {
  EmptyState,
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { skillLabel } from "@/lib/labour-import";
import { otHours } from "@/lib/attendance";
import { passState, showDate } from "@/lib/gate-pass";
import { today } from "@/lib/today";
import type { WageLedgerEntry } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

/** Pay lines on the profile, in this order; empty ones are hidden (docs §24) */
const EARN: { kind: WageLedgerEntry["kind"]; label: string }[] = [
  { kind: "salary", label: "Wage" },
  { kind: "ot", label: "OT" },
  { kind: "bonus", label: "Bonus" },
  { kind: "incentive", label: "Incentive" },
];
const CUT: { kind: WageLedgerEntry["kind"]; label: string }[] = [
  { kind: "advance", label: "Advance" },
  { kind: "pf", label: "PF" },
  { kind: "room_rent", label: "Room rent" },
  { kind: "travel", label: "Travel" },
  { kind: "food", label: "Food" },
  { kind: "deduction", label: "Other deductions" },
];
const monthName = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1]} ${y}`;
};

function LabourerHomePage() {
  const { state, currentAccount, updateLabourer } = useStore();
  const isLabourerOnly = state.currentRole === "labourer";
  const lockedId = isLabourerOnly
    ? currentAccount?.labourerId ?? state.currentUserId
    : null;
  const askedId = useSearchParams().get("id");
  const [labourerId, setLabourerId] = useState(
    lockedId ??
      (askedId && state.labourers.some((l) => l.id === askedId) ? askedId : null) ??
      state.labourers.find((l) => l.active)?.id ??
      state.labourers[0]?.id
  );

  const effectiveId = lockedId ?? labourerId;
  const labourer = state.labourers.find((l) => l.id === effectiveId);
  const history = useMemo(
    () =>
      state.attendance
        .filter((a) => a.labourerId === effectiveId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.attendance, effectiveId]
  );

  // Month view (docs §24): attendance counts and the month's pay
  const ledger = useMemo(() => state.wageLedger.filter((w) => w.labourerId === effectiveId), [state.wageLedger, effectiveId]);
  const months = useMemo(
    () => [...new Set([today().slice(0, 7), ...history.map((a) => a.date.slice(0, 7)), ...ledger.map((w) => w.date.slice(0, 7))])].sort().reverse(),
    [history, ledger]
  );
  const [pickedMonth, setMonth] = useState<string | null>(null);
  const month = pickedMonth && months.includes(pickedMonth) ? pickedMonth : (months.find((m) => history.some((a) => a.date.startsWith(m))) ?? months[0]);
  const inMonth = history.filter((a) => a.date.startsWith(month));
  const count = (...st: string[]) => inMonth.filter((a) => st.includes(a.status)).length;
  const presentDays = count("present", "overtime") + 0.5 * count("half");
  const otTotal = inMonth.reduce((n, a) => n + otHours(a.inTime, a.outTime), 0);
  const monthLedger = ledger.filter((w) => w.date.startsWith(month));
  const sumOf = (k: WageLedgerEntry["kind"]) => monthLedger.filter((w) => w.kind === k).reduce((n, w) => n + w.amount, 0);
  // An uploaded wage for the month (docs §24) replaces the days × rate estimate
  const wage = labourer && sumOf("salary") === 0 ? labourer.wageDaily * presentDays : 0;
  const earnLines = [
    ...(wage > 0 ? [{ label: `Wage (${presentDays} days × ${formatINR(labourer!.wageDaily)})`, amount: wage }] : []),
    ...EARN.map((e) => ({ label: e.label, amount: sumOf(e.kind) })),
  ].filter((l) => l.amount !== 0);
  const cutLines = CUT.map((e) => ({ label: e.label, amount: Math.abs(sumOf(e.kind)) })).filter((l) => l.amount !== 0);
  const net = earnLines.reduce((n, l) => n + l.amount, 0) - cutLines.reduce((n, l) => n + l.amount, 0);
  const pass = labourer ? passState(labourer, today()) : null;

  const equipment = state.equipment.filter((e) =>
    labourer?.equipmentIds.includes(e.id)
  );

  const canEditTrade =
    state.currentRole === "hr" ||
    state.currentRole === "admin" ||
    state.currentRole === "super_admin";

  if (!labourer) {
    return (
      <EmptyState
        title="No labourer profiles"
        detail="Seed labourers to preview the read-mostly labourer home."
      />
    );
  }

  const tradeDef = state.tradeCatalogue.find((t) => t.id === labourer.trade);
  const tradeLabel = tradeDef?.label ?? labourer.trade;
  const subLabel = tradeDef?.subcategories.find(
    (s) => s.id === labourer.tradeSubcategory
  )?.label;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Labourer profile"
        subtitle={
          isLabourerOnly
            ? "Your profile only — EP / gate pass, attendance, equipment, wages (read-only)."
            : "EP / gate pass, trade (+ sub-category), attendance history, assigned equipment, wages gist."
        }
        action={
          isLabourerOnly ? undefined : (
            <Select value={effectiveId} onValueChange={setLabourerId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {state.labourers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiTile
          label="Trade"
          value={subLabel ? `${tradeLabel} · ${subLabel}` : tradeLabel}
          tone="accent"
        />
        <KpiTile label="EP number" value={labourer.epNumber} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-heading text-sm font-bold">Attendance · {monthName(month)}</h3>
            <select
              aria-label="Month"
              className="ml-auto h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="Present" value={String(presentDays)} tone="ok" />
            <KpiTile label="Absent" value={String(count("absent"))} tone="crit" />
            <KpiTile label="Leave" value={String(count("leave"))} tone="warn" />
            <KpiTile label="OT hours" value={String(otTotal)} tone="accent" />
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Pay · {monthName(month)}</h3>
          {earnLines.length + cutLines.length === 0 ? (
            <EmptyState title="No pay recorded for this month" detail="Pay lines come from the monthly pay upload." />
          ) : (
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {earnLines.map((l) => (
                  <tr key={l.label}>
                    <td className="py-0.5">{l.label}</td>
                    <td className="text-right font-mono">{formatINR(l.amount)}</td>
                  </tr>
                ))}
                {cutLines.map((l) => (
                  <tr key={l.label} className="text-[var(--sge-crit)]">
                    <td className="py-0.5">{l.label}</td>
                    <td className="text-right font-mono">−{formatINR(l.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--sge-line)] font-semibold">
                  <td className="pt-1.5">Net pay</td>
                  <td className="pt-1.5 text-right font-mono">{formatINR(net)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Gate pass</h3>
          <div className="rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] p-4">
            <div className="font-heading text-2xl font-bold">{labourer.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  RIL pass
                </div>
                <div className={labourer.rilStatus && /expired|hibernat/i.test(labourer.rilStatus) ? "font-semibold text-[var(--sge-crit)]" : "font-semibold"}>
                  {labourer.rilStatus ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  EP
                </div>
                <div className="font-mono font-semibold">{labourer.epNumber}</div>
              </div>
              {/* docs §24: pass dates from RIL's export; HR / Admin / supervisor alerted 10 days before */}
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">Valid from</div>
                <div className="font-mono text-sm">{showDate(labourer.passValidFrom)}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">Expires</div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-sm">
                  {showDate(labourer.passExpiry)}
                  {pass ? (
                    <StatusPill tone={pass.state === "expired" ? "crit" : pass.state === "expiring" ? "warn" : "ok"}>
                      {pass.state === "expired" ? "expired" : `${pass.days} d left`}
                    </StatusPill>
                  ) : null}
                </div>
              </div>
              {/* Owner 2026-10-14: EIC is the RIL contact, a fixed reference on the profile */}
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">EIC (RIL contact)</div>
                <div className="text-sm">{labourer.eic ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">Skill</div>
                <div className="text-sm">{skillLabel(labourer.skill)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  Trade
                </div>
                {canEditTrade ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Select
                      value={labourer.trade}
                      onValueChange={(v) => {
                        const def = state.tradeCatalogue.find((t) => t.id === v);
                        updateLabourer(labourer.id, {
                          trade: v,
                          tradeSubcategory: def?.subcategories[0]?.id,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {state.tradeCatalogue
                          .filter((t) => t.active)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {tradeDef && tradeDef.subcategories.length > 0 ? (
                      <Select
                        value={labourer.tradeSubcategory ?? ""}
                        onValueChange={(v) =>
                          updateLabourer(labourer.id, {
                            tradeSubcategory: v || undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="Sub-category" />
                        </SelectTrigger>
                        <SelectContent>
                          {tradeDef.subcategories.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    {tradeLabel}
                    {subLabel ? ` · ${subLabel}` : ""}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  Status
                </div>
                <StatusPill tone={labourer.active ? "ok" : "crit"}>
                  {labourer.active ? "active" : "inactive"}
                </StatusPill>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Assigned equipment
          </h3>
          {equipment.length === 0 ? (
            <EmptyState
              title="No equipment assigned"
              detail="Harness / hopper tags linked to this profile will show here."
            />
          ) : (
            equipment.map((e) => (
              <div
                key={e.id}
                className="mb-2 flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <span>
                  {e.tag} · {e.type}
                  {e.expiryDate ? (
                    <span className="ml-2 font-mono text-xs text-[var(--sge-ink-3)]">exp {showDate(e.expiryDate)}</span>
                  ) : null}
                </span>
                <StatusPill
                  tone={
                    e.status === "ok"
                      ? "ok"
                      : e.status === "due"
                        ? "warn"
                        : "crit"
                  }
                >
                  {e.status}
                </StatusPill>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Attendance history <span className="font-normal text-[var(--sge-ink-3)]">· view only</span>
        </h3>
        {history.length === 0 ? (
          <EmptyState
            title="No attendance yet"
            detail="Supervisor / HR mark attendance; history appears here."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr>
                <th className="py-1">Date</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5 font-mono text-xs">{a.date}</td>
                  <td>
                    <StatusPill
                      tone={
                        a.status === "present"
                          ? "ok"
                          : a.status === "absent"
                            ? "crit"
                            : "warn"
                      }
                    >
                      {a.status}
                    </StatusPill>
                  </td>
                  <td className="font-mono text-xs">{a.inTime ?? "—"}</td>
                  <td className="font-mono text-xs">{a.outTime ?? "—"}</td>
                  <td className="text-[var(--sge-ink-2)]">{a.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
// useSearchParams (?id= from the pass list) needs a Suspense boundary in Next 15
function LabourerHome() {
  return (
    <Suspense fallback={null}>
      <LabourerHomePage />
    </Suspense>
  );
}

export default guarded("labourer", LabourerHome);
