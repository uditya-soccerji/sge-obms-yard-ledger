"use client";

import { useMemo, useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/work/common";
import { siteSupervisors } from "@/lib/crew";
import { EQUIPMENT_KINDS, equipExpiryState, kindDef, nextTag, setupOf, setupValue, sortSetup } from "@/lib/equipment";
import { effectivePermission } from "@/lib/permissions";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { today as todayDate } from "@/lib/today";
import type { EquipmentItem, EquipmentKind } from "@/lib/types";
import { formatINR } from "@/components/shared/ui-bits";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";

const TAB = "/operations?p=equipment";

/**
 * Supervisor equipment setups (docs §7, B05). SIC / store / Owner / SA issue
 * items into a supervisor's setup and move site items in or out; a supervisor
 * sees their own setup (FEFO or FIFO) and can set an item's expiry.
 */
export function SetupDesk() {
  const { state, currentAccount, issueEquipment, assignEquipment, setEquipmentExpiry } = useStore();
  const { notify } = useWork();
  const role = state.currentRole;
  const manage = effectivePermission(currentAccount, role, "equipment", "create");
  const me = state.currentUserId;
  const siteId = entrySiteId(state);
  const site = state.sites.find((s) => s.id === siteId);
  const sups = siteSupervisors(state.staff, siteId);
  const [chosen, setChosen] = useState("");
  const supervisorId = role === "supervisor" ? me ?? "" : chosen || sups[0]?.id || "";
  const sup = state.staff.find((s) => s.id === supervisorId);
  const [order, setOrder] = useState<"fefo" | "fifo">("fefo");
  const [open, setOpen] = useState<string | null>(null);
  const [expiryDraft, setExpiryDraft] = useState<Record<string, string>>({});
  const [kind, setKind] = useState<EquipmentKind>("compressor");
  const [qty, setQty] = useState("1");
  const [newExpiry, setNewExpiry] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = todayDate();
  const nameOf = (id: string) => state.staff.find((s) => s.id === id)?.name ?? id;

  const setup = useMemo(() => sortSetup(setupOf(state.equipment, supervisorId), order), [state.equipment, supervisorId, order]);
  const pool = state.equipment.filter((e) => e.siteId === siteId && !e.supervisorId);

  if (!sup) {
    return (
      <EmptyState
        title="No supervisor to show"
        detail={manage ? `No supervisors on ${site?.code ?? "this site"} yet.` : "Your login isn't linked to a supervisor record."}
      />
    );
  }

  function tell(title: string, detail: string, refId?: string, problem = false) {
    notify({ kind: "equipment_changed", siteId: sup!.siteId, subjectStaffId: sup!.id, problem, title, detail, tab: TAB, refId });
  }

  function issue() {
    const r = issueEquipment({ kind, supervisorId, qty: Number(qty), expiryDate: newExpiry || undefined });
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not issued" });
    setMsg({ ok: true, text: `Issued ${r.tags.join(", ")} to ${sup!.name}` });
    tell(`${kindDef(kind).label} issued to ${sup!.name}`, `${r.tags.join(", ")}${kindDef(kind).tracking === "counted" ? ` · qty ${qty}` : ""}${newExpiry ? ` · exp ${newExpiry}` : ""}`);
    setQty("1");
    setNewExpiry("");
  }

  function move(e: EquipmentItem, to: string) {
    const r = assignEquipment(e.id, to);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not moved" });
    setMsg({ ok: true, text: to ? `${e.tag} added to ${nameOf(to)}'s setup` : `${e.tag} returned to the site store` });
    tell(to ? `${e.tag} → ${nameOf(to)}'s setup` : `${e.tag} returned to store`, `${kindDef(e.type).label}${e.supervisorId ? ` · was with ${nameOf(e.supervisorId)}` : ""}`, e.id);
  }

  function saveExpiry(e: EquipmentItem) {
    const date = expiryDraft[e.id] ?? "";
    const r = setEquipmentExpiry(e.id, date);
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not saved" });
    setMsg({ ok: true, text: `${e.tag}: ${r.change}` });
    // An expiry already past is a problem worth flagging (§7)
    tell(`${e.tag} expiry set by ${nameOf(me ?? "")}`, `${kindDef(e.type).label} · ${r.change}`, e.id, equipExpiryState(date, today) === "expired");
  }

  const due = setup.filter((e) => ["expired", "soon"].includes(equipExpiryState(e.expiryDate, today))).length;
  return (
    <div className="space-y-4">
      <SectionHeader
        title={`Equipment setups · ${site?.code ?? ""}`}
        subtitle="Each supervisor's kit (docs §7). Expiry warns 15 days ahead. Every change is logged and the SIC and store are told."
      />
      {msg ? <p className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}

      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {role === "supervisor" ? (
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide">My setup · {sup.name}</h3>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="font-heading text-xs font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">Supervisor</span>
              <select aria-label="Supervisor" className={cn(selectCls, "w-auto")} value={supervisorId} onChange={(e) => setChosen(e.target.value)}>
                {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <StatusPill tone="accent">{setup.length} item{setup.length === 1 ? "" : "s"}</StatusPill>
          {due ? <StatusPill tone="warn">{due} expiring / expired</StatusPill> : null}
          {setupValue(setup) ? <span className="text-xs text-[var(--sge-ink-3)]">Value held {formatINR(setupValue(setup))}</span> : null}
          <span className="ml-auto flex gap-1">
            {(["fefo", "fifo"] as const).map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                title={o === "fefo" ? "First expiry first out" : "First issued first out"}
                className={cn("rounded-sm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider", order === o ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]")}
              >
                {o}
              </button>
            ))}
          </span>
        </div>
        {setup.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No items in this setup yet.{manage ? " Issue items or add site items below." : " The store issues your kit."}</p>
        ) : (
          <div className="divide-y divide-[var(--sge-line)]">
            {setup.map((e) => {
              const st = equipExpiryState(e.expiryDate, today);
              const def = kindDef(e.type);
              const isOpen = open === e.id;
              return (
                <div key={e.id} className="py-2 text-sm">
                  <button type="button" className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                    <span className="font-mono text-xs font-semibold">{e.tag}</span>
                    <span>{def.label}{e.qty ? ` × ${e.qty}` : ""}</span>
                    <StatusPill tone={e.status === "ok" ? "ok" : e.status === "due" ? "warn" : "crit"}>{e.status}</StatusPill>
                    <span className={cn("ml-auto text-xs", st === "expired" ? "font-semibold text-[var(--sge-crit)]" : st === "soon" ? "font-semibold text-[var(--sge-brass-ink)]" : "text-[var(--sge-ink-3)]")}>
                      {e.expiryDate ? `exp ${e.expiryDate}${st === "expired" ? " · EXPIRED" : st === "soon" ? " · soon" : ""}` : "no expiry set"}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="mt-2 space-y-2 rounded-sm bg-[var(--sge-linen)] p-2 text-xs">
                      <div className="text-[var(--sge-ink-2)]">
                        Issued {e.issuedOn ?? "—"} · last check {e.lastCheck}
                        {def.unitValue ? ` · value ~${formatINR(def.unitValue * (e.qty ?? 1))}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[var(--sge-ink-3)]">Expiry</span>
                        <Input type="date" aria-label={`Expiry for ${e.tag}`} className="h-8 w-40 text-xs" value={expiryDraft[e.id] ?? e.expiryDate ?? ""} onChange={(ev) => setExpiryDraft({ ...expiryDraft, [e.id]: ev.target.value })} />
                        <Button size="sm" className="h-8 text-xs" onClick={() => saveExpiry(e)}>Save expiry</Button>
                        {manage ? (
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => move(e, "")}>Return to store</Button>
                        ) : null}
                      </div>
                      {e.history?.length ? (
                        <ul className="space-y-0.5 text-[var(--sge-ink-3)]">
                          {[...e.history].reverse().map((h, i) => (
                            <li key={i}>{h.at.slice(0, 10)} · {nameOf(h.by)} · {h.change}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {manage ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">Issue to {sup.name}</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="text-[var(--sge-ink-3)]">Item</span>
              <select aria-label="Item kind" className={cn(selectCls, "mt-1 w-56")} value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>
                {EQUIPMENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}{k.tracking === "counted" ? " (counted)" : ""}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-[var(--sge-ink-3)]">{kindDef(kind).tracking === "counted" ? "Quantity" : "How many"}</span>
              <Input aria-label="Quantity" type="number" className="mt-1 h-9 w-24" value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
            <label className="text-xs">
              <span className="text-[var(--sge-ink-3)]">Expiry (optional)</span>
              <Input aria-label="New item expiry" type="date" className="mt-1 h-9 w-40" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} />
            </label>
            <Button size="sm" onClick={issue}>Issue</Button>
          </div>
          <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
            Tagged items get one tag each (next: {nextTag(kind, site?.code ?? "SITE", state.equipment)}); gloves and PPE kits are one counted batch.
          </p>
          {pool.length ? (
            <div className="mt-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">Site items not in any setup</div>
              <div className="divide-y divide-[var(--sge-line)]">
                {pool.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 py-1.5 text-sm">
                    <span className="font-mono text-xs">{e.tag}</span>
                    <span>{kindDef(e.type).label}</span>
                    <span className="text-xs text-[var(--sge-ink-3)]">{e.expiryDate ? `exp ${e.expiryDate}` : ""}</span>
                    <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => move(e, supervisorId)}>Add to setup</Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
