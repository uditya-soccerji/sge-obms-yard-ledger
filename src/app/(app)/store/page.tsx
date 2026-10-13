"use client";

import { guarded } from "@/components/shared/require-module";
import Link from "next/link";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PAINT_STAGE_HINT,
  PAINT_STAGE_LABEL,
  PAINT_STAGE_ORDER,
  canEditMovement941,
  canEditMovement942261,
} from "@/lib/paint-lifecycle";
import { useStore } from "@/lib/store";
import { kindDef } from "@/lib/equipment";
import type { PaintLifecycleStage } from "@/lib/types";

function StoreHomePage() {
  const { state, advancePaintStage, updatePaintLine } = useStore();

  const byStage = PAINT_STAGE_ORDER.map((stage) => ({
    stage,
    lines: state.paintStock.filter((p) => p.stage === stage),
  }));

  /** Dual books: SGE used (DPR×MPS) vs RIL posted litres from 942/261 */
  const dualBook = state.paintStock.filter(
    (p) =>
      p.stage === "posted" ||
      (p.rilPosted != null && p.sgeUsed != null && p.rilPosted > 0)
  );

  const storeDprs = state.dprDocuments.filter((d) => d.submitterType === "store");

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Store Keeper"
        subtitle="Store DPR + paint FIM lifecycle PR→PO→RIL/SGE store→issue (941)→DPR consume→reco→post 942/261."
        action={
          <div className="flex gap-2">
            <Link href="/dpr/new">
              <Button size="sm">Store DPR</Button>
            </Link>
            <Link href="/dpr">
              <Button size="sm" variant="outline">
                DPR desk
              </Button>
            </Link>
          </div>
        }
      />

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Store DPRs</h3>
        {storeDprs.length === 0 ? (
          <EmptyState
            title="No store DPR"
            detail="Submit daily store sworn record for SIC."
          />
        ) : (
          storeDprs.map((d) => (
            <Link
              key={d.id}
              href={`/dpr/${d.id}`}
              className="mb-2 flex items-center justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <span>
                {d.date} · {d.plant} · {d.note.slice(0, 48)}
              </span>
              <StatusPill
                tone={
                  d.status === "sic_approved"
                    ? "ok"
                    : d.status === "submitted"
                      ? "accent"
                      : "default"
                }
              >
                {d.status.replace("_", " ")}
              </StatusPill>
            </Link>
          ))
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Open PR/PO"
          value={String(
            state.paintStock.filter((p) => p.stage === "pr" || p.stage === "po")
              .length
          )}
        />
        <KpiTile
          label="In SGE store"
          value={String(
            state.paintStock.filter((p) => p.stage === "sge_receive").length
          )}
          tone="ok"
        />
        <KpiTile
          label="Issued to supervisors"
          value={String(
            state.paintStock.filter((p) => p.stage === "issued").length
          )}
          tone="accent"
        />
        <KpiTile
          label="Awaiting 942/261"
          value={String(
            state.paintStock.filter((p) => p.stage === "reco").length
          )}
          tone="warn"
        />
      </div>

      <Panel>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
              Paint lifecycle board
            </h3>
            <p className="mt-1 max-w-2xl text-xs text-[var(--sge-ink-3)]">
              941 = RIL issue movement · 942 = consumption after reco · 261 =
              related RIL posting. These are document/movement refs, not SAP
              material codes. Batch/SAP stay on the card.
            </p>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {byStage.map(({ stage, lines }) => (
            <StageColumn
              key={stage}
              stage={stage}
              lines={lines}
              onAdvance={advancePaintStage}
              onUpdate={updatePaintLine}
            />
          ))}
        </div>
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">
          Dual books — SGE used (DPR×MPS) vs RIL posted (942/261)
        </h3>
        {dualBook.length === 0 ? (
          <EmptyState
            title="No posted reco lines"
            detail="After RIL posts 942/261, lines appear here for month-end variance."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr>
                  <th className="py-1">Material</th>
                  <th>942 / 261</th>
                  <th>RIL posted</th>
                  <th>SGE used</th>
                  <th>Δ</th>
                </tr>
              </thead>
              <tbody>
                {dualBook.map((l) => {
                  const delta = (l.sgeUsed ?? 0) - (l.rilPosted ?? 0);
                  return (
                    <tr key={l.id} className="border-t border-[var(--sge-line)]">
                      <td className="py-1.5">
                        {l.description}
                        <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">
                          {l.sapCode} · {l.batch}
                        </div>
                      </td>
                      <td className="font-mono text-[11px]">
                        <div>{l.movement942 || "—"}</div>
                        <div className="text-[var(--sge-ink-3)]">
                          {l.movement261 || "—"}
                        </div>
                      </td>
                      <td className="font-mono">{l.rilPosted ?? "—"} L</td>
                      <td className="font-mono">{l.sgeUsed ?? "—"} L</td>
                      <td>
                        {l.rilPosted != null && l.sgeUsed != null ? (
                          <StatusPill
                            tone={Math.abs(delta) >= 8 ? "crit" : "ok"}
                          >
                            {delta > 0 ? "+" : ""}
                            {delta} L
                          </StatusPill>
                        ) : (
                          <StatusPill>pending</StatusPill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Equipment checklist — all site kit (setups: Operations → Equipment)
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          {state.equipment.map((eq) => (
            <div
              key={eq.id}
              className="rounded-md border border-[var(--sge-line)] p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{eq.tag}</div>
                  <div className="text-xs capitalize text-[var(--sge-ink-3)]">
                    {kindDef(eq.type).label}{eq.qty ? ` × ${eq.qty}` : ""} · checked {eq.lastCheck}
                  </div>
                </div>
                <StatusPill
                  tone={
                    eq.status === "ok"
                      ? "ok"
                      : eq.status === "due"
                        ? "warn"
                        : "crit"
                  }
                >
                  {eq.status}
                </StatusPill>
              </div>
              <ul className="space-y-1 text-sm">
                {eq.checklist.map((c) => (
                  <li key={c.item} className="flex justify-between">
                    <span>{c.item}</span>
                    <span>{c.ok ? "✓" : "✗"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function StageColumn({
  stage,
  lines,
  onAdvance,
  onUpdate,
}: {
  stage: PaintLifecycleStage;
  lines: ReturnType<typeof useStore>["state"]["paintStock"];
  onAdvance: (id: string) => void;
  onUpdate: ReturnType<typeof useStore>["updatePaintLine"];
}) {
  return (
    <div className="min-w-[200px] flex-1 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)]/60 p-2">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--sge-ink-3)]">
        {PAINT_STAGE_LABEL[stage]}
        <span className="ml-1 font-mono">({lines.length})</span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-[var(--sge-ink-3)]">
        {PAINT_STAGE_HINT[stage]}
      </p>
      {lines.length === 0 ? (
        <div className="text-xs text-[var(--sge-ink-3)]">Empty</div>
      ) : (
        lines.map((line) => (
          <div
            key={line.id}
            className="mb-2 rounded border border-[var(--sge-line)] bg-[var(--sge-surface)] p-2 text-xs"
          >
            <div className="font-semibold text-[var(--sge-ink)]">
              {line.description}
            </div>
            <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">
              {line.sapCode} · {line.batch}
            </div>
            <div className="mt-1 font-mono">{line.qtyLitres} L</div>

            {canEditMovement941(stage) ? (
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                  941 issue #
                </span>
                <Input
                  className="mt-0.5 h-7 font-mono text-[11px]"
                  value={line.movement941 ?? ""}
                  placeholder="941-…"
                  onChange={(e) =>
                    onUpdate(line.id, { movement941: e.target.value })
                  }
                />
              </label>
            ) : null}

            {canEditMovement942261(stage) ? (
              <div className="mt-2 space-y-1.5">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    942 consumption #
                  </span>
                  <Input
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.movement942 ?? ""}
                    placeholder="942-…"
                    onChange={(e) =>
                      onUpdate(line.id, { movement942: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    261 posting #
                  </span>
                  <Input
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.movement261 ?? ""}
                    placeholder="261-…"
                    onChange={(e) =>
                      onUpdate(line.id, { movement261: e.target.value })
                    }
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    RIL posted L
                  </span>
                  <Input
                    type="number"
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.rilPosted ?? ""}
                    placeholder="0"
                    onChange={(e) =>
                      onUpdate(line.id, {
                        rilPosted: e.target.value
                          ? Number(e.target.value)
                          : undefined,
                      })
                    }
                  />
                </label>
              </div>
            ) : null}

            {stage !== "posted" ? (
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => onAdvance(line.id)}
                >
                  Advance →
                </Button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("store", StoreHomePage);
