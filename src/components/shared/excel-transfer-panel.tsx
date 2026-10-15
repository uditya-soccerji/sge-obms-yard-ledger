"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { canExcelTransfer, downloadXlsxWithHeaders, readSpreadsheet } from "@/lib/excel-io";
import type { ExcelTransferSpec, TransferPreviewRow } from "@/lib/transfer-types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Owner / Super Admin only: download Excel (current data or blank template)
 * and upload Excel/CSV with duplicate checks before anything is written.
 */
export function ExcelTransferPanel({
  spec,
  note,
}: {
  spec: ExcelTransferSpec | null | undefined;
  note?: string;
}) {
  const { state, currentAccount } = useStore();
  const role = state.currentRole;
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<TransferPreviewRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canExcelTransfer(role) || !spec) return null;

  const data = spec.exportRows();
  const toApply = (preview ?? []).filter((r) => r.status === "new" || r.status === "update");
  const counts = {
    new: (preview ?? []).filter((r) => r.status === "new").length,
    update: (preview ?? []).filter((r) => r.status === "update").length,
    duplicate: (preview ?? []).filter((r) => r.status === "duplicate").length,
    error: (preview ?? []).filter((r) => r.status === "error").length,
  };

  function download(kind: "data" | "template") {
    downloadXlsxWithHeaders(
      `${spec!.id}-${kind === "template" ? "template" : "export"}.xlsx`,
      spec!.sheetName,
      spec!.headers,
      kind === "template" ? [] : data
    );
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMsg(null);
    setPreview(null);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      return setMsg({ ok: false, text: "Choose an .xlsx or .csv file" });
    }
    setFileName(f.name);
    try {
      const sheets = await readSpreadsheet(f);
      const first = sheets[0];
      if (!first?.rows.length) return setMsg({ ok: false, text: "File has no data rows" });
      setPreview(spec!.preview(first.rows));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read file" });
    }
  }

  async function apply() {
    if (!toApply.length) return setMsg({ ok: false, text: "Nothing new to upload — duplicates were skipped" });
    setBusy(true);
    try {
      const res = await spec!.apply(toApply);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "Upload failed" });
        return;
      }
      setMsg({
        ok: true,
        text: `Uploaded: ${res.added ?? 0} new${res.updated ? `, ${res.updated} updated` : ""}. Duplicates were not written again.`,
      });
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" type="button" onClick={() => download("data")}>
          Download Excel
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={() => download("template")}>
          Blank template
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={() => {
            setOpen(!open);
            setMsg(null);
            setPreview(null);
          }}
        >
          {open ? "Close upload" : "Upload Excel"}
        </Button>
        <span className="text-[10px] text-[var(--sge-ink-3)]">
          Owner / Super Admin only · {currentAccount?.name}
        </span>
      </div>
      {open ? (
        <Panel>
          <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
            {note ??
              `Upload fills or updates ${spec.label}. Rows already in the system are marked duplicate and are not uploaded again. Download the template for the column names.`}
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full text-xs"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          {fileName ? <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">{fileName}</p> : null}
          {preview ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <StatusPill tone="ok">{counts.new} new</StatusPill>
                <StatusPill tone="warn">{counts.update} update</StatusPill>
                <StatusPill>{counts.duplicate} duplicate (skipped)</StatusPill>
                {counts.error ? <StatusPill tone="crit">{counts.error} error</StatusPill> : null}
              </div>
              <div className="max-h-48 overflow-auto rounded-sm border border-[var(--sge-line)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[var(--sge-linen)] text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                      <th className="px-2 py-1">Line</th>
                      <th>Status</th>
                      <th>Row</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 80).map((r) => (
                      <tr key={`${r.line}-${r.key}`} className="border-t border-[var(--sge-line)]">
                        <td className="px-2 py-1 tabular-nums">{r.line}</td>
                        <td>
                          <span
                            className={cn(
                              r.status === "new" && "text-[var(--sge-ok)]",
                              r.status === "update" && "text-[var(--sge-brass-ink)]",
                              r.status === "duplicate" && "text-[var(--sge-ink-3)]",
                              r.status === "error" && "text-[var(--sge-crit)]"
                            )}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td>{r.summary}</td>
                        <td className="text-[var(--sge-ink-3)]">{r.detail ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 80 ? (
                  <p className="px-2 py-1 text-[10px] text-[var(--sge-ink-3)]">
                    Showing first 80 of {preview.length}
                  </p>
                ) : null}
              </div>
              <Button size="sm" disabled={busy || !toApply.length} onClick={() => void apply()}>
                {busy ? "Uploading…" : `Upload ${toApply.length} row${toApply.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          ) : null}
          {msg ? (
            <p className={cn("mt-2 text-xs", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
