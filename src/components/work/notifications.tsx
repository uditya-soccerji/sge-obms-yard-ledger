"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { isFor, isInstant, KIND_LABEL, type Viewer, type WorkEvent } from "@/lib/work/events";
import { canCloseJob } from "@/lib/work/logic";
import { useWork } from "@/lib/work/store";
import { cn } from "@/lib/utils";

/** Approvals waiting longer than this escalate to Owner / Super Admin (docs §19). */
export const ESCALATE_AFTER_HOURS = 24;

export interface WaitingItem {
  id: string;
  title: string;
  detail: string;
  ageHours: number;
  escalated: boolean;
  tab: string;
}

/** Hours since an ISO timestamp (or a date-only value, read as midnight UTC). */
export function hoursSince(at: string, now = Date.now()): number {
  const t = Date.parse(at);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 3_600_000) : 0;
}

export const ageLabel = (hours: number) => (hours < 24 ? `${Math.floor(hours)} h` : `${Math.floor(hours / 24)} d`);

/** What the viewer has to act on right now, derived from live state. */
export function useWaitingForMe(): WaitingItem[] {
  const { state, currentAccount } = useStore();
  const { work } = useWork();
  const role = state.currentRole;
  const sites = currentAccount?.siteIds ?? [];
  const onSite = (siteId: string) => role === "owner" || role === "super_admin" || sites.includes(siteId);
  const lineOf = (id: string) => work.planLines.find((l) => l.id === id);
  const items: WaitingItem[] = [];
  for (const job of work.jobs) {
    const line = lineOf(job.planLineId);
    if (!line || !onSite(line.siteId)) continue;
    if (job.status === "awaiting_sic") {
      // Real elapsed time: the close is stamped when the supervisor asks (docs §19, 24 h)
      const age = job.closeRequestedAt ? hoursSince(job.closeRequestedAt) : 0;
      const escalated = age >= ESCALATE_AFTER_HOURS;
      // SIC approves; Owner / Super Admin see every waiting item, escalated ones flagged
      const mine = role === "sic" || role === "owner" || role === "super_admin";
      if (mine) items.push({ id: job.id, title: `Confirm JMS · ${job.jobNo}`, detail: `${line.plant} · ${job.location}`, ageHours: age, escalated, tab: "jobs" });
    }
    if (role === "supervisor" && job.supervisorId === state.currentUserId && canCloseJob(job, work.dprs).ok) {
      items.push({ id: job.id, title: `Close job · ${job.jobNo}`, detail: `All stages done · ${job.location}`, ageHours: 0, escalated: false, tab: "jobs" });
    }
  }
  return items.sort((a, b) => Number(b.escalated) - Number(a.escalated) || b.ageHours - a.ageHours);
}

export function useMyEvents() {
  const { state, currentAccount } = useStore();
  const { work } = useWork();
  const viewer: Viewer = {
    role: state.currentRole,
    staffId: state.currentUserId,
    siteIds: state.currentRole === "owner" || state.currentRole === "super_admin" ? [] : currentAccount?.siteIds ?? [],
  };
  const mine = work.events.filter((e) => isFor(e, viewer));
  const seen = currentAccount ? work.lastSeen[currentAccount.id] ?? 0 : 0;
  return { mine, seen, accountId: currentAccount?.id ?? "" };
}

export function NotificationBell() {
  const router = useRouter();
  const { state } = useStore();
  const { markSeen } = useWork();
  const waiting = useWaitingForMe();
  const { mine, seen, accountId } = useMyEvents();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const isBoss = state.currentRole === "owner" || state.currentRole === "super_admin";
  // 2026-10-24: Owner / SA see problems only by default; unticking is remembered for that login
  const prefKey = `sge-bell-problems-only-${accountId ?? ""}`;
  const [pref, setPref] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(prefKey);
      setPref(v === null ? null : v === "1");
    } catch {
      setPref(null);
    }
  }, [prefKey]);
  const problemsOnly = isBoss && (pref ?? true);
  const setProblemsOnly = (on: boolean) => {
    setPref(on);
    try {
      localStorage.setItem(prefKey, on ? "1" : "0");
    } catch {
      /* blocked */
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const unread = mine.filter((e) => e.seq > seen);
  const instantNew = unread.filter(isInstant).filter((e) => !problemsOnly || e.problem);
  const badge = waiting.length + instantNew.length;
  const list = (problemsOnly ? mine.filter((e) => e.problem) : mine).slice().reverse();
  const instant = list.filter(isInstant).slice(0, 8);
  const summary = list.filter((e) => !isInstant(e));
  const days = [...new Set(summary.map((e) => e.day))].slice(0, 4);

  const go = (tab: string) => {
    setOpen(false);
    // Events from outside Work (e.g. crews) carry their own path
    router.push(tab.startsWith("/") ? tab : `/work?t=${tab}`);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={`Notifications${badge ? `, ${badge} new` : ""}`}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-8 w-8 items-center justify-center rounded-sm text-white hover:bg-[var(--sge-night-2)]"
      >
        <Bell className="h-4 w-4" />
        {badge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--sge-brass)] px-1 text-center text-[10px] font-bold leading-4 text-[var(--sge-night)]">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-50 w-[min(92vw,400px)] overflow-hidden rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink)] shadow-[var(--sge-shadow)]">
          <div className="flex items-center justify-between border-b border-[var(--sge-line)] px-3 py-2">
            <span className="font-heading text-sm font-bold">Notifications</span>
            <div className="flex items-center gap-2">
              {isBoss ? (
                <label className="flex items-center gap-1 text-[11px] text-[var(--sge-ink-2)]">
                  <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} />
                  Problems only
                </label>
              ) : null}
              <button type="button" className="text-[11px] text-[var(--sge-brass-ink)] underline" onClick={() => accountId && markSeen(accountId)}>
                Mark all read
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <Section title={`Waiting for me (${waiting.length})`}>
              {waiting.length === 0 ? <Empty text="Nothing waiting for you." /> : null}
              {waiting.map((w) => (
                <button key={w.id + w.title} type="button" onClick={() => go(w.tab)} className="block w-full border-b border-[var(--sge-line)] px-3 py-2 text-left hover:bg-[var(--sge-brass-wash)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{w.title}</span>
                    {w.escalated ? (
                      <span className="flex items-center gap-1 rounded-sm bg-[var(--sge-crit-wash)] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[var(--sge-crit)]">
                        <ShieldAlert className="h-3 w-3" /> Escalated · {ageLabel(w.ageHours)}
                      </span>
                    ) : w.ageHours >= 1 ? (
                      <span className="text-[10px] text-[var(--sge-ink-3)]">{ageLabel(w.ageHours)}</span>
                    ) : null}
                  </div>
                  <div className="text-xs text-[var(--sge-ink-3)]">{w.detail}</div>
                </button>
              ))}
            </Section>

            <Section title="Approvals & problems (instant)">
              {instant.length === 0 ? <Empty text="No approvals or problems." /> : null}
              {instant.map((e) => <EventRow key={e.id} e={e} isNew={e.seq > seen} onClick={() => go(e.tab)} />)}
            </Section>

            <Section title="Daily summary">
              {days.length === 0 ? <Empty text="No other updates." /> : null}
              {days.map((d) => {
                const evs = summary.filter((e) => e.day === d);
                return (
                  <details key={d} className="border-b border-[var(--sge-line)]">
                    <summary className="cursor-pointer px-3 py-2 text-sm">
                      <b>{d}</b> · {evs.length} update{evs.length === 1 ? "" : "s"}{" "}
                      <span className="text-xs text-[var(--sge-ink-3)]">
                        ({Object.entries(evs.reduce<Record<string, number>>((m, e) => ({ ...m, [KIND_LABEL[e.kind]]: (m[KIND_LABEL[e.kind]] ?? 0) + 1 }), {}))
                          .map(([k, n]) => `${n} ${k}`)
                          .join(", ")})
                      </span>
                    </summary>
                    {evs.map((e) => <EventRow key={e.id} e={e} isNew={e.seq > seen} onClick={() => go(e.tab)} compact />)}
                  </details>
                );
              })}
            </Section>
          </div>

          {isBoss ? (
            <button type="button" onClick={() => go("activity")} className="block w-full border-t border-[var(--sge-line)] bg-[var(--sge-paper-2)] px-3 py-2 text-center text-xs font-semibold hover:bg-[var(--sge-brass-wash)]">
              Open activity log
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-[var(--sge-paper-2)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-3)]">{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-3 text-xs text-[var(--sge-ink-3)]">{text}</div>;
}

function EventRow({ e, isNew, onClick, compact }: { e: WorkEvent; isNew: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("block w-full border-b border-[var(--sge-line)] px-3 text-left hover:bg-[var(--sge-brass-wash)]", compact ? "py-1.5 pl-5" : "py-2")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-sm", isNew ? "font-semibold" : "")}>
          {isNew ? <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--sge-brass)] align-middle" /> : null}
          {e.title}
        </span>
        {e.problem ? <span className="rounded-sm bg-[var(--sge-crit-wash)] px-1.5 text-[10px] font-bold uppercase text-[var(--sge-crit)]">Problem</span> : null}
      </div>
      <div className="text-xs text-[var(--sge-ink-3)]">
        {e.detail} · {e.actorName}{e.actorRole ? ` (${e.actorRole.replace("_", " ")})` : ""}{e.impersonatedBy ? ` via ${e.impersonatedBy}` : ""} · {e.day}
      </div>
    </button>
  );
}
