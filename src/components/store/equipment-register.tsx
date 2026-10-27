"use client";

import { allStoreItems, holdingsOf } from "@/lib/store-ledger";

import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fefo, inStore, KITS, kitLabel, RETURN_CONDITIONS, TAGGED, taggedLabel, type KitType, type TaggedType } from "@/lib/equipment-register";
import { daysUntil, showDate } from "@/lib/gate-pass";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import type { EquipmentReturn } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWork } from "@/lib/work/store";

const sel = "h-9 rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";
type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <p className={cn("text-sm", m.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{m.text}</p> : null);

function Expiry({ date }: { date?: string }) {
  if (!date) return <span className="text-xs text-[var(--sge-ink-3)]">no expiry</span>;
  const d = daysUntil(date, today());
  return (
    <span className="whitespace-nowrap font-mono text-xs">
      {showDate(date)} <StatusPill tone={d < 0 ? "crit" : d <= 30 ? "warn" : "ok"}>{d < 0 ? "expired" : `${d} d`}</StatusPill>
    </span>
  );
}

/** Returns waiting for this person: the store (with_store) or the SIC (with_sic, scraps) */
export function ReturnsQueue({ stage }: { stage: "with_store" | "with_sic" }) {
  const { state, fullState, decideReturn } = useStore();
  const { notify } = useWork();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const name = (id?: string) => fullState.staff.find((s) => s.id === id)?.name ?? id ?? "";
  const rows = state.equipmentReturns.filter((r) => r.status === stage);
  const what = (r: EquipmentReturn) => {
    if (r.equipmentId) {
      const e = fullState.equipment.find((x) => x.id === r.equipmentId);
      return e ? `${e.tag} · ${taggedLabel(e.type)}` : r.equipmentId;
    }
    const k = fullState.kitIssues.find((x) => x.id === r.kitIssueId);
    return k ? `${r.qty} × ${kitLabel(k.item)}` : `${r.qty} items`;
  };

  function decide(r: EquipmentReturn, approve: boolean) {
    const res = decideReturn(r.id, approve, notes[r.id] ?? "");
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Not saved" });
    if (res.next === "with_sic") {
      notify({ kind: "return_scrap", problem: true, siteId: r.siteId, subjectStaffId: r.by, title: `Scrap to confirm: ${what(r)}`, detail: `${r.note} · from ${name(r.by)} · store confirmed`, tab: "/home", refId: r.id });
      setMsg({ ok: true, text: "Confirmed — scrapped items go to the SIC next." });
    } else {
      notify({ kind: "return_decided", problem: !approve, siteId: r.siteId, subjectStaffId: r.by, title: `Return ${approve ? "accepted" : "rejected"}: ${what(r)}`, detail: notes[r.id]?.trim() || r.condition, tab: "/home", refId: r.id });
      setMsg({ ok: true, text: approve ? "Return accepted." : "Return rejected." });
    }
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-heading text-sm font-bold">{stage === "with_store" ? "Returns to confirm" : "Scrapped items to confirm"}</h3>
        {rows.length ? <StatusPill tone="warn">{rows.length}</StatusPill> : null}
      </div>
      <Note m={msg} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting" detail={stage === "with_store" ? "Supervisors' returns land here." : "A scrap confirmed by the store lands here for your OK."} />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2 text-sm">
              <StatusPill tone={r.condition === "ok" ? "ok" : r.condition === "scrapped" ? "crit" : "warn"}>{r.condition}</StatusPill>
              <span className="font-semibold">{what(r)}</span>
              <span className="text-[var(--sge-ink-3)]">from {name(r.by)}{r.note ? ` · ${r.note}` : ""}</span>
              <Input aria-label="Note" className="ml-auto h-8 w-48" placeholder="Note (needed to reject)" value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => decide(r, false)}>Reject</Button>
              <Button size="sm" onClick={() => decide(r, true)}>Confirm</Button>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/** The store's Equipment tab (round 2, §27) */
export function StoreEquipmentDesk() {
  const { state, fullState, addTagged, receiveKit, issueTagged, issueKit } = useStore();
  const siteId = entrySiteId(state);
  const sups = fullState.staff.filter((s) => s.role === "supervisor" && s.siteId === siteId && s.active !== false);
  const name = (id?: string) => fullState.staff.find((s) => s.id === id)?.name ?? id ?? "";
  const [msg, setMsg] = useState<Msg>(null);
  const [tType, setTType] = useState<TaggedType>("harness");
  const [tag, setTag] = useState("");
  const [tExp, setTExp] = useState("");
  const [tVal, setTVal] = useState("");
  const [kItem, setKItem] = useState<KitType>("gloves");
  const [kQty, setKQty] = useState("");
  const [kExp, setKExp] = useState("");
  const [iItem, setIItem] = useState<KitType>("gloves");
  const [iQty, setIQty] = useState("");
  const [iSup, setISup] = useState("");
  const [tSup, setTSup] = useState<Record<string, string>>({});

  const tagged = state.equipment.filter((e) => !e.scrapped);
  const inStoreTagged = tagged.filter((e) => !e.issuedTo).sort(fefo);
  const issuedTagged = tagged.filter((e) => e.issuedTo);
  const kitIssues = state.kitIssues.filter((k) => k.qty - (k.returned ?? 0) > 0);
  const t = today();

  const done = (r: { ok: boolean; error?: string }, ok: string) => setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Not saved" });

  return (
    <div className="space-y-4">
      <SectionHeader title="Equipment register" subtitle="Tagged items one by one, gloves / PPE / helmets by quantity. Issue to a supervisor's crew — oldest expiry first. Returns are confirmed here; scraps also need the SIC." />
      <Note m={msg} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Add a tagged item</h3>
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Item type" className={sel} value={tType} onChange={(e) => { const v = e.target.value as TaggedType; setTType(v); setTVal(String(TAGGED.find((x) => x.type === v)?.value ?? "")); }}>
              {TAGGED.map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}
            </select>
            <Input aria-label="Tag" className="h-9 w-32" placeholder="Tag / serial" value={tag} onChange={(e) => setTag(e.target.value)} />
            <Input aria-label="Expiry" type="date" className="h-9 w-40" value={tExp} onChange={(e) => setTExp(e.target.value)} />
            <Input aria-label="Value" type="number" className="h-9 w-24" placeholder="₹" value={tVal} onChange={(e) => setTVal(e.target.value)} />
            <Button size="sm" onClick={() => { const r = addTagged({ type: tType, tag, expiryDate: tExp, value: Number(tVal) || undefined }); done(r, `${tag.toUpperCase()} added`); if (r.ok) { setTag(""); setTExp(""); } }}>Add</Button>
          </div>
        </Panel>
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Receive gloves / PPE / helmets</h3>
          <div className="flex flex-wrap items-end gap-2">
            <select aria-label="Kit item" className={sel} value={kItem} onChange={(e) => setKItem(e.target.value as KitType)}>
              {KITS.map((x) => <option key={x.item} value={x.item}>{x.label}</option>)}
            </select>
            <Input aria-label="Quantity" type="number" min={1} className="h-9 w-24" placeholder="Qty" value={kQty} onChange={(e) => setKQty(e.target.value)} />
            <Input aria-label="Lot expiry" type="date" className="h-9 w-40" value={kExp} onChange={(e) => setKExp(e.target.value)} />
            <Button size="sm" onClick={() => { const r = receiveKit({ item: kItem, qty: Number(kQty), expiryDate: kExp }); done(r, `${kQty} × ${kitLabel(kItem)} received`); if (r.ok) setKQty(""); }}>Receive</Button>
          </div>
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Gloves / PPE / helmets in store</h3>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          {KITS.map((k) => (
            <div key={k.item} className="rounded-md border border-[var(--sge-line)] px-3 py-2">
              <div className="text-xs uppercase text-[var(--sge-ink-3)]">{k.label}</div>
              <div className="font-heading text-xl font-bold tabular-nums">{inStore(state.kitLots, siteId, k.item, t)}</div>
              <div className="space-y-0.5">
                {state.kitLots.filter((l) => l.item === k.item && l.qty > 0).sort(fefo).map((l) => (
                  <div key={l.id} className="flex justify-between text-xs"><span>{l.qty}</span><Expiry date={l.expiryDate} /></div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-sm font-semibold">Issue</span>
          <Input aria-label="Issue quantity" type="number" min={1} className="h-9 w-20" placeholder="Qty" value={iQty} onChange={(e) => setIQty(e.target.value)} />
          <select aria-label="Issue item" className={sel} value={iItem} onChange={(e) => setIItem(e.target.value as KitType)}>
            {KITS.map((x) => <option key={x.item} value={x.item}>{x.label}</option>)}
          </select>
          <span className="text-sm">to</span>
          <select aria-label="Issue to supervisor" className={sel} value={iSup} onChange={(e) => setISup(e.target.value)}>
            <option value="">supervisor…</option>
            {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={() => { const r = issueKit(iItem, Number(iQty), iSup); done(r, `Issued — from lots expiring ${r.lots?.map((l) => (l.expiryDate ? showDate(l.expiryDate) : "no expiry")).join(", ")}`); if (r.ok) setIQty(""); }}>Issue (oldest expiry first)</Button>
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Tagged items in store <span className="font-normal text-[var(--sge-ink-3)]">· oldest expiry first</span></h3>
        {inStoreTagged.length === 0 ? <EmptyState title="Nothing in store" detail="Add tagged items above." /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]"><tr><th className="py-1">Tag</th><th>Item</th><th>Expiry</th><th>State</th><th /></tr></thead>
            <tbody>
              {inStoreTagged.map((e) => (
                <tr key={e.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5 font-mono text-xs">{e.tag}</td>
                  <td>{taggedLabel(e.type)}{e.value ? <span className="text-xs text-[var(--sge-ink-3)]"> · ₹{e.value.toLocaleString("en-IN")}</span> : null}</td>
                  <td><Expiry date={e.expiryDate} /></td>
                  <td><StatusPill tone={e.status === "ok" ? "ok" : e.status === "due" ? "warn" : "crit"}>{e.status}</StatusPill></td>
                  <td className="whitespace-nowrap text-right">
                    <select aria-label={`Issue ${e.tag} to`} className={cn(sel, "h-8")} value={tSup[e.id] ?? ""} onChange={(ev) => setTSup({ ...tSup, [e.id]: ev.target.value })}>
                      <option value="">issue to…</option>
                      {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="ml-1 h-8" onClick={() => done(issueTagged(e.id, tSup[e.id] ?? ""), `${e.tag} issued`)}>Issue</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">With supervisors</h3>
        {issuedTagged.length + kitIssues.length === 0 ? <EmptyState title="Nothing issued" detail="Issued items show here until they come back." /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]"><tr><th className="py-1">Item</th><th>With</th><th>Since</th><th>Expiry</th></tr></thead>
            <tbody>
              {issuedTagged.map((e) => (
                <tr key={e.id} className="border-t border-[var(--sge-line)]"><td className="py-1.5">{e.tag} · {taggedLabel(e.type)}</td><td>{name(e.issuedTo)}</td><td className="font-mono text-xs">{e.issuedOn}</td><td><Expiry date={e.expiryDate} /></td></tr>
              ))}
              {kitIssues.map((k) => (
                <tr key={k.id} className="border-t border-[var(--sge-line)]"><td className="py-1.5">{k.qty - (k.returned ?? 0)} × {kitLabel(k.item)}</td><td>{name(k.supervisorId)}</td><td className="font-mono text-xs">{k.issuedOn}</td><td><Expiry date={k.lots[0]?.expiryDate} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <ReturnsQueue stage="with_store" />
    </div>
  );
}

/** A supervisor's equipment: what he holds, and returning it (round 2, §27) */
export function SupervisorEquipment() {
  const { state, fullState, returnEquipment } = useStore();
  const { notify } = useWork();
  const me = state.currentUserId;
  const [cond, setCond] = useState<Record<string, EquipmentReturn["condition"]>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const mine = fullState.equipment.filter((e) => e.issuedTo === me && !e.scrapped);
  const kits = fullState.kitIssues.filter((k) => k.supervisorId === me && k.qty - (k.returned ?? 0) > 0);
  const waiting = fullState.equipmentReturns.filter((r) => r.by === me && (r.status === "with_store" || r.status === "with_sic"));
  const ledgerItems = allStoreItems(fullState);
  const withMe = me ? holdingsOf(fullState.storeMoves, me) : [];

  function send(key: string, input: { equipmentId?: string; kitIssueId?: string; qty: number }, label: string, siteId: string) {
    const c = cond[key] ?? "ok";
    const r = returnEquipment({ ...input, condition: c, note: note[key] ?? "" });
    if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not saved" });
    notify({ kind: "return_raised", problem: c === "scrapped" || c === "damaged", siteId, subjectStaffId: me ?? undefined, title: `Return (${c}): ${label}`, detail: note[key]?.trim() || "—", tab: "/operations?p=equipment", refId: r.id });
    setMsg({ ok: true, text: "Return sent — the store confirms it." });
  }

  // A plain function, not a component, so inputs keep focus while typing
  const row = ({ k, label, siteId, input, max }: { k: string; label: string; siteId: string; input: { equipmentId?: string; kitIssueId?: string }; max?: number }) => (
    <div key={k} className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm">
      <span className="font-semibold">{label}</span>
      {max ? <Input aria-label={`Qty for ${label}`} type="number" min={1} max={max} className="h-8 w-20" value={qty[k] ?? String(max)} onChange={(e) => setQty({ ...qty, [k]: e.target.value })} /> : null}
      <select aria-label={`Condition for ${label}`} className={cn(sel, "h-8")} value={cond[k] ?? "ok"} onChange={(e) => setCond({ ...cond, [k]: e.target.value as EquipmentReturn["condition"] })}>
        {RETURN_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <Input aria-label={`Note for ${label}`} className="h-8 min-w-[180px] flex-1" placeholder="What's wrong? (if not OK)" value={note[k] ?? ""} onChange={(e) => setNote({ ...note, [k]: e.target.value })} />
      <Button size="sm" variant="outline" onClick={() => send(k, { ...input, qty: max ? Number(qty[k] ?? max) : 1 }, label, siteId)}>Return</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionHeader title="My equipment" subtitle="What the store issued to your crew. Return it as OK, damaged, expired or scrapped — the store confirms; a scrap also needs the SIC." />
      <Note m={msg} />
      {/* 2026-10-27, store process: what the store's ledger says he holds, with any extra-issue flag */}
      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">With me (from the store)</h3>
        {withMe.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">Nothing issued to you yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {withMe.map((h) => {
              const it = ledgerItems.find((i) => i.id === h.itemId);
              return (
                <span key={h.itemId} className={h.flagged ? "rounded-sm border border-[var(--sge-warn)] bg-[var(--sge-warn-wash)] px-1.5 py-0.5 text-xs" : "rounded-sm border border-[var(--sge-line)] px-1.5 py-0.5 text-xs"}>
                  {it?.name ?? h.itemId} · <b>{h.qty}</b> {it?.unit}{h.flagged ? " · extra issue" : ""}
                </span>
              );
            })}
          </div>
        )}
      </Panel>
      <Panel>
        {mine.length + kits.length === 0 ? <EmptyState title="Nothing issued to you" detail="The store issues equipment from its Equipment tab." /> : (
          <div className="space-y-2">
            {mine.map((e) => row({ k: e.id, label: `${e.tag} · ${taggedLabel(e.type)}`, siteId: e.siteId, input: { equipmentId: e.id } }))}
            {kits.map((k) => row({ k: k.id, label: `${kitLabel(k.item)} (issued ${k.issuedOn})`, siteId: k.siteId, input: { kitIssueId: k.id }, max: k.qty - (k.returned ?? 0) }))}
          </div>
        )}
      </Panel>
      {waiting.length ? (
        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Returns waiting</h3>
          {waiting.map((r) => (
            <div key={r.id} className="text-sm">{r.qty} · {r.condition} · <StatusPill tone="warn">{r.status === "with_store" ? "with the store" : "with the SIC"}</StatusPill></div>
          ))}
        </Panel>
      ) : null}
    </div>
  );
}
