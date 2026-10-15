"use client";

import { useMemo } from "react";
import { ExcelTransferPanel } from "@/components/shared/excel-transfer-panel";
import { transferSpec } from "@/lib/master-transfer";
import type { MasterSheetId } from "@/lib/master/types";
import type { ExcelTransferSpec, TransferPreviewRow } from "@/lib/transfer-types";
import { useStore } from "@/lib/store";
import type { RoleId } from "@/lib/types";

/** Master Data sheet Excel transfer (Owner / Super Admin). */
export function ExcelTransfer({ sheet }: { sheet: MasterSheetId }) {
  const store = useStore();
  const state = store.fullState;

  const spec = useMemo((): ExcelTransferSpec | null => {
    const base = transferSpec(sheet);
    if (!base) return null;
    return {
      id: base.id,
      label: base.label,
      sheetName: base.sheetName,
      headers: base.headers,
      exportRows: () => base.exportRows(state),
      preview: (rows) => base.preview(rows, state),
      apply: (rows) => applyMasterRows(sheet, rows, store),
    };
  }, [sheet, state, store]);

  return <ExcelTransferPanel spec={spec} />;
}

type StoreApi = ReturnType<typeof useStore>;

async function applyMasterRows(
  sheet: MasterSheetId,
  rows: TransferPreviewRow[],
  store: StoreApi
): Promise<{ ok: boolean; error?: string; added?: number; updated?: number }> {
  let added = 0;
  let updated = 0;
  for (const r of rows) {
    const p = r.payload;
    if (!p) continue;
    const res = await applyOne(sheet, p, store);
    if (!res.ok) return { ok: false, error: res.error ?? `Stopped at line ${r.line}` };
    if (r.status === "new") added += 1;
    else updated += 1;
  }
  return { ok: true, added, updated };
}

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
      const role = String(p.role) as RoleId;
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
