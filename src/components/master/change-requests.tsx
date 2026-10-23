"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Hourglass, ListChecks, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import type { MasterChangeRequest, MasterRequestSheet } from "@/lib/types";
import { cn } from "@/lib/utils";
import { masterRequestsTab, SHEET_NAME, unseenMasterDecisions, WAGE_UNDO_MS } from "@/lib/wage-requests";
import { useWork } from "@/lib/work/store";

const PAGE = 50;
const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * The Daily wages request flow, for Trades / Rate book / Materials / Units (2026-10-24):
 * the Admin's edits wait for Owner / SA; Undo for 60 s; counted button; 50 a page; NEW highlight.
 */
export function ChangeRequestsPanel({ sheet }: { sheet: MasterRequestSheet }) {
  const { fullState: state, decideMasterChange, withdrawMasterChange, markMasterChanges } = useStore();
  const { notify } = useWork();
  const params = useSearchParams();
  const isAdmin = state.currentRole === "admin";
  const isBoss = state.currentRole === "owner" || state.currentRole === "super_admin";
  const me = state.currentUserId ?? state.currentAccountId;
  const mine = (r: MasterChangeRequest) => r.requestedBy === me;
  const all = state.masterChangeRequests.filter((r) => r.sheet === sheet);
  const pending = all.filter((r) => r.status === "pending").sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const rows = [...pending, ...all.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.requestedAt).localeCompare(a.decidedAt ?? a.requestedAt))];
  const unseen = unseenMasterDecisions(state, sheet);

  const askedOpen = params.get("requests") === "open";
  const [open, setOpen] = useState(askedOpen);
  useEffect(() => {
    if (askedOpen) setOpen(true);
  }, [askedOpen]);
  const [pageNo, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pageNo, pages - 1);
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Decisions the Admin hasn't seen: counted on the button, highlighted while the list is open
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const unseenKey = unseen.map((r) => r.id).join(",");
  useEffect(() => {
    if (!open || !unseenKey) return;
    const ids = unseenKey.split(",");
    setFresh((f) => new Set([...f, ...ids]));
    markMasterChanges(ids, { seenByRequester: true });
  }, [open, unseenKey, markMasterChanges]);

  // Countdown while one of my requests is still in its Undo window
  const [, tick] = useState(0);
  const inWindow = pending.some((r) => mine(r) && !r.notified);
  useEffect(() => {
    if (!inWindow) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [inWindow]);
  const secondsLeft = (r: MasterChangeRequest) => Math.max(0, Math.ceil((Date.parse(r.requestedAt) + WAGE_UNDO_MS - Date.now()) / 1000));
  const latestMine = isAdmin ? pending.find((r) => mine(r) && secondsLeft(r) > 0) : undefined;

  function undo(r: MasterChangeRequest) {
    const res = withdrawMasterChange(r.id);
    setMsg(res.ok ? { ok: true, text: r.notified ? "Request taken back — it is off the Owner / Super Admin's list." : "Request taken back — the Owner / Super Admin were not told." } : { ok: false, text: res.error ?? "Couldn't undo" });
  }
  async function decide(r: MasterChangeRequest, approve: boolean) {
    const res = await decideMasterChange(r.id, approve, note[r.id] ?? "");
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Couldn't decide" });
    setMsg({ ok: true, text: approve ? "Approved — the change is made." : "Rejected — the Admin is told." });
    notify({ kind: "change_decided", problem: !approve, siteId: "", subjectStaffId: r.requestedBy, title: `${SHEET_NAME[sheet]} change ${approve ? "approved" : "rejected"}: ${r.summary}`, detail: note[r.id]?.trim() || (approve ? "Change made" : ""), tab: masterRequestsTab(sheet), refId: r.id });
  }

  if (!isAdmin && !isBoss) return null;
  return (
    <div className="mb-4 space-y-2">
      {isAdmin ? (
        <p className="rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)]">
          Your changes here go to the Owner / Super Admin as a request. Nothing changes until they approve it.
        </p>
      ) : null}
      {latestMine ? (
        <p className="text-sm text-[var(--sge-ok)]">
          Request sent: {latestMine.summary}. You can Undo it for {secondsLeft(latestMine)} s before the Owner / Super Admin are told.
        </p>
      ) : null}
      {msg ? <p className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-expanded={open}
        className={cn("gap-2", pending.length ? "border-[var(--sge-brass)] text-[var(--sge-brass-ink)]" : "")}
        onClick={() => setOpen((v) => !v)}
      >
        <ListChecks aria-hidden className="h-4 w-4" />
        {SHEET_NAME[sheet]} change requests
        {pending.length ? (
          <span aria-label={`${pending.length} waiting`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sge-brass)] px-1.5 text-[11px] font-bold text-white">
            {pending.length}
          </span>
        ) : null}
        {unseen.length ? <span className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--sge-ok)] px-1.5 text-[11px] font-bold text-white">{unseen.length} new</span> : null}
        <span className="text-xs font-normal text-[var(--sge-ink-3)]">{open ? "Hide" : `Show (${rows.length})`}</span>
      </Button>
      {open ? (
        <div className="rounded-sm border border-[var(--sge-line)] p-3">
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--sge-ink-3)]">No requests yet.</p>
          ) : (
            <>
              <div className="divide-y divide-[var(--sge-line)]">
                {rows.slice(page * PAGE, page * PAGE + PAGE).map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "flex flex-wrap items-center gap-2 py-1.5 text-sm",
                      fresh.has(r.id) && "-mx-2 rounded-sm border-l-4 px-2",
                      fresh.has(r.id) && (r.status === "approved" ? "border-[var(--sge-ok)] bg-[var(--sge-ok-wash)]" : "border-[var(--sge-crit)] bg-[var(--sge-crit-wash)]")
                    )}
                  >
                    {fresh.has(r.id) ? <span className="rounded-sm bg-[var(--sge-night)] px-1.5 text-[10px] font-bold uppercase text-white">New</span> : null}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-sm px-1.5 text-[11px] font-semibold uppercase",
                        r.status === "pending" ? "bg-[var(--sge-warn-wash)] text-[var(--sge-warn)]" : r.status === "approved" ? "bg-[var(--sge-ok-wash)] text-[var(--sge-ok)]" : r.status === "withdrawn" ? "bg-[var(--sge-paper-2)] text-[var(--sge-ink-3)]" : "bg-[var(--sge-crit-wash)] text-[var(--sge-crit)]"
                      )}
                    >
                      {r.status === "pending" ? <Hourglass aria-hidden className="h-3 w-3" /> : null}
                      {r.status === "pending" ? "waiting" : r.status === "withdrawn" ? "undone" : r.status}
                    </span>
                    <span className={r.status === "pending" ? "font-semibold" : ""}>{r.summary}</span>
                    <span className="text-xs text-[var(--sge-ink-3)]">
                      asked by {r.requestedByName} · {stamp(r.requestedAt)}
                      {r.decidedAt ? ` · ${r.status === "withdrawn" ? "undone" : r.status} ${stamp(r.decidedAt)}` : ""}
                      {r.decidedNote ? ` · ${r.decidedNote}` : ""}
                    </span>
                    {r.status === "pending" && isAdmin && mine(r) ? (
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-[var(--sge-ink-3)]">{r.notified || secondsLeft(r) === 0 ? "Owner / SA told" : `Owner / SA told in ${secondsLeft(r)} s`}</span>
                        <Button size="sm" variant="outline" className="gap-1 border-[var(--sge-warn)] text-[var(--sge-warn)]" onClick={() => undo(r)}>
                          <Undo2 aria-hidden className="h-3.5 w-3.5" /> Undo
                        </Button>
                      </span>
                    ) : null}
                    {r.status === "pending" && isBoss ? (
                      <span className="ml-auto flex items-center gap-1">
                        <Input aria-label="Reason" className="h-8 w-44" placeholder="Reason (to reject)" value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
                        <Button size="sm" className="gap-1 bg-[var(--sge-crit)] text-white hover:bg-[var(--sge-crit)]/90" onClick={() => void decide(r, false)}>
                          <X aria-hidden className="h-3.5 w-3.5" /> Reject
                        </Button>
                        <Button size="sm" className="gap-1 bg-[var(--sge-ok)] text-white hover:bg-[var(--sge-ok)]/90" onClick={() => void decide(r, true)}>
                          <Check aria-hidden className="h-3.5 w-3.5" /> Approve
                        </Button>
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
              {pages > 1 ? (
                <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</Button>
                  <span>
                    Page {page + 1} of {pages} · {rows.length} requests
                  </span>
                  <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((n) => n + 1)}>Next</Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
