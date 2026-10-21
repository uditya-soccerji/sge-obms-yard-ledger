"use client";

import { useMemo, useState } from "react";
import { EmptyState, formatINR, Panel, SectionHeader } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadXlsxWithHeaders } from "@/lib/excel-io";
import { PAY_COLUMNS, type PayKind } from "@/lib/pay-import";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";

/** Lines that are taken off pay (shown in red, subtracted for net) */
const CUTS: PayKind[] = ["advance", "pf", "room_rent", "travel", "food", "deduction"];

/**
 * Labour pay (round 2, §27): every labourer's uploaded pay lines for a month and
 * the net — HR and Finance, with an Excel export for payroll / the bank.
 */
export function LabourPay() {
  const { state } = useStore();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [q, setQ] = useState("");
  const site = (id?: string) => state.sites.find((s) => s.id === id)?.code ?? "";

  const rows = useMemo(() => {
    const byLab = new Map<string, Record<string, number>>();
    for (const w of state.wageLedger) {
      if (!w.labourerId || !w.date.startsWith(month)) continue;
      const r = byLab.get(w.labourerId) ?? {};
      r[w.kind] = (r[w.kind] ?? 0) + Math.abs(w.amount);
      byLab.set(w.labourerId, r);
    }
    return [...byLab.entries()]
      .map(([id, amounts]) => {
        const l = state.labourers.find((x) => x.id === id);
        const earned = PAY_COLUMNS.filter((c) => !CUTS.includes(c.kind)).reduce((t, c) => t + (amounts[c.kind] ?? 0), 0);
        const cut = CUTS.reduce((t, k) => t + (amounts[k] ?? 0), 0);
        return { id, name: l?.name ?? id, ep: l?.epNumber ?? "", site: site(l?.siteId), amounts, earned, cut, net: earned - cut };
      })
      .filter((r) => !q.trim() || `${r.name} ${r.ep}`.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.wageLedger, state.labourers, month, q]);
  const shown = PAY_COLUMNS.filter((c) => rows.some((r) => r.amounts[c.kind]));
  const total = (k: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + k(r), 0);

  function exportXlsx() {
    const headers = ["EP Number", "Name", "Site", ...shown.map((c) => c.label), "Earned", "Cuts", "Net pay"];
    downloadXlsxWithHeaders(
      `labour-pay-${month}`,
      `Pay ${month}`,
      headers,
      rows.map((r) => ({
        "EP Number": r.ep,
        Name: r.name,
        Site: r.site,
        ...Object.fromEntries(shown.map((c) => [c.label, r.amounts[c.kind] ?? ""])),
        Earned: r.earned,
        Cuts: r.cut,
        "Net pay": r.net,
      }))
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Labour pay" subtitle="Each labourer's pay for the month from the monthly pay upload. Export for payroll / the bank." />
      <Panel>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Month
            <Input type="month" className="mt-1 h-9 w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <Input className="h-9 max-w-xs" placeholder="Search name / EP" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="text-xs text-[var(--sge-ink-3)]">{rows.length} labourers · net {formatINR(total((r) => r.net))}</span>
          <Button size="sm" className="ml-auto" disabled={!rows.length} onClick={exportXlsx}>
            Export to Excel
          </Button>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No pay for this month" detail="Pay lines appear here after the monthly pay upload (HR / Admin home)." />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm tabular-nums">
              <thead className="sticky top-0 bg-[var(--sge-paper)] text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr>
                  <th className="py-1">Name</th>
                  <th>EP</th>
                  <th>Site</th>
                  {shown.map((c) => <th key={c.kind} className="text-right">{c.label}</th>)}
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--sge-line)]">
                    <td className="py-1.5">{r.name}</td>
                    <td className="font-mono text-xs">{r.ep}</td>
                    <td>{r.site}</td>
                    {shown.map((c) => (
                      <td key={c.kind} className={`text-right font-mono ${CUTS.includes(c.kind) ? "text-[var(--sge-crit)]" : ""}`}>
                        {r.amounts[c.kind] ? `${CUTS.includes(c.kind) ? "−" : ""}${formatINR(r.amounts[c.kind])}` : ""}
                      </td>
                    ))}
                    <td className="text-right font-mono font-semibold">{formatINR(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
