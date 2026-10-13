"use client";

import { formatINR, Panel, StatusPill } from "@/components/shared/ui-bits";
import { today as todayDate } from "@/lib/today";
import { useStore } from "@/lib/store";
import { workedCount } from "@/lib/attendance";
import type { AppState } from "@/lib/types";
import type { WorkState } from "@/lib/work/types";
import { entryArea } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";


export interface SiteRow {
  siteId: string;
  code: string;
  name: string;
  crew: number;
  present: number;
  paintedM2: number;
  blastedM2: number;
  scaffoldM3: number;
  pendingDprs: number;
  openRequests: number;
  kitIssues: number;
  expenseToday: number;
  billed: number;
}

/** One row of figures per enabled site, from the unfiltered state. */
export function siteRows(s: AppState, w: WorkState): SiteRow[] {
  const day = todayDate();
  return s.sites
    .filter((x) => x.enabled)
    .map((site) => {
      const id = site.id;
      // Today's quantities come from the one DPR model in Work (job lines + scaffold lines)
      const siteOfJob = (jobId: string) => w.planLines.find((l) => l.id === w.jobs.find((j) => j.id === jobId)?.planLineId)?.siteId;
      const lines = w.dprs.filter((d) => d.date === day && siteOfJob(d.jobId) === id);
      const reportsToday = w.reports.filter((r) => r.siteId === id && r.date === day);
      return {
        siteId: id,
        code: site.code,
        name: site.name,
        crew: s.labourers.filter((l) => l.siteId === id && l.active).length,
        present: workedCount(s.attendance.filter((a) => a.siteId === id), todayDate()),
        paintedM2: Math.round(lines.filter((d) => d.stage !== "prep").reduce((n, d) => n + entryArea(d), 0) * 1000) / 1000,
        blastedM2: Math.round(lines.filter((d) => d.stage === "prep").reduce((n, d) => n + entryArea(d), 0) * 1000) / 1000,
        scaffoldM3: reportsToday.flatMap((r) => r.scaffoldWork ?? []).reduce((n, l) => n + (l.erectM3 || 0), 0),
        pendingDprs: w.reports.filter((d) => d.siteId === id && d.status === "submitted").length,
        openRequests: s.equipmentRequests.filter(
          (r) => r.siteId === id && ["open", "sic_approved", "fulfilling"].includes(r.status)
        ).length,
        kitIssues: s.equipment.filter((e) => e.siteId === id && e.status !== "ok")
          .length,
        expenseToday: s.finance
          .filter((f) => f.siteId === id && f.date === todayDate() && f.kind === "expense")
          .reduce((n, f) => n + f.amount, 0),
        billed: s.billing
          .filter((b) => b.siteId === id && b.status !== "draft")
          .reduce((n, b) => n + b.amount, 0),
      };
    });
}

function pct(present: number, crew: number) {
  return crew ? Math.round((present / crew) * 100) : 0;
}

/**
 * All sites view: every site side by side plus a total row.
 * Clicking a site opens that site's own dashboard.
 */
export function SiteComparison() {
  const { fullState, switchSite } = useStore();
  const { work } = useWork();
  const rows = siteRows(fullState, work);
  const total = rows.reduce(
    (t, r) => ({
      crew: t.crew + r.crew,
      present: t.present + r.present,
      paintedM2: t.paintedM2 + r.paintedM2,
      blastedM2: t.blastedM2 + r.blastedM2,
      scaffoldM3: t.scaffoldM3 + r.scaffoldM3,
      pendingDprs: t.pendingDprs + r.pendingDprs,
      openRequests: t.openRequests + r.openRequests,
      kitIssues: t.kitIssues + r.kitIssues,
      expenseToday: t.expenseToday + r.expenseToday,
      billed: t.billed + r.billed,
    }),
    {
      crew: 0, present: 0, paintedM2: 0, blastedM2: 0, scaffoldM3: 0,
      pendingDprs: 0, openRequests: 0, kitIssues: 0, expenseToday: 0, billed: 0,
    }
  );

  const th = "px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-3)]";
  const td = "px-3 py-2 text-right tabular-nums";

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink)]">
            Site by site · today
          </h3>
          <p className="text-[11px] text-[var(--sge-ink-3)]">
            Tap a site to open its own dashboard. Totals row = the figures above.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--sge-line)]">
              <th className={th + " text-left"}>Site</th>
              <th className={th}>Present / crew</th>
              <th className={th}>Painted m²</th>
              <th className={th}>Blasted m²</th>
              <th className={th}>Scaffold m³</th>
              <th className={th}>DPRs at SIC</th>
              <th className={th}>Open requests</th>
              <th className={th}>Kit due/fault</th>
              <th className={th}>Spend today</th>
              <th className={th}>Billed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = pct(r.present, r.crew);
              return (
                <tr
                  key={r.siteId}
                  onClick={() => switchSite(r.siteId)}
                  className="cursor-pointer border-b border-[var(--sge-line)] hover:bg-[var(--sge-accent-wash)]"
                >
                  <td className="px-3 py-2 text-left">
                    <span className="font-heading font-bold tracking-wide">{r.code}</span>
                    <span className="ml-2 text-xs text-[var(--sge-ink-3)]">{r.name}</span>
                  </td>
                  <td className={td}>
                    {r.present}/{r.crew}{" "}
                    <StatusPill tone={p >= 80 ? "ok" : p >= 65 ? "warn" : "crit"}>
                      {p}%
                    </StatusPill>
                  </td>
                  <td className={td}>{r.paintedM2 || "—"}</td>
                  <td className={td}>{r.blastedM2 || "—"}</td>
                  <td className={td}>{r.scaffoldM3 || "—"}</td>
                  <td className={td}>{r.pendingDprs || "—"}</td>
                  <td className={td}>{r.openRequests || "—"}</td>
                  <td className={td}>
                    {r.kitIssues ? <StatusPill tone="crit">{r.kitIssues}</StatusPill> : "—"}
                  </td>
                  <td className={td}>{formatINR(r.expenseToday)}</td>
                  <td className={td}>{formatINR(r.billed)}</td>
                </tr>
              );
            })}
            <tr className="bg-[var(--sge-paper-2)] font-semibold">
              <td className="px-3 py-2 text-left font-heading uppercase tracking-wide">
                All sites
              </td>
              <td className={td}>
                {total.present}/{total.crew} · {pct(total.present, total.crew)}%
              </td>
              <td className={td}>{total.paintedM2}</td>
              <td className={td}>{total.blastedM2}</td>
              <td className={td}>{total.scaffoldM3}</td>
              <td className={td}>{total.pendingDprs}</td>
              <td className={td}>{total.openRequests}</td>
              <td className={td}>{total.kitIssues}</td>
              <td className={td}>{formatINR(total.expenseToday)}</td>
              <td className={td}>{formatINR(total.billed)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
