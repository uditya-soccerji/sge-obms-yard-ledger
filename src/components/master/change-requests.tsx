"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { RequestList, type ListRequest } from "@/components/shared/request-list";
import { useStore } from "@/lib/store";
import type { MasterRequestSheet } from "@/lib/types";
import { masterRequestsTab, SHEET_NAME, unseenMasterDecisions } from "@/lib/wage-requests";
import { useWork } from "@/lib/work/store";

/** The Daily wages request flow, for Trades / Rate book / Materials / Units (2026-10-24) */
export function ChangeRequestsPanel({ sheet }: { sheet: MasterRequestSheet }) {
  const { fullState: state, decideMasterChange, withdrawMasterChange, markMasterChanges } = useStore();
  const { notify } = useWork();
  const params = useSearchParams();
  const isAdmin = state.currentRole === "admin";
  const isBoss = state.currentRole === "owner" || state.currentRole === "super_admin";
  const seen = useCallback((ids: string[]) => markMasterChanges(ids, { seenByRequester: true }), [markMasterChanges]);
  if (!isAdmin && !isBoss) return null;
  const rows = state.masterChangeRequests.filter((r) => r.sheet === sheet);

  async function decide(r: ListRequest, approve: boolean, note: string) {
    const res = await decideMasterChange(r.id, approve, note);
    if (res.ok) notify({ kind: "change_decided", problem: !approve, siteId: "", subjectStaffId: r.requestedBy, title: `${SHEET_NAME[sheet]} change ${approve ? "approved" : "rejected"}: ${r.summary}`, detail: note.trim() || (approve ? "Change made" : ""), tab: masterRequestsTab(sheet), refId: r.id });
    return res;
  }

  return (
    <>
      {isAdmin ? (
        <p className="mb-2 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)]">
          Your changes here go to the Owner / Super Admin as a request. Nothing changes until they approve it.
        </p>
      ) : null}
      <RequestList
        title={`${SHEET_NAME[sheet]} change requests`}
        rows={rows}
        me={state.currentUserId ?? state.currentAccountId}
        asker={isAdmin}
        decider={() => isBoss}
        deciderLabel="Owner / Super Admin"
        unseenIds={unseenMasterDecisions(state, sheet).map((r) => r.id)}
        onSeen={seen}
        onUndo={(r) => withdrawMasterChange(r.id)}
        onDecide={decide}
        startOpen={params.get("requests") === "open"}
      />
    </>
  );
}
