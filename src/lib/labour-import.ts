/**
 * Bulk labourer upload from CSV (B09, owner 2026-10-13). Pure: parse the file,
 * match names to Master Data, and check every row before anything is added.
 * Duplicates: an EP already used (current or old EP, docs §1) is always
 * refused; the same Name + Trade + Skill as someone already registered is
 * flagged as a possible duplicate and only added when the user says so.
 */
import type { Labourer, SkillLevel, StaffMember, TradeDefinition } from "./types";
import type { Contractor } from "./master/types";

export const SKILL_LEVELS: { id: SkillLevel; label: string }[] = [
  { id: "highly_skilled", label: "Highly skilled" },
  { id: "skilled", label: "Skilled" },
  { id: "semi_skilled", label: "Semi-skilled" },
  { id: "unskilled", label: "Unskilled" },
];

export const skillLabel = (s?: SkillLevel) => SKILL_LEVELS.find((x) => x.id === s)?.label ?? "—";

/** EP pass number (docs §1): PP + 10 digits, upper-cased. */
export const EP_RE = /^PP\d{10}$/;
export const normEp = (s: string) => s.replace(/\s+/g, "").toUpperCase();

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const key = (name: string, trade: string, skill?: string) => `${norm(name)}|${norm(trade)}|${skill ?? ""}`;

/** Template the upload screen offers for download. */
export const TEMPLATE_CSV =
  "Name,EP number,Trade,Skill level,Contractor,Supervisor,Daily wage\n" +
  "Ramesh Kumar,PP5920100001,Painter,Skilled,Shree Gayatri Enterprise (own),V. Chauhan,850\n";

/** RFC-4180-ish CSV: quotes, doubled quotes, commas and newlines in quotes, BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

type Col = "name" | "ep" | "trade" | "skill" | "contractor" | "supervisor" | "wage";
const HEADERS: Record<Col, string[]> = {
  name: ["name", "labourer name", "labour name", "ep name", "worker name"],
  ep: ["ep number", "ep no", "ep no.", "ep", "ep_number", "gate pass no"],
  trade: ["trade", "trade name"],
  skill: ["skill level", "skill", "skill_level", "category"],
  contractor: ["contractor", "contractor name", "sub contractor", "sub-contractor"],
  supervisor: ["supervisor", "supervisor name"],
  wage: ["daily wage", "wage", "wage per day", "daily_wage"],
};

export interface ImportRow {
  line: number;
  name: string;
  ep: string;
  trade: string;
  skill: string;
  contractor: string;
  supervisor: string;
  wage: string;
  /** Hard problems: the row can't be added */
  errors: string[];
  /** Same Name + Trade + Skill as someone already there: add only if confirmed */
  possibleDuplicate?: string;
  /** Ready-to-add record when there are no errors */
  labourer?: Omit<Labourer, "id">;
}

export interface ImportContext {
  siteId: string;
  labourers: Labourer[];
  trades: TradeDefinition[];
  contractors: Contractor[];
  /** Supervisors on the upload's site */
  supervisors: StaffMember[];
}

/** Read the header row, map columns, and check every data row. */
export function checkImport(table: string[][], ctx: ImportContext): { rows: ImportRow[]; missingColumns: string[] } {
  const [head = [], ...body] = table;
  const idx = {} as Record<Col, number>;
  (Object.keys(HEADERS) as Col[]).forEach((c) => {
    idx[c] = head.findIndex((h) => HEADERS[c].includes(norm(h)));
  });
  const missingColumns = (["name", "ep", "trade", "skill", "contractor"] as Col[])
    .filter((c) => idx[c] < 0)
    .map((c) => ({ name: "Name", ep: "EP number", trade: "Trade", skill: "Skill level", contractor: "Contractor" })[c as "name"]);
  if (missingColumns.length) return { rows: [], missingColumns };

  // Every EP ever used, current or archived (docs §1 EP history)
  const usedEp = new Map<string, string>();
  for (const l of ctx.labourers) {
    if (l.epNumber) usedEp.set(normEp(l.epNumber), `${l.name} (current EP)`);
    for (const h of l.epHistory ?? []) usedEp.set(normEp(h.ep), `${l.name} (old EP until ${h.until})`);
  }
  const existingKey = new Map(
    ctx.labourers.filter((l) => l.active).map((l) => [key(l.name, l.trade, l.skill), l.name] as const)
  );
  const seenEp = new Map<string, number>();
  const seenKey = new Map<string, number>();

  const rows = body.map((cells, i): ImportRow => {
    const get = (c: Col) => (idx[c] >= 0 ? (cells[idx[c]] ?? "").trim() : "");
    const r: ImportRow = {
      line: i + 2,
      name: get("name").replace(/\s+/g, " "),
      ep: normEp(get("ep")),
      trade: get("trade"),
      skill: get("skill"),
      contractor: get("contractor"),
      supervisor: get("supervisor"),
      wage: get("wage"),
      errors: [],
    };
    if (!r.name) r.errors.push("Name is missing");
    if (!r.ep) r.errors.push("EP number is missing");
    else if (!EP_RE.test(r.ep)) r.errors.push(`EP "${r.ep}" must be PP + 10 digits`);
    else if (usedEp.has(r.ep)) r.errors.push(`EP ${r.ep} already belongs to ${usedEp.get(r.ep)}`);
    else if (seenEp.has(r.ep)) r.errors.push(`EP ${r.ep} is also on line ${seenEp.get(r.ep)}`);
    if (r.ep) seenEp.set(r.ep, seenEp.get(r.ep) ?? r.line);

    const trade = ctx.trades.find((t) => t.active && (norm(t.id) === norm(r.trade) || norm(t.label) === norm(r.trade)));
    if (!r.trade) r.errors.push("Trade is missing");
    else if (!trade) r.errors.push(`Trade "${r.trade}" isn't in Master Data → Trades`);
    const skill = SKILL_LEVELS.find((s) => norm(s.label) === norm(r.skill) || norm(s.id) === norm(r.skill.replace(/[\s-]+/g, "_")));
    if (!r.skill) r.errors.push("Skill level is missing");
    else if (!skill) r.errors.push(`Skill "${r.skill}" — use ${SKILL_LEVELS.map((s) => s.label).join(", ")}`);
    const contractor = ctx.contractors.find((c) => c.active && (norm(c.name) === norm(r.contractor) || norm(c.code) === norm(r.contractor)));
    if (!r.contractor) r.errors.push("Contractor is missing");
    else if (!contractor) r.errors.push(`Contractor "${r.contractor}" isn't in Master Data → Contractors`);
    const sup = r.supervisor ? ctx.supervisors.find((s) => norm(s.name) === norm(r.supervisor)) : undefined;
    if (r.supervisor && !sup) r.errors.push(`Supervisor "${r.supervisor}" isn't a supervisor on this site`);
    const wage = r.wage ? Number(r.wage.replace(/[₹,\s]/g, "")) : 0;
    if (r.wage && !(wage >= 0)) r.errors.push(`Daily wage "${r.wage}" isn't a number`);

    if (trade && skill && r.name) {
      const k = key(r.name, trade.id, skill.id);
      const there = existingKey.get(k);
      if (there) r.possibleDuplicate = `Same name, trade and skill as ${there} already registered`;
      else if (seenKey.has(k)) r.possibleDuplicate = `Same name, trade and skill as line ${seenKey.get(k)}`;
      seenKey.set(k, seenKey.get(k) ?? r.line);
    }
    if (!r.errors.length && trade && skill && contractor) {
      r.labourer = {
        name: r.name,
        trade: trade.id,
        skill: skill.id,
        epNumber: r.ep,
        gatePass: "",
        siteId: ctx.siteId,
        // Upload can set the standing crew; blank = unassigned (docs §20)
        supervisorId: sup?.id ?? "",
        contractorId: contractor.id,
        wageDaily: wage,
        equipmentIds: [],
        active: true,
      };
    }
    return r;
  });
  return { rows, missingColumns };
}
