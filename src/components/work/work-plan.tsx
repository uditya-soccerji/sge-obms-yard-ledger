"use client";

import { useState } from "react";
import { KpiTile, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isMonthClosed, lineStatus, monthLabel, nextMonth, OVER_TOLERANCE, UNDER_TOLERANCE } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";
import { STAGES } from "@/lib/work/types";
import { fmtM2, fmtPct, Msg, selectCls, tdCls, thCls, useWorkScope } from "./common";

const FLAG = {
  ok: { tone: "ok", label: "Within band" },
  short: { tone: "crit", label: "Short" },
  over: { tone: "crit", label: "Over +5%" },
  running: { tone: "default", label: "Running" },
} as const;

export function WorkPlan() {
  const { addPlanLine, closeMonth } = useWork();
  const s = useWorkScope();
  const { work } = s;
  // Each site closes its own month (docs §15). In All sites there is no single
  // "current" month, so the view starts on the latest one and closing is per site.
  const viewSite = s.allSites ? null : s.currentSiteId;
  const siteIdsShown = [...new Set(work.planLines.filter((l) => s.inSite(l.siteId)).map((l) => l.siteId))];
  const viewCurrent = viewSite ? s.monthOf(viewSite) : siteIdsShown.map(s.monthOf).sort().pop() ?? work.defaultMonth;
  const months = [...new Set([...work.planLines.filter((l) => s.inSite(l.siteId)).map((l) => l.month), viewCurrent])].sort();
  // The picked month belongs to the site it was picked on; switching site goes back to that site's current month
  const [pick, setPick] = useState<{ site: string; month: string } | null>(null);
  const month = pick && pick.site === s.currentSiteId && months.includes(pick.month) ? pick.month : viewCurrent;
  const setMonth = (m: string) => setPick({ site: s.currentSiteId, month: m });
  const lines = work.planLines
    .filter((l) => l.month === month && s.inSite(l.siteId))
    .sort((a, b) => a.plant.localeCompare(b.plant) || a.serviceCode.localeCompare(b.serviceCode));
  const rows = lines.map((l) => ({ l, st: lineStatus(l, work) }));
  const tot = rows.reduce(
    (t, { st }) => ({ plan: t.plan + st.plan, actual: t.actual + st.actual, remaining: t.remaining + st.remaining, wip: t.wip + Object.values(st.inProgress).reduce((a, b) => Math.max(a, b), 0) }),
    { plan: 0, actual: 0, remaining: 0, wip: 0 }
  );
  const flagged = rows.filter((r) => r.st.flag === "short" || r.st.flag === "over").length;
  const isOpen = viewSite ? !isMonthClosed(work, viewSite, month) : null;
  const isCurrent = viewSite ? month === s.monthOf(viewSite) : false;
  const viewSiteCode = viewSite ? s.siteCode(viewSite) : "";

  // add-plan form. The site follows the header; only All sites picks one here.
  const plantsFor = (siteId: string) => s.sites.find((x) => x.id === siteId)?.plants ?? [];
  const [f, setF] = useState({ siteId: "", plant: "", serviceCode: work.serviceItems[0]?.code ?? "", planM2: "", supervisorId: "" });
  const formSite = s.allSites ? f.siteId || s.entrySite : s.currentSiteId;
  const [msg, setMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const supervisors = s.staff.filter((x) => x.role === "supervisor" && x.siteId === formSite);
  // Keep the pick only while it belongs to this site, else the first supervisor shown
  const supervisorId = supervisors.some((x) => x.id === f.supervisorId) ? f.supervisorId : supervisors[0]?.id ?? "";
  const knownPlants = [...new Set([...plantsFor(formSite), ...work.planLines.filter((l) => l.siteId === formSite).map((l) => l.plant)])].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <div>
            <Label className="text-[11px] uppercase tracking-wide text-[var(--sge-ink-3)]">Plan month</Label>
            <select className={selectCls + " mt-1 w-40"} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)} {viewSite ? (isMonthClosed(work, viewSite, m) ? "· closed" : m === s.monthOf(viewSite) ? "· current" : "") : ""}
                </option>
              ))}
            </select>
          </div>
          {isOpen === null ? (
            <StatusPill>Each site closes its own month</StatusPill>
          ) : (
            <StatusPill tone={isOpen ? "accent" : "default"}>{isOpen ? "Open" : "Closed & carried"}</StatusPill>
          )}
        </div>
        {viewSite && isCurrent && s.canConfirm ? (
          <Button
            variant="outline"
            onClick={() => {
              if (!window.confirm(`Close ${monthLabel(month)} for ${viewSiteCode}? Unfinished m² and open jobs on ${viewSiteCode} move to the next month. Other sites are not affected.`)) return;
              const r = closeMonth(viewSite);
              setMsg(r.ok ? { ok: true, msg: `${monthLabel(month)} closed for ${viewSiteCode} — remaining work carried forward.` } : { ok: false, msg: r.error });
              if (r.ok) setMonth(nextMonth(month));
            }}
          >
            Close {monthLabel(month)} for {viewSiteCode}
          </Button>
        ) : null}
      </div>
      <Msg text={msg} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Plan (incl. carried)" value={`${fmtM2(Math.round(tot.plan))} m²`} hint={`${rows.length} plan lines`} />
        <KpiTile label="Actual (JMS, final shade)" value={`${fmtM2(Math.round(tot.actual))} m²`} hint={tot.plan ? `${fmtPct(tot.actual / tot.plan)} of plan` : undefined} tone="ok" />
        <KpiTile label="Remaining" value={`${fmtM2(Math.round(tot.remaining))} m²`} hint={`In progress (furthest stage): ${fmtM2(Math.round(tot.wip))} m²`} tone="warn" />
        <KpiTile label="Lines outside band" value={String(flagged)} hint={`Allowed −${UNDER_TOLERANCE * 100}% to +${OVER_TOLERANCE * 100}%`} tone={flagged ? "crit" : "default"} />
      </div>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--sge-line)]">
                <th className={thCls}>Plant</th>
                <th className={thCls}>Job (MPS · type)</th>
                <th className={thCls}>Supervisor</th>
                <th className={thCls + " text-right"}>Plan m²</th>
                <th className={thCls + " text-right"}>Actual m²</th>
                <th className={thCls}>In progress by stage (m²)</th>
                <th className={thCls + " text-right"}>Remaining</th>
                <th className={thCls + " text-right"}>%</th>
                <th className={thCls}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-[var(--sge-ink-3)]">
                    No plan for this month on this site.
                  </td>
                </tr>
              ) : null}
              {rows.map(({ l, st }) => {
                const it = s.item(l.serviceCode);
                const fl = FLAG[st.flag];
                return (
                  <tr key={l.id} className="border-b border-[var(--sge-line)]">
                    <td className={tdCls}>
                      <div className="font-heading font-bold tracking-wide">{l.plant}</div>
                      {s.allSites ? <div className="text-[10px] text-[var(--sge-ink-3)]">{s.siteCode(l.siteId)}</div> : null}
                    </td>
                    <td className={tdCls}>
                      <div className="font-medium">{it?.mps} · {l.jobType}</div>
                      <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">
                        {l.serviceCode} · ₹{it?.rate}/m²{it?.ratePending ? " (rate pending)" : ""}
                      </div>
                    </td>
                    <td className={tdCls + " text-xs"}>{s.staffName(l.supervisorId)}</td>
                    <td className={tdCls + " text-right tabular-nums"}>
                      {fmtM2(st.plan)}
                      {l.carriedM2 > 0 ? (
                        <div className="text-[10px] text-[var(--sge-brass-ink)]">incl. {fmtM2(l.carriedM2)} carried</div>
                      ) : null}
                    </td>
                    <td className={tdCls + " text-right tabular-nums"}>{st.actual ? fmtM2(st.actual) : "—"}</td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        {STAGES.filter((x) => st.inProgress[x.id] > 0).map((x) => (
                          <span key={x.id} className="rounded-sm border border-[var(--sge-brass)]/50 bg-[var(--sge-brass-wash)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--sge-brass-ink)]">
                            {x.short} {fmtM2(st.inProgress[x.id])}
                          </span>
                        ))}
                        {STAGES.every((x) => st.inProgress[x.id] === 0) ? <span className="text-xs text-[var(--sge-ink-3)]">—</span> : null}
                      </div>
                    </td>
                    <td className={tdCls + " text-right font-semibold tabular-nums"}>{st.remaining ? fmtM2(st.remaining) : "—"}</td>
                    <td className={tdCls + " text-right tabular-nums"}>{fmtPct(st.pct)}</td>
                    <td className={tdCls}>
                      <StatusPill tone={fl.tone}>{fl.label}</StatusPill>
                      {st.flag !== "running" ? (
                        <div className="mt-0.5 font-mono text-[10px] text-[var(--sge-ink-3)]">
                          {st.variance >= 0 ? "+" : ""}
                          {(st.variance * 100).toFixed(1)}%
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {(isCurrent || s.allSites) && s.canPlan ? (
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Add to {monthLabel(s.monthOf(formSite))} plan · {s.siteCode(formSite)}</h3>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!f.plant.trim()) return setMsg({ ok: false, msg: "Plant is required" });
              if (!supervisorId) return setMsg({ ok: false, msg: `No supervisor on ${s.siteCode(formSite)} yet — add one in Master Data first.` });
              const it = s.item(f.serviceCode);
              const r = addPlanLine({
                siteId: formSite,
                plant: f.plant.trim().toUpperCase(),
                serviceCode: f.serviceCode,
                jobType: it?.description.replace(/^APLY\s*/i, "") ?? "",
                planM2: Number(f.planM2),
                supervisorId,
              });
              setMsg(r.ok ? { ok: true, msg: `Plan line added for ${s.staffName(supervisorId)}.` } : { ok: false, msg: r.error });
              if (r.ok) setF((x) => ({ ...x, planM2: "" }));
            }}
          >
            {s.allSites ? (
              <div>
                <Label>Site</Label>
                <select className={selectCls + " mt-1"} value={formSite} onChange={(e) => setF({ ...f, siteId: e.target.value, plant: "", supervisorId: "" })}>
                  {s.sites.filter((x) => x.enabled).map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}
                </select>
              </div>
            ) : null}
            <div>
              <Label>Plant</Label>
              <Input className="mt-1" list="work-plants" value={f.plant} onChange={(e) => setF({ ...f, plant: e.target.value })} placeholder="e.g. COKER" />
              <datalist id="work-plants">{knownPlants.map((p) => <option key={p} value={p} />)}</datalist>
            </div>
            <div className="lg:col-span-2">
              <Label>Service item</Label>
              <select className={selectCls + " mt-1"} value={f.serviceCode} onChange={(e) => setF({ ...f, serviceCode: e.target.value })}>
                {work.serviceItems.map((x) => (
                  <option key={x.code} value={x.code}>{x.mps} · {x.description}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Plan m²</Label>
              <Input className="mt-1" type="number" min="0" step="any" value={f.planM2} onChange={(e) => setF({ ...f, planM2: e.target.value })} />
            </div>
            <div>
              <Label>Supervisor</Label>
              <select className={selectCls + " mt-1"} value={supervisorId} onChange={(e) => setF({ ...f, supervisorId: e.target.value })}>
                {supervisors.length === 0 ? <option value="">No supervisor on this site</option> : null}
                {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Add plan line</Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
