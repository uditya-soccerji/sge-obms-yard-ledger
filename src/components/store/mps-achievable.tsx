"use client";

import { useMemo, useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/work/common";
import { achievable, MPS_SCHEMES, TYPE6_SHADES } from "@/lib/mps-norms";
import { useStore } from "@/lib/store";
import { allStoreItems, inStore, round } from "@/lib/store-ledger";

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 1 });

/**
 * 2026-10-27: how many m² of each MPS the paint in hand can do — by site store or by plant
 * (paint issued to that plant), brush and spray, with the paint that runs out first.
 * Each figure assumes all the paint goes to that one scheme; schemes share paint.
 */
export function MpsAchievable({ siteId }: { siteId: string }) {
  const { fullState: state } = useStore();
  const items = useMemo(() => allStoreItems(state), [state]);
  const plants = state.sites.find((x) => x.id === siteId)?.plants ?? [];
  const [scope, setScope] = useState("store");
  // Paint in the chosen scope, by SAP code: the site store, or what was issued to a plant
  const stockBySap = useMemo(() => {
    const bySap = new Map<string, number>();
    for (const it of items.filter((i) => i.group === "paint" && i.code)) {
      const q =
        scope === "store"
          ? inStore(state.storeMoves, siteId, it.id)
          : state.storeMoves.filter((m) => m.kind === "issue" && m.siteId === siteId && m.itemId === it.id && m.plant === scope).reduce((t, m) => t + m.qty, 0);
      if (q) bySap.set(it.code!, round((bySap.get(it.code!) ?? 0) + q));
    }
    return bySap;
  }, [items, state.storeMoves, siteId, scope]);
  const stock = (sap: string) => stockBySap.get(sap) ?? 0;
  // Type 6 is one code per shade: default to the shade with the most paint
  const best = [...TYPE6_SHADES].sort((a, b) => stock(b.code) - stock(a.code))[0];
  const [shadePick, setShade] = useState("");
  const shade = shadePick || best?.code || TYPE6_SHADES[0].code;
  const rows = MPS_SCHEMES.map((s) => ({ s, brush: achievable(s, stock, "brush", shade), spray: achievable(s, stock, "spray", shade) })).sort(
    (a, b) => (b.brush.m2 ?? -1) - (a.brush.m2 ?? -1)
  );
  const paintInScope = [...stockBySap.entries()].filter(([, q]) => q > 0);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Paint in</Label>
            <select aria-label="Scope" className={selectCls + " mt-1"} value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="store">{state.sites.find((x) => x.id === siteId)?.code} store (not yet issued)</option>
              {plants.map((p) => <option key={p} value={p}>Plant {p} (issued to it)</option>)}
            </select>
          </div>
          <div>
            <Label>Type 6 finish shade</Label>
            <select aria-label="Type 6 shade" className={selectCls + " mt-1"} value={shade} onChange={(e) => setShade(e.target.value)}>
              {TYPE6_SHADES.map((s) => <option key={s.code} value={s.code}>{s.shade} · {s.code} · {fmt(stock(s.code))} L</option>)}
            </select>
          </div>
          <div className="text-xs text-[var(--sge-ink-3)] sm:pt-6">
            Each MPS is worked out as if all this paint went to it: area = stock ÷ norm for each paint; the paint that runs out first sets the area. Norms from the RIL MPS sheet (L/m²); thinner = 10% of paint.
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {paintInScope.length === 0 ? (
            <span className="text-[var(--sge-ink-3)]">No paint here yet — receive paint, or issue it to this plant.</span>
          ) : (
            paintInScope.map(([sap, q]) => (
              <span key={sap} className="rounded-sm border border-[var(--sge-line)] px-1.5 py-0.5">
                {items.find((i) => i.code === sap)?.name ?? sap} · <b>{fmt(q)} L</b>
              </span>
            ))
          )}
        </div>
      </Panel>
      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">MPS achievable with this paint</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--sge-ink-3)]">
                <th className="py-1.5">MPS</th>
                <th>Paints needed (brush L/m² · in hand)</th>
                <th className="text-right">Brush m²</th>
                <th className="text-right">Spray m²</th>
                <th className="pl-3">Runs out first</th>
                <th className="text-right">Thinner (brush)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, brush, spray }) => (
                <tr key={s.mps} className={brush.m2 === null ? "border-t border-[var(--sge-line)] text-[var(--sge-ink-3)]" : "border-t border-[var(--sge-line)]"}>
                  <td className="py-1.5 align-top">
                    <div className="font-semibold">{s.mps}</div>
                    <div className="max-w-[180px] text-[10px] text-[var(--sge-ink-3)]">{s.application}</div>
                  </td>
                  <td className="align-top text-xs">
                    {brush.m2 === null ? (
                      <span>No norm in the sheet for {s.coats.map((c) => c.coat).join(" / ") || "this scheme"}</span>
                    ) : (
                      brush.perPaint.map((p) => (
                        <div key={p.sap}>
                          {p.paint} <span className="font-mono text-[10px]">{p.sap}</span> · {p.perM2} L/m² · <b className={p.stock ? "" : "text-[var(--sge-crit)]"}>{fmt(p.stock)} L</b>
                        </div>
                      ))
                    )}
                  </td>
                  <td className="text-right align-top font-mono font-semibold">{brush.m2 === null ? "—" : fmt(brush.m2)}</td>
                  <td className="text-right align-top font-mono">{spray.m2 === null ? "—" : fmt(spray.m2)}</td>
                  <td className="pl-3 align-top">{brush.m2 === null ? null : <StatusPill tone={brush.m2 > 0 ? "warn" : "crit"}>{brush.limitedBy}</StatusPill>}</td>
                  <td className="text-right align-top font-mono text-xs">{brush.m2 ? `${fmt(brush.thinnerL)} L` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-[var(--sge-ink-3)]">Schemes share paint (Type 6 is in many), so these areas are alternatives — not a total to add up.</p>
      </Panel>
    </div>
  );
}
