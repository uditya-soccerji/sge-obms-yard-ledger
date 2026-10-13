"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { checkImport, parseCsv, skillLabel, TEMPLATE_CSV, type ImportRow } from "@/lib/labour-import";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Bulk labourer upload (B09). Our template or RIL's "Employee Details" export,
 * saved as CSV. Every row is checked; only good rows (and ticked possible
 * duplicates) are added. EPs already used, now or before, are refused.
 */
export function LabourImport({ onClose }: { onClose: () => void }) {
  const { fullState: state, importLabourers } = useStore();
  const siteId = entrySiteId(state);
  const site = state.sites.find((s) => s.id === siteId);
  const [file, setFile] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [addTrades, setAddTrades] = useState(true);
  const [keep, setKeep] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState<"all" | "errors" | "dupes">("all");

  const result = text
    ? checkImport(parseCsv(text), {
        defaultSiteId: siteId,
        sites: state.sites,
        labourers: state.labourers,
        trades: state.tradeCatalogue,
        contractors: state.masterCatalog.contractors,
        staff: state.staff,
        addMissingTrades: addTrades,
      })
    : null;
  const rows = result?.rows ?? [];
  const ready = rows.filter((r) => r.labourer && (!r.possibleDuplicate || keep[r.line]));
  const errors = rows.filter((r) => r.errors.length).length;
  const dupes = rows.filter((r) => !r.errors.length && r.possibleDuplicate).length;
  const newTrades = [...new Map(ready.filter((r) => r.newTrade).map((r) => [r.newTrade!.id, r.newTrade!])).values()];
  const bySite = ready.reduce<Record<string, number>>((m, r) => ({ ...m, [r.siteCode]: (m[r.siteCode] ?? 0) + 1 }), {});
  const visible = rows.filter((r) => (show === "errors" ? r.errors.length : show === "dupes" ? !r.errors.length && r.possibleDuplicate : true));

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setKeep({});
    if (!/\.csv$/i.test(f.name)) {
      setText(null);
      return setMsg({ ok: false, text: "Choose a .csv file — in Excel use File → Save As → CSV (Comma delimited)." });
    }
    setFile(f.name);
    setText(await f.text());
  }

  function add() {
    const res = importLabourers(ready.map((r) => r.labourer!), newTrades, file);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Not added" });
    setMsg({
      ok: true,
      text: `Added ${res.added} labourer${res.added === 1 ? "" : "s"} (${Object.entries(bySite).map(([k, v]) => `${k} ${v}`).join(", ")})${newTrades.length ? ` and ${newTrades.length} new trade${newTrades.length === 1 ? "" : "s"}` : ""}.`,
    });
    setText(null);
  }

  function template() {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "labourers-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Panel className="mb-3 border-dashed">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide">Upload labourers (CSV)</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={template}>Download template</Button>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={onClose}>Close</Button>
      </div>
      <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
        Our template, or RIL&apos;s Employee Details export as it is — in Excel: File → Save As → CSV. Name, EP and Trade are needed.
        Site comes from the Site column, else RIL&apos;s area (DTA / PCG / SOLAR), else {site?.code ?? "the site you're on"}. No contractor = SGE (own).
        An EP already used, now or before, is refused; the same Name + Trade + Skill as someone registered needs your tick.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input aria-label="CSV file" type="file" accept=".csv,text/csv" onChange={(e) => void pick(e.target.files?.[0])} />
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" aria-label="Add missing trades" checked={addTrades} onChange={(e) => setAddTrades(e.target.checked)} />
          Add trades that aren&apos;t in Master Data yet
        </label>
      </div>
      {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      {result?.missingColumns.length ? (
        <p className="mt-2 text-sm text-[var(--sge-crit)]">The file is missing column(s): {result.missingColumns.join(", ")}.</p>
      ) : null}
      {text && rows.length ? (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">{file}</span>
            <StatusPill tone="ok">{rows.filter((r) => r.labourer && !r.possibleDuplicate).length} ready</StatusPill>
            {dupes ? <StatusPill tone="warn">{dupes} possible duplicate{dupes === 1 ? "" : "s"}</StatusPill> : null}
            {errors ? <StatusPill tone="crit">{errors} with errors (skipped)</StatusPill> : null}
            {newTrades.length ? <span className="text-[var(--sge-ink-3)]">{newTrades.length} new trade{newTrades.length === 1 ? "" : "s"}</span> : null}
            <span className="text-[var(--sge-ink-3)]">{Object.entries(bySite).map(([k, v]) => `${k} ${v}`).join(" · ")}</span>
            <Button size="sm" className="ml-auto h-8" disabled={!ready.length} onClick={add}>
              Add {ready.length} labourer{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
          <div className="mb-1 flex gap-1">
            {(["all", "errors", "dupes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setShow(v)}
                className={cn("rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase", show === v ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]" : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)]")}
              >
                {v === "all" ? `All (${rows.length})` : v === "errors" ? `Errors (${errors})` : `Possible duplicates (${dupes})`}
              </button>
            ))}
          </div>
          <div className="max-h-96 overflow-auto rounded-sm border border-[var(--sge-line)]">
            <table className="w-full min-w-[860px] text-xs [&_td]:px-2 [&_th]:px-2">
              <thead className="sticky top-0 bg-[var(--sge-paper-2)] text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                <tr>
                  <th className="py-1">Line</th>
                  <th>Name</th>
                  <th>EP</th>
                  <th>Trade</th>
                  <th>Skill</th>
                  <th>Site</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 400).map((r: ImportRow) => (
                  <tr
                    key={r.line}
                    className={cn(
                      "border-t border-[var(--sge-line)] align-top",
                      r.errors.length ? "bg-[var(--sge-crit-wash)]" : r.possibleDuplicate ? "bg-[var(--sge-warn-wash)]" : ""
                    )}
                  >
                    <td className="py-1 font-mono">{r.line}</td>
                    <td className="py-1">{r.name || "—"}</td>
                    <td className="py-1 font-mono">{r.ep || "—"}</td>
                    <td className="py-1">{r.trade}{r.newTrade ? <span className="ml-1 text-[var(--sge-brass-ink)]">(new)</span> : null}</td>
                    <td className="py-1">{r.labourer ? skillLabel(r.labourer.skill) : r.skill}</td>
                    <td className="py-1">{r.siteCode || "—"}</td>
                    <td className="py-1">
                      {r.errors.length ? (
                        <span className="text-[var(--sge-crit)]">{r.errors.join("; ")}</span>
                      ) : r.possibleDuplicate ? (
                        <label className="flex items-start gap-1.5 text-[var(--sge-brass-ink)]">
                          <input type="checkbox" aria-label={`Add line ${r.line} anyway`} checked={!!keep[r.line]} onChange={(e) => setKeep({ ...keep, [r.line]: e.target.checked })} />
                          <span>{r.possibleDuplicate} — tick to add anyway</span>
                        </label>
                      ) : (
                        <span className="text-[var(--sge-ok)]">OK<span className="text-[var(--sge-ink-3)]">{r.notes.length ? ` · ${r.notes.join(", ")}` : ""}</span></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length > 400 ? <p className="p-2 text-xs text-[var(--sge-ink-3)]">Showing the first 400 of {visible.length} rows — all are checked and counted above.</p> : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
