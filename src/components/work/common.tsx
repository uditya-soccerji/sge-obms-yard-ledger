"use client";

import { cn } from "@/lib/utils";
import { ALL_SITES } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { DEFAULT_WAGE } from "@/lib/work/logic";
import type { PlanLine, Stage } from "@/lib/work/types";
import { STAGES } from "@/lib/work/types";

export const fmtM2 = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

export const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export const selectCls =
  "h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm text-[var(--sge-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--sge-brass)]/50";

export const thCls =
  "px-2.5 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-3)]";
export const tdCls = "px-2.5 py-2 align-top";

/** Work rows the viewer may see: the active site, or every site in All sites. */
export function useWorkScope() {
  const { state, fullState } = useStore();
  const { work } = useWork();
  const wages = new Map(fullState.labourers.map((l) => [l.id, l.wageDaily]));
  const wageOf = (id: string) => wages.get(id) ?? DEFAULT_WAGE;
  const inSite = (siteId: string) =>
    state.currentSiteId === ALL_SITES || state.currentSiteId === siteId;
  const lineIds = new Set(work.planLines.filter((l) => inSite(l.siteId)).map((l) => l.id));
  const staffName = (id: string) => state.staff.find((s) => s.id === id)?.name ?? id;
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? id;
  const item = (code: string) => work.serviceItems.find((s) => s.code === code);
  const line = (id: string) => work.planLines.find((l) => l.id === id);
  const role = state.currentRole;
  return {
    work,
    inSite,
    lineIds,
    staffName,
    siteCode,
    item,
    line,
    role,
    allSites: state.currentSiteId === ALL_SITES,
    currentSiteId: state.currentSiteId,
    sites: state.sites,
    staff: state.staff,
    wageOf,
    // Payments + P&L: Owner, Super Admin, Finance (docs §18)
    canMoney: role === "owner" || role === "super_admin" || role === "finance",
    canConfirm: role === "sic" || role === "owner" || role === "super_admin",
    canPlan: role === "sic" || role === "owner" || role === "super_admin" || role === "admin",
    canEnter: role === "supervisor" || role === "admin" || role === "sic" || role === "owner" || role === "super_admin",
    enteredBy: (role === "admin" ? "admin" : "supervisor") as "admin" | "supervisor",
  };
}

export function lineLabel(l: PlanLine, item?: { mps: string }) {
  return `${l.plant} · ${item?.mps ?? l.serviceCode} · ${l.jobType}`;
}

/** Small stage chips: done (m²) / not started, for the stages a job needs. */
export function StageChips({
  stages,
  areas,
  final,
}: {
  stages: Stage[];
  areas: Record<Stage, number>;
  final?: Stage;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {STAGES.filter((s) => stages.includes(s.id)).map((s) => {
        const v = areas[s.id];
        return (
          <span
            key={s.id}
            title={s.label}
            className={cn(
              "rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
              v > 0
                ? s.id === final
                  ? "border-[var(--sge-ok)]/50 bg-[var(--sge-ok-wash)] text-[var(--sge-ok)]"
                  : "border-[var(--sge-brass)]/50 bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]"
                : "border-[var(--sge-line)] text-[var(--sge-ink-3)]"
            )}
          >
            {s.short} {v > 0 ? fmtM2(v) : "—"}
          </span>
        );
      })}
    </div>
  );
}

export function Msg({ text }: { text: { ok: boolean; msg: string } | null }) {
  if (!text) return null;
  return (
    <p
      className={cn(
        "rounded-sm px-2.5 py-1.5 text-xs",
        text.ok
          ? "bg-[var(--sge-ok-wash)] text-[var(--sge-ok)]"
          : "bg-[var(--sge-crit-wash)] text-[var(--sge-crit)]"
      )}
    >
      {text.msg}
    </p>
  );
}
