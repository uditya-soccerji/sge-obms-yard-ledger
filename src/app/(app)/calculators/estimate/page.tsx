"use client";

import { guarded } from "@/components/shared/require-module";
import { useMemo, useState } from "react";
import {
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { estimateCost } from "@/lib/estimate";
import { useStore } from "@/lib/store";
import { entrySiteId } from "@/lib/site-scope";
import type { RateCardKind } from "@/lib/types";

function CostEstimatePage() {
  const { state, updateRateCard } = useStore();
  const [kind, setKind] = useState<RateCardKind>("pipeline");
  const [qty, setQty] = useState(500);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const activeSite = entrySiteId(state);

  const result = useMemo(
    () =>
      estimateCost(state.rateCards, {
        kind,
        quantity: qty,
        siteId: activeSite,
        rateLines: state.rateLines,
      }),
    [state.rateCards, state.rateLines, activeSite, kind, qty]
  );

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Cost & manpower estimator"
        subtitle="Pipeline, Structures, Tanks (₹/m²) and Scaffolding (₹/m³). When a matching PO rate exists for the active site, the rate book wins over legacy rate cards."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="space-y-4">
          <div>
            <Label>Scope type</Label>
            <Select
              value={kind}
              onValueChange={(v) => setKind(v as RateCardKind)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pipeline">Pipeline</SelectItem>
                <SelectItem value="structures">Structures</SelectItem>
                <SelectItem value="tanks">Tanks / vessels</SelectItem>
                <SelectItem value="scaffolding">Scaffolding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              Quantity ({kind === "scaffolding" ? "m³" : "m²"})
            </Label>
            <Input
              type="number"
              className="mt-1"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
        </Panel>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile
            label="Estimated cost"
            value={result ? formatINR(result.costInr) : "—"}
            tone="accent"
            hint={
              result
                ? `${result.quantity} ${result.unit} × ₹${result.rateInr}`
                : undefined
            }
          />
          <KpiTile
            label="Paint / material"
            value={
              result
                ? kind === "scaffolding"
                  ? result.materialNote ?? "Scaffold hire"
                  : `${result.paintLitres} L`
                : "—"
            }
          />
          <KpiTile
            label="Avg manpower days"
            value={result ? String(result.manpowerDays) : "—"}
            hint="Crew-days estimate"
            tone="ok"
          />
          <KpiTile
            label="Unit rate"
            value={result ? `₹${result.rateInr}/${result.unit}` : "—"}
            hint={
              result?.fromRateBook
                ? "From PO rate book"
                : "From legacy rate card"
            }
            tone={result?.fromRateBook ? "ok" : undefined}
          />
        </div>
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
          Rate cards {state.currentRole === "admin" || state.currentRole === "owner" ? "(editable)" : ""}
        </h3>
        <div className="space-y-2">
          {state.rateCards.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <div>
                <div className="font-semibold">{c.label}</div>
                <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                  ₹{c.rateInr}/{c.unit}
                  {c.paintLitresPerUnit != null
                    ? ` · ${c.paintLitresPerUnit} L/${c.unit}`
                    : ""}
                  {` · ${c.manpowerDaysPerUnit} md/${c.unit}`}
                  {c.materialNote ? ` · ${c.materialNote}` : ""}
                </div>
              </div>
              {(state.currentRole === "admin" ||
                state.currentRole === "owner") &&
              c.editable ? (
                editId === c.id ? (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={editRate}
                      onChange={(e) => setEditRate(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        updateRateCard(c.id, { rateInr: Number(editRate) });
                        setEditId(null);
                      }}
                    >
                      Save
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditId(c.id);
                      setEditRate(String(c.rateInr));
                    }}
                  >
                    Edit rate
                  </Button>
                )
              ) : null}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("calculators", CostEstimatePage);
