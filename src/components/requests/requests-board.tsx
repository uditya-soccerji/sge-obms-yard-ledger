"use client";

import { useMemo, useState } from "react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kindDef } from "@/lib/equipment";
import { effectivePermission, plantScopeFor } from "@/lib/permissions";
import {
  BOARD_FILTERS,
  filterBoard,
  REQUEST_STATUS_LABEL,
  REQUEST_STEPS,
  REQUEST_TONE,
  sortBoard,
  type RequestAction,
} from "@/lib/requests";
import { useStore } from "@/lib/store";
import type { EquipmentRequest, EquipmentRequestStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";

export const REQUESTS_TAB = "/operations?p=requests";

/**
 * Requests board (docs §9, B06): urgent first; filter by SIC approval pending /
 * to fulfil / fulfilled / not fulfilled / rejected. SIC approves or rejects, the
 * store fulfils (or says why not), the requester confirms received.
 */
export function RequestsBoard({ title = "Requests board" }: { title?: string }) {
  const { state, currentAccount, stepEquipmentRequest } = useStore();
  const { notify } = useWork();
  const role = state.currentRole;
  const sicStep = effectivePermission(currentAccount, role, "requests", "approve");
  const storeStep = sicStep || effectivePermission(currentAccount, role, "requests", "update");
  const me = state.currentUserId;
  const scope = plantScopeFor(currentAccount, role);
  const [filter, setFilter] = useState<"open" | EquipmentRequestStatus>("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameOf = (id?: string) => (id ? state.staff.find((s) => s.id === id)?.name ?? id : "—");

  const all = useMemo(
    // Your own requests always show, even outside your plant scope
    () => state.equipmentRequests.filter((r) => scope === "all" || scope.includes(r.plant) || r.createdBy === me),
    [state.equipmentRequests, scope, me]
  );
  const rows = sortBoard(filterBoard(all, filter));
  const count = (f: "open" | EquipmentRequestStatus) => filterBoard(all, f).length;

  function act(r: EquipmentRequest, action: RequestAction) {
    const note = notes[r.id] ?? "";
    const res = stepEquipmentRequest(r.id, action, note);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Not done" });
    const label = res.status ? REQUEST_STATUS_LABEL[res.status] : action;
    setMsg({ ok: true, text: `${r.description}: ${label}` });
    notify({
      kind: "request_step",
      siteId: r.siteId,
      subjectStaffId: r.createdBy,
      problem: action === "reject" || action === "not_fulfilled",
      title: `${r.description} — ${label}`,
      detail: [r.urgent ? "URGENT" : "", `${r.kind}${r.action === "exchange" ? " exchange" : ""}`, r.plant, note.trim()].filter(Boolean).join(" · "),
      tab: REQUESTS_TAB,
      refId: r.id,
    });
    setNotes({ ...notes, [r.id]: "" });
  }

  const can = (r: EquipmentRequest, a: RequestAction) => {
    if (!REQUEST_STEPS[a].from.includes(r.status)) return false;
    if (a === "approve" || a === "reject") return sicStep;
    if (a === "received") return r.createdBy === me || sicStep;
    return storeStep;
  };

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide">{title}</h3>
        <span className="text-xs text-[var(--sge-ink-3)]">urgent first</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-1">
        {BOARD_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider",
              filter === f.id ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]"
            )}
          >
            {f.label} ({count(f.id)})
          </button>
        ))}
      </div>
      {msg ? <p className={cn("mb-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title="Nothing here" detail="No requests in this list." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const actions = (Object.keys(REQUEST_STEPS) as RequestAction[]).filter((a) => can(r, a));
            const needsNote = actions.some((a) => REQUEST_STEPS[a].note);
            const exchanged = r.exchangeItemId ? state.equipment.find((e) => e.id === r.exchangeItemId) : undefined;
            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-md border px-3 py-2",
                  r.urgent && (r.status === "sic_pending" || r.status === "approved")
                    ? "border-[var(--sge-crit)]/50 bg-[var(--sge-crit-wash)]"
                    : "border-[var(--sge-line)] bg-[var(--sge-paper)]"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {r.urgent ? <span className="text-[10px] font-bold uppercase text-[var(--sge-crit)]">Urgent</span> : null}
                  <span className="text-sm font-semibold">{r.description}</span>
                  <StatusPill tone={REQUEST_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</StatusPill>
                </div>
                <div className="mt-0.5 text-xs text-[var(--sge-ink-3)]">
                  {r.action === "exchange" ? "Exchange" : "Issue"} · {r.kind} · {r.plant} · qty {r.qty ?? "—"} · by {nameOf(r.createdBy)} · {r.createdAt.slice(0, 10)}
                  {exchanged ? ` · handing back ${exchanged.tag} (${kindDef(exchanged.type).label})` : ""}
                  {r.sourceDprId ? " · from DPR" : ""}
                </div>
                {r.sicNote ? <div className="mt-0.5 text-xs text-[var(--sge-crit)]">Rejected: {r.sicNote}</div> : null}
                {r.fulfillNote ? (
                  <div className={cn("mt-0.5 text-xs", r.status === "not_fulfilled" ? "text-[var(--sge-crit)]" : "text-[var(--sge-ok)]")}>
                    {r.status === "not_fulfilled" ? "Not fulfilled: " : ""}{r.fulfillNote}
                  </div>
                ) : null}
                {actions.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {needsNote ? (
                      <Input
                        aria-label={`Note for ${r.description}`}
                        className="h-8 w-56 text-xs"
                        placeholder="Reason (needed to reject / not fulfilled)"
                        value={notes[r.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      />
                    ) : null}
                    {actions.map((a) => (
                      <Button
                        key={a}
                        size="sm"
                        variant={a === "reject" || a === "not_fulfilled" ? "ghost" : a === "approve" || a === "fulfil" ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => act(r, a)}
                      >
                        {REQUEST_STEPS[a].label}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
