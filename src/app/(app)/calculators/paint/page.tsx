"use client";

import { guarded } from "@/components/shared/require-module";
import { useMemo, useState } from "react";
import {
  Panel,
  SectionHeader,
  StatusPill,
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
import { Textarea } from "@/components/ui/textarea";
import { calculatePaint } from "@/lib/paint-calc";
import { PAINT_SCHEMES } from "@/lib/paint-schemes";
import type { AppMethod } from "@/lib/paint-types";

function PaintCalculatorPage() {
  const [schemeId, setSchemeId] = useState(2);
  const [area, setArea] = useState(1000);
  const [method, setMethod] = useState<AppMethod>("brush");
  const [contingency, setContingency] = useState(0);
  const [manualLitres, setManualLitres] = useState("");
  const [manualReason, setManualReason] = useState("");

  const scheme = PAINT_SCHEMES.find((s) => s.id === schemeId)!;

  const result = useMemo(() => {
    return calculatePaint({
      schemeId,
      area: Number(area) || 0,
      method,
      contingencyPct: Number(contingency) || 0,
      manualLitres: manualLitres ? Number(manualLitres) : undefined,
      manualReason,
    });
  }, [schemeId, area, method, contingency, manualLitres, manualReason]);

  const statusTone =
    scheme.status === "ok"
      ? "ok"
      : scheme.status === "none"
        ? "crit"
        : "warn";

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Paint calculator"
        subtitle="MPS schemes subset from Hub / Paint Calculator — norms + NO_NORM path with manual litres + reason."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Panel className="space-y-4">
          <div>
            <Label>MPS scheme</Label>
            <Select
              value={String(schemeId)}
              onValueChange={(v) => setSchemeId(Number(v))}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAINT_SCHEMES.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    MPS {s.id} · {s.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-[var(--sge-ink-2)]">{scheme.app}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone={statusTone}>{scheme.status}</StatusPill>
              <span className="text-xs text-[var(--sge-ink-3)]">
                DFT {scheme.dft} µm · {scheme.temp}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Area (m²)</Label>
              <Input
                type="number"
                className="mt-1"
                value={area}
                min={0}
                onChange={(e) => setArea(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <Label>Contingency %</Label>
              <Input
                type="number"
                className="mt-1"
                value={contingency}
                min={0}
                onChange={(e) => setContingency(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>

          <div>
            <Label>Application method</Label>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={method === "brush" ? "default" : "outline"}
                size="sm"
                onClick={() => setMethod("brush")}
              >
                Brush / roller · eff 0.65
              </Button>
              <Button
                type="button"
                variant={method === "spray" ? "default" : "outline"}
                size="sm"
                onClick={() => setMethod("spray")}
              >
                Spray · eff 0.50
              </Button>
            </div>
          </div>

          {result.isNoNorm ? (
            <div className="space-y-3 rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] p-3">
              <div className="text-sm font-semibold text-[var(--sge-crit)]">
                NO_NORM — enter manual litres + mandatory reason (flagged for owner)
              </div>
              <div>
                <Label>Manual litres</Label>
                <Input
                  type="number"
                  className="mt-1"
                  value={manualLitres}
                  onChange={(e) => setManualLitres(e.target.value)}
                  placeholder="e.g. 42"
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  className="mt-1"
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                  placeholder="Why is published norm missing / overridden?"
                />
              </div>
              {result.flaggedForOwner && manualReason.trim() ? (
                <StatusPill tone="warn">Flagged for owner review</StatusPill>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Coat-by-coat result
          </h3>
          <div className="space-y-2">
            {result.coats.map((c) => (
              <div
                key={`${c.coat.m}-${c.coat.s}`}
                className="rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <div className="font-medium">
                  {c.coat.pos} · {c.coat.p}
                </div>
                <div className="mt-1 font-mono text-xs text-[var(--sge-ink-3)]">
                  DFT {c.coat.dft} µm · SAP {c.coat.sap || "—"} · thinner SAP{" "}
                  {c.coat.tsap || "—"}
                </div>
                <div className="mt-1">
                  {c.litres != null ? (
                    <span className="font-mono font-semibold">
                      {c.litres} L paint · {c.thinner} L thinner
                    </span>
                  ) : (
                    <StatusPill tone="crit">no published rate</StatusPill>
                  )}
                </div>
              </div>
            ))}
          </div>
          {result.partial ? (
            <div className="mt-4 rounded-md border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)]">
              Part total: no {method} norm for {result.partial.join(", ")} — those coats are not in the total. Flagged for the owner.
            </div>
          ) : null}
          <div className="mt-4 rounded-md border border-[var(--sge-accent)]/30 bg-[var(--sge-accent-wash)] p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-accent-ink)]">
              Totals (+10% thinner)
            </div>
            <div className="mt-1 font-heading text-2xl font-bold tabular-nums">
              {result.totalPaint != null ? `${result.totalPaint} L` : "—"} paint
            </div>
            <div className="font-mono text-sm text-[var(--sge-ink-2)]">
              {result.totalThinner != null
                ? `${result.totalThinner} L thinner`
                : "Enter manual litres for NO_NORM"}
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--sge-ink-3)]">{scheme.remarks}</p>
        </Panel>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("calculators", PaintCalculatorPage);
