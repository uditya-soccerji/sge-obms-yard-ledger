"use client";

import { useMemo, useState } from "react";
import { EmptyState, formatINR, KpiTile, Panel, SectionHeader } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadXlsxWithHeaders } from "@/lib/excel-io";
import { normalizeEp } from "@/lib/ep";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { cn } from "@/lib/utils";

/**
 * Advances register (round 2, §27): cash advances given to labourers, and what
 * the monthly pay upload has recovered (its Advance line) — balance per person.
 */
export function AdvancesRegister() {
  const { state, giveAdvance } = useStore();
  const [ep, setEp] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const found = state.labourers.find((l) => normalizeEp(l.epNumber) === normalizeEp(ep));

  const rows = useMemo(() => {
    const given = new Map<string, number>();
    for (const a of state.advances) given.set(a.labourerId, (given.get(a.labourerId) ?? 0) + a.amount);
    const recovered = new Map<string, number>();
    for (const w of state.wageLedger) if (w.kind === "advance" && w.labourerId) recovered.set(w.labourerId, (recovered.get(w.labourerId) ?? 0) + Math.abs(w.amount));
    return [...given.keys()]
      .map((id) => {
        const l = state.labourers.find((x) => x.id === id);
        const g = given.get(id) ?? 0;
        const r = Math.min(recovered.get(id) ?? 0, g);
        const last = state.advances.filter((a) => a.labourerId === id).sort((a, b) => b.date.localeCompare(a.date))[0];
        return { id, name: l?.name ?? id, ep: l?.epNumber ?? "", given: g, recovered: r, balance: g - r, last: last?.date ?? "" };
      })
      .filter((r) => !onlyOpen || r.balance > 0)
      .sort((a, b) => b.balance - a.balance);
  }, [state.advances, state.wageLedger, state.labourers, onlyOpen]);

  function give() {
    if (!found) return setMsg({ ok: false, text: "No labourer with that EP" });
    const r = giveAdvance({ labourerId: found.id, date, amount: Number(amount), note });
    setMsg(r.ok ? { ok: true, text: `₹${amount} advance to ${found.name} recorded` } : { ok: false, text: r.error ?? "Not saved" });
    if (r.ok) { setAmount(""); setNote(""); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Advances" subtitle="Cash advances to labourers. Recovery comes from the Advance line of the monthly pay upload; the balance is what's still out." />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Given" value={formatINR(rows.reduce((s, r) => s + r.given, 0))} />
        <KpiTile label="Recovered" value={formatINR(rows.reduce((s, r) => s + r.recovered, 0))} tone="ok" />
        <KpiTile label="Still out" value={formatINR(rows.reduce((s, r) => s + r.balance, 0))} tone="warn" hint={`${rows.filter((r) => r.balance > 0).length} labourers`} />
      </div>
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Give an advance</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">EP number<Input className="mt-1 h-9 w-40 font-mono" value={ep} onChange={(e) => setEp(e.target.value)} placeholder="PP59…" /></label>
          <span className="pb-2 text-sm">{found ? <b>{found.name}</b> : ep ? <span className="text-[var(--sge-crit)]">not found</span> : null}</span>
          <label className="text-xs">Amount ₹<Input type="number" min={0} className="mt-1 h-9 w-28" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="text-xs">Date<Input type="date" max={today()} className="mt-1 h-9 w-40" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-xs">Note<Input className="mt-1 h-9 w-48" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <Button size="sm" onClick={give}>Record</Button>
        </div>
        {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      </Panel>
      <Panel>
        <div className="mb-3 flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only with a balance</label>
          <Button size="sm" variant="outline" className="ml-auto" disabled={!rows.length} onClick={() => downloadXlsxWithHeaders(`advances-${today()}`, "Advances", ["EP Number", "Name", "Given", "Recovered", "Balance", "Last advance"], rows.map((r) => ({ "EP Number": r.ep, Name: r.name, Given: r.given, Recovered: r.recovered, Balance: r.balance, "Last advance": r.last })))}>Export to Excel</Button>
        </div>
        {rows.length === 0 ? <EmptyState title="No advances out" detail="Record an advance above." /> : (
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]"><tr><th className="py-1">Name</th><th>EP</th><th className="text-right">Given</th><th className="text-right">Recovered</th><th className="text-right">Balance</th><th>Last</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5">{r.name}</td><td className="font-mono text-xs">{r.ep}</td>
                  <td className="text-right font-mono">{formatINR(r.given)}</td><td className="text-right font-mono">{formatINR(r.recovered)}</td>
                  <td className="text-right font-mono font-semibold">{formatINR(r.balance)}</td><td className="font-mono text-xs">{r.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
