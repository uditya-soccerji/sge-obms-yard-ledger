"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { batchBalances, daysBetween, EXPIRY_WARN_DAYS, expiryState, supervisorPaint } from "@/lib/work/logic";
import { today } from "@/lib/today";
import { useWork } from "@/lib/work/store";
import { inStock } from "@/lib/work/paint-steps";
import { fmtM2, Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";
import { WorkExcelTransferStack } from "./work-excel-transfer";

const SLICES = [
  { key: "expired", label: "Expired", color: "var(--sge-crit)" },
  { key: "soon", label: `Expiring ≤ ${EXPIRY_WARN_DAYS} days`, color: "var(--sge-brass)" },
  { key: "ok", label: "OK", color: "var(--sge-ok)" },
  { key: "unknown", label: "No expiry date", color: "var(--sge-ink-3)" },
] as const;
type ExpState = (typeof SLICES)[number]["key"];

export function WorkPaint() {
  const { issuePaint } = useWork();
  const s = useWorkScope();
  const { work } = s;
  const left = batchBalances(work);
  const batches = work.paint
    // On hand = in the SGE store or with a supervisor (paint still on order is on the Store page)
    .filter((b) => s.inSite(b.siteId) && (b.supervisorId || inStock(b)))
    .map((b) => ({ ...b, left: left.get(b.id) ?? b.qtyL, state: expiryState(b.expiry, today()) }))
    .filter((b) => b.left > 0)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const totals = { expired: 0, soon: 0, ok: 0, unknown: 0 } as Record<ExpState, number>;
  for (const b of batches) totals[b.state] += b.left;
  const all = totals.expired + totals.soon + totals.ok + totals.unknown;

  const holdings = supervisorPaint(work).filter((r) =>
    s.staff.some((x) => x.id === r.supervisorId && s.inSite(x.siteId))
  );

  const store = batches.filter((b) => !b.supervisorId);
  const [batchId, setBatchId] = useState("");
  const [supPick, setSup] = useState("");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const pick = store.find((b) => b.id === batchId);
  // Paint goes only to a supervisor on the batch's own site
  const supervisors = s.staff.filter((x) => x.role === "supervisor" && (pick ? x.siteId === pick.siteId : s.inSite(x.siteId)));
  const sup = supervisors.some((x) => x.id === supPick) ? supPick : supervisors[0]?.id ?? "";

  return (
    <div className="space-y-4">
      <WorkExcelTransferStack kinds={["paintBatches", "paintSteps"]} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <h3 className="font-heading text-sm font-bold">Stock by expiry</h3>
          <p className="text-[11px] text-[var(--sge-ink-3)]">All batches on hand (store + supervisors) as of {today()}</p>
          <Pie totals={totals} />
          <ul className="mt-2 space-y-1 text-sm">
            {SLICES.map((x) => (
              <li key={x.key} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: x.color }} />
                  {x.label}
                </span>
                <span className="tabular-nums">
                  {fmtM2(Math.round(totals[x.key]))} L {all ? `(${Math.round((totals[x.key] / all) * 100)}%)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <h3 className="mb-2 font-heading text-sm font-bold">Supervisor paint — issued vs used (DPR) vs still needed</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--sge-line)]">
                  <th className={thCls}>Supervisor</th>
                  <th className={thCls}>Paint</th>
                  <th className={thCls + " text-right"}>Issued L</th>
                  <th className={thCls + " text-right"}>Used L</th>
                  <th className={thCls + " text-right"}>Balance L</th>
                  <th className={thCls + " text-right"}>Needed for remaining</th>
                  <th className={thCls}>Flag</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((r) => (
                  <tr key={r.supervisorId + r.sap} className="border-b border-[var(--sge-line)]">
                    <td className={tdCls + " text-xs"}>{s.staffName(r.supervisorId)}</td>
                    <td className={tdCls + " text-xs"}>{r.name}<div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{r.sap}</div></td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtM2(r.issued)}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtM2(r.used)}</td>
                    <td className={tdCls + " text-right font-semibold tabular-nums"}>{fmtM2(r.balance)}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtM2(Math.round(r.needed))}</td>
                    <td className={tdCls}>
                      {r.flag === "negative" ? <StatusPill tone="crit">Negative</StatusPill> : r.flag === "low" ? <StatusPill tone="warn">Low — issue more</StatusPill> : r.flag === "no_stock" ? <StatusPill tone="crit">No stock — issue paint</StatusPill> : r.flag === "none" ? <StatusPill>Not issued</StatusPill> : <StatusPill tone="ok">OK</StatusPill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-[var(--sge-ink-3)]">
            Used = litres on the supervisor&apos;s DPR entries. Needed = remaining plan m² × WO norm. Low = balance below what&apos;s needed. Negative is allowed but flagged.
          </p>
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Batches on hand</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>Paint</th>
                <th className={thCls}>Batch</th>
                <th className={thCls}>Held by</th>
                <th className={thCls + " text-right"}>Left L</th>
                <th className={thCls}>Expiry</th>
                <th className={thCls}>State</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const d = daysBetween(today(), b.expiry);
                return (
                  <tr key={b.id} className="border-b border-[var(--sge-line)]">
                    <td className={tdCls + " text-xs"}>{b.name}<div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{b.sap}</div></td>
                    <td className={tdCls + " font-mono text-xs"}>{b.batch}</td>
                    <td className={tdCls + " text-xs"}>{b.supervisorId ? s.staffName(b.supervisorId) : "SGE store"}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtM2(b.left)}</td>
                    <td className={tdCls + " text-xs"}>{b.expiry}</td>
                    <td className={tdCls}>
                      <StatusPill tone={b.state === "expired" ? "crit" : b.state === "soon" ? "warn" : "ok"}>
                        {b.state === "expired" ? `Expired ${-d} d ago` : b.state === "soon" ? `${d} days left` : b.state === "unknown" ? "No date" : "OK"}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {s.canIssuePaint ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Issue paint from store to a supervisor</h3>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const r = issuePaint(batchId, sup, Number(qty));
              setMsg(r.ok ? { ok: true, msg: `Issued ${qty} L ${pick?.name} to ${s.staffName(sup)}.` } : { ok: false, msg: r.error });
              if (r.ok) setQty("");
            }}
          >
            <div className="sm:col-span-2">
              <Label>Store batch</Label>
              <select className={selectCls + " mt-1"} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">Pick a batch…</option>
                {store.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.batch} · {b.left} L · exp {b.expiry}{b.state === "expired" ? " (EXPIRED)" : b.state === "soon" ? " (expiring)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Supervisor</Label>
              <select className={selectCls + " mt-1"} value={sup} onChange={(e) => setSup(e.target.value)}>
                {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Litres</Label>
              <Input className="mt-1" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            {pick && pick.state !== "ok" ? (
              <p className="text-xs text-[var(--sge-warn)] sm:col-span-4">Warning: this batch is {pick.state === "expired" ? "already expired" : "expiring soon"} — it can still be issued.</p>
            ) : null}
            <div className="sm:col-span-4 flex items-center gap-3">
              <Button type="submit">Issue paint</Button>
              <Msg text={msg} />
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}

/** Donut chart of litres by expiry state. */
function Pie({ totals }: { totals: Record<ExpState, number> }) {
  const all = totals.expired + totals.soon + totals.ok + totals.unknown;
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="mx-auto mt-3 h-44 w-44" role="img" aria-label="Paint stock by expiry">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--sge-paper-2)" strokeWidth="22" />
      {all > 0
        ? SLICES.map((x) => {
            const len = (totals[x.key] / all) * c;
            const el = (
              <circle
                key={x.key}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={x.color}
                strokeWidth="22"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              />
            );
            offset += len;
            return el;
          })
        : null}
      <text x="70" y="66" textAnchor="middle" className="fill-[var(--sge-ink)] font-heading" fontSize="18" fontWeight="700">
        {fmtM2(Math.round(all))}
      </text>
      <text x="70" y="84" textAnchor="middle" className="fill-[var(--sge-ink-3)]" fontSize="10">
        litres on hand
      </text>
    </svg>
  );
}
