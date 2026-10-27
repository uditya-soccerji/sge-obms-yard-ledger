"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowDownToLine, Calculator, ArrowUpFromLine, BookOpen, Boxes, ClipboardList, Info, Package, PaintBucket, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/work/common";
import { useStore } from "@/lib/store";
import { allStoreItems, byPlant, GROUP_LABEL, holdingsOf, IDLE_DAYS, inScope, inStore, MOVE_LABEL, NEAR_EXPIRY_DAYS, paintTypeOf, paintTypes, stockStatus, type StockScope } from "@/lib/store-ledger";
import { today } from "@/lib/today";
import { plannedPaintNeed, TYPE6_KEY } from "@/lib/paint-need";
import { useWork } from "@/lib/work/store";
import { ALL_SITES, entrySiteId } from "@/lib/site-scope";
import type { StoreGroup, StoreItem, StoreMove } from "@/lib/types";
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

/**
 * Every item: in store, at each plant, total, the batch to issue next, and its status
 * (2026-10-27: plant-wise quantities; quantity / type / plant / status filters; expired,
 * near expiry, not used in a month; FEFO for paint, FIFO for the rest).
 */
type StatusKey = "ok" | "low" | "out" | "expired" | "near" | "idle";
const STATUS_LABEL: Record<StatusKey, string> = { ok: "OK", low: "Low", out: "Out", expired: "Expired", near: `Near expiry`, idle: "Not used 1 month" };
const STATUS_TONE: Record<StatusKey, "ok" | "warn" | "crit" | "default"> = { ok: "ok", low: "warn", out: "crit", expired: "crit", near: "warn", idle: "default" };

function StockTab({ siteId, scope }: { siteId: string; scope: StockScope }) {
  const { fullState: state } = useStore();
  const [group, setGroup] = useState("");
  const [plant, setPlant] = useState("");
  const [status, setStatus] = useState<StatusKey | "">("");
  const [qtyMode, setQtyMode] = useState<"stock" | "any" | "zero" | "min">("stock");
  const [minQty, setMinQty] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const day = today();
  const plants = state.sites.find((x) => x.id === siteId)?.plants ?? [];
  const [t6Pick, setT6Pick] = useState("");
  const paint = scope === "paint";
  // 2026-10-27: where each paint is going to be used — this month's plan, by plant
  const { work } = useWork();
  const need = useMemo(() => (paint ? plannedPaintNeed(work, siteId) : new Map<string, { plant: string; litres: number }[]>()), [paint, work, siteId]);
  const needOf = (r: { i: StoreItem; type6: boolean }) => (r.type6 || paintTypeOf(r.i) === "Type 6" ? need.get(TYPE6_KEY) : r.i.code ? need.get(r.i.code) : undefined) ?? [];
  const rowOf = (i: StoreItem) => {
      const store = inStore(state.storeMoves, siteId, i.id);
      const plantsQty = byPlant(state.storeMoves, siteId, i.id);
      const atPlants = plantsQty.reduce((t, p) => t + p.qty, 0);
      const reorder = i.reorder[siteId] ?? 0;
      const st = stockStatus(state.storeMoves, siteId, i, day, store);
      const statuses: StatusKey[] = [];
      if (store <= 0) statuses.push("out");
      else if (reorder > 0 && store < reorder) statuses.push("low");
      if (st.expiredQty > 0) statuses.push("expired");
      if (st.nearQty > 0) statuses.push("near");
      if (st.idle) statuses.push("idle");
      if (!statuses.length) statuses.push("ok");
      const shown = plant ? plantsQty.find((p) => p.plant === plant)?.qty ?? 0 : store + atPlants;
      return { i, store, plantsQty, atPlants, reorder, st, statuses, shown, type6: false };
  };
  type Row = ReturnType<typeof rowOf>;
  let base: Row[] = allStoreItems(state)
    .filter((i) => i.active && inScope(i, scope) && (!group || (scope === "paint" ? paintTypeOf(i) === group : i.group === group)) && (!q.trim() || `${paintTypeOf(i)} ${i.category} ${i.name} ${i.code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())))
    .map(rowOf);
  // 2026-10-27: Type 6 is one row; its SAP codes (one per shade) are in a dropdown — all shades, or one
  const t6Items = paint ? allStoreItems(state).filter((i) => i.active && i.group === "paint" && paintTypeOf(i) === "Type 6") : [];
  const t6Rows = t6Items.map(rowOf);
  const t6At = base.findIndex((r) => paintTypeOf(r.i) === "Type 6");
  if (t6At >= 0) {
    const picked = t6Rows.find((r) => r.i.id === t6Pick);
    const sum = (f: (r: Row) => number) => t6Rows.reduce((t, r) => t + f(r), 0);
    const plantsMap = new Map<string, number>();
    for (const r of t6Rows) for (const pq of r.plantsQty) plantsMap.set(pq.plant, (plantsMap.get(pq.plant) ?? 0) + pq.qty);
    const store = sum((r) => r.store);
    const plantsQty = [...plantsMap.entries()].map(([pl, qty]) => ({ plant: pl, qty })).sort((a, b) => b.qty - a.qty);
    const atPlants = plantsQty.reduce((t, x) => t + x.qty, 0);
    const nexts = t6Rows.map((r) => r.st.next).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999"));
    const statuses = [...new Set(t6Rows.filter((r) => r.store > 0 || r.atPlants > 0).flatMap((r) => r.statuses).filter((k) => k !== "out" && k !== "ok"))] as StatusKey[];
    const all: Row = {
      i: { id: "type6-all", group: "paint", category: "Type 6", name: "All shades", unit: "L", trackExpiry: true, reorder: {}, active: true },
      store,
      plantsQty,
      atPlants,
      reorder: 0,
      st: { expiredQty: sum((r) => r.st.expiredQty), nearQty: sum((r) => r.st.nearQty), idle: t6Rows.some((r) => r.st.idle), lastIssue: undefined, next: nexts[0] },
      statuses: store <= 0 ? ["out", ...statuses] : statuses.length ? statuses : ["ok"],
      shown: plant ? plantsQty.find((x) => x.plant === plant)?.qty ?? 0 : store + atPlants,
      type6: true,
    };
    base = [...base.filter((r) => paintTypeOf(r.i) !== "Type 6")];
    base.splice(t6At, 0, picked ? { ...picked, type6: true } : all);
  }
  const rows = base
    .filter((r) => !plant || r.plantsQty.some((p) => p.plant === plant))
    .filter((r) => !status || r.statuses.includes(status))
    .filter((r) => (qtyMode === "stock" ? r.shown > 0 : qtyMode === "zero" ? r.shown === 0 : qtyMode === "min" ? r.shown >= (Number(minQty) || 0) : true));
  return (
    <div className="space-y-4">
      {adding ? <AddItemForm scope={scope} /> : null}
      <p className="flex items-start gap-2 rounded-sm border border-[var(--sge-brass)]/40 bg-[var(--sge-brass-wash)] px-3 py-2 text-xs text-[var(--sge-brass-ink)]">
        <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {paint ? (
          <span><b>Issue paint First-Expiry-First-Out (FEFO):</b> always issue the batch that expires first, even if it came in later. Expired paint is never issued — report it. The Issue form picks the right batch for you; “Issue next” below shows it.</span>
        ) : (
          <span><b>Issue First-In-First-Out (FIFO):</b> issue the oldest stock received first, so nothing sits until it spoils. “Issue next” below shows the oldest batch; anything not used for a month is marked.</span>
        )}
      </p>
      <Panel>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Button type="button" size="sm" className="gap-1" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : paint ? "+ Add paint" : "+ Add item"}
          </Button>
          <Input aria-label="Search stock" className="w-48" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label={paint ? "Paint type" : "Group"} className={selectCls + " w-48"} value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{paint ? "All paint types" : "All groups"}</option>
            {paint
              ? paintTypes(allStoreItems(state)).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)
              : (Object.keys(GROUP_LABEL) as StoreGroup[]).filter((g) => g !== "paint").map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
          </select>
          <select aria-label="Plant" className={selectCls + " w-40"} value={plant} onChange={(e) => setPlant(e.target.value)}>
            <option value="">All plants</option>
            {plants.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Status" className={selectCls + " w-44"} value={status} onChange={(e) => setStatus(e.target.value as StatusKey | "")}>
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as StatusKey[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]}</option>)}
          </select>
          <select aria-label="Quantity" className={selectCls + " w-40"} value={qtyMode} onChange={(e) => setQtyMode(e.target.value as typeof qtyMode)}>
            <option value="stock">Quantity: in stock</option>
            <option value="any">Quantity: any</option>
            <option value="zero">Quantity: zero</option>
            <option value="min">Quantity: at least…</option>
          </select>
          {qtyMode === "min" ? <Input aria-label="Minimum quantity" className="w-24" type="number" min="0" placeholder="e.g. 50" value={minQty} onChange={(e) => setMinQty(e.target.value)} /> : null}
          <span className="ml-auto text-xs text-[var(--sge-ink-3)]">{rows.length} item(s)</span>
        </div>
        {rows.length === 0 ? (
          <EmptyState title="Nothing matches" detail="Change the filters, or receive stock / load the opening stock (Receive tab)." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
                  <th className="py-1.5">{paint ? "Paint type · SAP code" : "Group · category"}</th>
                  <th className="text-right">In store</th>
                  <th className="pl-3">At plants{plant ? ` (${plant})` : ""}</th>
                  <th className="text-right">Total</th>
                  {paint ? <th className="pl-3">To be used at (plan)</th> : null}
                  <th className="pl-3">Issue next ({paint ? "FEFO" : "FIFO"})</th>
                  <th className="text-right">Reorder at</th>
                  <th className="pl-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.i.id} className="border-t border-[var(--sge-line)] align-top">
                    <td className="py-1.5">
                      {r.type6 ? (
                        // Type 6: every SAP code (shade) in one dropdown, with its litres here
                        <div>
                          <div className="font-semibold">Type 6 · PU finish</div>
                          <select aria-label="Type 6 SAP code" className={selectCls + " mt-1 h-8 w-64 text-xs"} value={t6Pick} onChange={(e) => setT6Pick(e.target.value)}>
                            <option value="">All {t6Rows.length} SAP codes · {t6Rows.reduce((t, x) => t + x.store + x.atPlants, 0)} L</option>
                            {[...t6Rows].sort((a, b) => b.store + b.atPlants - (a.store + a.atPlants) || a.i.name.localeCompare(b.i.name)).map((x) => (
                              <option key={x.i.id} value={x.i.id}>SAP {x.i.code} · {x.i.name.replace("Type 6 · PU finish · ", "")} · {x.store + x.atPlants} L</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="font-semibold">
                            {paint ? paintTypeOf(r.i) : `${GROUP_LABEL[r.i.group]} · ${r.i.category}`}
                            {r.i.code ? <span className="ml-1.5 font-mono text-xs font-normal">· SAP {r.i.code}</span> : null}
                          </div>
                          {/* The item's name is secondary: small and plain */}
                          <div className="text-[11px] font-normal text-[var(--sge-ink-3)]">{r.i.name}</div>
                        </>
                      )}
                    </td>
                    <td className="text-right font-mono">{r.store} {r.i.unit}</td>
                    <td className="pl-3">
                      {r.plantsQty.length === 0 ? (
                        <span className="text-xs text-[var(--sge-ink-3)]">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.plantsQty.map((p) => (
                            <span key={p.plant} className={cn("rounded-sm border px-1.5 py-0.5 text-[11px]", p.plant === plant ? "border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] font-semibold" : "border-[var(--sge-line)]")}>
                              {p.plant} <b className="font-mono">{p.qty}</b>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="text-right font-mono font-semibold">{r.store + r.atPlants}</td>
                    {paint ? (
                      <td className="pl-3">
                        {needOf(r).length === 0 ? (
                          <span className="text-xs text-[var(--sge-ink-3)]">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {needOf(r).map((n) => {
                              const have = r.plantsQty.find((x) => x.plant === n.plant)?.qty ?? 0;
                              const short = have < n.litres;
                              return (
                                <span
                                  key={n.plant}
                                  title={`${n.plant}: ${n.litres} L still to be used this month by the plan; ${have} L issued to it${short ? ` — ${Math.round((n.litres - have) * 10) / 10} L short` : ""}`}
                                  className={cn("rounded-sm border px-1.5 py-0.5 text-[11px]", short ? "border-[var(--sge-crit)]/50 bg-[var(--sge-crit-wash)] text-[var(--sge-crit)]" : "border-[var(--sge-ok)]/50 bg-[var(--sge-ok-wash)]", n.plant === plant && "font-semibold")}
                                >
                                  {n.plant} <b className="font-mono">{n.litres}</b>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {r.type6 && needOf(r).length ? <div className="mt-0.5 text-[10px] text-[var(--sge-ink-3)]">Type 6, any shade (the plan doesn&apos;t name it)</div> : null}
                      </td>
                    ) : null}
                    <td className="pl-3 text-xs">
                      {r.st.next ? (
                        <span>
                          Batch <b>{r.st.next.batch}</b> · {r.st.next.qty} {r.i.unit}
                          <span className="block text-[10px] text-[var(--sge-ink-3)]">{r.st.next.expiry ? `exp ${r.st.next.expiry}` : `received ${r.st.next.received}`}</span>
                        </span>
                      ) : r.store > 0 ? (
                        <span className="text-[var(--sge-ink-3)]">no batch recorded</span>
                      ) : (
                        <span className="text-[var(--sge-ink-3)]">—</span>
                      )}
                    </td>
                    <td className="text-right font-mono text-[var(--sge-ink-3)]">{r.reorder || "—"}</td>
                    <td className="pl-3">
                      <div className="flex flex-wrap gap-1">
                        {r.statuses.map((k) => (
                          <StatusPill key={k} tone={STATUS_TONE[k]}>
                            {STATUS_LABEL[k]}
                            {k === "expired" ? ` ${r.st.expiredQty}` : k === "near" ? ` ${r.st.nearQty}` : ""}
                          </StatusPill>
                        ))}
                      </div>
                      {r.statuses.includes("idle") ? <div className="mt-0.5 text-[10px] text-[var(--sge-ink-3)]">{r.st.lastIssue ? `last issued ${r.st.lastIssue}` : "never issued"}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[var(--sge-ink-3)]">
          {paint ? "To be used at = litres this month's plan still needs at each plant (remaining m² × MPS norm per coat); red = less issued to that plant than it needs. " : ""}Near expiry = expiring within {NEAR_EXPIRY_DAYS} days. Not used = no issue in the last {IDLE_DAYS} days. At plants = issued to that plant and not yet used. Reorder levels are set per site by the Owner / Super Admin (stage 4).
        </p>
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
