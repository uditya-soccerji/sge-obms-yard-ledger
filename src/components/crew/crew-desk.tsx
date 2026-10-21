"use client";

import { useMemo, useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/work/common";
import { approveBlock, canManageCrew, canPickOwnCrew, crewOf, isOpenRequest, siteSupervisors } from "@/lib/crew";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { CrewRequest, Labourer } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";
import { OpsExcelTransferStack } from "@/components/ops/ops-excel-transfer";

const CREW_TAB = "/operations?p=crew";

/**
 * Supervisor crews (docs §23). SIC / Owner / Super Admin assign and take off
 * labourers and decide requests; a supervisor sees their crew, releases
 * labourers others ask for, and — with the right — requests labourers.
 */
export function CrewDesk() {
  const { state, currentAccount, assignCrew, removeFromCrew, requestCrew, releaseCrew, decideCrew } = useStore();
  const { notify } = useWork();
  const role = state.currentRole;
  const manage = canManageCrew(currentAccount, role);
  const pick = canPickOwnCrew(currentAccount, role);
  const me = state.currentUserId;
  const siteId = entrySiteId(state);
  const site = state.sites.find((s) => s.id === siteId);
  const sups = siteSupervisors(state.staff, siteId);
  const [chosen, setChosen] = useState("");
  // A supervisor only ever works on their own crew
  const supervisorId = role === "supervisor" ? me ?? "" : chosen || sups[0]?.id || "";
  const sup = state.staff.find((s) => s.id === supervisorId);
  const nameOf = (staffId: string | null | undefined) =>
    staffId ? state.staff.find((s) => s.id === staffId)?.name ?? staffId : "Unassigned";

  const [pool, setPool] = useState<"free" | "others">("free");
  const [q, setQ] = useState("");
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const crew = useMemo(() => crewOf(state.labourers, supervisorId), [state.labourers, supervisorId]);
  const candidates = useMemo(() => {
    const term = q.trim().toLowerCase();
    return state.labourers
      .filter((l) => l.active && l.siteId === siteId && l.supervisorId !== supervisorId)
      .filter((l) => (pool === "free" ? !l.supervisorId : !!l.supervisorId))
      .filter((l) => !term || l.name.toLowerCase().includes(term) || l.epNumber.toLowerCase().includes(term));
  }, [state.labourers, siteId, supervisorId, pool, q]);
  const open = state.crewRequests
    .filter((r) => r.siteId === siteId && isOpenRequest(r))
    .filter((r) => manage || r.toSupervisorId === me || r.fromSupervisorId === me);
  const recent = state.crewRequests
    .filter((r) => r.siteId === siteId && !isOpenRequest(r))
    .filter((r) => manage || r.toSupervisorId === me || r.fromSupervisorId === me)
    .slice(0, 8);
  const lab = (id: string): Labourer | undefined => state.labourers.find((l) => l.id === id);

  if (!manage && role !== "supervisor") {
    return <EmptyState title="Crews are managed by the SIC" detail="Owner, Super Admin, SIC and supervisors use this page." />;
  }
  if (!sup) {
    return (
      <EmptyState
        title="No supervisor to show"
        detail={manage ? `No supervisors on ${site?.code ?? "this site"} yet. Add one in Master Data → Users / seats.` : "Your login isn't linked to a supervisor record."}
      />
    );
  }

  function done(r: { ok: boolean; error?: string }, okText: string) {
    setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.error ?? "Failed" });
    return r.ok;
  }

  function assign() {
    const r = assignCrew(ticked, supervisorId);
    if (!done(r, `${r.moved.length} labourer${r.moved.length === 1 ? "" : "s"} added to ${sup!.name}'s crew`)) return;
    for (const m of r.moved) {
      notify({
        kind: "crew_changed",
        siteId,
        // Moving someone off another crew is a major change (docs §23)
        problem: !!m.fromSupervisorId,
        subjectStaffId: m.fromSupervisorId ?? supervisorId,
        alsoStaffId: supervisorId,
        title: `${m.name} → ${sup!.name}'s crew`,
        detail: m.fromSupervisorId ? `Moved from ${nameOf(m.fromSupervisorId)}` : "Was unassigned",
        tab: CREW_TAB,
        refId: m.labourerId,
      });
    }
    setTicked([]);
  }

  function request() {
    const r = requestCrew(ticked, note);
    if (!done(r, `${r.created.length} request${r.created.length === 1 ? "" : "s"} sent to the SIC`)) return;
    for (const c of r.created) {
      notify({
        kind: "crew_requested",
        siteId,
        // From another crew: that supervisor, SIC, Admin and HR are told (docs §24)
        problem: !!c.fromSupervisorId,
        subjectStaffId: c.fromSupervisorId ?? undefined,
        alsoStaffId: c.toSupervisorId,
        title: `${nameOf(c.toSupervisorId)} asks for ${lab(c.labourerId)?.name ?? c.labourerId}`,
        detail: c.fromSupervisorId ? `Now on ${nameOf(c.fromSupervisorId)}'s crew — SIC to approve` : "Unassigned — SIC to approve",
        tab: CREW_TAB,
        refId: c.id,
      });
    }
    setTicked([]);
    setNote("");
  }

  function remove(l: Labourer) {
    if (!done(removeFromCrew(l.id), `${l.name} taken off ${sup!.name}'s crew`)) return;
    notify({ kind: "crew_changed", siteId, problem: true, subjectStaffId: supervisorId, title: `${l.name} taken off ${sup!.name}'s crew`, detail: "Now unassigned", tab: CREW_TAB, refId: l.id });
  }

  function release(r: CrewRequest) {
    if (!done(releaseCrew(r.id), `${lab(r.labourerId)?.name} released — waiting for SIC`)) return;
    notify({ kind: "crew_released", siteId, subjectStaffId: r.toSupervisorId, alsoStaffId: r.fromSupervisorId ?? undefined, title: `${lab(r.labourerId)?.name} released by ${nameOf(r.fromSupervisorId)}`, detail: `For ${nameOf(r.toSupervisorId)} — SIC to approve`, tab: CREW_TAB, refId: r.id });
  }

  function decide(r: CrewRequest, approve: boolean) {
    const n = rejectNote[r.id] ?? "";
    const name = lab(r.labourerId)?.name ?? r.labourerId;
    if (!done(decideCrew(r.id, approve, n), approve ? `${name} joined ${nameOf(r.toSupervisorId)}'s crew` : "Request rejected")) return;
    notify({
      kind: "crew_decided",
      siteId,
      problem: approve && !!r.fromSupervisorId,
      subjectStaffId: r.toSupervisorId,
      alsoStaffId: r.fromSupervisorId ?? undefined,
      title: `${name} → ${nameOf(r.toSupervisorId)}: ${approve ? "approved" : "rejected"}`,
      detail: approve ? (r.fromSupervisorId ? `Moved from ${nameOf(r.fromSupervisorId)}` : "Was unassigned") : n,
      tab: CREW_TAB,
      refId: r.id,
    });
  }

  const canAdd = manage || pick;
  return (
    <div className="space-y-4">
      <SectionHeader
        title={`Crews · ${site?.code ?? ""}`}
        subtitle="Standing crews (docs §23, §24). The SIC changes crews; a supervisor asks and the SIC approves. Taking someone from another crew tells that supervisor, the SIC, Admin and HR. Every change is logged."
      />
      <OpsExcelTransferStack kinds={["crewAssignments", "crewRequests"]} />
      {msg ? (
        <p className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p>
      ) : null}

      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {role === "supervisor" ? (
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide">My crew · {sup.name}</h3>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-heading text-xs font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">Supervisor</span>
              <select aria-label="Supervisor" className={cn(selectCls, "w-auto")} value={supervisorId} onChange={(e) => { setChosen(e.target.value); setTicked([]); }}>
                {sups.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          <StatusPill tone="accent">{crew.length} on crew</StatusPill>
        </div>
        {crew.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">
            No labourers on this crew yet.{canAdd ? " Add them below." : " Ask your SIC to assign labourers."}
          </p>
        ) : (
          <div className="divide-y divide-[var(--sge-line)]">
            {crew.map((l) => (
              <div key={l.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>
                  <span className="font-semibold">{l.name}</span>
                  <span className="ml-2 font-mono text-xs text-[var(--sge-ink-3)]">{l.epNumber || "—"}</span>
                </span>
                {manage ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => remove(l)}>
                    Take off crew
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {canAdd ? (
        <Panel>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
              {manage ? `Add to ${sup.name}'s crew` : "Ask for labourers"}
            </h3>
            {(["free", "others"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setPool(p); setTicked([]); }}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
                  pool === p ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]"
                )}
              >
                {p === "free" ? "Unassigned" : "On other crews"}
              </button>
            ))}
            <Input className="ml-auto h-8 w-48 text-sm" placeholder="Search name / EP" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {pool === "others" && !manage ? (
            <p className="mb-2 text-xs text-[var(--sge-ink-3)]">The SIC approves; their current supervisor, Admin and HR are told.</p>
          ) : null}
          {candidates.length === 0 ? (
            <p className="text-sm text-[var(--sge-ink-3)]">{pool === "free" ? "No unassigned labourers on this site." : "No labourers on other crews."}</p>
          ) : (
            <div className="max-h-72 divide-y divide-[var(--sge-line)] overflow-y-auto">
              {candidates.map((l) => (
                <label key={l.id} className="flex cursor-pointer items-center gap-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={ticked.includes(l.id)}
                    onChange={(e) => setTicked(e.target.checked ? [...ticked, l.id] : ticked.filter((x) => x !== l.id))}
                  />
                  <span className="font-semibold">{l.name}</span>
                  <span className="font-mono text-xs text-[var(--sge-ink-3)]">{l.epNumber || "—"}</span>
                  {l.supervisorId ? <span className="ml-auto text-xs text-[var(--sge-ink-3)]">with {nameOf(l.supervisorId)}</span> : null}
                </label>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!manage ? (
              <Input className="h-8 w-64 text-sm" placeholder="Note for the SIC (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            ) : null}
            <Button size="sm" disabled={!ticked.length} onClick={manage ? assign : request}>
              {manage ? `Add ${ticked.length || ""} to crew` : `Request ${ticked.length || ""} for my crew`}
            </Button>
          </div>
        </Panel>
      ) : (
        <Panel>
          <p className="text-sm text-[var(--sge-ink-3)]">
            Your SIC assigns labourers to your crew.
          </p>
        </Panel>
      )}

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Requests {open.length ? `(${open.length} open)` : ""}
        </h3>
        {open.length === 0 ? <p className="text-sm text-[var(--sge-ink-3)]">No open requests.</p> : null}
        <div className="divide-y divide-[var(--sge-line)]">
          {open.map((r) => {
            const block = approveBlock(r, lab(r.labourerId));
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold">{lab(r.labourerId)?.name ?? r.labourerId}</span>
                <span className="text-xs text-[var(--sge-ink-3)]">
                  {nameOf(r.fromSupervisorId)} → {nameOf(r.toSupervisorId)}
                  {r.note ? ` · “${r.note}”` : ""}
                </span>
                <StatusPill tone={r.status === "released" ? "ok" : "warn"}>{r.status === "released" ? "released" : "waiting"}</StatusPill>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {r.status === "requested" && r.fromSupervisorId && r.fromSupervisorId === me ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => release(r)}>
                      Release
                    </Button>
                  ) : null}
                  {manage ? (
                    <>
                      <Button size="sm" className="h-7 text-xs" disabled={!!block} title={block ?? undefined} onClick={() => decide(r, true)}>
                        Approve
                      </Button>
                      <Input
                        className="h-7 w-40 text-xs"
                        placeholder="Reason to reject"
                        value={rejectNote[r.id] ?? ""}
                        onChange={(e) => setRejectNote({ ...rejectNote, [r.id]: e.target.value })}
                      />
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => decide(r, false)}>
                        Reject
                      </Button>
                    </>
                  ) : null}
                </span>
                {manage && block ? <span className="w-full text-xs text-[var(--sge-brass-ink)]">{block}</span> : null}
              </div>
            );
          })}
        </div>
        {recent.length ? (
          <div className="mt-3 border-t border-[var(--sge-line)] pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">Recently decided</div>
            {recent.map((r) => (
              <div key={r.id} className="text-xs text-[var(--sge-ink-2)]">
                {lab(r.labourerId)?.name ?? r.labourerId} → {nameOf(r.toSupervisorId)} · <b>{r.status}</b>
                {r.note ? ` · ${r.note}` : ""}
              </div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
