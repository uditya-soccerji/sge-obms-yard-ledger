"use client";

import { useMemo } from "react";
import { ExcelTransferPanel } from "@/components/shared/excel-transfer-panel";
import type { ExcelTransferSpec } from "@/lib/transfer-types";
import { useStore } from "@/lib/store";
import { opsTransferSpec, type OpsTransferId } from "@/lib/ops-transfer";

/** Owner / Super Admin Excel transfer for one Operations sheet. */
export function OpsExcelTransfer({ kind }: { kind: OpsTransferId }) {
  const { fullState, importOpsExcel } = useStore();
  const base = opsTransferSpec(kind);

  const spec = useMemo((): ExcelTransferSpec | null => {
    if (!base) return null;
    const ctx = {
      state: fullState,
      setState: () => {
        /* preview/export only */
      },
    };
    return {
      id: base.id,
      label: base.label,
      sheetName: base.sheetName,
      headers: base.headers,
      exportRows: () => base.exportRows(ctx),
      preview: (rows) => base.preview(rows, ctx),
      apply: (rows) => importOpsExcel(kind, rows),
    };
  }, [base, fullState, importOpsExcel, kind]);

  return <ExcelTransferPanel spec={spec} />;
}

export function OpsExcelTransferStack({ kinds }: { kinds: OpsTransferId[] }) {
  return (
    <div className="space-y-1">
      {kinds.map((k) => (
        <div key={k}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
            {opsTransferSpec(k)?.label}
          </p>
          <OpsExcelTransfer kind={k} />
        </div>
      ))}
    </div>
  );
}
