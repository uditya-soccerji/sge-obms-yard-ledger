/**
 * Monthly pay upload (docs §24): Admin or HR upload one CSV a month with each
 * labourer's pay lines; Finance is told. Matched by EP (current or old). Only new
 * or changed lines are applied — the same labourer, month, line and amount is
 * "already uploaded" and says by whom.
 */
import { normalizeEp } from "./ep";
import { showDate } from "./gate-pass";
import { parseCsv } from "./labour-import";
import { realToday } from "./today";
import type { Labourer, WageLedgerEntry } from "./types";

export type PayKind = WageLedgerEntry["kind"];

/** Pay columns, in the order the profile shows them; header names the file may use */
export const PAY_COLUMNS: { kind: PayKind; label: string; headers: string[] }[] = [
  { kind: "salary", label: "Wage", headers: ["wage", "salary", "basic", "gross wage", "wages"] },
  { kind: "ot", label: "OT", headers: ["ot", "ot amount", "overtime", "ot wage"] },
  { kind: "bonus", label: "Bonus", headers: ["bonus"] },
  { kind: "incentive", label: "Incentive", headers: ["incentive", "incentives"] },
  { kind: "advance", label: "Advance", headers: ["advance", "advances", "advance recovery"] },
  { kind: "pf", label: "PF", headers: ["pf", "epf", "provident fund"] },
  { kind: "room_rent", label: "Room rent", headers: ["room rent", "room", "rent", "accommodation"] },
  { kind: "travel", label: "Travel", headers: ["travel", "travelling", "conveyance"] },
  { kind: "food", label: "Food", headers: ["food", "mess", "canteen"] },
  { kind: "deduction", label: "Other deductions", headers: ["deduction", "deductions", "other deduction", "other deductions"] },
];

const EP_HEADERS = ["ep number", "ep no", "ep no.", "ep", "worker id", "ep_number"];
const MONTH_HEADERS = ["month", "pay month", "salary month", "period"];
const NAME_HEADERS = ["name", "full name", "labourer name", "worker name"];

export const PAY_TEMPLATE_CSV =
  "EP Number,Name,Month," + PAY_COLUMNS.map((c) => c.label).join(",") + "\n" +
  "PP5920000000,Example Name,2026-10,15600,1620,,500,2000,1872,1200,,1500,\n";

const norm = (s: string) => s.trim().toLowerCase().replace(/[_\s]+/g, " ");
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "2026-10", "10/2026", "10-2026", "Oct 2026", "October-2026", "Oct-26" → "2026-10" */
export function parseMonth(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^([A-Za-z]{3})[A-Za-z]*[-\s,']*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    if (mon) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(mon).padStart(2, "0")}`;
  }
  return null;
}

export interface PayLine {
  kind: PayKind;
  amount: number;
  /** new: not there yet · changed: there with another amount · same: already uploaded */
  state: "new" | "changed" | "same";
  existingId?: string;
  was?: number;
  by?: string;
}

export interface PayRow {
  line: number;
  ep: string;
  name: string;
  month: string;
  labourerId?: string;
  errors: string[];
  lines: PayLine[];
}

export function checkPayImport(text: string, labourers: Labourer[], ledger: WageLedgerEntry[]): { rows: PayRow[]; missing: string[] } {
  const [head = [], ...body] = parseCsv(text);
  const h = head.map(norm);
  const find = (names: string[]) => h.findIndex((x) => names.includes(x));
  const iEp = find(EP_HEADERS);
  const iMonth = find(MONTH_HEADERS);
  const iName = find(NAME_HEADERS);
  const cols = PAY_COLUMNS.map((c) => ({ ...c, i: find(c.headers) })).filter((c) => c.i >= 0);
  const missing = [...(iEp < 0 ? ["EP Number"] : []), ...(iMonth < 0 ? ["Month"] : []), ...(cols.length ? [] : ["at least one pay column (Wage, OT, PF, …)"])];
  if (missing.length) return { rows: [], missing };

  const byEp = new Map<string, Labourer>();
  for (const l of labourers) {
    const cur = normalizeEp(l.epNumber);
    if (cur) byEp.set(cur, l);
    for (const old of l.epHistory ?? []) {
      const o = normalizeEp(old.ep);
      if (o && !byEp.has(o)) byEp.set(o, l);
    }
  }
  const seen = new Map<string, number>();

  const rows = body
    .filter((cells) => cells.some((c) => c.trim()))
    .map((cells, k): PayRow => {
      const get = (i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");
      const epRaw = get(iEp);
      const ep = normalizeEp(epRaw) ?? epRaw;
      const month = parseMonth(get(iMonth));
      const r: PayRow = { line: k + 2, ep, name: get(iName), month: month ?? get(iMonth), errors: [], lines: [] };
      const lab = byEp.get(ep);
      if (!epRaw) r.errors.push("EP is missing");
      else if (!lab) r.errors.push(`EP ${ep} isn't in the register`);
      if (!month) r.errors.push(`Month "${get(iMonth)}" — use 2026-10 or Oct 2026`);
      const key = `${lab?.id}|${month}`;
      if (lab && month && seen.has(key)) r.errors.push(`Same person and month as line ${seen.get(key)}`);
      if (lab && month) seen.set(key, r.line);
      if (r.errors.length || !lab || !month) return r;
      r.labourerId = lab.id;
      r.name = r.name || lab.name;
      for (const c of cols) {
        const raw = get(c.i).replace(/[₹,\s]/g, "");
        if (!raw || raw === "-") continue;
        const amount = Math.abs(Number(raw));
        if (!Number.isFinite(amount)) {
          r.errors.push(`${c.label} "${get(c.i)}" isn't a number`);
          continue;
        }
        if (amount === 0) continue;
        const there = ledger.find((w) => w.labourerId === lab.id && w.kind === c.kind && w.date.startsWith(month));
        const by = there?.upload ? `${there.upload.by} on ${showDate(realToday(new Date(there.upload.at)))}` : there ? "hand entry" : undefined;
        r.lines.push(
          !there
            ? { kind: c.kind, amount, state: "new" }
            : Math.abs(there.amount) === amount
              ? { kind: c.kind, amount, state: "same", existingId: there.id, by }
              : { kind: c.kind, amount, state: "changed", existingId: there.id, was: Math.abs(there.amount), by }
        );
      }
      if (!r.errors.length && r.lines.length === 0) r.errors.push("No pay amounts on this line");
      return r;
    });
  return { rows, missing: [] };
}

export const payLabel = (k: PayKind) => PAY_COLUMNS.find((c) => c.kind === k)?.label ?? k;
