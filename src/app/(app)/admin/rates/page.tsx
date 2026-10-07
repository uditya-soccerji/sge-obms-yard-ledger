"use client";

import { useMemo, useState } from "react";
import {
  EmptyState,
  formatINR,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  currentRatesForSite,
  rateHistory,
} from "@/lib/rate-book";
import { PO_INGEST_SUMMARY, RATE_LINES_INGESTED } from "@/lib/rate-book-seed";
import { useStore } from "@/lib/store";

export default function RateBookPage() {
  const { state, upsertRateLine } = useStore();
  const canEdit =
    state.currentRole === "admin" ||
    state.currentRole === "super_admin" ||
    state.currentRole === "finance" ||
    state.currentRole === "owner";

  const [siteFilter, setSiteFilter] = useState(state.currentSiteId);
  const [q, setQ] = useState("");
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    poNumber: "",
    description: "",
    itemKey: "",
    uom: "m2",
    rateInr: "",
    effectiveFrom: "2026-10-05",
    sourceFile: "manual",
  });

  const current = useMemo(() => {
    const rows = currentRatesForSite(state.rateLines, siteFilter);
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.description.toLowerCase().includes(needle) ||
        r.itemKey.includes(needle) ||
        r.poNumber.includes(needle)
    );
  }, [state.rateLines, siteFilter, q]);

  const historyRows = useMemo(() => {
    if (!historyKey) return [];
    const [itemKey, uom] = historyKey.split("||");
    return rateHistory(state.rateLines, siteFilter, itemKey, uom);
  }, [historyKey, state.rateLines, siteFilter]);

  const poCount = useMemo(() => {
    const set = new Set(state.rateLines.map((r) => r.poNumber));
    return set.size;
  }, [state.rateLines]);

  function handleAdd() {
    const rateInr = Number(form.rateInr);
    if (!form.itemKey.trim() || !form.description.trim() || !rateInr) {
      setMsg("Item key, description, and rate are required.");
      return;
    }
    upsertRateLine({
      poNumber: form.poNumber.trim() || "MANUAL",
      siteIds: [siteFilter],
      itemKey: form.itemKey.trim(),
      description: form.description.trim(),
      uom: form.uom.trim() || "m2",
      rateInr,
      effectiveFrom: form.effectiveFrom,
      sourceFile: form.sourceFile || "manual",
    });
    setMsg(`Saved rate line ${form.itemKey} @ ${formatINR(rateInr)}`);
    setForm((f) => ({ ...f, description: "", itemKey: "", rateInr: "" }));
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Rate book"
        subtitle="Versioned PO / work-order rates. Latest rate wins per site + item + UOM; full history kept for audit."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Rate lines" value={String(state.rateLines.length)} />
        <KpiTile
          label="Current @ site"
          value={String(current.length)}
          tone="accent"
        />
        <KpiTile label="PO sources" value={String(poCount)} tone="ok" />
        <KpiTile
          label="Ingested seed"
          value={String(RATE_LINES_INGESTED)}
          hint="From Desktop PO PDFs"
        />
      </div>

      <Panel>
        <h3 className="mb-2 font-heading text-sm font-bold">PO ingest status</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
              <tr>
                <th className="py-1">File</th>
                <th>PO</th>
                <th>Sites</th>
                <th>Lines</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {PO_INGEST_SUMMARY.map((row) => (
                <tr key={row.file} className="border-t border-[var(--sge-line)]">
                  <td className="max-w-[220px] truncate py-1.5 font-mono text-xs">
                    {row.file}
                  </td>
                  <td className="font-mono text-xs">{row.po ?? "—"}</td>
                  <td className="text-xs">
                    {(row.sites ?? []).join(", ") || "—"}
                  </td>
                  <td>{row.count}</td>
                  <td>
                    <StatusPill tone={row.status === "ok" ? "ok" : "warn"}>
                      {row.status}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Site</Label>
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="mt-1 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.sites
                .filter((s) => s.enabled)
                .map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px] flex-1">
          <Label>Search</Label>
          <Input
            className="mt-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Item key, description, PO…"
          />
        </div>
      </div>

      {canEdit ? (
        <Panel className="space-y-3">
          <h3 className="font-heading text-sm font-bold">
            Add / edit rate line (manual)
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label>PO number</Label>
              <Input
                className="mt-1"
                value={form.poNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, poNumber: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Item key</Label>
              <Input
                className="mt-1"
                value={form.itemKey}
                onChange={(e) =>
                  setForm((f) => ({ ...f, itemKey: e.target.value }))
                }
                placeholder="Service code"
              />
            </div>
            <div>
              <Label>UOM</Label>
              <Input
                className="mt-1"
                value={form.uom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, uom: e.target.value }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description</Label>
              <Input
                className="mt-1"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Rate ₹</Label>
              <Input
                type="number"
                className="mt-1"
                value={form.rateInr}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rateInr: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Effective from</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.effectiveFrom}
                onChange={(e) =>
                  setForm((f) => ({ ...f, effectiveFrom: e.target.value }))
                }
              />
            </div>
            <div>
              <Label>Source file</Label>
              <Input
                className="mt-1"
                value={form.sourceFile}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sourceFile: e.target.value }))
                }
              />
            </div>
          </div>
          <Button type="button" onClick={handleAdd}>
            Save rate line
          </Button>
        </Panel>
      ) : null}

      <Panel>
        <h3 className="mb-3 font-heading text-sm font-bold">
          Current rates —{" "}
          {state.sites.find((s) => s.id === siteFilter)?.code ?? siteFilter}
        </h3>
        {current.length === 0 ? (
          <EmptyState
            title="No rates for this site"
            detail="Jetty / Gagva may be empty until a PO maps here, or add a manual line."
          />
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--sge-surface)] text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr>
                  <th className="py-1 pr-2">Item</th>
                  <th className="pr-2">UOM</th>
                  <th className="pr-2">Rate</th>
                  <th className="pr-2">PO</th>
                  <th className="pr-2">From</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {current.slice(0, 200).map((r) => (
                  <tr key={r.id} className="border-t border-[var(--sge-line)]">
                    <td className="max-w-[280px] truncate py-1.5 pr-2">
                      <div className="truncate font-medium">{r.description}</div>
                      <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">
                        {r.itemKey}
                      </div>
                    </td>
                    <td className="pr-2 font-mono text-xs">{r.uom}</td>
                    <td className="pr-2 font-semibold">
                      {formatINR(r.rateInr)}
                    </td>
                    <td className="pr-2 font-mono text-xs">{r.poNumber}</td>
                    <td className="pr-2 text-xs">{r.effectiveFrom}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          setHistoryKey(`${r.itemKey}||${r.uom}`)
                        }
                      >
                        History
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {current.length > 200 ? (
              <p className="mt-2 text-xs text-[var(--sge-ink-3)]">
                Showing 200 of {current.length} — refine search to narrow.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      {historyKey ? (
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-bold">
              History — {historyKey.replace("||", " / ")}
            </h3>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setHistoryKey(null)}
            >
              Close
            </Button>
          </div>
          {historyRows.length === 0 ? (
            <EmptyState title="No history" detail="No versions for this key." />
          ) : (
            <div className="space-y-1">
              {historyRows.map((h) => (
                <div
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--sge-line)] px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-semibold">{formatINR(h.rateInr)}</div>
                    <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
                      PO {h.poNumber} · {h.effectiveFrom} · {h.sourceFile}
                    </div>
                  </div>
                  <StatusPill tone={h.superseded ? "warn" : "ok"}>
                    {h.superseded ? "superseded" : "current"}
                  </StatusPill>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
