"use client";

import { useState } from "react";
import { Panel, SectionHeader } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { scaffoldVolume } from "@/lib/paint-calc";

export default function ScaffoldPage() {
  const [l, setL] = useState(20);
  const [b, setB] = useState(8);
  const [h, setH] = useState(12);
  const [e, setE] = useState(1);
  const volume = scaffoldVolume(l, b, h, e);

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Scaffolding volume"
        subtitle="Standing scaffold volume L×B×H×E for DPR and hire tracking."
      />
      <Panel className="max-w-lg space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <Label>L (m)</Label>
            <Input
              type="number"
              className="mt-1"
              value={l}
              onChange={(e) => setL(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>B (m)</Label>
            <Input
              type="number"
              className="mt-1"
              value={b}
              onChange={(e) => setB(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>H (m)</Label>
            <Input
              type="number"
              className="mt-1"
              value={h}
              onChange={(e) => setH(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>E (factor)</Label>
            <Input
              type="number"
              className="mt-1"
              value={e}
              onChange={(ev) => setE(Number(ev.target.value))}
            />
          </div>
        </div>
        <div className="rounded-md border border-[var(--sge-steel)]/30 bg-[var(--sge-surface-2)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-steel)]">
            Standing volume
          </div>
          <div className="font-heading text-3xl font-bold tabular-nums">
            {volume} m³
          </div>
          <p className="mt-1 text-xs text-[var(--sge-ink-2)]">
            Matches hub scaffolding calc pattern. Rates / norms still open for later.
          </p>
        </div>
      </Panel>
    </div>
  );
}
