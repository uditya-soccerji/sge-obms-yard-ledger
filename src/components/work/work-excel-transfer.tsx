"use client";

import { useMemo } from "react";
import { ExcelTransferPanel } from "@/components/shared/excel-transfer-panel";
import type { ExcelTransferSpec } from "@/lib/transfer-types";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { workTransferSpec, type WorkTransferId } from "@/lib/work-transfer";

/** Owner / Super Admin Excel transfer for one Work sheet. */
export function WorkExcelTransfer({ kind }: { kind: WorkTransferId }) {
  const { fullState } = useStore();
  const { work, importExcel } = useWork();
  const base = workTransferSpec(kind);

  const spec = useMemo((): ExcelTransferSpec | null => {
    if (!base) return null;
    const ctx = {
      work,
      sites: fullState.sites,
      staff: fullState.staff,
      setWork: () => {
        /* preview/export only — apply goes through importExcel */
      },
    };
    return {
      id: base.id,
      label: base.label,
      sheetName: base.sheetName,
      headers: base.headers,
      exportRows: () => base.exportRows({ ...ctx, work }),
      preview: (rows) => base.preview(rows, { ...ctx, work }),
      apply: (rows) => importExcel(kind, rows),
    };
  }, [base, work, fullState.sites, fullState.staff, importExcel, kind]);

  return <ExcelTransferPanel spec={spec} />;
}

/** Several Work sheets on one screen (e.g. DPR reports + entries). */
export function WorkExcelTransferStack({ kinds }: { kinds: WorkTransferId[] }) {
  return (
    <div className="space-y-1">
      {kinds.map((k) => (
        <div key={k}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
            {workTransferSpec(k)?.label}
          </p>
          <WorkExcelTransfer kind={k} />
        </div>
      ))}
    </div>
  );
}
