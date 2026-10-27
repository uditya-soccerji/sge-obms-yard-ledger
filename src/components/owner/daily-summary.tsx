"use client";

import { useState } from "react";
import { formatINR, KpiTile, Panel } from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { WORKING } from "@/lib/attendance";
import { OPEN_STATUSES } from "@/lib/requests";
import { ALL_SITES } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { daysAgo } from "@/lib/today";
import { entryArea, entryPlanLineId, round3 } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";

/**
 * Owner's daily summary (round 2, §27): one day on one panel — work, people,
 * JMS, money, requests and the day's problems. Yesterday by default.
 */
export function OwnerDailySummary() {
  const { state } = useStore();
  const { work } = useWork();
  const [day, setDay] = useState(daysAgo(1));
  const sites = new Set(state.sites.map((s) => s.id));
  const inSite = (id?: string) => !id || sites.has(id);
  const lineSite = (planLineId: string) => work.planLines.find((l) => l.id === planLineId)?.siteId;

  const reports = work.reports.filter((r) => r.date === day && inSite(r.siteId));
  const submitted = reports.filter((r) => r.status !== "draft").length;
  const approved = reports.filter((r) => r.status === "sic_approved").length;
  const lines = work.dprs.filter((d) => d.date === day && inSite(lineSite(entryPlanLineId(d, work.jobs) ?? "")));
  const area = round3(lines.reduce((t, e) => t + entryArea(e), 0));
  const litres = round3(lines.reduce((t, e) => t + (e.litres || 0), 0));
  const present = new Set(state.attendance.filter((a) => a.date === day && WORKING.includes(a.status)).map((a) => a.labourerId)).size;
  const jms = work.jms.filter((j) => inSite(lineSite(j.planLineId)));
  const confirmed = jms.filter((j) => j.confirmedOn === day);
  const finished = jms.filter((j) => j.adminAt?.slice(0, 10) === day);
  const received = jms.filter((j) => j.payment?.receivedOn === day).reduce((t, j) => t + (j.payment?.amount ?? 0), 0);
  const spent = work.expenses.filter((x) => !x.voided && x.date === day && inSite(x.siteId)).reduce((t, x) => t + x.amount, 0);
  const openReq = state.equipmentRequests.filter((r) => OPEN_STATUSES.includes(r.status));
  const urgent = openReq.filter((r) => r.urgent || r.reason === "urgent" || r.status === "rejected").length;
  const problems = work.events.filter((e) => e.day === day && e.problem && inSite(e.siteId));

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">Daily summary</h3>
        <Input type="date" aria-label="Summary day" className="h-8 w-40" max={daysAgo(0)} value={day} onChange={(e) => setDay(e.target.value)} />
        <span className="text-xs text-[var(--sge-ink-3)]">{state.currentSiteId === ALL_SITES ? "All sites" : state.sites.find((x) => x.id === state.currentSiteId)?.code}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="DPRs submitted" value={String(submitted)} hint={`${approved} approved`} />
        <KpiTile label="Work done" value={`${area} m²`} hint={`${litres} L paint`} tone="accent" />
        <KpiTile label="Labourers present" value={String(present)} tone="ok" />
        <KpiTile label="JMS confirmed" value={String(confirmed.length)} hint={`${finished.length} finished by Admin`} />
        <KpiTile label="Received" value={formatINR(received)} hint={`spent ${formatINR(spent)}`} tone="ok" />
        <KpiTile label="Open requests" value={String(openReq.length)} hint={`${urgent} urgent / rejected`} tone={urgent ? "warn" : undefined} />
      </div>
      {problems.length ? (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-crit)]">Problems that day ({problems.length})</div>
          <ul className="space-y-0.5 text-sm">
            {problems.slice(0, 8).map((e) => (
              <li key={e.id}>
                <b>{e.title}</b> <span className="text-[var(--sge-ink-3)]">— {e.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--sge-ink-3)]">No problems flagged that day.</p>
      )}
    </Panel>
  );
}
