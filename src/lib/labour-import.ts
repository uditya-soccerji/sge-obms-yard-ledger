/**
 * Bulk labourer upload from CSV (B09, owner 2026-10-13/14). Pure: parse the
 * file, match it to Master Data, check every row before anything is added.
 * Reads our template and RIL's "Employee Details" export as it comes
 * (Full Name, Worker ID, Trade, CATEGORY, Select EIC, Workman Status, Area Of Movement).
 * Duplicates: an EP already used (now or as an old EP, docs §1) is refused;
 * the same Name + Trade + Skill as someone registered is a "possible
 * duplicate" added only when the user ticks it.
 */
import { parseDate, showDate } from "./gate-pass";
import { realToday } from "./today";
import { normalizeEp } from "./ep";
import type { Labourer, Site, SkillLevel, StaffMember, TradeDefinition } from "./types";
import type { Contractor } from "./master/types";

export const SKILL_LEVELS: { id: SkillLevel; label: string }[] = [
  { id: "highly_skilled", label: "Highly skilled" },
  { id: "skilled", label: "Skilled" },
  { id: "semi_skilled", label: "Semi-skilled" },
  { id: "unskilled", label: "Unskilled" },
];

export const skillLabel = (s?: SkillLevel) => SKILL_LEVELS.find((x) => x.id === s)?.label ?? "—";

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const key = (name: string, trade: string, skill?: string) => `${norm(name)}|${norm(trade)}|${skill ?? ""}`;
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** "Semi Skilled", "UnSkilled", "#N/A" → our level (blank / N/A = not known). */
export function parseSkill(raw: string): SkillLevel | null | undefined {
  const v = norm(raw).replace(/[\s_-]+/g, "");
  if (!v || v === "#n/a" || v === "n/a" || v === "na") return undefined;
  return ({ highlyskilled: "highly_skilled", skilled: "skilled", semiskilled: "semi_skilled", unskilled: "unskilled" } as Record<string, SkillLevel>)[v] ?? null;
}

/** RIL marks retired trade names "(Do Not Use)_X"; file them under X (owner, 2026-10-14). */
export const cleanTrade = (raw: string) => raw.replace(/^\(do not use\)_?/i, "").trim();

/**
 * Site from RIL's "Area Of Movement" (owner, 2026-10-14): PCG and SEZ → PCG,
 * Solar / NEI → SOLAR, Refining / OM&SH DTA → DTA. Unknown → null.
 */
export function siteCodeFromArea(area: string): string | null {
  const a = area.toUpperCase();
  if (!a.trim()) return null;
  if (/\bPCG\b/.test(a) || /\bSEZ\b/.test(a)) return "PCG";
  if (/SOLAR|\bNEI\b|POLYSILICON|GLASS/.test(a)) return "SOLAR";
  if (/\bDTA\b/.test(a)) return "DTA";
  return null;
}

/** RIL workman status → still working with us? Only "Terminated" ends it (owner, 2026-10-14). */
export const activeFromRilStatus = (status: string) => !/terminated/i.test(status);
/** Statuses that need attention (pass not usable today). */
export const rilStatusProblem = (status?: string) => !!status && /expired|hibernat/i.test(status);

/** Template the upload screen offers for download (example row only, no real person). */
export const TEMPLATE_CSV =
  "Name,EP number,Trade,Skill level,Contractor,Site,Supervisor,Daily wage,EIC,RIL status,RIL area\n" +
  "Example Name,PP5900000001,Painter,Skilled,Shree Gayatri Enterprise (own),DTA,,850,Mr. Example EIC,Valid,Refining - DTA-ISBL\n";

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

type Col = "name" | "ep" | "trade" | "skill" | "contractor" | "site" | "supervisor" | "wage" | "eic" | "status" | "area" | "validFrom" | "validTo";
const HEADERS: Record<Col, string[]> = {
  name: ["name", "full name", "labourer name", "labour name", "ep name", "worker name"],
  ep: ["ep number", "ep no", "ep no.", "ep", "worker id", "ep_number"],
  trade: ["trade", "trade name"],
  skill: ["skill level", "skill", "category", "skill_level"],
  contractor: ["contractor", "contractor name", "sub contractor", "sub-contractor"],
  site: ["site", "site code"],
  supervisor: ["supervisor", "supervisor name"],
  wage: ["daily wage", "wage", "wage per day"],
  eic: ["eic", "select eic", "ril eic"],
  status: ["ril status", "workman status", "pass status"],
  area: ["ril area", "area of movement", "area"],
  validFrom: ["valid from", "pass valid from", "validity from", "pass start date", "start date", "issue date"],
  validTo: ["valid to", "valid upto", "valid up to", "valid till", "validity to", "valid until", "expiry", "expiry date", "pass expiry", "pass expiry date", "pass end date", "end date"],
};

export interface ImportRow {
  line: number;
  name: string;
  ep: string;
  trade: string;
  skill: string;
  siteCode: string;
  errors: string[];
  /** Fine to add, but something must be filled in later (no crew, wage, Aadhaar, skill…) */
  notes: string[];
  possibleDuplicate?: string;
  /** Already registered (same current EP) and the file changes its RIL details: applied as an update */
  update?: { id: string; patch: Partial<Labourer>; changes: string[] };
  /** Already registered and nothing new in this row: not uploaded (docs §24) */
  alreadyIn?: string;
  /** Trade that isn't in Master Data yet (added only if the user agrees) */
  newTrade?: { id: string; label: string };
  labourer?: Omit<Labourer, "id">;
}

export interface ImportContext {
  /** Site rows go to when the file doesn't say */
  defaultSiteId: string;
  sites: Site[];
  labourers: Labourer[];
  trades: TradeDefinition[];
  contractors: Contractor[];
  staff: StaffMember[];
  /** Create trades the file uses that Master Data doesn't have */
  addMissingTrades: boolean;
}

export function checkImport(table: string[][], ctx: ImportContext): { rows: ImportRow[]; missingColumns: string[] } {
  const [head = [], ...body] = table;
  const idx = {} as Record<Col, number>;
  (Object.keys(HEADERS) as Col[]).forEach((c) => {
    idx[c] = head.findIndex((h) => HEADERS[c].includes(norm(h)));
  });
  const missingColumns = (["name", "ep", "trade"] as Col[])
    .filter((c) => idx[c] < 0)
    .map((c) => ({ name: "Name", ep: "EP number", trade: "Trade" } as Record<string, string>)[c]);
  if (missingColumns.length) return { rows: [], missingColumns };

  const usedEp = new Map<string, string>();
  const byCurrentEp = new Map<string, Labourer>();
  for (const l of ctx.labourers) {
    const cur = normalizeEp(l.epNumber);
    if (cur) byCurrentEp.set(cur, l);
    for (const h of l.epHistory ?? []) {
      const old = normalizeEp(h.ep);
      if (old) usedEp.set(old, `${l.name} (old EP until ${h.until})`);
    }
  }
  const existingKey = new Map(ctx.labourers.filter((l) => l.active).map((l) => [key(l.name, l.trade, l.skill), l.name] as const));
  const seenEp = new Map<string, number>();
  const seenKey = new Map<string, number>();
  const sgeContractor = ctx.contractors.find((c) => c.active && /shree gayatri/i.test(c.name)) ?? ctx.contractors.find((c) => c.active);

  const rows = body.map((cells, i): ImportRow => {
    const get = (c: Col) => (idx[c] >= 0 ? (cells[idx[c]] ?? "").trim() : "");
    const name = get("name").replace(/\s+/g, " ");
    const epRaw = get("ep");
    const ep = normalizeEp(epRaw);
    const tradeRaw = cleanTrade(get("trade"));
    const r: ImportRow = { line: i + 2, name, ep: ep ?? epRaw, trade: tradeRaw, skill: get("skill"), siteCode: "", errors: [], notes: [] };

    if (!name) r.errors.push("Name is missing");
    if (!epRaw) r.errors.push("EP number is missing");
    else if (!ep) r.errors.push(`EP "${epRaw}" must be PP + 10 digits`);
    else if (seenEp.has(ep)) r.errors.push(`EP ${ep} is also on line ${seenEp.get(ep)}`);
    else if (usedEp.has(ep)) r.errors.push(`EP ${ep} already belongs to ${usedEp.get(ep)}`);
    if (ep) seenEp.set(ep, seenEp.get(ep) ?? r.line);

    const validFromRaw = get("validFrom");
    const validToRaw = get("validTo");
    const validFrom = parseDate(validFromRaw);
    const validTo = parseDate(validToRaw);
    if (validFrom === null) r.errors.push(`Valid-from "${validFromRaw}" isn't a date`);
    if (validTo === null) r.errors.push(`Expiry "${validToRaw}" isn't a date`);
    if (validFrom && validTo && validTo < validFrom) r.errors.push("Expiry is before valid-from");

    // Someone already registered under this EP: refresh their RIL details, or say it's already in (docs §24)
    const existing = ep && !r.errors.length ? byCurrentEp.get(ep) : undefined;
    if (existing) {
      const status = get("status");
      const fresh: Partial<Labourer> = {
        ...(get("eic") ? { eic: get("eic") } : {}),
        ...(status ? { rilStatus: status, ...(activeFromRilStatus(status) ? {} : { active: false }) } : {}),
        ...(get("area") ? { rilArea: get("area") } : {}),
        ...(validFrom ? { passValidFrom: validFrom } : {}),
        ...(validTo ? { passExpiry: validTo } : {}),
      };
      const names: Record<string, string> = { eic: "EIC", rilStatus: "pass status", rilArea: "area", passValidFrom: "valid-from", passExpiry: "expiry", active: "inactive (Terminated)" };
      const patch = Object.fromEntries(Object.entries(fresh).filter(([k, v]) => existing[k as keyof Labourer] !== v)) as Partial<Labourer>;
      const changes = Object.entries(patch).map(([k, v]) => (k === "active" ? names[k] : `${names[k]} → ${k.startsWith("pass") ? showDate(String(v)) : v}`));
      if (changes.length) r.update = { id: existing.id, patch, changes };
      else
        r.alreadyIn = existing.upload
          ? `Not uploaded — already uploaded by ${existing.upload.by} on ${showDate(realToday(new Date(existing.upload.at)))}`
          : "Not uploaded — already in the register (added by hand)";
      r.siteCode = ctx.sites.find((s) => s.id === existing.siteId)?.code ?? "";
      return r;
    }

    // Trade: Master Data, or a new one when the user allows it
    let tradeId: string | undefined;
    const known = ctx.trades.find((t) => t.active && (norm(t.id) === norm(tradeRaw) || norm(t.label) === norm(tradeRaw)));
    if (!tradeRaw) r.errors.push("Trade is missing");
    else if (known) tradeId = known.id;
    else if (ctx.addMissingTrades) {
      r.newTrade = { id: slug(tradeRaw), label: tradeRaw };
      tradeId = r.newTrade.id;
    } else r.errors.push(`Trade "${tradeRaw}" isn't in Master Data → Trades`);

    const skill = parseSkill(r.skill);
    if (skill === null) r.errors.push(`Skill "${r.skill}" — use ${SKILL_LEVELS.map((s) => s.label).join(", ")}`);

    // Site: the file's Site column, else from RIL's area, else the screen's site
    const area = get("area");
    const code = (get("site") || siteCodeFromArea(area) || "").toUpperCase();
    const site = code ? ctx.sites.find((s) => s.code === code) : ctx.sites.find((s) => s.id === ctx.defaultSiteId);
    if (!site) r.errors.push(`Site "${code}" isn't in Master Data → Sites`);
    else if (!site.enabled) r.errors.push(`Site ${site.code} is switched off`);
    r.siteCode = site?.code ?? code;
    if (!get("site") && area && !siteCodeFromArea(area)) r.notes.push(`area "${area}" → ${site?.code ?? "?"} (default)`);

    const contractorRaw = get("contractor");
    const contractor = contractorRaw
      ? ctx.contractors.find((c) => c.active && (norm(c.name) === norm(contractorRaw) || norm(c.code) === norm(contractorRaw)))
      : sgeContractor;
    if (!contractor) r.errors.push(`Contractor "${contractorRaw}" isn't in Master Data → Contractors`);

    const supRaw = get("supervisor");
    const sup = supRaw && site ? ctx.staff.find((s) => s.role === "supervisor" && s.siteId === site.id && norm(s.name) === norm(supRaw)) : undefined;
    if (supRaw && !sup) r.errors.push(`Supervisor "${supRaw}" isn't a supervisor on ${site?.code ?? "that site"}`);

    const wageRaw = get("wage");
    const wage = wageRaw ? Number(wageRaw.replace(/[₹,\s]/g, "")) : 0;
    if (wageRaw && !(wage >= 0)) r.errors.push(`Daily wage "${wageRaw}" isn't a number`);

    const status = get("status");
    const active = activeFromRilStatus(status);
    if (!sup) r.notes.push("no supervisor yet");
    if (!(wage > 0)) r.notes.push("no wage yet");
    r.notes.push("Aadhaar missing");
    if (!skill) r.notes.push("skill missing");
    if (rilStatusProblem(status)) r.notes.push(`RIL pass ${status}`);
    if (!active) r.notes.push("Terminated → added as inactive");

    if (name && tradeId && skill) {
      const k = key(name, tradeId, skill);
      const there = existingKey.get(k);
      if (there) r.possibleDuplicate = `Same name, trade and skill as ${there} already registered`;
      else if (seenKey.has(k)) r.possibleDuplicate = `Same name, trade and skill as line ${seenKey.get(k)}`;
      seenKey.set(k, seenKey.get(k) ?? r.line);
    }

    if (!r.errors.length && ep && tradeId && site && contractor) {
      r.labourer = {
        name,
        epNumber: ep,
        trade: tradeId,
        ...(skill ? { skill } : {}),
        gatePass: "",
        siteId: site.id,
        supervisorId: sup?.id ?? "",
        contractorId: contractor.id,
        wageDaily: wage,
        equipmentIds: [],
        active,
        ...(get("eic") ? { eic: get("eic") } : {}),
        ...(status ? { rilStatus: status } : {}),
        ...(area ? { rilArea: area } : {}),
        ...(validFrom ? { passValidFrom: validFrom } : {}),
        ...(validTo ? { passExpiry: validTo } : {}),
      };
    }
    return r;
  });
  return { rows, missingColumns };
}
