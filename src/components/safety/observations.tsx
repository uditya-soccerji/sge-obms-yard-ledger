"use client";

import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { SiteObservation } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";

const RISK_TONE = { low: "default", medium: "warn", high: "crit" } as const;
const STATUS_TONE = { open: "crit", fixed: "warn", closed: "ok" } as const;
const selectCls = "h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) : "");

/**
 * Safety observations (round 2, §27). Safety raises one (risk Low / Medium / High,
 * optional STOP WORK) and tags the supervisor; the supervisor marks it fixed;
 * Safety closes or reopens it. Supervisor and SIC are told and see it on their home.
 */
export function ObservationList({ mode }: { mode: "safety" | "supervisor" | "sic" }) {
  const { state, fullState, moveObservation } = useStore();
  const { notify } = useWork();
  const [filter, setFilter] = useState<"active" | "closed" | "all">("active");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const me = state.currentUserId;
  const name = (id?: string) => fullState.staff.find((s) => s.id === id)?.name ?? id ?? "";
  const rows = state.safetyObservations
    .filter((o) => (mode === "supervisor" ? o.supervisorId === me : true))
    .filter((o) => (filter === "active" ? o.status !== "closed" : filter === "closed" ? o.status === "closed" : true))
    .sort((a, b) => Number(!!b.stopWork) - Number(!!a.stopWork) || (b.risk === "high" ? 1 : 0) - (a.risk === "high" ? 1 : 0) || b.raisedAt.localeCompare(a.raisedAt));

  function move(o: SiteObservation, to: "fixed" | "closed" | "open") {
    const r = moveObservation(o.id, to, notes[o.id]);
    setMsg(r.ok ? { ok: true, text: to === "fixed" ? "Marked fixed — Safety will check and close it." : to === "closed" ? "Closed." : "Reopened." } : { ok: false, text: r.error ?? "Not saved" });
    if (!r.ok) return;
    if (to === "fixed") notify({ kind: "observation_fixed", siteId: o.siteId, subjectStaffId: o.supervisorId, title: `Fixed: ${o.location}`, detail: `${notes[o.id]?.trim() ?? ""} · ${name(o.supervisorId)}`, tab: "/operations?p=observations", refId: o.id });
    else notify({ kind: "observation_closed", siteId: o.siteId, subjectStaffId: o.supervisorId, problem: to === "open", title: `${to === "closed" ? "Closed" : "Reopened"}: ${o.location}`, detail: o.text, tab: "/home", refId: o.id });
    setNotes({ ...notes, [o.id]: "" });
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">{mode === "supervisor" ? "Safety observations on my work" : "Safety observations"}</h3>
        {rows.filter((o) => o.status === "open").length ? <StatusPill tone="crit">{rows.filter((o) => o.status === "open").length} open</StatusPill> : null}
        <div className="ml-auto flex gap-1">
          {(["active", "closed", "all"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase", filter === f ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]")}>
              {f === "active" ? "Open / fixed" : f}
            </button>
          ))}
        </div>
      </div>
      {msg ? <p className={cn("mb-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" detail={filter === "active" ? "No open observations." : "No observations."} />
      ) : (
        <div className="space-y-2">
          {rows.map((o) => (
            <div key={o.id} className={cn("rounded-md border px-3 py-2", o.stopWork && o.status !== "closed" ? "border-[var(--sge-crit)] bg-[var(--sge-crit-wash)]" : "border-[var(--sge-line)] bg-[var(--sge-ground)]")}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {o.stopWork ? <StatusPill tone="crit">STOP WORK</StatusPill> : null}
                <StatusPill tone={RISK_TONE[o.risk]}>{o.risk} risk</StatusPill>
                <StatusPill tone={STATUS_TONE[o.status]}>{o.status}</StatusPill>
                <span className="font-semibold">{o.location}</span>
                {o.plant ? <span className="text-[var(--sge-ink-3)]">· {o.plant}</span> : null}
                <span className="ml-auto text-xs text-[var(--sge-ink-3)]">{name(o.supervisorId)} · {when(o.raisedAt)}</span>
              </div>
              <p className="mt-1 text-sm">{o.text}</p>
              {o.fixNote ? <p className="mt-1 text-xs text-[var(--sge-ok)]">Fixed: {o.fixNote} · {when(o.fixedAt)}</p> : null}
              {o.closedAt ? <p className="mt-1 text-xs text-[var(--sge-ink-3)]">Closed by {name(o.closedBy)} · {when(o.closedAt)}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {mode === "supervisor" && o.status === "open" ? (
                  <>
                    <Input aria-label={`What was done for ${o.location}`} className="h-8 min-w-[220px] flex-1" placeholder="What was done to fix it?" value={notes[o.id] ?? ""} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} />
                    <Button size="sm" onClick={() => move(o, "fixed")}>Mark fixed</Button>
                  </>
                ) : null}
                {mode === "safety" && o.status !== "closed" ? <Button size="sm" onClick={() => move(o, "closed")}>Close</Button> : null}
                {mode === "safety" && o.status !== "open" ? <Button size="sm" variant="outline" onClick={() => move(o, "open")}>Reopen</Button> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** Safety's Observations tab: raise one (or a stop-work call), then the list */
export function SafetyObservationsDesk() {
  const { state, fullState, raiseObservation } = useStore();
  const { notify } = useWork();
  const siteId = entrySiteId(state);
  const site = fullState.sites.find((s) => s.id === siteId);
  const sups = fullState.staff.filter((s) => s.role === "supervisor" && s.siteId === siteId && s.active !== false);
  const [plant, setPlant] = useState("");
  const [location, setLocation] = useState("");
  const [text, setText] = useState("");
  const [risk, setRisk] = useState<SiteObservation["risk"]>("medium");
  const [supervisorId, setSup] = useState("");
  const [stopWork, setStopWork] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function raise() {
    const r = raiseObservation({ siteId, plant: plant || undefined, location, text, risk: stopWork ? "high" : risk, supervisorId, stopWork: stopWork || undefined });
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not saved" });
    const sup = fullState.staff.find((s) => s.id === supervisorId)?.name ?? "";
    notify({
      kind: stopWork ? "stop_work" : "observation_raised",
      problem: stopWork || risk === "high",
      siteId,
      subjectStaffId: supervisorId,
      title: stopWork ? `STOP WORK · ${location}` : `${risk.toUpperCase()} risk · ${location}`,
      detail: `${text.trim()} · ${sup}${plant ? ` · ${plant}` : ""}`,
      tab: "/home",
      refId: r.id,
    });
    setMsg({ ok: true, text: stopWork ? "Stop work raised — SIC, Owner and the supervisor are alerted." : "Observation raised — the supervisor and SIC are told." });
    setLocation("");
    setText("");
    setStopWork(false);
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Safety observations" subtitle={`Raise an observation or a stop-work call for ${site?.code ?? "this site"} and tag the supervisor. The supervisor marks it fixed; you close it.`} />
      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            Plant
            <select className={cn(selectCls, "mt-1")} value={plant} onChange={(e) => setPlant(e.target.value)}>
              <option value="">—</option>
              {(site?.plants ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-xs">Where<Input className="mt-1" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Pipe rack 311, level 2" /></label>
          <label className="text-xs">
            Risk
            <select className={cn(selectCls, "mt-1")} value={stopWork ? "high" : risk} disabled={stopWork} onChange={(e) => setRisk(e.target.value as SiteObservation["risk"])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="text-xs">
            Supervisor
            <select className={cn(selectCls, "mt-1")} value={supervisorId} onChange={(e) => setSup(e.target.value)}>
              <option value="">Tag the supervisor…</option>
              {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs sm:col-span-2 lg:col-span-3">What did you see?<Input className="mt-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Harness not anchored while blasting at height" /></label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--sge-crit)]">
              <input type="checkbox" checked={stopWork} onChange={(e) => setStopWork(e.target.checked)} /> Stop work
            </label>
            <Button variant={stopWork ? "destructive" : "default"} onClick={raise}>{stopWork ? "Raise STOP WORK" : "Raise"}</Button>
          </div>
        </div>
        {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      </Panel>
      <ObservationList mode="safety" />
    </div>
  );
}
