"use client";

import { useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { canExcelTransfer, downloadXlsxWithHeaders, readSpreadsheet } from "@/lib/excel-io";
import { transferSpec, type TransferPreviewRow } from "@/lib/master-transfer";
import type { MasterSheetId } from "@/lib/master/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Owner / Super Admin only: download Excel (current data or blank template)
 * and upload Excel with duplicate checks before anything is written.
 */
export function ExcelTransfer({ sheet }: { sheet: MasterSheetId }) {
  const { fullState: state, currentAccount } = useStore();
  const role = state.currentRole;
  const spec = transferSpec(sheet);
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<TransferPreviewRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canExcelTransfer(role) || !spec) return null;

  const data = spec.exportRows(state);
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
      setPreview(spec!.preview(first.rows, state));
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read file" });
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
        <Button size="sm" variant="outline" type="button" onClick={() => { setOpen(!open); setMsg(null); setPreview(null); }}>
          {open ? "Close upload" : "Upload Excel"}
        </Button>
        <span className="text-[10px] text-[var(--sge-ink-3)]">
          Owner / Super Admin only · {currentAccount?.name}
        </span>
      </div>
      {open ? (
        <Panel>
          <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
            Upload fills or updates {spec.label}. Rows already in the system are marked duplicate and are not uploaded again. Download the template for the column names.
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
                  <p className="px-2 py-1 text-[10px] text-[var(--sge-ink-3)]">Showing first 80 of {preview.length}</p>
                ) : null}
              </div>
              <ApplyButton sheet={sheet} rows={toApply} busy={busy} setBusy={setBusy} setMsg={setMsg} onDone={() => setPreview(null)} />
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

function ApplyButton({
  sheet,
  rows,
  busy,
  setBusy,
  setMsg,
  onDone,
}: {
  sheet: MasterSheetId;
  rows: TransferPreviewRow[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  setMsg: (m: { ok: boolean; text: string } | null) => void;
  onDone: () => void;
}) {
  const store = useStore();

  async function apply() {
    if (!rows.length) return setMsg({ ok: false, text: "Nothing new to upload — duplicates were skipped" });
    setBusy(true);
    try {
      let added = 0;
      let updated = 0;
      for (const r of rows) {
        const p = r.payload;
        if (!p) continue;
        const res = await applyOne(sheet, p, store);
        if (!res.ok) {
          setMsg({ ok: false, text: res.error ?? `Stopped at line ${r.line}` });
          setBusy(false);
          return;
        }
        if (r.status === "new") added += 1;
        else updated += 1;
      }
      setMsg({
        ok: true,
        text: `Uploaded: ${added} new${updated ? `, ${updated} updated` : ""}. Duplicates were not written again.`,
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" disabled={busy || !rows.length} onClick={() => void apply()}>
      {busy ? "Uploading…" : `Upload ${rows.length} row${rows.length === 1 ? "" : "s"}`}
    </Button>
  );
}

type StoreApi = ReturnType<typeof useStore>;

async function applyOne(
  sheet: MasterSheetId,
  p: Record<string, unknown>,
  store: StoreApi
): Promise<{ ok: boolean; error?: string }> {
  switch (sheet) {
    case "sites": {
      const code = String(p.code);
      const existing = store.fullState.sites.find((s) => s.code === code);
      return store.upsertSite({
        id: existing?.id ?? `site-${code.toLowerCase()}`,
        code,
        name: String(p.name),
        client: String(p.client ?? "RIL"),
        enabled: Boolean(p.enabled),
        plants: (p.plants as string[]) ?? existing?.plants ?? [],
        rpTags: (p.rpTags as string[]) ?? existing?.rpTags ?? [],
        plantDetails: existing?.plantDetails ?? [],
      });
    }
    case "users": {
      const role = String(p.role) as import("@/lib/types").RoleId;
      return store.createUser({
        username: String(p.username),
        name: String(p.name),
        password: String(p.password),
        roles: [role],
        siteIds: (p.siteIds as string[]) ?? [],
        plantIds: [],
        permissionOverrides: [],
        active: Boolean(p.active ?? true),
      });
    }
    case "labourers":
      return store.addLabourer(p as Parameters<StoreApi["addLabourer"]>[0]);
    case "contractors": {
      const row = {
        id: (p.id as string) || `con-${String(p.code).toLowerCase()}`,
        code: String(p.code),
        name: String(p.name),
        gstin: p.gstin as string | undefined,
        siteId: (p.siteId as string | null) ?? null,
        active: Boolean(p.active),
      };
      return store.upsertContractor(row);
    }
    case "trades":
      return store.addTrade({
        id: p.id as string | undefined,
        label: String(p.label),
        subcategories: (p.subcategories as { id: string; label: string }[]) ?? [],
        active: Boolean(p.active ?? true),
        siteId: null,
      });
    case "wageBands":
      return store.upsertWageBand({
        id: p.id as string | undefined,
        tradeId: String(p.tradeId),
        skill: p.skill as Parameters<StoreApi["upsertWageBand"]>[0]["skill"],
        experience: p.experience as Parameters<StoreApi["upsertWageBand"]>[0]["experience"],
        dailyWage: Number(p.dailyWage),
        active: Boolean(p.active ?? true),
        note: p.note as string | undefined,
      });
    case "materials": {
      const row = {
        id: (p.id as string) || `mat-${String(p.code).toLowerCase()}`,
        code: String(p.code),
        label: String(p.label),
        sapCode: String(p.sapCode ?? ""),
        paintSystem: String(p.paintSystem ?? ""),
        uom: String(p.uom ?? "L"),
        siteId: (p.siteId as string | null) ?? null,
        active: Boolean(p.active ?? true),
        varianceTolerancePct: p.varianceTolerancePct as number | undefined,
      };
      return store.upsertMaterial(row);
    }
    case "rateBook":
      store.upsertRateLine({
        poNumber: String(p.poNumber),
        itemKey: String(p.itemKey),
        description: String(p.description),
        uom: String(p.uom),
        rateInr: Number(p.rateInr),
        effectiveFrom: String(p.effectiveFrom),
        siteIds: (p.siteIds as string[]) ?? [],
        sourceFile: String(p.sourceFile ?? "excel-upload"),
      });
      return { ok: true };
    case "dprTypes":
    case "activityTemplates":
    case "units":
    case "storeBooks":
    case "fimStages":
    case "safetyFormCodes":
    case "shiftTypes":
    case "attendanceStatuses": {
      const row = {
        id: (p.id as string) || `cat-${String(p.code).toLowerCase()}`,
        code: String(p.code),
        label: String(p.label),
        siteId: (p.siteId as string | null) ?? null,
        active: Boolean(p.active ?? true),
        note: p.note as string | undefined,
      };
      return store.upsertCatalogItem(sheet, row);
    }
    default:
      return { ok: false, error: "This sheet has no upload handler yet" };
  }
}
