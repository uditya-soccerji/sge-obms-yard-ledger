"use client";

import { useState } from "react";
import { EmptyState, KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";
import { round3 } from "@/lib/work/logic";
import { inStock, LIFECYCLE, LIFECYCLE_LABEL, recoRows, stepVariance } from "@/lib/work/paint-steps";
import { useWork } from "@/lib/work/store";
import type { PaintLifecycle, PaintStep } from "@/lib/work/types";
import { Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";

/**
 * The Store's paint board (docs §6, merge plan Step 8) on Work batches: the
 * stages before stock arrives, our 941 issues, month reco (942 = DPR use) and
 * posting (261), with RIL's numbers typed against our steps for reference.
 */
export function PaintBoard() {
  const { fullState } = useStore();
  const { receivePaint, advancePaintLifecycle, recoMonth, postMonth, setRilRef } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const canAct = s.canIssuePaint || s.role === "admin";
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const done = (r: { ok: boolean; error?: string }, ok: string) => setMsg(r.ok ? { ok: true, msg: ok } : { ok: false, msg: r.error ?? "Couldn't do that" });

  const batches = work.paint.filter((b) => s.inSite(b.siteId) && !b.supervisorId);
  const byStage = (st: PaintLifecycle) => batches.filter((b) => (b.lifecycle ?? "sge_receive") === st && (st !== "sge_receive" || b.qtyL > 0));
  const siteOfSup = (id: string) => fullState.staff.find((x) => x.id === id)?.siteId;
  const steps = work.paintSteps.filter((st) => s.inSite(siteOfSup(st.supervisorId) ?? ""));
  const issues = steps.filter((st) => st.step === "941").sort((a, b) => b.date.localeCompare(a.date));
  const recos = recoRows(work, siteOfSup, s.inSite);
  const waitingRef = steps.filter((st) => !st.rilRef);
  const thisMonth = today().slice(0, 7);
  const variances = steps.map((st) => ({ st, v: stepVariance(st, fullState.masterCatalog.materials) })).filter((x) => x.v);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="On order (PR / PO / RIL store)" value={String(batches.filter((b) => !inStock(b)).length)} />
        <KpiTile label="In SGE store" value={`${round3(byStage("sge_receive").reduce((t, b) => t + b.qtyL, 0))} L`} tone="ok" />
        <KpiTile label="Issued this month (941)" value={`${round3(issues.filter((i) => i.month === thisMonth).reduce((t, i) => t + i.litres, 0))} L`} tone="accent" />
        <KpiTile label="Waiting for RIL ref" value={String(waitingRef.length)} tone={waitingRef.length ? "warn" : "ok"} />
      </div>
      <Msg text={msg} />

      <Panel>
        <h3 className="mb-1 font-heading text-sm font-bold">Before issue: PR → PO → RIL store → SGE store</h3>
        <p className="mb-3 text-[11px] text-[var(--sge-ink-3)]">Paint on order isn&apos;t stock; only batches in the SGE store can be issued (Work → Paint stock).</p>
        <div className="grid gap-3 md:grid-cols-4">
          {LIFECYCLE.map((st) => (
            <div key={st} className="rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)]/60 p-2">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--sge-ink-3)]">
                {LIFECYCLE_LABEL[st]} <span className="font-mono">({byStage(st).length})</span>
              </div>
              {byStage(st).length === 0 ? <div className="text-xs text-[var(--sge-ink-3)]">Empty</div> : null}
              {byStage(st).map((b) => (
                <div key={b.id} className="mb-2 rounded border border-[var(--sge-line)] bg-[var(--sge-surface)] p-2 text-xs">
                  <div className="font-semibold">{b.name}</div>
                  <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">
                    {b.sap}{b.batch ? ` · ${b.batch}` : ""}{b.prNo ? ` · ${b.prNo}` : ""}{b.poNo ? ` · ${b.poNo}` : ""}
                  </div>
                  <div className="mt-1 font-mono">{b.qtyL} L{b.expiry ? ` · exp ${b.expiry}` : ""}</div>
                  {canAct && st !== "sge_receive" ? (
                    <Button size="sm" variant="outline" className="mt-1.5 h-6 px-2 text-[10px]" onClick={() => done(advancePaintLifecycle(b.id), `${b.name} moved on.`)}>
                      Advance →
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
        {canAct ? <ReceiveForm onDone={(r, text) => done(r, text)} receive={receivePaint} /> : null}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">941 — issued to supervisors</h3>
        {issues.length === 0 ? (
          <EmptyState title="Nothing issued yet" detail="Issue from the SGE store in Work → Paint stock; the 941 is recorded here." />
        ) : (
          <div className="max-h-72 overflow-auto">
            <StepTable rows={issues.slice(0, 40)} staffName={s.staffName} canAct={canAct} onRef={(id, ref) => done(setRilRef(id, ref), "RIL 941 no. saved.")} />
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-1 font-heading text-sm font-bold">Month reco (942) and posting (261)</h3>
        <p className="mb-3 text-[11px] text-[var(--sge-ink-3)]">942 litres = our DPR use for that supervisor, paint and month — never typed. Posting (261) closes the month&apos;s consumption.</p>
        {recos.length === 0 ? (
          <EmptyState title="No paint used yet" detail="Recos appear once DPR job lines record litres." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>Month</th>
                <th className={thCls}>Supervisor</th>
                <th className={thCls}>Paint</th>
                <th className={thCls + " text-right"}>DPR use L</th>
                <th className={thCls}>942</th>
                <th className={thCls}>261</th>
              </tr>
            </thead>
            <tbody>
              {recos.map((r) => (
                <tr key={`${r.supervisorId}|${r.sap}|${r.month}`} className="border-b border-[var(--sge-line)]">
                  <td className={tdCls + " font-mono text-xs"}>{r.month}</td>
                  <td className={tdCls + " text-xs"}>{s.staffName(r.supervisorId)}</td>
                  <td className={tdCls + " text-xs"}>{r.name}<div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{r.sap}</div></td>
                  <td className={tdCls + " text-right tabular-nums"}>{r.used}</td>
                  <td className={tdCls + " text-xs"}>
                    {r.reco ? (
                      <RefCell step={r.reco} canAct={canAct} withLitres onRef={(ref, l) => done(setRilRef(r.reco!.id, ref, l), "RIL 942 saved.")} />
                    ) : r.month < today().slice(0, 7) && canAct ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => done(recoMonth(r.supervisorId, r.sap, r.month), `942 reco done: ${r.used} L.`)}>
                        Run reco
                      </Button>
                    ) : (
                      <span className="text-[var(--sge-ink-3)]">after month end</span>
                    )}
                  </td>
                  <td className={tdCls + " text-xs"}>
                    {r.posted ? (
                      <RefCell step={r.posted} canAct={canAct} onRef={(ref) => done(setRilRef(r.posted!.id, ref), "RIL 261 saved.")} />
                    ) : r.reco && canAct ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => done(postMonth(r.reco!.id), "261 posted.")}>
                        Post
                      </Button>
                    ) : (
                      <span className="text-[var(--sge-ink-3)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Variance — our DPR use vs RIL&apos;s 942 litres</h3>
        {variances.length === 0 ? (
          <p className="text-sm text-[var(--sge-ink-3)]">No RIL litres typed on a 942 yet.</p>
        ) : (
          <div className="space-y-1 text-sm">
            {variances.map(({ st, v }) => (
              <div key={st.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{st.month} · {s.staffName(st.supervisorId)} · {st.sap}</span>
                <StatusPill tone={v!.over ? "crit" : "ok"}>
                  ours {st.litres} L · RIL {st.rilLitres} L · {v!.pct.toFixed(1)}% (±{v!.tolerance}%)
                </StatusPill>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function StepTable({ rows, staffName, canAct, onRef }: { rows: PaintStep[]; staffName: (id: string) => string; canAct: boolean; onRef: (id: string, ref: string) => void }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--sge-line)]">
          <th className={thCls}>Date</th>
          <th className={thCls}>Supervisor</th>
          <th className={thCls}>Paint</th>
          <th className={thCls + " text-right"}>Litres</th>
          <th className={thCls}>RIL 941 no.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-[var(--sge-line)]">
            <td className={tdCls + " font-mono text-xs"}>{r.date}</td>
            <td className={tdCls + " text-xs"}>{staffName(r.supervisorId)}</td>
            <td className={tdCls + " font-mono text-xs"}>{r.sap}</td>
            <td className={tdCls + " text-right tabular-nums"}>{r.litres}</td>
            <td className={tdCls + " text-xs"}>
              <RefCell step={r} canAct={canAct} onRef={(ref) => onRef(r.id, ref)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** RIL's number on one of our steps: shown when typed, otherwise a small form. */
function RefCell({ step, canAct, withLitres, onRef }: { step: PaintStep; canAct: boolean; withLitres?: boolean; onRef: (ref: string, litres?: number) => void }) {
  const [ref, setRef] = useState("");
  const [litres, setLitres] = useState("");
  if (step.rilRef) {
    return (
      <span className="font-mono">
        {step.rilRef}
        {step.rilLitres != null ? ` · RIL ${step.rilLitres} L` : ""}
      </span>
    );
  }
  if (!canAct) return <StatusPill tone="warn">waiting for RIL</StatusPill>;
  return (
    <form
      className="flex flex-wrap items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        onRef(ref, litres === "" ? undefined : Number(litres));
      }}
    >
      <Input className="h-7 w-28 font-mono text-[11px]" placeholder={`RIL ${step.step} no.`} value={ref} onChange={(e) => setRef(e.target.value)} />
      {withLitres ? <Input className="h-7 w-20 text-[11px]" type="number" min={0} step="any" placeholder="RIL L" value={litres} onChange={(e) => setLitres(e.target.value)} /> : null}
      <Button size="sm" type="submit" variant="ghost" className="h-7 px-2 text-[11px]">Save</Button>
    </form>
  );
}

function ReceiveForm({ receive, onDone }: { receive: ReturnType<typeof useWork>["receivePaint"]; onDone: (r: { ok: boolean; error?: string }, text: string) => void }) {
  const s = useWorkScope();
  const materials = useStore().fullState.masterCatalog.materials.filter((m) => m.active && m.sapCode);
  const [f, setF] = useState({ sap: "", qtyL: "", batch: "", lifecycle: "pr" as PaintLifecycle, prNo: "", poNo: "", mfg: "", expiry: "" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const mat = materials.find((m) => m.sapCode === f.sap);
  return (
    <form
      className="mt-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = receive({
          siteId: s.entrySite,
          sap: f.sap,
          name: mat?.label ?? f.sap,
          batch: f.batch,
          qtyL: Number(f.qtyL),
          lifecycle: f.lifecycle,
          prNo: f.prNo || undefined,
          poNo: f.poNo || undefined,
          mps: mat?.paintSystem || undefined,
          mfg: f.mfg,
          expiry: f.expiry,
        });
        onDone(r, `${f.qtyL} L added at ${LIFECYCLE_LABEL[f.lifecycle]}.`);
        if (r.ok) set({ qtyL: "", batch: "", prNo: "", poNo: "", mfg: "", expiry: "" });
      }}
    >
      <div className="sm:col-span-2">
        <Label>Paint (Master Data → Materials)</Label>
        <select className={selectCls + " mt-1"} value={f.sap} onChange={(e) => set({ sap: e.target.value })}>
          <option value="">Pick…</option>
          {materials.map((m) => <option key={m.id} value={m.sapCode}>{m.label} · {m.sapCode}</option>)}
        </select>
      </div>
      <div>
        <Label>Litres</Label>
        <Input className="mt-1" type="number" min={0} step="any" value={f.qtyL} onChange={(e) => set({ qtyL: e.target.value })} />
      </div>
      <div>
        <Label>Stage</Label>
        <select className={selectCls + " mt-1"} value={f.lifecycle} onChange={(e) => set({ lifecycle: e.target.value as PaintLifecycle })}>
          {LIFECYCLE.map((x) => <option key={x} value={x}>{LIFECYCLE_LABEL[x]}</option>)}
        </select>
      </div>
      <div>
        <Label>PR no.</Label>
        <Input className="mt-1" value={f.prNo} onChange={(e) => set({ prNo: e.target.value })} />
      </div>
      <div>
        <Label>PO no.</Label>
        <Input className="mt-1" value={f.poNo} onChange={(e) => set({ poNo: e.target.value })} />
      </div>
      <div>
        <Label>Batch</Label>
        <Input className="mt-1" value={f.batch} onChange={(e) => set({ batch: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Mfg</Label>
          <Input className="mt-1" type="date" value={f.mfg} onChange={(e) => set({ mfg: e.target.value })} />
        </div>
        <div>
          <Label>Expiry</Label>
          <Input className="mt-1" type="date" value={f.expiry} onChange={(e) => set({ expiry: e.target.value })} />
        </div>
      </div>
      <div className="sm:col-span-4">
        <Button type="submit" size="sm">Add paint</Button>
      </div>
    </form>
  );
}
