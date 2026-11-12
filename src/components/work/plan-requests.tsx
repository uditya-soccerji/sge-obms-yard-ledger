"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { RequestList } from "@/components/shared/request-list";
import { Panel } from "@/components/shared/ui-bits";
import { useStore } from "@/lib/store";
import type { WorkState } from "@/lib/work/types";
import { useWork } from "@/lib/work/store";

/** Decided plan-line requests the signed-in Admin hasn't looked at yet */
export function unseenPlanDecisions(work: WorkState, role: string | null, me: string | null) {
  if (role !== "admin") return [];
  return work.planRequests.filter((r) => (r.status === "approved" || r.status === "rejected") && !r.seenByRequester && r.requestedBy === me);
}

/**
 * 2026-10-24: the Admin's plan lines wait here for the site's SIC, the Owner or the Super Admin.
 * Same list as Master Data requests: Undo for 60 s, counted button, reason to reject, history thread.
 */
export function PlanRequestsPanel({ inSite }: { inSite: (siteId: string) => boolean }) {
  const { state, currentAccount } = useStore();
  const { work, decidePlanRequest, withdrawPlanRequest, markPlanRequests } = useWork();
  const params = useSearchParams();
  const role = state.currentRole;
  const me = state.currentUserId ?? state.currentAccountId;
  const seen = useCallback((ids: string[]) => markPlanRequests(ids, { seenByRequester: true }), [markPlanRequests]);
  if (role !== "admin" && role !== "sic" && role !== "owner" && role !== "super_admin") return null;
  const rows = work.planRequests.filter((r) => inSite(r.siteId));
  const isBoss = role === "owner" || role === "super_admin";
  const siteOf = (id: string) => work.planRequests.find((r) => r.id === id)?.siteId ?? "";

  return (
    <Panel>
      <h3 className="mb-2 font-heading text-sm font-bold">Plan line requests</h3>
      {role === "admin" ? (
        <p className="mb-2 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)]">
          Your plan lines go to the SIC / Owner / Super Admin as a request. A line joins the plan only after they approve it.
        </p>
      ) : null}
      <RequestList
        title="Plan line requests"
        rows={rows}
        me={me}
        asker={role === "admin"}
        decider={(r) => isBoss || (role === "sic" && (currentAccount?.siteIds ?? []).includes(siteOf(r.id)))}
        deciderLabel="SIC / Owner / Super Admin"
        unseenIds={unseenPlanDecisions(work, role, me).map((r) => r.id)}
        onSeen={seen}
        onUndo={(r) => withdrawPlanRequest(r.id)}
        onDecide={(r, approve, note) => decidePlanRequest(r.id, approve, note)}
        startOpen={params.get("requests") === "open"}
      />
    </Panel>
  );
}
