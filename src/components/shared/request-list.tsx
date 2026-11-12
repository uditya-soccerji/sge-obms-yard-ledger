"use client";

import { useEffect, useState } from "react";
import { Bell, Check, CheckCircle2, Hourglass, ListChecks, Send, Undo2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RequestStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WAGE_UNDO_MS } from "@/lib/wage-requests";

export interface ListRequest {
  id: string;
  summary: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  decidedAt?: string;
  decidedNote?: string;
  notified?: boolean;
  thread?: RequestStep[];
}

type Res = { ok: boolean; error?: string };
const PAGE = 50;
export const stamp = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** The request's audit thread; older requests (before threads) get one rebuilt from their fields */
export function threadOf(r: ListRequest): RequestStep[] {
  if (r.thread?.length) return r.thread;
  const t: RequestStep[] = [{ at: r.requestedAt, byName: r.requestedByName, action: "requested" }];
  if (r.decidedAt && r.status !== "pending") t.push({ at: r.decidedAt, byName: r.status === "withdrawn" ? r.requestedByName : "Owner / Super Admin", action: r.status === "withdrawn" ? "undone" : r.status === "approved" ? "approved" : "rejected", note: r.decidedNote });
  return t;
}

const STEP: Record<RequestStep["action"], { label: string; icon: typeof Send; tone: string }> = {
  requested: { label: "Asked", icon: Send, tone: "text-[var(--sge-brass-ink)]" },
  alerted: { label: "Alert sent", icon: Bell, tone: "text-[var(--sge-warn)]" },
  undone: { label: "Undone", icon: Undo2, tone: "text-[var(--sge-ink-3)]" },
  approved: { label: "Approved", icon: CheckCircle2, tone: "text-[var(--sge-ok)]" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-[var(--sge-crit)]" },
};

/**
 * One list for every approval flow (2026-10-24): counted button, 50 a page, Undo window for the
 * asker, approve / reject (reason needed) for the deciders, NEW highlight, and each request's history.
 */
export function RequestList({
  title,
  rows,
  me,
  asker,
  decider,
  deciderLabel,
  unseenIds,
  onSeen,
  onUndo,
  onDecide,
  startOpen,
}: {
  title: string;
  rows: ListRequest[];
  me: string | null;
  /** Signed in as the role whose changes become requests */
  asker: boolean;
  decider: (r: ListRequest) => boolean;
  /** Who is told after the Undo window, e.g. "Owner / Super Admin" */
  deciderLabel: string;
  unseenIds: string[];
  onSeen: (ids: string[]) => void;
  onUndo: (r: ListRequest) => Res;
  onDecide: (r: ListRequest, approve: boolean, note: string) => Res | Promise<Res>;
  startOpen: boolean;
}) {
  const mine = (r: ListRequest) => r.requestedBy === me;
  const pending = rows.filter((r) => r.status === "pending").sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const all = [...pending, ...rows.filter((r) => r.status !== "pending").sort((a, b) => (b.decidedAt ?? b.requestedAt).localeCompare(a.decidedAt ?? a.requestedAt))];

  const [open, setOpen] = useState(startOpen);
  useEffect(() => {
    if (startOpen) setOpen(true);
  }, [startOpen]);
  const [pageNo, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const page = Math.min(pageNo, pages - 1);
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<Set<string>>(new Set());

  // Decisions the asker hasn't seen: counted on the button, highlighted while the list is open
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const unseenKey = unseenIds.join(",");
  useEffect(() => {
    if (!open || !unseenKey) return;
    const ids = unseenKey.split(",");
    setFresh((f) => new Set([...f, ...ids]));
    onSeen(ids);
  }, [open, unseenKey, onSeen]);

  // Countdown while one of my requests is still in its Undo window
  const [, tick] = useState(0);
  const inWindow = pending.some((r) => mine(r) && !r.notified);
  useEffect(() => {
    if (!inWindow) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [inWindow]);
  const secondsLeft = (r: ListRequest) => Math.max(0, Math.ceil((Date.parse(r.requestedAt) + WAGE_UNDO_MS - Date.now()) / 1000));
  const latestMine = asker ? pending.find((r) => mine(r) && secondsLeft(r) > 0) : undefined;

  function undo(r: ListRequest) {
    const res = onUndo(r);
    setMsg(res.ok ? { ok: true, text: r.notified ? `Request taken back — it is off the ${deciderLabel} list.` : `Request taken back — the ${deciderLabel} were not told.` } : { ok: false, text: res.error ?? "Couldn't undo" });
  }
  async function decide(r: ListRequest, approve: boolean) {
    const res = await onDecide(r, approve, note[r.id] ?? "");
    setMsg(res.ok ? { ok: true, text: approve ? "Approved — the change is made." : "Rejected — the asker is told." } : { ok: false, text: res.error ?? "Couldn't decide" });
  }

  return (
    <div className="mb-4 space-y-2">
      {latestMine ? (
        <p className="text-sm text-[var(--sge-ok)]">
          Request sent: {latestMine.summary}. You can Undo it for {secondsLeft(latestMine)} s before the {deciderLabel} are told.
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
        {title}
        {pending.length ? (
          <span aria-label={`${pending.length} waiting`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--sge-brass)] px-1.5 text-[11px] font-bold text-white">
            {pending.length}
          </span>
        ) : null}
        {unseenIds.length ? <span className="inline-flex h-5 items-center justify-center rounded-full bg-[var(--sge-ok)] px-1.5 text-[11px] font-bold text-white">{unseenIds.length} new</span> : null}
        <span className="text-xs font-normal text-[var(--sge-ink-3)]">{open ? "Hide" : `Show (${all.length})`}</span>
      </Button>
      {open ? (
        <div className="rounded-sm border border-[var(--sge-line)] p-3">
          {all.length === 0 ? (
            <p className="text-sm text-[var(--sge-ink-3)]">No requests yet.</p>
          ) : (
            <>
              <div className="divide-y divide-[var(--sge-line)]">
                {all.slice(page * PAGE, page * PAGE + PAGE).map((r) => {
                  const steps = threadOf(r);
                  const showing = history.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "py-1.5 text-sm",
                        fresh.has(r.id) && "-mx-2 rounded-sm border-l-4 px-2",
                        fresh.has(r.id) && (r.status === "approved" ? "border-[var(--sge-ok)] bg-[var(--sge-ok-wash)]" : "border-[var(--sge-crit)] bg-[var(--sge-crit-wash)]")
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
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
                          {r.decidedNote ? ` · ${r.decidedNote}` : ""}
                        </span>
                        <button type="button" className="text-xs text-[var(--sge-brass-ink)] underline" aria-expanded={showing} onClick={() => setHistory((h) => { const n = new Set(h); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                          History ({steps.length})
                        </button>
                        {r.status === "pending" && asker && mine(r) ? (
                          <span className="ml-auto flex items-center gap-2">
                            <span className="text-xs text-[var(--sge-ink-3)]">{r.notified || secondsLeft(r) === 0 ? `${deciderLabel} told` : `${deciderLabel} told in ${secondsLeft(r)} s`}</span>
                            <Button size="sm" variant="outline" className="gap-1 border-[var(--sge-warn)] text-[var(--sge-warn)]" onClick={() => undo(r)}>
                              <Undo2 aria-hidden className="h-3.5 w-3.5" /> Undo
                            </Button>
                          </span>
                        ) : null}
                        {r.status === "pending" && decider(r) ? (
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
                      {showing ? (
                        // The audit thread: every step, who, when (IST)
                        <ol className="ml-2 mt-1.5 space-y-1 border-l-2 border-[var(--sge-line)] pl-3">
                          {steps.map((st, i) => {
                            const m = STEP[st.action];
                            const Icon = m.icon;
                            return (
                              <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                                <Icon aria-hidden className={cn("h-3.5 w-3.5", m.tone)} />
                                <span className={cn("font-semibold", m.tone)}>{m.label}</span>
                                <span>by {st.byName}</span>
                                <span className="text-[var(--sge-ink-3)]">· {stamp(st.at)}</span>
                                {st.note ? <span className="text-[var(--sge-ink-2)]">· {st.note}</span> : null}
                              </li>
                            );
                          })}
                        </ol>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {pages > 1 ? (
                <div className="mt-2 flex items-center justify-end gap-2 text-xs">
                  <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Previous</Button>
                  <span>
                    Page {page + 1} of {pages} · {all.length} requests
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
