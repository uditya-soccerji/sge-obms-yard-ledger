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
import { paintVariance } from "@/lib/paint-variance";
import { useState } from "react";
import type { PaintLifecycleStage, StaffMember } from "@/lib/types";

function StoreHomePage() {
  const { state, advancePaintStage, updatePaintLine, setEquipmentStatus } = useStore();
  const [boardMsg, setBoardMsg] = useState<string | null>(null);
  const [faults, setFaults] = useState<Record<string, string>>({});
  const isStore = state.currentRole === "store" || state.currentRole === "super_admin";
  // Paint goes to painting & blasting supervisors
  const supervisors = state.staff.filter((s) => s.role === "supervisor" && (s.supervisorType ?? "painting_blasting") === "painting_blasting");
  const materials = state.masterCatalog.materials;
  const advance = (id: string) => {
    const res = advancePaintStage(id);
    setBoardMsg(res.ok ? null : res.error ?? "Couldn't move it");
  };

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
        {boardMsg ? (
          <div className="mb-2 rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
            {boardMsg}
          </div>
        ) : null}
        <div className="flex gap-3 overflow-x-auto pb-2">
          {byStage.map(({ stage, lines }) => (
            <StageColumn
              key={stage}
              stage={stage}
              lines={lines}
              onAdvance={advance}
              onUpdate={updatePaintLine}
              supervisors={supervisors}
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
                  <th>Δ (tolerance)</th>
                </tr>
              </thead>
              <tbody>
                {dualBook.map((l) => {
                  const v = paintVariance(l, materials);
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
                        {v ? (
                          <StatusPill tone={v.over ? "crit" : "ok"}>
                            {v.litres > 0 ? "+" : ""}
                            {v.litres} L · {v.pct.toFixed(1)}% (±{v.tolerance}%)
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
          Equipment checklist — hopper / compressor / airless / harness
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
                    {eq.type} · checked {eq.lastCheck}
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
              {eq.faultNote ? (
                <div className="mb-2 text-xs text-[var(--sge-crit)]">Fault: {eq.faultNote}</div>
              ) : null}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {eq.status !== "fault" ? (
                  <>
                    <Input
                      className="h-7 flex-1 text-xs"
                      placeholder="What's wrong? (to report a fault)"
                      value={faults[eq.id] ?? ""}
                      onChange={(e) => setFaults((f) => ({ ...f, [eq.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        const res = setEquipmentStatus(eq.id, "fault", faults[eq.id]);
                        setBoardMsg(res.ok ? null : res.error ?? null);
                        if (res.ok) setFaults((f) => ({ ...f, [eq.id]: "" }));
                      }}
                    >
                      Report fault
                    </Button>
                  </>
                ) : null}
                {isStore && eq.status !== "ok" ? (
                  <Button size="sm" className="h-7 text-xs" onClick={() => setEquipmentStatus(eq.id, "ok")}>
                    Mark repaired / checked
                  </Button>
                ) : null}
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

/** Text box that saves when you leave it, not on every key (one audit line per change) */
function BlurInput({ value, onSave, ...rest }: { value: string; onSave: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur" | "defaultValue">) {
  return (
    <Input
      key={value}
      defaultValue={value}
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value);
      }}
      {...rest}
    />
  );
}

function StageColumn({
  stage,
  lines,
  onAdvance,
  onUpdate,
  supervisors,
}: {
  stage: PaintLifecycleStage;
  lines: ReturnType<typeof useStore>["state"]["paintStock"];
  onAdvance: (id: string) => void;
  onUpdate: ReturnType<typeof useStore>["updatePaintLine"];
  supervisors: StaffMember[];
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
            {line.issuedTo && !canEditMovement941(stage) ? (
              <div className="mt-1 text-[10px] text-[var(--sge-ink-3)]">
                To {supervisors.find((s) => s.id === line.issuedTo)?.name ?? line.issuedTo}
                {line.movement941 ? ` · 941 ${line.movement941}` : ""}
              </div>
            ) : null}

            {canEditMovement941(stage) ? (
              <>
              <label className="mt-2 block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                  941 issue #
                </span>
                <BlurInput
                  className="mt-0.5 h-7 font-mono text-[11px]"
                  value={line.movement941 ?? ""}
                  placeholder="941-…"
                  onSave={(v) => onUpdate(line.id, { movement941: v })}
                />
              </label>
              <label className="mt-1.5 block">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                  Issue to
                </span>
                <select
                  className="mt-0.5 h-7 w-full rounded-md border border-[var(--sge-line)] bg-transparent px-1 text-[11px]"
                  value={line.issuedTo ?? ""}
                  onChange={(e) => onUpdate(line.id, { issuedTo: e.target.value || undefined })}
                >
                  <option value="">Pick a supervisor…</option>
                  {supervisors
                    .filter((s) => s.siteId === line.siteId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              </>
            ) : null}

            {canEditMovement942261(stage) ? (
              <div className="mt-2 space-y-1.5">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    942 consumption #
                  </span>
                  <BlurInput
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.movement942 ?? ""}
                    placeholder="942-…"
                    onSave={(v) => onUpdate(line.id, { movement942: v })}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    261 posting #
                  </span>
                  <BlurInput
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.movement261 ?? ""}
                    placeholder="261-…"
                    onSave={(v) => onUpdate(line.id, { movement261: v })}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                    RIL posted L
                  </span>
                  <BlurInput
                    type="number"
                    min={0}
                    className="mt-0.5 h-7 font-mono text-[11px]"
                    value={line.rilPosted != null ? String(line.rilPosted) : ""}
                    placeholder="0"
                    onSave={(v) =>
                      onUpdate(line.id, {
                        rilPosted: v && Number(v) >= 0 ? Number(v) : undefined,
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
