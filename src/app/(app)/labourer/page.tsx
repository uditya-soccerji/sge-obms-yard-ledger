"use client";

import { guarded } from "@/components/shared/require-module";
import {
  EmptyState,
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { skillLabel } from "@/lib/labour-import";
import { WORKING } from "@/lib/attendance";
import { useMemo, useState } from "react";

function LabourerHomePage() {
  const { state, currentAccount, updateLabourer } = useStore();
  const isLabourerOnly = state.currentRole === "labourer";
  const lockedId = isLabourerOnly
    ? currentAccount?.labourerId ?? state.currentUserId
    : null;
  const [labourerId, setLabourerId] = useState(
    lockedId ??
      state.labourers.find((l) => l.active)?.id ??
      state.labourers[0]?.id
  );

  const effectiveId = lockedId ?? labourerId;
  const labourer = state.labourers.find((l) => l.id === effectiveId);
  const history = useMemo(
    () =>
      state.attendance
        .filter((a) => a.labourerId === effectiveId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [state.attendance, effectiveId]
  );

  const presentDays = history.filter(
    (a) => WORKING.includes(a.status)
  ).length;
  const wageGist = labourer
    ? labourer.wageDaily *
        history.filter((a) => a.status === "present" || a.status === "overtime").length +
      labourer.wageDaily *
        0.5 *
        history.filter((a) => a.status === "half").length
    : 0;

  const equipment = state.equipment.filter((e) =>
    labourer?.equipmentIds.includes(e.id)
  );

  const canEditTrade =
    state.currentRole === "hr" ||
    state.currentRole === "admin" ||
    state.currentRole === "super_admin";

  if (!labourer) {
    return (
      <EmptyState
        title="No labourer profiles"
        detail="Seed labourers to preview the read-mostly labourer home."
      />
    );
  }

  const tradeDef = state.tradeCatalogue.find((t) => t.id === labourer.trade);
  const tradeLabel = tradeDef?.label ?? labourer.trade;
  const subLabel = tradeDef?.subcategories.find(
    (s) => s.id === labourer.tradeSubcategory
  )?.label;

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Labourer profile"
        subtitle={
          isLabourerOnly
            ? "Your profile only — EP / gate pass, attendance, equipment, wages (read-only)."
            : "EP / gate pass, trade (+ sub-category), attendance history, assigned equipment, wages gist."
        }
        action={
          isLabourerOnly ? undefined : (
            <Select value={effectiveId} onValueChange={setLabourerId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {state.labourers.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          label="Trade"
          value={subLabel ? `${tradeLabel} · ${subLabel}` : tradeLabel}
          tone="accent"
        />
        <KpiTile label="EP number" value={labourer.epNumber} />
        <KpiTile
          label="Days present (seed)"
          value={String(presentDays)}
          tone="ok"
        />
        <KpiTile
          label="Wages gist"
          value={formatINR(wageGist)}
          hint="From seeded attendance × daily rate"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">Gate pass</h3>
          <div className="rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] p-4">
            <div className="font-heading text-2xl font-bold">{labourer.name}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  RIL pass
                </div>
                <div className={labourer.rilStatus && /expired|hibernat/i.test(labourer.rilStatus) ? "font-semibold text-[var(--sge-crit)]" : "font-semibold"}>
                  {labourer.rilStatus ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  EP
                </div>
                <div className="font-mono font-semibold">{labourer.epNumber}</div>
              </div>
              {/* Owner 2026-10-14: EIC is the RIL contact, a fixed reference on the profile */}
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">EIC (RIL contact)</div>
                <div className="text-sm">{labourer.eic ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">Skill</div>
                <div className="text-sm">{skillLabel(labourer.skill)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  Trade
                </div>
                {canEditTrade ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Select
                      value={labourer.trade}
                      onValueChange={(v) => {
                        const def = state.tradeCatalogue.find((t) => t.id === v);
                        updateLabourer(labourer.id, {
                          trade: v,
                          tradeSubcategory: def?.subcategories[0]?.id,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {state.tradeCatalogue
                          .filter((t) => t.active)
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {tradeDef && tradeDef.subcategories.length > 0 ? (
                      <Select
                        value={labourer.tradeSubcategory ?? ""}
                        onValueChange={(v) =>
                          updateLabourer(labourer.id, {
                            tradeSubcategory: v || undefined,
                          })
                        }
                      >
                        <SelectTrigger className="h-8 w-[160px]">
                          <SelectValue placeholder="Sub-category" />
                        </SelectTrigger>
                        <SelectContent>
                          {tradeDef.subcategories.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    {tradeLabel}
                    {subLabel ? ` · ${subLabel}` : ""}
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                  Status
                </div>
                <StatusPill tone={labourer.active ? "ok" : "crit"}>
                  {labourer.active ? "active" : "inactive"}
                </StatusPill>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Assigned equipment
          </h3>
          {equipment.length === 0 ? (
            <EmptyState
              title="No equipment assigned"
              detail="Harness / hopper tags linked to this profile will show here."
            />
          ) : (
            equipment.map((e) => (
              <div
                key={e.id}
                className="mb-2 flex justify-between rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
              >
                <span>
                  {e.tag} · {e.type}
                </span>
                <StatusPill
                  tone={
                    e.status === "ok"
                      ? "ok"
                      : e.status === "due"
                        ? "warn"
                        : "crit"
                  }
                >
                  {e.status}
                </StatusPill>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Attendance history
        </h3>
        {history.length === 0 ? (
          <EmptyState
            title="No attendance yet"
            detail="Supervisor / HR mark attendance; history appears here."
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr>
                <th className="py-1">Date</th>
                <th>Status</th>
                <th>In</th>
                <th>Out</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id} className="border-t border-[var(--sge-line)]">
                  <td className="py-1.5 font-mono text-xs">{a.date}</td>
                  <td>
                    <StatusPill
                      tone={
                        a.status === "present"
                          ? "ok"
                          : a.status === "absent"
                            ? "crit"
                            : "warn"
                      }
                    >
                      {a.status}
                    </StatusPill>
                  </td>
                  <td className="font-mono text-xs">{a.inTime ?? "—"}</td>
                  <td className="font-mono text-xs">{a.outTime ?? "—"}</td>
                  <td className="text-[var(--sge-ink-2)]">{a.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

// Route guard: only roles that may use this page get past the URL
export default guarded("labourer", LabourerHomePage);
