"use client";
/**
 * One staff member's monthly salary (owner, 2026-11-18): days, OT, earnings, deductions, net paid and the
 * day-by-day marks, from the monthly staff salary sheet. Shown only to Owner, Super Admin, HR and Finance.
 */
import { useState } from "react";
import { formatINR } from "@/components/shared/ui-bits";
import type { StaffSalary } from "@/lib/supabase/staff-salary";
import { cn } from "@/lib/utils";

const money = (n?: number) => (n == null || n === 0 ? "—" : formatINR(Math.round(n)));
const MARK: Record<string, { label: string; cls: string }> = {
  P: { label: "Present", cls: "bg-[var(--sge-ok)] text-white" },
  H: { label: "Holiday (paid)", cls: "bg-[var(--sge-ok)]/70 text-white" },
  S: { label: "Weekly off", cls: "bg-[var(--sge-paper-2)] text-[var(--sge-ink-3)]" },
  A: { label: "Absent", cls: "bg-[var(--sge-crit)] text-white" },
};

export function StaffSalaryPanel({ rows }: { rows: StaffSalary[] }) {
  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();
  const [month, setMonth] = useState(months[0]);
  const list = rows.filter((r) => r.month === month);
  if (!rows.length) return <p className="text-sm text-[var(--sge-ink-3)]">No salary record yet.</p>;
  const label = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {months.map((m) => (
          <button key={m} type="button" onClick={() => setMonth(m)} className={cn("rounded px-2.5 py-1 text-xs font-semibold", m === month ? "bg-[var(--sge-ink)] text-white" : "border border-[var(--sge-line)]")}>
            {label(m)}
          </button>
        ))}
      </div>
      {list.map((r) => {
        const earn: [string, number | undefined][] = [["Salary", r.salaryAmount], ["Overtime", r.otAmount], ["Bonus", r.bonus], ["Room rent", r.roomRent], ["Conveyance", r.conveyance], ["Statutory bonus", r.statutoryBonus]];
        const ded: [string, number | undefined][] = [["PF", r.pf], ["PT", r.pt], ["ESIC", r.esic], ["Advance", r.advance], ["Other", r.otherDeduction]];
        return (
          <div key={r.id} className="space-y-3 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] p-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span><span className="text-[var(--sge-ink-3)]">Basic salary (month)</span> <b>{money(r.monthlyRate)}</b></span>
              <span><span className="text-[var(--sge-ink-3)]">Per day</span> {money(r.perDayRate)}</span>
              <span><span className="text-[var(--sge-ink-3)]">OT rate / h</span> {money(r.perOtRate)}</span>
              <span><span className="text-[var(--sge-ink-3)]">Days paid</span> <b>{r.presentDays ?? "—"}</b></span>
              <span><span className="text-[var(--sge-ink-3)]">OT hours</span> {r.otHours || "—"}</span>
              <span><span className="text-[var(--sge-ink-3)]">Category</span> {r.category ?? "—"}</span>
              <span><span className="text-[var(--sge-ink-3)]">Sheet site</span> {r.sheetSite ?? "—"}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <table className="text-sm">
                <tbody>
                  {earn.map(([k, v]) => <tr key={k}><td className="pr-3 text-[var(--sge-ink-3)]">{k}</td><td className="text-right font-mono">{money(v)}</td></tr>)}
                  <tr className="border-t border-[var(--sge-line)] font-semibold"><td className="pr-3">Gross</td><td className="text-right font-mono">{money(r.gross)}</td></tr>
                </tbody>
              </table>
              <table className="text-sm">
                <tbody>
                  {ded.map(([k, v]) => <tr key={k}><td className="pr-3 text-[var(--sge-ink-3)]">{k}</td><td className="text-right font-mono">{money(v)}</td></tr>)}
                  <tr className="border-t border-[var(--sge-line)] font-semibold"><td className="pr-3">Deductions</td><td className="text-right font-mono">{money(r.totalDeductions)}</td></tr>
                </tbody>
              </table>
              <div className="rounded-md bg-[var(--sge-ok-wash)] p-3">
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">Net paid</div>
                <div className="font-heading text-2xl font-bold">{money(r.netPaid)}</div>
                {r.remarks ? <div className="mt-1 text-xs text-[var(--sge-ink-2)]">{r.remarks}</div> : null}
              </div>
            </div>
            {r.dayMarks?.length ? (
              <div>
                <div className="mb-1 text-[11px] uppercase text-[var(--sge-ink-3)]">Attendance · {label(r.month)}</div>
                <div className="flex flex-wrap gap-1">
                  {r.dayMarks.map((m, i) => {
                    const k = (m ?? "").toUpperCase();
                    const ot = r.dayOt?.[i];
                    return (
                      <div key={i} title={`${i + 1}: ${MARK[k]?.label ?? (k || "—")}${ot ? ` · OT ${ot} h` : ""}`} className={cn("flex h-8 w-8 flex-col items-center justify-center rounded text-[10px] font-semibold", MARK[k]?.cls ?? "border border-dashed border-[var(--sge-line)] text-[var(--sge-ink-3)]")}>
                        <span className="leading-none opacity-70">{i + 1}</span>
                        <span className="leading-none">{k || "·"}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 text-[11px] text-[var(--sge-ink-3)]">P present · H paid holiday · S weekly off · A absent</div>
              </div>
            ) : null}
            <div className="text-[11px] text-[var(--sge-ink-3)]">From {r.source}</div>
          </div>
        );
      })}
    </div>
  );
}
