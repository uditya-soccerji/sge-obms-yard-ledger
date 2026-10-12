"use client";

import { guarded } from "@/components/shared/require-module";
import { useState } from "react";
import { Panel, SectionHeader } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { areaFromDims } from "@/lib/paint-calc";

function AreaScopePage() {
  const [length, setLength] = useState(40);
  const [width, setWidth] = useState(12);
  const [faces, setFaces] = useState(1);
  const area = areaFromDims(length, width, faces);

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Area & scope"
        subtitle="Quick scope take-off for painting / blasting areas before paint calc or DPR."
      />
      <Panel className="max-w-lg space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Length (m)</Label>
            <Input
              type="number"
              className="mt-1"
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Width / height (m)</Label>
            <Input
              type="number"
              className="mt-1"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Faces</Label>
            <Input
              type="number"
              className="mt-1"
              value={faces}
              onChange={(e) => setFaces(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="rounded-md border border-[var(--sge-accent)]/30 bg-[var(--sge-accent-wash)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-accent-ink)]">
            Scope area
          </div>
          <div className="font-heading text-3xl font-bold tabular-nums">
            {area} m²
          </div>
          <p className="mt-1 text-xs text-[var(--sge-ink-2)]">
            L × B × faces — feed into paint calculator or supervisor DPR.
          </p>
        </div>
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("calculators", AreaScopePage);
