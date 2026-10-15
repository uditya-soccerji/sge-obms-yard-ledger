/**
 * Excel (.xlsx) download and upload helpers.
 * Only Owner and Super Admin may use these (docs — bulk data transfer).
 */
import * as XLSX from "xlsx";
import type { RoleId } from "./types";

export function canExcelTransfer(role: RoleId | null | undefined): boolean {
  return role === "owner" || role === "super_admin";
}

export type SheetRows = { name: string; rows: Record<string, string | number | boolean | null | undefined>[] };

/** Build a workbook and trigger a browser download. */
export function downloadXlsx(filename: string, sheets: SheetRows[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const rows = s.rows.length
      ? s.rows
      : [{}]; // empty sheet still gets headers if we pass a header-only row from callers
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31) || "Sheet1");
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Download with an explicit header order (empty data still exports the template columns). */
export function downloadXlsxWithHeaders(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Record<string, string | number | boolean | null | undefined>[]
) {
  const aoa: (string | number | boolean | null | undefined)[][] = [headers];
  for (const r of rows) {
    aoa.push(headers.map((h) => (r[h] == null ? "" : r[h])));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || "Sheet1");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

export type ParsedSheet = { name: string; rows: Record<string, string>[] };

/** Read the first sheet (or all) from an .xlsx / .xls / .csv file as string-keyed rows. */
export async function readSpreadsheet(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
      raw: false,
    });
    const rows = raw.map((r) => {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) {
        out[String(k).trim()] = v == null ? "" : String(v).trim();
      }
      return out;
    });
    return { name, rows };
  });
}

/** Case-insensitive header lookup. */
export function cell(row: Record<string, string>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const want of names) {
    const hit = keys.find((k) => k.toLowerCase() === want.toLowerCase());
    if (hit && row[hit] !== "") return row[hit];
  }
  return "";
}
