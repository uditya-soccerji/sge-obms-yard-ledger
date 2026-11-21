"use client";

import { guarded } from "@/components/shared/require-module";
import { useState } from "react";
import { Panel, SectionHeader } from "@/components/shared/ui-bits";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { areaFromDims } from "@/lib/paint-calc";

function PdfButton({ href }: { href: string }) {
  // docs §24: the working and result, with the user's profile, saved as PDF
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <Button size="sm" variant="outline">Download PDF</Button>
    </a>
  );
}

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
        action={<PdfButton href={`/print/calc?type=area&l=${length}&w=${width}&f=${faces}`} />}
      />
      <Panel className="max-w-lg space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label>Length (m)</Label>
            <NumberInput className="mt-1" min={0} value={length} onValue={(n) => setLength(Math.max(0, n))} />
          </div>
          <div>
            <Label>Width / height (m)</Label>
            <NumberInput className="mt-1" min={0} value={width} onValue={(n) => setWidth(Math.max(0, n))} />
          </div>
          <div>
            <Label>Faces</Label>
            <NumberInput className="mt-1" min={0} value={faces} onValue={(n) => setFaces(Math.max(0, n))} />
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
