"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { OpsPanelHost } from "@/components/ops/panel-host";
import { EmptyState } from "@/components/shared/ui-bits";
import { opsPillsFor, type OpsPanelId } from "@/lib/desk";
import { PANEL_ICON, useQueueCounts } from "@/lib/queues";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function OperationsInner() {
  const { currentAccount, state } = useStore();
  const pills = opsPillsFor(currentAccount, state.currentRole);
  // 2026-10-24: an icon on every tab, and the number waiting for this role
  const { ops } = useQueueCounts();
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("p") as OpsPanelId | null;
  const active = useMemo(() => {
    if (requested && pills.some((p) => p.id === requested)) return requested;
    return pills[0]?.id ?? null;
  }, [requested, pills]);

  if (pills.length === 0 || !active) {
    return (
      <EmptyState
        title="No operations for this seat"
        detail="This role only has Home. Switch role or sign in as a field seat."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-[var(--sge-line)] pb-2">
        {pills.map((p) => {
          const on = p.id === active;
          const Icon = PANEL_ICON[p.id];
          const n = ops[p.id] ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.replace(`/operations?p=${p.id}`)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors",
                on
                  ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]"
                  : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
              )}
            >
              {Icon ? <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
              {p.label}
              {n ? (
                <span aria-label={`${n} waiting`} className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--sge-brass)] px-1 text-[10px] font-bold leading-none tracking-normal text-white">
                  {n}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <OpsPanelHost panel={active} />
    </div>
  );
}

export default function OperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-[var(--sge-ink-3)]">
          Opening operations…
        </div>
      }
    >
      <OperationsInner />
    </Suspense>
  );
}
