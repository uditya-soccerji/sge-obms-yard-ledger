"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, Calculator, ArrowUpFromLine, BookOpen, Boxes, ClipboardList, Package, PaintBucket, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/work/common";
import { useStore } from "@/lib/store";
import { allStoreItems, GROUP_LABEL, heldBy, holdingsOf, inScope, inStore, MOVE_LABEL, paintTypeOf, paintTypes, type StockScope } from "@/lib/store-ledger";
import { ALL_SITES, entrySiteId } from "@/lib/site-scope";
import type { StoreGroup, StoreMove } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AddItemForm, IssueForm, OpeningStockUpload, PaintReceiveList, ReceiveForm } from "./store-forms";
import { MpsAchievable } from "./mps-achievable";

const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export type StoreTabId = "stock" | "receive" | "issue" | "ledger" | "mps" | "ppe" | "machinery" | "paint" | "dprs";
type SectionId = "paint" | "other" | "machinery" | "dprs";
type Tab = { id: StoreTabId; label: string; icon: LucideIcon };

/**
 * 2026-10-27: paint and other stock are kept apart. Each has its own Stock · Receive · Issue · Ledger;
 * paint adds MPS achievable and the paint board; other stock adds the PPE flags from DPRs.
 */
const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; tabs: Tab[] }[] = [
  {
    id: "paint",
    label: "Paint",
    icon: PaintBucket,
    tabs: [
      { id: "stock", label: "Paint stock", icon: Boxes },
      { id: "receive", label: "Receive", icon: ArrowDownToLine },
      { id: "issue", label: "Issue", icon: ArrowUpFromLine },
      { id: "ledger", label: "Ledger", icon: BookOpen },
      { id: "mps", label: "MPS achievable", icon: Calculator },
      { id: "paint", label: "Paint board", icon: ClipboardList },
    ],
  },
  {
    id: "other",
    label: "Other stock",
    icon: Package,
    tabs: [
      { id: "stock", label: "Stock", icon: Boxes },
      { id: "receive", label: "Receive", icon: ArrowDownToLine },
      { id: "issue", label: "Issue", icon: ArrowUpFromLine },
      { id: "ledger", label: "Ledger", icon: BookOpen },
      { id: "ppe", label: "PPE from DPRs", icon: ShieldAlert },
    ],
  },
  { id: "machinery", label: "Machinery", icon: Wrench, tabs: [] },
  { id: "dprs", label: "Store DPRs", icon: ClipboardList, tabs: [] },
];

const pill = (on: boolean) =>
  cn("inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em]", on ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]");
const badge = (c: number) => (c ? <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sge-brass)] px-1 text-[10px] font-bold leading-none tracking-normal text-white">{c}</span> : null);

export function StoreWorkspace({ panels, counts }: { panels: Partial<Record<StoreTabId, ReactNode>>; counts?: Partial<Record<StoreTabId, number>> }) {
  const { fullState: state } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sec = SECTIONS.find((x) => x.id === params.get("sec")) ?? SECTIONS[0];
  const tab = (sec.tabs.find((t) => t.id === params.get("tab"))?.id ?? sec.tabs[0]?.id ?? sec.id) as StoreTabId;
  const go = (s: SectionId, t?: StoreTabId) => router.replace(`${pathname}?sec=${s}${t ? `&tab=${t}` : ""}`);
  // The store's site: the header's site; on All sites (central, Owner, SA) pick one here
  const allSites = state.currentSiteId === ALL_SITES;
  const [picked, setPicked] = useState("");
  const siteId = allSites ? picked || entrySiteId(state) : state.currentSiteId;
  const sites = state.sites.filter((x) => x.enabled);
  const low = useMemo(() => {
    const items = allStoreItems(state).filter((i) => i.active && (i.reorder[siteId] ?? 0) > 0 && inStore(state.storeMoves, siteId, i.id) < (i.reorder[siteId] ?? 0));
    return { paint: items.filter((i) => inScope(i, "paint")).length, other: items.filter((i) => inScope(i, "other")).length };
  }, [state, siteId]);
  const secCount = (id: SectionId) => (id === "paint" ? low.paint : id === "other" ? low.other + (counts?.ppe ?? 0) : id === "machinery" ? counts?.machinery ?? 0 : 0);
  const tabCount = (id: StoreTabId) => (id === "stock" ? (sec.id === "paint" ? low.paint : low.other) : id === "ppe" ? counts?.ppe ?? 0 : 0);
  const scope: StockScope = sec.id === "paint" ? "paint" : "other";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--sge-line)] pb-2">
        {SECTIONS.map((x) => {
          const Icon = x.icon;
          return (
            <button key={x.id} type="button" onClick={() => go(x.id)} className={cn(pill(sec.id === x.id), "px-4 py-2 text-xs")}>
              <Icon aria-hidden className="h-4 w-4" />
              {x.label}
              {badge(secCount(x.id))}
            </button>
          );
        })}
        {allSites ? (
          <select aria-label="Store site" className={selectCls + " ml-auto w-auto"} value={siteId} onChange={(e) => setPicked(e.target.value)}>
            {sites.map((x) => <option key={x.id} value={x.id}>{x.code} store</option>)}
          </select>
        ) : null}
      </div>
      {sec.tabs.length ? (
        <div className="flex flex-wrap items-center gap-1 border-l-4 border-[var(--sge-brass)] pl-2">
          {sec.tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} type="button" onClick={() => go(sec.id, t.id)} className={pill(tab === t.id)}>
                <Icon aria-hidden className="h-3.5 w-3.5" />
                {t.label}
                {badge(tabCount(t.id))}
              </button>
            );
          })}
        </div>
      ) : null}
      {sec.id === "machinery" ? panels.machinery ?? null : null}
      {sec.id === "dprs" ? panels.dprs ?? null : null}
      {sec.id === "paint" || sec.id === "other" ? (
        <>
          {tab === "stock" ? <StockTab siteId={siteId} scope={scope} /> : null}
          {tab === "receive" ? (
            <div className="space-y-4">
              {scope === "paint" ? (
                <Panel>
                  <h3 className="mb-3 font-heading text-sm font-bold">Receive paint</h3>
                  <PaintReceiveList siteId={siteId} />
                </Panel>
              ) : (
                <ReceiveForm siteId={siteId} />
              )}
              <OpeningStockUpload siteId={siteId} scope={scope} />
              <LedgerList siteId={siteId} scope={scope} kinds={["receive", "opening"]} title="Recent receipts" />
            </div>
          ) : null}
          {tab === "issue" ? (
            <div className="space-y-4">
              <IssueForm siteId={siteId} scope={scope} />
              <Holdings siteId={siteId} scope={scope} />
              <LedgerList siteId={siteId} scope={scope} kinds={["issue"]} title="Recent issues" />
            </div>
          ) : null}
          {tab === "ledger" ? <LedgerList siteId={siteId} scope={scope} title={scope === "paint" ? "Paint ledger" : "Store ledger (other stock)"} /> : null}
          {tab === "mps" ? <MpsAchievable siteId={siteId} /> : null}
          {tab === "paint" ? panels.paint ?? null : null}
          {tab === "ppe" ? panels.ppe ?? null : null}
        </>
      ) : null}
    </div>
  );
}

/** Every item: in store, with supervisors, reorder level and status */
function StockTab({ siteId, scope }: { siteId: string; scope: StockScope }) {
  const { fullState: state } = useStore();
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [onlyStock, setOnlyStock] = useState(true);
  const [adding, setAdding] = useState(false);
  const sups = state.staff.filter((x) => x.role === "supervisor" && x.siteId === siteId).map((x) => x.id);
  const rows = allStoreItems(state)
    .filter((i) => i.active && inScope(i, scope) && (!group || (scope === "paint" ? paintTypeOf(i) === group : i.group === group)) && (!q.trim() || `${i.category} ${i.name} ${i.code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())))
    .map((i) => {
      const store = inStore(state.storeMoves, siteId, i.id);
      const withSup = sups.reduce((t, s) => t + heldBy(state.storeMoves, s, i.id), 0);
      const reorder = i.reorder[siteId] ?? 0;
      return { i, store, withSup, reorder, status: store <= 0 ? "out" : reorder > 0 && store < reorder ? "low" : "ok" };
    })
    .filter((r) => !onlyStock || r.store !== 0 || r.withSup !== 0);
  return (
    <div className="space-y-4">
      {adding ? <AddItemForm scope={scope} /> : null}
      <Panel>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" className="gap-1" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : scope === "paint" ? "+ Add paint" : "+ Add item"}
          </Button>
          <Input aria-label="Search stock" className="w-56" placeholder="Search item, category, code" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label={scope === "paint" ? "Paint type" : "Group"} className={selectCls + " w-56"} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{scope === "paint" ? "All paint types" : "All groups"}</option>
            {scope === "paint"
              ? paintTypes(allStoreItems(state)).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)
              : (Object.keys(GROUP_LABEL) as StoreGroup[]).filter((g) => g !== "paint").map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={onlyStock} onChange={(e) => setOnlyStock(e.target.checked)} /> Only items with stock
          </label>
          <span className="ml-auto text-xs text-[var(--sge-ink-3)]">{rows.length} item(s)</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="No stock yet" detail={onlyStock ? "Receive stock or load the opening stock (Receive tab). Untick “Only items with stock” to see the whole item list." : "No item matches."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
                  <th className="py-1.5">Item</th>
                  <th>{scope === "paint" ? "Paint type" : "Group · category"}</th>
                  <th className="text-right">In store</th>
                  <th className="text-right">With supervisors</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Reorder at</th>
                  <th className="pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i.id} className="border-t border-[var(--sge-line)]">
                    <td className="py-1.5 font-medium">{r.i.name}{r.i.code ? <span className="ml-1 font-mono text-[10px] text-[var(--sge-ink-3)]">{r.i.code}</span> : null}</td>
                    <td className="text-xs text-[var(--sge-ink-3)]">{scope === "paint" ? paintTypeOf(r.i) : `${GROUP_LABEL[r.i.group]} · ${r.i.category}`}</td>
                    <td className="text-right font-mono">{r.store} {r.i.unit}</td>
                    <td className="text-right font-mono">{r.withSup || "—"}</td>
                    <td className="text-right font-mono font-semibold">{r.store + r.withSup}</td>
                    <td className="text-right font-mono text-[var(--sge-ink-3)]">{r.reorder || "—"}</td>
                    <td className="pl-3"><StatusPill tone={r.status === "ok" ? "ok" : r.status === "low" ? "warn" : "crit"}>{r.status === "ok" ? "OK" : r.status === "low" ? "Low" : "Out"}</StatusPill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--sge-ink-3)]">Reorder levels are set per site by the Owner / Super Admin (stage 4).</p>
      </Panel>
      <Holdings siteId={siteId} scope={scope} />
    </div>
  );
}

/** What each supervisor on the site holds, with extra-issue flags for Owner / SA */
function Holdings({ siteId, scope }: { siteId: string; scope: StockScope }) {
  const { fullState: state } = useStore();
  const items = allStoreItems(state);
  const sups = state.staff.filter((x) => x.role === "supervisor" && x.siteId === siteId);
  const rows = sups.map((s) => ({ s, held: holdingsOf(state.storeMoves.filter((m) => m.siteId === siteId && inScope(items.find((i) => i.id === m.itemId), scope)), s.id) })).filter((r) => r.held.length);
  return (
    <Panel>
      <h3 className="mb-2 font-heading text-sm font-bold">With supervisors</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--sge-ink-3)]">Nothing issued yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ s, held }) => (
            <div key={s.id}>
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
                {s.name}
                {held.some((h) => h.flagged) ? (
                  <span className="inline-flex items-center gap-1 rounded-sm bg-[var(--sge-warn-wash)] px-1.5 text-[11px] font-semibold text-[var(--sge-warn)]">
                    <AlertTriangle aria-hidden className="h-3 w-3" /> extra issue
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {held.map((h) => {
                  const it = items.find((i) => i.id === h.itemId);
                  return (
                    <span key={h.itemId} className={cn("rounded-sm border px-1.5 py-0.5 text-xs", h.flagged ? "border-[var(--sge-warn)] bg-[var(--sge-warn-wash)]" : "border-[var(--sge-line)]")}>
                      {it?.name ?? h.itemId} · <b>{h.qty}</b> {it?.unit}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

const PAGE = 50;

/** The ledger, newest first, 50 a page — edit a line (kept in its History) */
function LedgerList({ siteId, scope, kinds, title }: { siteId: string; scope: StockScope; kinds?: StoreMove["kind"][]; title: string }) {
  const { fullState: state, editStoreMove } = useStore();
  const items = allStoreItems(state);
  const [q, setQ] = useState("");
  const [pageNo, setPage] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [hist, setHist] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const supName = (id?: string) => (id ? state.staff.find((x) => x.id === id)?.name ?? id : "");
  const rows = state.storeMoves
    .filter((m) => m.siteId === siteId && inScope(items.find((i) => i.id === m.itemId), scope) && (!kinds || kinds.includes(m.kind)))
    .filter((m) => {
      if (!q.trim()) return true;
      const it = items.find((i) => i.id === m.itemId);
      return `${it?.name} ${it?.category} ${supName(m.supervisorId)} ${m.batch ?? ""} ${m.vendor ?? ""} ${m.billNo ?? ""}`.toLowerCase().includes(q.trim().toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.enteredAt.localeCompare(a.enteredAt));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pageNo, pages - 1);
  return (
    <Panel>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">{title}</h3>
        <Input aria-label="Search ledger" className="ml-auto w-56" placeholder="Search item, supervisor, batch, bill" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {msg ? <p className="mb-2 text-xs text-[var(--sge-crit)]">{msg}</p> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--sge-ink-3)]">No lines yet.</p>
      ) : (
        <div className="divide-y divide-[var(--sge-line)]">
          {rows.slice(page * PAGE, page * PAGE + PAGE).map((m) => {
            const it = items.find((i) => i.id === m.itemId);
            return (
              <div key={m.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{m.date}</span>
                  <StatusPill tone={m.kind === "issue" ? "warn" : m.kind === "adjust" ? "default" : "ok"}>{MOVE_LABEL[m.kind]}</StatusPill>
                  <span className="font-semibold">{it?.name ?? m.itemId}</span>
                  <span className="font-mono">{m.kind === "issue" ? "−" : m.qty > 0 ? "+" : ""}{m.qty} {it?.unit}</span>
                  {m.supervisorId ? <span className="text-xs">→ {supName(m.supervisorId)}{m.plant ? ` · ${m.plant}` : ""}</span> : null}
                  {m.extraIssue ? <span className="inline-flex items-center gap-1 rounded-sm bg-[var(--sge-warn-wash)] px-1.5 text-[11px] font-semibold text-[var(--sge-warn)]"><AlertTriangle aria-hidden className="h-3 w-3" /> extra · held {m.extraIssue.heldBefore}</span> : null}
                  <span className="text-xs text-[var(--sge-ink-3)]">
                    {[m.batch && `batch ${m.batch}`, m.expiry && `exp ${m.expiry}`, m.vendor, m.vehicleNo && `vehicle ${m.vehicleNo}`, m.billNo && `bill ${m.billNo}`, m.po && `PO ${m.po}`, m.note].filter(Boolean).join(" · ")}
                  </span>
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    <span className="text-[var(--sge-ink-3)]">{m.enteredByName} · {stamp(m.enteredAt)}</span>
                    <button type="button" className="text-[var(--sge-brass-ink)] underline" onClick={() => setHist(hist === m.id ? null : m.id)}>History ({m.history.length})</button>
                    <button type="button" className="text-[var(--sge-brass-ink)] underline" onClick={() => { setEditing(editing === m.id ? null : m.id); setMsg(null); }}>{editing === m.id ? "Close" : "Edit"}</button>
                  </span>
                </div>
                {hist === m.id ? (
                  <ol className="ml-2 mt-1.5 space-y-0.5 border-l-2 border-[var(--sge-line)] pl-3 text-xs">
                    {m.history.map((h, i) => (
                      <li key={i}><b>{h.action === "created" ? "Entered" : "Edited"}</b> by {h.byName} · {stamp(h.at)}{h.note ? ` · ${h.note}` : ""}</li>
                    ))}
                  </ol>
                ) : null}
                {editing === m.id ? (
                  <EditLine
                    m={m}
                    onSave={(patch) => {
                      const r = editStoreMove(m.id, patch);
                      if (!r.ok) return setMsg(r.error ?? "Couldn't save");
                      setEditing(null);
                      setMsg(null);
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {pages > 1 ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-xs">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {pages} · {rows.length} lines</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </Panel>
  );
}

function EditLine({ m, onSave }: { m: StoreMove; onSave: (patch: Partial<StoreMove>) => void }) {
  const [f, setF] = useState({ date: m.date, qty: String(m.qty), batch: m.batch ?? "", expiry: m.expiry ?? "", vendor: m.vendor ?? "", billNo: m.billNo ?? "", po: m.po ?? "", note: m.note ?? "" });
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2 rounded-sm border border-[var(--sge-brass)]/40 bg-[var(--sge-brass-wash)]/40 p-2 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ date: f.date, qty: Number(f.qty), batch: f.batch || undefined, expiry: f.expiry || undefined, vendor: f.vendor || undefined, billNo: f.billNo || undefined, po: f.po || undefined, note: f.note || undefined });
      }}
    >
      <label className="space-y-0.5">Date<Input aria-label="Edit date" type="date" className="h-8 w-36 text-xs" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <label className="space-y-0.5">Qty<Input aria-label="Edit quantity" type="number" step="any" className="h-8 w-24 text-xs" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
      <label className="space-y-0.5">Batch<Input aria-label="Edit batch" className="h-8 w-28 text-xs" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} /></label>
      <label className="space-y-0.5">Expiry<Input aria-label="Edit expiry" type="date" className="h-8 w-36 text-xs" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></label>
      {m.kind === "receive" ? (
        <>
          <label className="space-y-0.5">Vendor<Input aria-label="Edit vendor" className="h-8 w-32 text-xs" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} /></label>
          <label className="space-y-0.5">Bill<Input aria-label="Edit bill" className="h-8 w-24 text-xs" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} /></label>
          <label className="space-y-0.5">PO<Input aria-label="Edit PO" className="h-8 w-24 text-xs" value={f.po} onChange={(e) => setF({ ...f, po: e.target.value })} /></label>
        </>
      ) : null}
      <label className="space-y-0.5">Note<Input aria-label="Edit note" className="h-8 w-40 text-xs" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <Button type="submit" size="sm">Save</Button>
    </form>
  );
}
