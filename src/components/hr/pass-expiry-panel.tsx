"use client";

import { useState } from "react";
import { LabourImport } from "@/components/master/labour-import";
import { EmptyState, Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { canViewModule } from "@/lib/permissions";
import { PASS_ALERT_DAYS, passesNeedingAction, showDate } from "@/lib/gate-pass";
import { useStore } from "@/lib/store";
import { today } from "@/lib/today";

/**
 * RIL gate passes that have expired or expire within 10 days (docs §24).
 * HR and Admin see their sites and can upload RIL's export (pass dates);
 * a supervisor sees only his own crew.
 */
export function PassExpiryPanel({ supervisorId }: { supervisorId?: string }) {
  const { state, fullState, currentAccount } = useStore();
  const [upload, setUpload] = useState(false);
  const canUpload = !supervisorId && (state.currentRole === "hr" || state.currentRole === "admin" || state.currentRole === "super_admin");
  const sites = currentAccount?.siteIds ?? [];
  const pool = fullState.labourers.filter((l) =>
    supervisorId ? l.supervisorId === supervisorId : sites.length === 0 || sites.includes(l.siteId)
  );
  const rows = passesNeedingAction(pool, today());
  const expired = rows.filter((r) => r.state === "expired").length;
  const withDates = pool.filter((l) => l.passExpiry).length;
  const canOpen = canViewModule(currentAccount, state.currentRole, "labourer");
  const supName = (id: string) => fullState.staff.find((s) => s.id === id)?.name ?? "—";

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold">{supervisorId ? "My crew — gate passes to renew" : "RIL gate passes to renew"}</h3>
        {expired ? <StatusPill tone="crit">{expired} expired</StatusPill> : null}
        {rows.length - expired ? <StatusPill tone="warn">{rows.length - expired} within {PASS_ALERT_DAYS} days</StatusPill> : null}
        <span className="text-xs text-[var(--sge-ink-3)]">{withDates} of {pool.length} labourers have pass dates</span>
        {canUpload ? (
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setUpload((v) => !v)}>
            {upload ? "Close upload" : "Upload RIL export"}
          </Button>
        ) : null}
      </div>
      {upload ? <LabourImport title="Upload RIL export (pass dates)" onClose={() => setUpload(false)} /> : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No passes to renew"
          detail={withDates ? `Nothing expires in the next ${PASS_ALERT_DAYS} days.` : "Upload RIL's export with Valid From / Valid To to start tracking expiry."}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr>
                <th className="py-1">Labourer</th>
                <th>EP</th>
                <th>Expiry</th>
                <th>Left</th>
                {supervisorId ? null : <th>Supervisor</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map(({ labourer: l, state: st, days }) => (
                <tr key={l.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5">
                    {canOpen ? (
                      <a className="underline-offset-2 hover:underline" href={`/labourer?id=${l.id}`}>{l.name}</a>
                    ) : (
                      l.name
                    )}
                  </td>
                  <td className="font-mono text-xs">{l.epNumber}</td>
                  <td className="font-mono text-xs">{showDate(l.passExpiry)}</td>
                  <td>
                    <StatusPill tone={st === "expired" ? "crit" : "warn"}>{st === "expired" ? `expired ${-days} d ago` : days === 0 ? "today" : `${days} d`}</StatusPill>
                  </td>
                  {supervisorId ? null : <td className="text-[var(--sge-ink-2)]">{supName(l.supervisorId)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 ? <p className="pt-2 text-xs text-[var(--sge-ink-3)]">Showing the first 50 of {rows.length}.</p> : null}
        </div>
      )}
    </Panel>
  );
}
