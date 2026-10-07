import { cn } from "@/lib/utils";
import { ScrollText } from "lucide-react";

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[var(--sge-line)] pb-4">
      <div>
        <h2 className="font-heading text-[1.65rem] font-semibold tracking-tight text-[var(--sge-ink)] md:text-[1.85rem]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--sge-ink-2)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "ok" | "warn" | "crit" | "accent";
}) {
  const tones = {
    default: "border-[var(--sge-line)]",
    ok: "border-[var(--sge-ok)]/45 bg-[var(--sge-ok-wash)]",
    warn: "border-[var(--sge-warn)]/45 bg-[var(--sge-warn-wash)]",
    crit: "border-[var(--sge-crit)]/45 bg-[var(--sge-crit-wash)]",
    accent: "border-[var(--sge-brass)]/50 bg-[var(--sge-brass-wash)]",
  };
  return (
    <div
      className={cn(
        "rounded-sm border bg-[var(--sge-paper)] p-3.5 shadow-[var(--sge-shadow)]",
        tones[tone]
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sge-ink-3)]">
        {label}
      </div>
      <div className="mt-1.5 font-heading text-[1.7rem] font-semibold tabular-nums leading-none text-[var(--sge-ink)]">
        {value}
      </div>
      {hint ? (
        <div className="mt-1.5 text-xs text-[var(--sge-ink-2)]">{hint}</div>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-[var(--sge-line-strong)] bg-[var(--sge-paper)]/70 px-6 py-12 text-center">
      <ScrollText className="mb-3 h-8 w-8 text-[var(--sge-brass-ink)]" />
      <div className="font-heading text-lg font-semibold text-[var(--sge-ink)]">
        {title}
      </div>
      <p className="mt-1 max-w-sm text-sm text-[var(--sge-ink-2)]">{detail}</p>
    </div>
  );
}

export function StatusPill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "ok" | "warn" | "crit" | "accent";
}) {
  const map = {
    default: "border-[var(--sge-line-strong)] bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]",
    ok: "border-[var(--sge-ok)]/40 bg-[var(--sge-ok-wash)] text-[var(--sge-ok)]",
    warn: "border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] text-[var(--sge-warn)]",
    crit: "border-[var(--sge-crit)]/40 bg-[var(--sge-crit-wash)] text-[var(--sge-crit)]",
    accent: "border-[var(--sge-brass)]/50 bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ledger-card rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] p-4 shadow-[var(--sge-shadow)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function formatINR(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}
