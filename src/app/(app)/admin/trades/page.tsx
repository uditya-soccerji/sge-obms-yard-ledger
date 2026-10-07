"use client";

import { useMemo, useState } from "react";
import {
  EmptyState,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export default function TradeCataloguePage() {
  const { state, addTrade, updateTrade, updateLabourer, currentAccount } =
    useStore();
  const canEdit =
    state.currentRole === "admin" ||
    state.currentRole === "super_admin" ||
    state.currentRole === "hr";

  const [label, setLabel] = useState("");
  const [subs, setSubs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const labourByTrade = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of state.labourers) {
      map.set(l.trade, (map.get(l.trade) ?? 0) + 1);
    }
    return map;
  }, [state.labourers]);

  function handleAdd() {
    if (!label.trim()) return;
    const subcategories = subs
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => ({
        id: s.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        label: s,
      }));
    addTrade({ label: label.trim(), subcategories, active: true });
    setLabel("");
    setSubs("");
    setMsg(`Added trade “${label.trim()}”`);
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Trade catalogue"
        subtitle="Labour trades and optional sub-categories (e.g. Painter → spray / manual). Used on labourer profiles."
      />

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      {canEdit ? (
        <Panel className="space-y-3">
          <h3 className="font-heading text-sm font-bold">Add trade</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Trade name</Label>
              <Input
                className="mt-1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Welder"
              />
            </div>
            <div>
              <Label>Sub-categories (pipe-separated)</Label>
              <Input
                className="mt-1"
                value={subs}
                onChange={(e) => setSubs(e.target.value)}
                placeholder="e.g. TIG | MIG"
              />
            </div>
          </div>
          <Button type="button" onClick={handleAdd}>
            Add to catalogue
          </Button>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">Catalogue</h3>
        {state.tradeCatalogue.length === 0 ? (
          <EmptyState title="No trades" detail="Seed or add trades above." />
        ) : (
          <div className="space-y-2">
            {state.tradeCatalogue.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.label}</span>
                    <StatusPill tone={t.active ? "ok" : "crit"}>
                      {t.active ? "active" : "inactive"}
                    </StatusPill>
                    <span className="text-[11px] text-[var(--sge-ink-3)]">
                      {labourByTrade.get(t.id) ?? 0} labourers
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-[var(--sge-ink-3)]">
                    id: {t.id}
                  </div>
                  {t.subcategories.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.subcategories.map((s) => (
                        <span
                          key={s.id}
                          className="rounded border border-[var(--sge-line)] bg-[var(--sge-ground)] px-2 py-0.5 text-xs"
                        >
                          {s.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-[var(--sge-ink-3)]">
                      No sub-categories
                    </div>
                  )}
                </div>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateTrade(t.id, { active: !t.active })}
                  >
                    {t.active ? "Disable" : "Enable"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {(state.currentRole === "hr" ||
        state.currentRole === "admin" ||
        state.currentRole === "super_admin") && (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Assign labourer trade
          </h3>
          <p className="mb-3 text-sm text-[var(--sge-ink-2)]">
            Signed in as {currentAccount?.name}. Pick trade (+ sub-category when
            present) for each labourer.
          </p>
          <div className="space-y-2">
            {state.labourers.map((l) => {
              const trade = state.tradeCatalogue.find((t) => t.id === l.trade);
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
                >
                  <div className="min-w-[140px] font-medium">{l.name}</div>
                  <select
                    className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-surface)] px-2 text-xs"
                    value={l.trade}
                    onChange={(e) => {
                      const next = e.target.value;
                      const def = state.tradeCatalogue.find((t) => t.id === next);
                      updateLabourer(l.id, {
                        trade: next,
                        tradeSubcategory: def?.subcategories[0]?.id,
                      });
                    }}
                  >
                    {state.tradeCatalogue.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {trade && trade.subcategories.length > 0 ? (
                    <select
                      className="h-8 rounded-md border border-[var(--sge-line)] bg-[var(--sge-surface)] px-2 text-xs"
                      value={l.tradeSubcategory ?? ""}
                      onChange={(e) =>
                        updateLabourer(l.id, {
                          tradeSubcategory: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">— subcategory —</option>
                      {trade.subcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}
