"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { checkImport, parseCsv, skillLabel, TEMPLATE_CSV, type ImportRow } from "@/lib/labour-import";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Bulk labourer upload (B09). Pick a CSV (Excel → Save As → CSV), see every
 * row checked, then add only the good rows. EPs already used (current or old)
 * are refused; same Name + Trade + Skill rows wait for "add anyway".
 */
export function LabourImport({ onClose }: { onClose: () => void }) {
  const { fullState: state, importLabourers } = useStore();
  const siteId = entrySiteId(state);
  const site = state.sites.find((s) => s.id === siteId);
  const [file, setFile] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [keep, setKeep] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setKeep({});
    if (!/\.csv$/i.test(f.name)) {
      setRows(null);
      return setMsg({ ok: false, text: "Choose a .csv file — in Excel use File → Save As → CSV (Comma delimited)." });
    }
    const text = await f.text();
    const res = checkImport(parseCsv(text), {
      siteId,
      labourers: state.labourers,
      trades: state.tradeCatalogue,
      contractors: state.masterCatalog.contractors,
      supervisors: state.staff.filter((s) => s.role === "supervisor" && s.siteId === siteId),
    });
    setFile(f.name);
    setMissing(res.missingColumns);
    setRows(res.rows);
  }

  const ready = (rows ?? []).filter((r) => r.labourer && (!r.possibleDuplicate || keep[r.line]));
  const errors = (rows ?? []).filter((r) => r.errors.length).length;
  const dupes = (rows ?? []).filter((r) => !r.errors.length && r.possibleDuplicate).length;

  function add() {
    const res = importLabourers(ready.map((r) => r.labourer!), file);
    if (!res.ok) return setMsg({ ok: false, text: res.error ?? "Not added" });
    setMsg({ ok: true, text: `Added ${res.added} labourer${res.added === 1 ? "" : "s"} to ${site?.code ?? "the site"}.` });
    setRows(null);
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
        <h3 className="font-heading text-sm font-bold uppercase tracking-wide">Upload labourers (CSV) · {site?.code}</h3>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={template}>Download template</Button>
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={onClose}>Close</Button>
      </div>
      <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
        Columns: Name, EP number, Trade, Skill level, Contractor, Supervisor (optional), Daily wage (optional). From Excel: File → Save As → CSV.
        Rows with an EP already used (now or before) are refused; the same Name + Trade + Skill as someone registered needs your tick.
      </p>
      <input
        aria-label="CSV file"
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {msg ? <p className={cn("mt-2 text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      {missing.length ? (
        <p className="mt-2 text-sm text-[var(--sge-crit)]">The file is missing column(s): {missing.join(", ")}. Use the template headings.</p>
      ) : null}
      {rows ? (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold">{file}</span>
            <StatusPill tone="ok">{(rows ?? []).filter((r) => r.labourer && !r.possibleDuplicate).length} ready</StatusPill>
            {dupes ? <StatusPill tone="warn">{dupes} possible duplicate{dupes === 1 ? "" : "s"}</StatusPill> : null}
            {errors ? <StatusPill tone="crit">{errors} with errors (skipped)</StatusPill> : null}
            <Button size="sm" className="ml-auto h-8" disabled={!ready.length} onClick={add}>
              Add {ready.length} labourer{ready.length === 1 ? "" : "s"}
            </Button>
          </div>
          <div className="max-h-80 overflow-auto rounded-sm border border-[var(--sge-line)]">
            <table className="w-full min-w-[760px] text-xs [&_td]:px-2 [&_th]:px-2">
              <thead className="sticky top-0 bg-[var(--sge-paper-2)] text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                <tr>
                  <th className="px-2 py-1">Line</th>
                  <th>Name</th>
                  <th>EP</th>
                  <th>Trade</th>
                  <th>Skill</th>
                  <th>Contractor</th>
                  <th>Supervisor</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.line}
                    className={cn(
                      "border-t border-[var(--sge-line)] align-top",
                      r.errors.length ? "bg-[var(--sge-crit-wash)]" : r.possibleDuplicate ? "bg-[var(--sge-warn-wash)]" : ""
                    )}
                  >
                    <td className="px-2 py-1 font-mono">{r.line}</td>
                    <td className="py-1">{r.name || "—"}</td>
                    <td className="py-1 font-mono">{r.ep || "—"}</td>
                    <td className="py-1">{r.trade}</td>
                    <td className="py-1">{r.labourer ? skillLabel(r.labourer.skill) : r.skill}</td>
                    <td className="py-1">{r.contractor}</td>
                    <td className="py-1">{r.supervisor || "—"}</td>
                    <td className="py-1 pr-2">
                      {r.errors.length ? (
                        <span className="text-[var(--sge-crit)]">{r.errors.join("; ")}</span>
                      ) : r.possibleDuplicate ? (
                        <label className="flex items-start gap-1.5 text-[var(--sge-brass-ink)]">
                          <input
                            type="checkbox"
                            aria-label={`Add line ${r.line} anyway`}
                            checked={!!keep[r.line]}
                            onChange={(e) => setKeep({ ...keep, [r.line]: e.target.checked })}
                          />
                          <span>{r.possibleDuplicate} — tick to add anyway</span>
                        </label>
                      ) : (
                        <span className="text-[var(--sge-ok)]">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
