"use client";

import { guarded } from "@/components/shared/require-module";
import Link from "next/link";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/store";
import { useSiteReports } from "@/lib/work/use-reports";
import { useEffect } from "react";
import { entrySiteId } from "@/lib/site-scope";
import { today as todayDate } from "@/lib/today";

function SafetyHomePage() {
  const { state, toggleSafetyItem, signSafetyDay, openSafetyDay } = useStore();
  const reports = useSiteReports();
  const site = entrySiteId(state);
  // Today's checklist for this site; it's opened (blank) the first time the page is used today
  const day = state.safetyDays.find((d) => d.siteId === site && d.date === todayDate());
  useEffect(() => {
    if (!day) openSafetyDay(site);
  }, [day, site, openSafetyDay]);
  const safetyDprs = reports
    .filter((d) => d.submitterType === "safety")
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));

  if (!day) {
    return (
      <div className="sge-enter">
        <SectionHeader
          title="Safety Supervisor"
          subtitle="Safety register-style daily checklist + Safety DPR."
        />
        <EmptyState
          title="No safety day opened"
          detail="Open a daily checklist cell to begin the Safety DPR."
        />
      </div>
    );
  }

  const checked = day.items.filter((i) => i.checked).length;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Safety Supervisor"
        subtitle="F/HSE/008 Safety DPR — observations-first register for SIC approval."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/dpr/new">
              <Button size="sm">Safety DPR</Button>
            </Link>
            {safetyDprs[0] ? (
              <Link href={`/dpr/${safetyDprs[0].id}`}>
                <Button size="sm" variant="outline">
                  Open DPR
                </Button>
              </Link>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={day.signed}
              onClick={() => signSafetyDay(day.id)}
            >
              {day.signed ? "Signed off" : "Sign checklist"}
            </Button>
          </div>
        }
      />

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">Safety DPR documents</h3>
        {safetyDprs.length === 0 ? (
          <EmptyState title="No safety DPR" detail="Submit via New DPR for SIC approval." />
        ) : (
          safetyDprs.map((d) => (
            <Link
              key={d.id}
              href={`/dpr/${d.id}`}
              className="mb-2 flex items-center justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
            >
              <span>
                {d.date} · {d.status} · obs{" "}
                {d.safetyBody?.observations.length ?? 0} · open{" "}
                {d.safetyBody?.glance.stillOpen ?? "—"}
              </span>
              <StatusPill
                tone={
                  d.status === "sic_approved"
                    ? "ok"
                    : d.status === "submitted"
                      ? "accent"
                      : "default"
                }
              >
                {d.status.replace("_", " ")}
              </StatusPill>
            </Link>
          ))
        )}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          label="Checklist progress"
          value={`${checked}/${day.items.length}`}
          tone={checked === day.items.length ? "ok" : "warn"}
        />
        <KpiTile
          label="Register date"
          value={day.date}
          hint={day.signed ? "Signed" : "Awaiting sign-off"}
        />
        <KpiTile
          label="Photo / upload"
          value={day.photoMock ? "1 mock" : "None"}
          tone={day.photoMock ? "accent" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Daily checklist (register-style)
          </h3>
          {day.signed ? (
            <p className="mb-2 text-xs text-[var(--sge-ink-3)]">Signed off — the checklist can no longer be changed.</p>
          ) : null}
          <div className="max-h-[420px] space-y-2 overflow-y-auto">
            {day.items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <Checkbox
                  checked={item.checked}
                  // Signed off = final (the store ignores changes too)
                  disabled={day.signed}
                  onCheckedChange={() => toggleSafetyItem(day.id, item.id)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                    {String(item.id).padStart(2, "0")}.
                  </span>{" "}
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-[var(--sge-ink-3)]">
            Safety DPR
          </h3>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                A · Observations
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[var(--sge-ink-2)]">
                {day.observations || "—"}
              </p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                B · Permits / talks
              </div>
              <p className="mt-1 text-[var(--sge-ink-2)]">
                Covered via checklist ticks (TBT, work permit, gas test).
              </p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                D/E · Incidents
              </div>
              <p className="mt-1 text-[var(--sge-ink-2)]">{day.incidents}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sge-ink-3)]">
                Photo / upload mock
              </div>
              {day.photoMock ? (
                <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-[var(--sge-line-strong)] bg-[var(--sge-ground)] px-3 py-4">
                  <StatusPill tone="accent">image</StatusPill>
                  <span className="font-mono text-xs">{day.photoMock}</span>
                </div>
              ) : (
                <EmptyState
                  title="No photo yet"
                  detail="Use Telegram simulator (image) to attach a mock observation photo."
                />
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--sge-line)] pt-3">
              <StatusPill tone={day.signed ? "ok" : "warn"}>
                {day.signed ? "F · Signed SO" : "F · Awaiting signature"}
              </StatusPill>
              <span className="text-xs text-[var(--sge-ink-3)]">
                SIC / RIL countersign later
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("safety", SafetyHomePage);
