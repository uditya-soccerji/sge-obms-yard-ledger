"use client";

import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeEp } from "@/lib/ep";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import type { LeaveEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const KINDS: { value: LeaveEntry["kind"]; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "sick", label: "Sick" },
  { value: "unpaid", label: "Unpaid" },
  { value: "other", label: "Other" },
];
const sel = "h-9 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

/** Leave register (round 2, §27): HR records a labourer's leave, approves or rejects it; who's on leave today */
export function LeaveRegister() {
  const { state, addLeave, decideLeave } = useStore();
  const t = today();
  const [ep, setEp] = useState("");
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(t);
  const [kind, setKind] = useState<LeaveEntry["kind"]>("casual");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"requested" | "approved" | "all">("requested");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const found = state.labourers.find((l) => normalizeEp(l.epNumber) === normalizeEp(ep));
  const name = (id: string) => state.labourers.find((l) => l.id === id)?.name ?? id;
  const onLeave = state.leaves.filter((e) => e.status === "approved" && e.from <= t && t <= e.to);
  const rows = state.leaves.filter((e) => filter === "all" || e.status === filter).sort((a, b) => b.from.localeCompare(a.from));

  function add() {
    if (!found) return setMsg({ ok: false, text: "No labourer with that EP" });
    const r = addLeave({ labourerId: found.id, from, to, kind, reason });
    setMsg(r.ok ? { ok: true, text: `Leave recorded for ${found.name} — approve it below` } : { ok: false, text: r.error ?? "Not saved" });
    if (r.ok) setReason("");
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Leave" subtitle="Record a labourer's leave, approve or reject it. Approved leave shows who is off today." />
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">On leave today ({onLeave.length})</h3>
        {onLeave.length === 0 ? <p className="text-sm text-[var(--sge-ink-3)]">Nobody.</p> : (
          <div className="flex flex-wrap gap-2 text-sm">
            {onLeave.map((e) => <span key={e.id} className="rounded-sm bg-[var(--sge-paper-2)] px-2 py-0.5">{name(e.labourerId)} <span className="text-xs text-[var(--sge-ink-3)]">until {e.to}</span></span>)}
          </div>
        )}
      </Panel>
      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Record leave</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">EP number<Input className="mt-1 h-9 w-40 font-mono" value={ep} onChange={(e) => setEp(e.target.value)} placeholder="PP59…" /></label>
          <span className="pb-2 text-sm">{found ? <b>{found.name}</b> : ep ? <span className="text-[var(--sge-crit)]">not found</span> : null}</span>
          <label className="text-xs">From<Input type="date" className="mt-1 h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs">To<Input type="date" className="mt-1 h-9 w-40" min={from} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="text-xs">Kind<select className={cn(sel, "mt-1 block")} value={kind} onChange={(e) => setKind(e.target.value as LeaveEntry["kind"])}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></label>
          <label className="text-xs">Reason<Input className="mt-1 h-9 w-56" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <Button size="sm" onClick={add}>Record</Button>
        </div>
        {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      </Panel>
      <Panel>
        <div className="mb-3 flex gap-1">
          {(["requested", "approved", "all"] as const).map((x) => (
            <button key={x} type="button" onClick={() => setFilter(x)} className={cn("rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase", filter === x ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]")}>{x === "requested" ? "Waiting" : x}</button>
          ))}
        </div>
        {rows.length === 0 ? <EmptyState title="Nothing here" detail="Record leave above." /> : (
          <div className="space-y-2">
            {rows.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm">
                <StatusPill tone={e.status === "approved" ? "ok" : e.status === "rejected" ? "crit" : "warn"}>{e.status}</StatusPill>
                <span className="font-semibold">{name(e.labourerId)}</span>
                <span className="font-mono text-xs">{e.from} → {e.to} ({days(e.from, e.to)} d)</span>
                <span className="text-[var(--sge-ink-3)]">{KINDS.find((k) => k.value === e.kind)?.label} · {e.reason}{e.decidedNote ? ` · ${e.decidedNote}` : ""}</span>
                {e.status === "requested" ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Input aria-label="Note" className="h-8 w-40" placeholder="Note (to reject)" value={notes[e.id] ?? ""} onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => { const r = decideLeave(e.id, false, notes[e.id] ?? ""); setMsg(r.ok ? { ok: true, text: "Rejected" } : { ok: false, text: r.error ?? "Not saved" }); }}>Reject</Button>
                    <Button size="sm" onClick={() => { const r = decideLeave(e.id, true, notes[e.id] ?? ""); setMsg(r.ok ? { ok: true, text: "Approved" } : { ok: false, text: r.error ?? "Not saved" }); }}>Approve</Button>
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
