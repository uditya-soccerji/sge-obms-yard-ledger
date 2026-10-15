/** Shared Excel/CSV transfer preview types (Master, Work, Operations). */

export type RowStatus = "new" | "update" | "duplicate" | "error";

export interface TransferPreviewRow {
  line: number;
  status: RowStatus;
  key: string;
  summary: string;
  detail?: string;
  /** Payload ready for apply (shape depends on sheet) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

export interface ExcelTransferSpec {
  id: string;
  label: string;
  sheetName: string;
  headers: string[];
  exportRows: () => Record<string, string | number | boolean | null | undefined>[];
  preview: (rows: Record<string, string>[]) => TransferPreviewRow[];
  /** Apply new/update rows; caller passes only those statuses */
  apply: (
    rows: TransferPreviewRow[]
  ) =>
    | { ok: boolean; error?: string; added?: number; updated?: number }
    | Promise<{ ok: boolean; error?: string; added?: number; updated?: number }>;
}
