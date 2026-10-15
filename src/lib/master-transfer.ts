/**
 * Export / import shapes for every Master Data sheet that has typed input.
 * Upload checks duplicates before anything is written (Owner / Super Admin).
 */
import type { MasterSheetId } from "./master/types";
import type { AppState, ExperienceLevel, SkillLevel, WageBand } from "./types";
import { SKILL_LEVELS } from "./labour-import";
import { EXPERIENCE_LEVELS } from "./wages";
import { cell } from "./excel-io";
import { normalizeEp } from "./ep";

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

export interface TransferSpec {
  id: MasterSheetId;
  label: string;
  sheetName: string;
  headers: string[];
  exportRows: (state: AppState) => Record<string, string | number | boolean>[];
  preview: (rows: Record<string, string>[], state: AppState) => TransferPreviewRow[];
}

const yn = (v: boolean) => (v ? "yes" : "no");
const parseYn = (s: string) => /^(1|y|yes|true|active|on)$/i.test(s.trim());

function catalogSpec(
  id: Extract<
    MasterSheetId,
    | "dprTypes"
    | "activityTemplates"
    | "units"
    | "storeBooks"
    | "fimStages"
    | "safetyFormCodes"
    | "shiftTypes"
    | "attendanceStatuses"
  >,
  label: string
): TransferSpec {
  return {
    id,
    label,
    sheetName: label,
    headers: ["code", "label", "siteCode", "active", "note"],
    exportRows: (state) =>
      state.masterCatalog[id].map((r) => ({
        code: r.code,
        label: r.label,
        siteCode: r.siteId ? state.sites.find((s) => s.id === r.siteId)?.code ?? r.siteId : "",
        active: yn(r.active),
        note: r.note ?? "",
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const code = cell(row, "code");
        const labelText = cell(row, "label");
        const siteCode = cell(row, "siteCode", "site");
        const active = cell(row, "active") ? parseYn(cell(row, "active")) : true;
        const note = cell(row, "note");
        if (!code || !labelText) {
          return { line: i + 2, status: "error", key: code || `row-${i}`, summary: "code and label required" };
        }
        const siteId = siteCode ? state.sites.find((s) => s.code.toLowerCase() === siteCode.toLowerCase())?.id ?? null : null;
        if (siteCode && !siteId) {
          return { line: i + 2, status: "error", key: code, summary: `Unknown site ${siteCode}` };
        }
        const existing = state.masterCatalog[id].find(
          (r) => r.code.toLowerCase() === code.toLowerCase() && (r.siteId ?? null) === (siteId ?? null)
        );
        const payload = {
          id: existing?.id,
          code,
          label: labelText,
          siteId: siteId ?? null,
          active,
          note: note || undefined,
        };
        if (existing) {
          const same =
            existing.label === labelText && existing.active === active && (existing.note ?? "") === (note ?? "");
          return {
            line: i + 2,
            status: same ? "duplicate" : "update",
            key: `${siteCode || "company"}|${code}`,
            summary: `${code} · ${labelText}`,
            detail: same ? "Already in the system — not uploaded" : "Will update existing row",
            payload,
          };
        }
        return {
          line: i + 2,
          status: "new",
          key: `${siteCode || "company"}|${code}`,
          summary: `${code} · ${labelText}`,
          payload,
        };
      }),
  };
}

export const TRANSFER_SPECS: TransferSpec[] = [
  {
    id: "sites",
    label: "Sites",
    sheetName: "Sites",
    headers: ["code", "name", "client", "enabled", "plants", "rpTags"],
    exportRows: (state) =>
      state.sites.map((s) => ({
        code: s.code,
        name: s.name,
        client: s.client,
        enabled: yn(s.enabled),
        plants: (s.plants ?? []).join("|"),
        rpTags: (s.rpTags ?? []).join("|"),
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const code = cell(row, "code").toUpperCase();
        const name = cell(row, "name");
        if (!code || !name) return { line: i + 2, status: "error", key: code || `r${i}`, summary: "code and name required" };
        if (!/^[A-Z]{2,6}$/.test(code)) {
          return { line: i + 2, status: "error", key: code, summary: "Site code must be 2–6 capital letters" };
        }
        const plants = cell(row, "plants")
          .split(/[|;,]/)
          .map((p) => p.trim())
          .filter(Boolean);
        const rpTags = cell(row, "rpTags", "rp")
          .split(/[|;,]/)
          .map((p) => p.trim())
          .filter(Boolean);
        const enabled = cell(row, "enabled") ? parseYn(cell(row, "enabled")) : true;
        const client = cell(row, "client") || "RIL";
        const existing = state.sites.find((s) => s.code.toUpperCase() === code);
        const payload = { code, name, client, enabled, plants, rpTags, id: existing?.id };
        if (existing) {
          const same =
            existing.name === name &&
            existing.client === client &&
            existing.enabled === enabled &&
            (existing.plants ?? []).join("|") === plants.join("|");
          return {
            line: i + 2,
            status: same ? "duplicate" : "update",
            key: code,
            summary: `${code} · ${name}`,
            detail: same ? "Already in the system — not uploaded" : "Will update existing site",
            payload,
          };
        }
        return { line: i + 2, status: "new", key: code, summary: `${code} · ${name}`, payload };
      }),
  },
  {
    id: "users",
    label: "Users",
    sheetName: "Users",
    headers: ["username", "name", "role", "sites", "active", "password"],
    exportRows: (state) =>
      state.users.map((u) => ({
        username: u.username,
        name: u.name,
        role: u.roles[0] ?? "",
        sites: u.siteIds.join("|"),
        active: yn(u.active),
        password: "", // never export passwords
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const username = cell(row, "username", "login").toLowerCase();
        const name = cell(row, "name");
        const role = cell(row, "role").toLowerCase();
        const password = cell(row, "password");
        if (!username || !name || !role) {
          return { line: i + 2, status: "error", key: username || `r${i}`, summary: "username, name and role required" };
        }
        const existing = state.users.find((u) => u.username.toLowerCase() === username);
        const siteCodes = cell(row, "sites", "site")
          .split(/[|;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const siteIds = siteCodes
          .map((c) => state.sites.find((s) => s.code.toLowerCase() === c.toLowerCase())?.id)
          .filter(Boolean) as string[];
        if (siteCodes.length && siteIds.length !== siteCodes.length) {
          return { line: i + 2, status: "error", key: username, summary: "One or more site codes unknown" };
        }
        const active = cell(row, "active") ? parseYn(cell(row, "active")) : true;
        if (existing) {
          return {
            line: i + 2,
            status: "duplicate",
            key: username,
            summary: `${username} · ${name}`,
            detail: "Login already exists — not uploaded (edit users in the app)",
          };
        }
        if (!password || password.length < 6) {
          return { line: i + 2, status: "error", key: username, summary: "New users need a password (6+ characters) in the password column" };
        }
        return {
          line: i + 2,
          status: "new",
          key: username,
          summary: `${username} · ${role}`,
          payload: { username, name, role, password, siteIds, active },
        };
      }),
  },
  {
    id: "labourers",
    label: "Labourers",
    sheetName: "Labourers",
    headers: [
      "name",
      "epNumber",
      "trade",
      "tradeSubcategory",
      "skill",
      "experience",
      "siteCode",
      "supervisorId",
      "contractorCode",
      "wageDaily",
      "mobile",
      "active",
    ],
    exportRows: (state) =>
      state.labourers.map((l) => ({
        name: l.name,
        epNumber: l.epNumber,
        trade: l.trade,
        tradeSubcategory: l.tradeSubcategory ?? "",
        skill: l.skill ?? "",
        experience: l.experience ?? "",
        siteCode: state.sites.find((s) => s.id === l.siteId)?.code ?? "",
        supervisorId: l.supervisorId,
        contractorCode: state.masterCatalog.contractors.find((c) => c.id === l.contractorId)?.code ?? "",
        wageDaily: l.wageDaily,
        mobile: l.mobile ?? "",
        active: yn(l.active),
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const name = cell(row, "name");
        const epRaw = cell(row, "epNumber", "ep", "worker id");
        const ep = normalizeEp(epRaw) ?? epRaw.toUpperCase();
        const trade = cell(row, "trade");
        if (!name || !ep || !trade) {
          return { line: i + 2, status: "error", key: ep || `r${i}`, summary: "name, epNumber and trade required" };
        }
        if (!/^PP\d{10}$/i.test(ep)) {
          return { line: i + 2, status: "error", key: ep, summary: "EP must be PP + 10 digits" };
        }
        const used =
          state.labourers.find((l) => l.epNumber.toUpperCase() === ep.toUpperCase()) ||
          state.labourers.find((l) => (l.epHistory ?? []).some((h) => h.ep.toUpperCase() === ep.toUpperCase()));
        if (used) {
          return {
            line: i + 2,
            status: "duplicate",
            key: ep,
            summary: `${name} · ${ep}`,
            detail: `EP already used by ${used.name} — not uploaded`,
          };
        }
        const siteCode = cell(row, "siteCode", "site");
        const site = siteCode
          ? state.sites.find((s) => s.code.toLowerCase() === siteCode.toLowerCase())
          : state.sites.find((s) => s.enabled);
        if (!site) return { line: i + 2, status: "error", key: ep, summary: "Unknown site" };
        const skillRaw = cell(row, "skill");
        const skill = SKILL_LEVELS.find((s) => s.id === skillRaw || s.label.toLowerCase() === skillRaw.toLowerCase())?.id as
          | SkillLevel
          | undefined;
        const expRaw = cell(row, "experience");
        const experience = EXPERIENCE_LEVELS.find(
          (e) => e.id === expRaw || e.label.toLowerCase() === expRaw.toLowerCase()
        )?.id as ExperienceLevel | undefined;
        const contractorCode = cell(row, "contractorCode", "contractor");
        const contractor =
          state.masterCatalog.contractors.find((c) => c.code.toLowerCase() === contractorCode.toLowerCase()) ||
          state.masterCatalog.contractors.find((c) => c.id === "con-sge");
        const wageDaily = Number(cell(row, "wageDaily", "wage")) || 0;
        return {
          line: i + 2,
          status: "new",
          key: ep,
          summary: `${name} · ${ep} · ${trade}`,
          payload: {
            name,
            epNumber: ep,
            trade,
            tradeSubcategory: cell(row, "tradeSubcategory", "sub") || undefined,
            skill,
            experience,
            siteId: site.id,
            supervisorId: cell(row, "supervisorId", "supervisor") || "",
            contractorId: contractor?.id,
            wageDaily,
            mobile: cell(row, "mobile") || undefined,
            gatePass: "",
            equipmentIds: [],
            active: cell(row, "active") ? parseYn(cell(row, "active")) : true,
          },
        };
      }),
  },
  {
    id: "contractors",
    label: "Contractors",
    sheetName: "Contractors",
    headers: ["code", "name", "gstin", "siteCode", "active"],
    exportRows: (state) =>
      state.masterCatalog.contractors.map((c) => ({
        code: c.code,
        name: c.name,
        gstin: c.gstin ?? "",
        siteCode: c.siteId ? state.sites.find((s) => s.id === c.siteId)?.code ?? "" : "",
        active: yn(c.active),
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const code = cell(row, "code");
        const name = cell(row, "name");
        if (!code || !name) return { line: i + 2, status: "error", key: code || `r${i}`, summary: "code and name required" };
        const siteCode = cell(row, "siteCode", "site");
        const siteId = siteCode ? state.sites.find((s) => s.code.toLowerCase() === siteCode.toLowerCase())?.id ?? null : null;
        if (siteCode && !siteId) return { line: i + 2, status: "error", key: code, summary: `Unknown site ${siteCode}` };
        const existing = state.masterCatalog.contractors.find((c) => c.code.toLowerCase() === code.toLowerCase());
        const payload = {
          id: existing?.id,
          code,
          name,
          gstin: cell(row, "gstin") || undefined,
          siteId,
          active: cell(row, "active") ? parseYn(cell(row, "active")) : true,
        };
        if (existing) {
          const same = existing.name === name && (existing.gstin ?? "") === (payload.gstin ?? "") && existing.active === payload.active;
          return {
            line: i + 2,
            status: same ? "duplicate" : "update",
            key: code,
            summary: `${code} · ${name}`,
            detail: same ? "Already in the system — not uploaded" : "Will update",
            payload,
          };
        }
        return { line: i + 2, status: "new", key: code, summary: `${code} · ${name}`, payload };
      }),
  },
  {
    id: "trades",
    label: "Trades",
    sheetName: "Trades",
    headers: ["id", "label", "subcategories", "active"],
    exportRows: (state) =>
      state.tradeCatalogue.map((t) => ({
        id: t.id,
        label: t.label,
        subcategories: t.subcategories.map((s) => s.label).join("|"),
        active: yn(t.active),
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const label = cell(row, "label", "trade");
        if (!label) return { line: i + 2, status: "error", key: `r${i}`, summary: "label required" };
        const id =
          cell(row, "id") ||
          label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_|_$/g, "");
        const subs = cell(row, "subcategories", "subs", "subtypes")
          .split(/[|;,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => ({
            id: s
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, ""),
            label: s,
          }));
        const active = cell(row, "active") ? parseYn(cell(row, "active")) : true;
        const existing = state.tradeCatalogue.find((t) => t.id === id || t.label.toLowerCase() === label.toLowerCase());
        if (existing) {
          return {
            line: i + 2,
            status: "duplicate",
            key: id,
            summary: `${existing.label}`,
            detail: "Trade already exists — not uploaded",
          };
        }
        return {
          line: i + 2,
          status: "new",
          key: id,
          summary: label,
          payload: { id, label, subcategories: subs, active, siteId: null },
        };
      }),
  },
  {
    id: "wageBands",
    label: "Daily wages",
    sheetName: "DailyWages",
    headers: ["tradeId", "skill", "experience", "dailyWage", "active", "note"],
    exportRows: (state) =>
      state.wageBands.map((b) => ({
        tradeId: b.tradeId,
        skill: b.skill,
        experience: b.experience,
        dailyWage: b.dailyWage,
        active: yn(b.active),
        note: b.note ?? "",
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const tradeId = cell(row, "tradeId", "trade");
        const skillRaw = cell(row, "skill");
        const expRaw = cell(row, "experience");
        const dailyWage = Number(cell(row, "dailyWage", "wage"));
        const skill = SKILL_LEVELS.find((s) => s.id === skillRaw || s.label.toLowerCase() === skillRaw.toLowerCase())?.id as
          | SkillLevel
          | undefined;
        const experience = EXPERIENCE_LEVELS.find(
          (e) => e.id === expRaw || e.label.toLowerCase() === expRaw.toLowerCase()
        )?.id as ExperienceLevel | undefined;
        if (!tradeId || !skill || !experience || !(dailyWage > 0)) {
          return {
            line: i + 2,
            status: "error",
            key: `${tradeId}|${skillRaw}|${expRaw}`,
            summary: "tradeId, skill, experience and dailyWage (>0) required",
          };
        }
        if (!state.tradeCatalogue.some((t) => t.id === tradeId)) {
          return { line: i + 2, status: "error", key: tradeId, summary: `Unknown trade ${tradeId}` };
        }
        const existing = state.wageBands.find(
          (b) => b.tradeId === tradeId && b.skill === skill && b.experience === experience
        );
        const payload: Omit<WageBand, "id"> & { id?: string } = {
          id: existing?.id,
          tradeId,
          skill,
          experience,
          dailyWage,
          active: cell(row, "active") ? parseYn(cell(row, "active")) : true,
          note: cell(row, "note") || undefined,
        };
        if (existing && existing.dailyWage === dailyWage && existing.active === payload.active) {
          return {
            line: i + 2,
            status: "duplicate",
            key: `${tradeId}|${skill}|${experience}`,
            summary: `${tradeId} · ${skill} · ${experience} · ₹${dailyWage}`,
            detail: "Already in the system — not uploaded",
          };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${tradeId}|${skill}|${experience}`,
          summary: `${tradeId} · ${skill} · ${experience} · ₹${dailyWage}`,
          detail: existing ? "Will update rate" : undefined,
          payload,
        };
      }),
  },
  {
    id: "materials",
    label: "Materials",
    sheetName: "Materials",
    headers: ["code", "label", "sapCode", "paintSystem", "uom", "siteCode", "active", "varianceTolerancePct"],
    exportRows: (state) =>
      state.masterCatalog.materials.map((m) => ({
        code: m.code,
        label: m.label,
        sapCode: m.sapCode,
        paintSystem: m.paintSystem,
        uom: m.uom,
        siteCode: m.siteId ? state.sites.find((s) => s.id === m.siteId)?.code ?? "" : "",
        active: yn(m.active),
        varianceTolerancePct: m.varianceTolerancePct ?? "",
      })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const code = cell(row, "code");
        const label = cell(row, "label");
        const sapCode = cell(row, "sapCode", "sap");
        if (!code || !label) return { line: i + 2, status: "error", key: code || `r${i}`, summary: "code and label required" };
        const siteCode = cell(row, "siteCode", "site");
        const siteId = siteCode ? state.sites.find((s) => s.code.toLowerCase() === siteCode.toLowerCase())?.id ?? null : null;
        const existing = state.masterCatalog.materials.find(
          (m) => m.code.toLowerCase() === code.toLowerCase() && (m.siteId ?? null) === (siteId ?? null)
        );
        const payload = {
          id: existing?.id,
          code,
          label,
          sapCode,
          paintSystem: cell(row, "paintSystem", "mps") || "",
          uom: cell(row, "uom") || "L",
          siteId,
          active: cell(row, "active") ? parseYn(cell(row, "active")) : true,
          varianceTolerancePct: cell(row, "varianceTolerancePct") ? Number(cell(row, "varianceTolerancePct")) : undefined,
        };
        if (existing) {
          const same = existing.label === label && existing.sapCode === sapCode && existing.active === payload.active;
          return {
            line: i + 2,
            status: same ? "duplicate" : "update",
            key: code,
            summary: `${code} · ${label}`,
            detail: same ? "Already in the system — not uploaded" : "Will update",
            payload,
          };
        }
        return { line: i + 2, status: "new", key: code, summary: `${code} · ${label}`, payload };
      }),
  },
  {
    id: "rateBook",
    label: "Rate book",
    sheetName: "RateBook",
    headers: ["poNumber", "itemKey", "description", "uom", "rateInr", "effectiveFrom", "siteCodes", "sourceFile"],
    exportRows: (state) =>
      state.rateLines
        .filter((r) => !r.superseded)
        .map((r) => ({
          poNumber: r.poNumber,
          itemKey: r.itemKey,
          description: r.description,
          uom: r.uom,
          rateInr: r.rateInr,
          effectiveFrom: r.effectiveFrom,
          siteCodes: r.siteIds.map((id) => state.sites.find((s) => s.id === id)?.code ?? id).join("|"),
          sourceFile: r.sourceFile,
        })),
    preview: (rows, state) =>
      rows.map((row, i) => {
        const poNumber = cell(row, "poNumber", "po");
        const itemKey = cell(row, "itemKey", "item");
        const uom = cell(row, "uom");
        const rateInr = Number(cell(row, "rateInr", "rate"));
        if (!poNumber || !itemKey || !uom || !(rateInr > 0)) {
          return { line: i + 2, status: "error", key: `${poNumber}|${itemKey}`, summary: "poNumber, itemKey, uom and rateInr required" };
        }
        const siteCodes = cell(row, "siteCodes", "sites")
          .split(/[|;,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const siteIds = siteCodes
          .map((c) => state.sites.find((s) => s.code.toLowerCase() === c.toLowerCase())?.id)
          .filter(Boolean) as string[];
        const existing = state.rateLines.find(
          (r) =>
            !r.superseded &&
            r.poNumber === poNumber &&
            r.itemKey === itemKey &&
            r.uom.toLowerCase() === uom.toLowerCase() &&
            r.rateInr === rateInr
        );
        if (existing) {
          return {
            line: i + 2,
            status: "duplicate",
            key: `${poNumber}|${itemKey}|${uom}|${rateInr}`,
            summary: `${poNumber} · ${itemKey} · ₹${rateInr}`,
            detail: "Same rate already in the book — not uploaded",
          };
        }
        return {
          line: i + 2,
          status: "new",
          key: `${poNumber}|${itemKey}|${uom}`,
          summary: `${poNumber} · ${itemKey} · ₹${rateInr}`,
          payload: {
            poNumber,
            itemKey,
            description: cell(row, "description") || itemKey,
            uom,
            rateInr,
            effectiveFrom: cell(row, "effectiveFrom", "from") || new Date().toISOString().slice(0, 10),
            siteIds,
            sourceFile: cell(row, "sourceFile", "source") || "excel-upload",
          },
        };
      }),
  },
  catalogSpec("dprTypes", "DPR types"),
  catalogSpec("activityTemplates", "Activity templates"),
  catalogSpec("units", "Units"),
  catalogSpec("storeBooks", "Store books"),
  catalogSpec("fimStages", "FIM stages"),
  catalogSpec("safetyFormCodes", "Safety form codes"),
  catalogSpec("shiftTypes", "Shift types"),
  catalogSpec("attendanceStatuses", "Attendance statuses"),
];

export function transferSpec(id: MasterSheetId): TransferSpec | undefined {
  return TRANSFER_SPECS.find((s) => s.id === id);
}
