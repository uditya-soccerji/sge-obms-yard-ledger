/**
 * Excel export / import for Operations typed inputs (Owner / Super Admin).
 */
import { cell } from "./excel-io";
import { normalizeEp } from "./ep";
import type { TransferPreviewRow } from "./transfer-types";
import type {
  AcplPunchRow,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  CrewRequest,
  EquipmentItem,
  EquipmentRequest,
  RateCard,
  SafetyChecklistDay,
  WageLedgerEntry,
} from "./types";

export type OpsTransferId =
  | "attendance"
  | "acplPunches"
  | "safetyDays"
  | "equipment"
  | "equipmentRequests"
  | "crewAssignments"
  | "crewRequests"
  | "wageLedger"
  | "rateCards";

export interface OpsTransferCtx {
  state: AppState;
  setState: (fn: (s: AppState) => AppState) => void;
}

function siteByCode(state: AppState, code: string) {
  return state.sites.find((s) => s.code.toLowerCase() === code.toLowerCase() || s.id === code);
}
function siteCode(state: AppState, id: string) {
  return state.sites.find((s) => s.id === id)?.code ?? id;
}
function labourerByEp(state: AppState, ep: string) {
  const n = normalizeEp(ep) ?? ep;
  return state.labourers.find((l) => normalizeEp(l.epNumber) === n || l.epNumber === ep || l.id === ep);
}
function staffByKey(state: AppState, key: string) {
  const k = key.toLowerCase();
  return state.staff.find((s) => s.id === key || s.name.toLowerCase() === k);
}
function yn(v: boolean) {
  return v ? "yes" : "no";
}
function parseYn(s: string) {
  return /^(1|y|yes|true|active|on)$/i.test(s.trim());
}
function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
function num(s: string, fallback = 0) {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
function sameish(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const ATT_STATUSES: AttendanceStatus[] = ["present", "absent", "half", "leave", "weekly_off", "overtime"];

export interface OpsSheetSpec {
  id: OpsTransferId;
  label: string;
  sheetName: string;
  headers: string[];
  exportRows: (ctx: OpsTransferCtx) => Record<string, string | number | boolean>[];
  preview: (rows: Record<string, string>[], ctx: OpsTransferCtx) => TransferPreviewRow[];
  apply: (rows: TransferPreviewRow[], ctx: OpsTransferCtx) => { ok: boolean; error?: string; added: number; updated: number };
}

const SPECS: OpsSheetSpec[] = [
  {
    id: "attendance",
    label: "Attendance",
    sheetName: "Attendance",
    headers: ["date", "ep", "status", "inTime", "outTime", "siteCode", "note"],
    exportRows: ({ state }) =>
      state.attendance.map((a) => {
        const lab = state.labourers.find((l) => l.id === a.labourerId);
        return {
          date: a.date,
          ep: lab?.epNumber ?? a.labourerId,
          status: a.status,
          inTime: a.inTime ?? "",
          outTime: a.outTime ?? "",
          siteCode: siteCode(state, a.siteId),
          note: a.note ?? "",
        };
      }),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const date = cell(row, "date");
        const lab = labourerByEp(state, cell(row, "ep", "epNumber"));
        const status = cell(row, "status") as AttendanceStatus;
        const site = siteByCode(state, cell(row, "siteCode", "site")) ?? (lab ? state.sites.find((s) => s.id === lab.siteId) : undefined);
        if (!date || !lab || !ATT_STATUSES.includes(status) || !site) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "date, ep, status, site required" };
        }
        const existing = state.attendance.find((a) => a.labourerId === lab.id && a.date === date);
        const payload: AttendanceRecord = {
          id: existing?.id ?? uid("att"),
          date,
          labourerId: lab.id,
          status,
          inTime: cell(row, "inTime") || undefined,
          outTime: cell(row, "outTime") || undefined,
          markedBy: existing?.markedBy ?? "excel-upload",
          siteId: site.id,
          note: cell(row, "note") || existing?.note,
          sourceDprId: existing?.sourceDprId,
        };
        if (existing && existing.status === payload.status && existing.inTime === payload.inTime && existing.outTime === payload.outTime) {
          return { line: i + 2, status: "duplicate", key: `${lab.epNumber}|${date}`, summary: `${lab.epNumber} · ${date}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${lab.epNumber}|${date}`,
          summary: `${lab.name} · ${date} · ${status}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "attendance", rows),
  },
  {
    id: "acplPunches",
    label: "ACPL punches",
    sheetName: "ACPL punches",
    headers: ["date", "ep", "labourerName", "inTime", "outTime", "siteCode"],
    exportRows: ({ state }) =>
      state.acplPunches.map((p) => ({
        date: p.date,
        ep: p.epNumber,
        labourerName: p.labourerName ?? "",
        inTime: p.inTime ?? "",
        outTime: p.outTime ?? "",
        siteCode: p.siteId ? siteCode(state, p.siteId) : "",
      })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const date = cell(row, "date");
        const ep = normalizeEp(cell(row, "ep", "epNumber")) ?? cell(row, "ep", "epNumber");
        if (!date || !ep) return { line: i + 2, status: "error", key: `r${i}`, summary: "date and ep required" };
        const site = siteByCode(state, cell(row, "siteCode", "site"));
        const inTime = cell(row, "inTime") || undefined;
        const outTime = cell(row, "outTime") || undefined;
        const existing = state.acplPunches.find(
          (p) => p.date === date && (normalizeEp(p.epNumber) ?? p.epNumber) === ep && (p.inTime || "") === (inTime || "")
        );
        const payload: AcplPunchRow = {
          id: existing?.id ?? uid("acpl"),
          date,
          epNumber: ep,
          labourerName: cell(row, "labourerName", "name") || existing?.labourerName,
          inTime,
          outTime,
          source: "upload",
          siteId: site?.id ?? existing?.siteId,
        };
        if (existing && existing.outTime === payload.outTime) {
          return { line: i + 2, status: "duplicate", key: `${ep}|${date}|${inTime}`, summary: `${ep} · ${date}`, detail: "Already in the system — not uploaded" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${ep}|${date}|${inTime ?? ""}`,
          summary: `${ep} · ${date} · ${inTime ?? "—"}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "acplPunches", rows),
  },
  {
    id: "safetyDays",
    label: "Safety days",
    sheetName: "Safety days",
    headers: ["date", "siteCode", "officer", "observations", "incidents", "signed", "itemsJson"],
    exportRows: ({ state }) =>
      state.safetyDays.map((d) => ({
        date: d.date,
        siteCode: siteCode(state, d.siteId),
        officer: state.staff.find((s) => s.id === d.officerId)?.name ?? d.officerId,
        observations: d.observations,
        incidents: d.incidents,
        signed: yn(d.signed),
        itemsJson: JSON.stringify(d.items),
      })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const date = cell(row, "date");
        const site = siteByCode(state, cell(row, "siteCode", "site"));
        const officer = staffByKey(state, cell(row, "officer", "officerId"));
        if (!date || !site) return { line: i + 2, status: "error", key: `r${i}`, summary: "date and siteCode required" };
        let items: SafetyChecklistDay["items"] = [];
        try {
          items = cell(row, "itemsJson") ? (JSON.parse(cell(row, "itemsJson")) as SafetyChecklistDay["items"]) : [];
        } catch {
          return { line: i + 2, status: "error", key: `${site.code}|${date}`, summary: "itemsJson invalid" };
        }
        const existing = state.safetyDays.find((d) => d.siteId === site.id && d.date === date);
        const payload: SafetyChecklistDay = {
          id: existing?.id ?? uid("saf"),
          date,
          siteId: site.id,
          officerId: officer?.id ?? existing?.officerId ?? "",
          items: items.length ? items : existing?.items ?? [],
          observations: cell(row, "observations") || existing?.observations || "",
          incidents: cell(row, "incidents") || existing?.incidents || "",
          signed: cell(row, "signed") ? parseYn(cell(row, "signed")) : existing?.signed ?? false,
        };
        if (existing && existing.observations === payload.observations && existing.signed === payload.signed && sameish(existing.items, payload.items)) {
          return { line: i + 2, status: "duplicate", key: `${site.code}|${date}`, summary: `${site.code} · ${date}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${site.code}|${date}`,
          summary: `${site.code} · ${date}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "safetyDays", rows),
  },
  {
    id: "equipment",
    label: "Equipment",
    sheetName: "Equipment",
    headers: ["id", "tag", "type", "status", "siteCode", "assignedTo", "lastCheck", "expiryDate", "faultNote", "checklistJson"],
    exportRows: ({ state }) =>
      state.equipment.map((e) => ({
        id: e.id,
        tag: e.tag,
        type: e.type,
        status: e.status,
        siteCode: siteCode(state, e.siteId),
        assignedTo: e.assignedTo ?? "",
        lastCheck: e.lastCheck,
        expiryDate: e.expiryDate ?? "",
        faultNote: e.faultNote ?? "",
        checklistJson: JSON.stringify(e.checklist),
      })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const tag = cell(row, "tag");
        const site = siteByCode(state, cell(row, "siteCode", "site"));
        const type = cell(row, "type") as EquipmentItem["type"];
        if (!tag || !site || !["hopper", "compressor", "airless", "harness", "ifr", "rope_access"].includes(type)) {
          return { line: i + 2, status: "error", key: tag || `r${i}`, summary: "tag, type, siteCode required" };
        }
        let checklist: EquipmentItem["checklist"] = [];
        try {
          checklist = cell(row, "checklistJson")
            ? (JSON.parse(cell(row, "checklistJson")) as EquipmentItem["checklist"])
            : [];
        } catch {
          return { line: i + 2, status: "error", key: tag, summary: "checklistJson invalid" };
        }
        const existing =
          state.equipment.find((e) => e.id === cell(row, "id")) ||
          state.equipment.find((e) => e.tag === tag && e.siteId === site.id);
        const payload: EquipmentItem = {
          id: existing?.id ?? uid("eq"),
          tag,
          type,
          status: (cell(row, "status") || existing?.status || "ok") as EquipmentItem["status"],
          siteId: site.id,
          assignedTo: cell(row, "assignedTo") || existing?.assignedTo,
          lastCheck: cell(row, "lastCheck") || existing?.lastCheck || "",
          expiryDate: cell(row, "expiryDate") || existing?.expiryDate,
          faultNote: cell(row, "faultNote") || existing?.faultNote,
          checklist: checklist.length ? checklist : existing?.checklist ?? [],
        };
        if (existing && existing.status === payload.status && existing.faultNote === payload.faultNote) {
          return { line: i + 2, status: "duplicate", key: tag, summary: tag, detail: "Already in the system" };
        }
        return { line: i + 2, status: existing ? "update" : "new", key: tag, summary: `${tag} · ${payload.status}`, payload };
      }),
    apply: (rows, ctx) => applyById(ctx, "equipment", rows),
  },
  {
    id: "equipmentRequests",
    label: "Equipment requests",
    sheetName: "Requests",
    headers: ["id", "siteCode", "plant", "kind", "description", "qty", "urgent", "status", "sourceDprId", "createdBy"],
    exportRows: ({ state }) =>
      state.equipmentRequests.map((r) => ({
        id: r.id,
        siteCode: siteCode(state, r.siteId),
        plant: r.plant,
        kind: r.kind,
        description: r.description,
        qty: r.qty ?? "",
        urgent: yn(!!r.urgent),
        status: r.status,
        sourceDprId: r.sourceDprId ?? "",
        createdBy: r.createdBy,
      })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const site = siteByCode(state, cell(row, "siteCode", "site"));
        const description = cell(row, "description");
        const kind = (cell(row, "kind") || "other") as EquipmentRequest["kind"];
        if (!site || !description) return { line: i + 2, status: "error", key: `r${i}`, summary: "siteCode and description required" };
        const sourceDprId = cell(row, "sourceDprId") || undefined;
        const existing =
          state.equipmentRequests.find((r) => r.id === cell(row, "id")) ||
          (sourceDprId
            ? state.equipmentRequests.find((r) => r.sourceDprId === sourceDprId && r.description === description)
            : undefined);
        const now = new Date().toISOString();
        const payload: EquipmentRequest = {
          id: existing?.id ?? uid("req"),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          createdBy: cell(row, "createdBy") || existing?.createdBy || "excel-upload",
          siteId: site.id,
          plant: cell(row, "plant") || existing?.plant || "",
          kind,
          description,
          qty: cell(row, "qty") ? num(cell(row, "qty")) : existing?.qty,
          urgent: cell(row, "urgent") ? parseYn(cell(row, "urgent")) : existing?.urgent,
          status: (cell(row, "status") || existing?.status || "open") as EquipmentRequest["status"],
          sourceDprId,
        };
        if (existing && existing.description === payload.description && existing.status === payload.status) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: description, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: payload.id,
          summary: `${site.code} · ${description}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "equipmentRequests", rows),
  },
  {
    id: "crewAssignments",
    label: "Crew assignments",
    sheetName: "Crew",
    headers: ["ep", "supervisor", "siteCode"],
    exportRows: ({ state }) =>
      state.labourers
        .filter((l) => l.supervisorId)
        .map((l) => ({
          ep: l.epNumber,
          supervisor: state.staff.find((s) => s.id === l.supervisorId)?.name ?? l.supervisorId!,
          siteCode: siteCode(state, l.siteId),
        })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const lab = labourerByEp(state, cell(row, "ep", "epNumber"));
        const sup = staffByKey(state, cell(row, "supervisor", "supervisorId"));
        if (!lab || !sup) return { line: i + 2, status: "error", key: cell(row, "ep") || `r${i}`, summary: "ep and supervisor required" };
        if (lab.supervisorId === sup.id) {
          return { line: i + 2, status: "duplicate", key: lab.epNumber, summary: `${lab.name} → ${sup.name}`, detail: "Already assigned" };
        }
        return {
          line: i + 2,
          status: lab.supervisorId ? "update" : "new",
          key: lab.epNumber,
          summary: `${lab.name} → ${sup.name}`,
          payload: { labourerId: lab.id, supervisorId: sup.id },
        };
      }),
    apply: (rows, ctx) => {
      const added = rows.filter((r) => r.status === "new").length;
      const updated = rows.filter((r) => r.status === "update").length;
      ctx.setState((s) => ({
        ...s,
        labourers: s.labourers.map((l) => {
          const hit = rows.find((r) => r.payload?.labourerId === l.id);
          return hit ? { ...l, supervisorId: hit.payload.supervisorId as string } : l;
        }),
      }));
      return { ok: true, added, updated };
    },
  },
  {
    id: "crewRequests",
    label: "Crew requests",
    sheetName: "Crew requests",
    headers: ["id", "siteCode", "ep", "toSupervisor", "fromSupervisor", "status", "note", "requestedAt"],
    exportRows: ({ state }) =>
      state.crewRequests.map((r) => {
        const lab = state.labourers.find((l) => l.id === r.labourerId);
        return {
          id: r.id,
          siteCode: siteCode(state, r.siteId),
          ep: lab?.epNumber ?? r.labourerId,
          toSupervisor: state.staff.find((s) => s.id === r.toSupervisorId)?.name ?? r.toSupervisorId,
          fromSupervisor: r.fromSupervisorId
            ? state.staff.find((s) => s.id === r.fromSupervisorId)?.name ?? r.fromSupervisorId
            : "",
          status: r.status,
          note: r.note ?? "",
          requestedAt: r.requestedAt,
        };
      }),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const lab = labourerByEp(state, cell(row, "ep"));
        const to = staffByKey(state, cell(row, "toSupervisor", "toSupervisorId"));
        const site = siteByCode(state, cell(row, "siteCode", "site")) ?? (lab ? state.sites.find((s) => s.id === lab.siteId) : undefined);
        if (!lab || !to || !site) return { line: i + 2, status: "error", key: `r${i}`, summary: "ep, toSupervisor, site required" };
        const status = (cell(row, "status") || "requested") as CrewRequest["status"];
        const open = state.crewRequests.find(
          (r) =>
            r.labourerId === lab.id &&
            r.toSupervisorId === to.id &&
            (r.status === "requested" || r.status === "released")
        );
        const existing = state.crewRequests.find((r) => r.id === cell(row, "id")) || open;
        if (existing && existing.status === status) {
          return { line: i + 2, status: "duplicate", key: existing.id, summary: `${lab.epNumber} → ${to.name}`, detail: "Already in the system" };
        }
        const from = cell(row, "fromSupervisor") ? staffByKey(state, cell(row, "fromSupervisor")) : null;
        const payload: CrewRequest = {
          id: existing?.id ?? uid("cr"),
          siteId: site.id,
          labourerId: lab.id,
          toSupervisorId: to.id,
          fromSupervisorId: from?.id ?? existing?.fromSupervisorId ?? lab.supervisorId ?? null,
          requestedBy: existing?.requestedBy ?? "excel-upload",
          requestedAt: cell(row, "requestedAt") || existing?.requestedAt || new Date().toISOString(),
          status,
          note: cell(row, "note") || existing?.note,
        };
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: payload.id,
          summary: `${lab.epNumber} → ${to.name} · ${status}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "crewRequests", rows),
  },
  {
    id: "wageLedger",
    label: "Wage ledger",
    sheetName: "Wage ledger",
    headers: ["ep", "date", "kind", "amount", "note", "siteCode"],
    exportRows: ({ state }) =>
      state.wageLedger.map((w) => {
        const lab = w.labourerId ? state.labourers.find((l) => l.id === w.labourerId) : undefined;
        return {
          ep: lab?.epNumber ?? "",
          date: w.date,
          kind: w.kind,
          amount: w.amount,
          note: w.note,
          siteCode: w.siteId ? siteCode(state, w.siteId) : "",
        };
      }),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const lab = labourerByEp(state, cell(row, "ep", "epNumber"));
        const date = cell(row, "date");
        const kind = cell(row, "kind") as WageLedgerEntry["kind"];
        const amount = num(cell(row, "amount"));
        const kinds: WageLedgerEntry["kind"][] = [
          "salary",
          "bonus",
          "advance",
          "ot",
          "incentive",
          "pf",
          "room_rent",
          "travel",
          "food",
          "deduction",
        ];
        if (!lab || !date || !kinds.includes(kind)) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "ep, date, kind required" };
        }
        const month = date.slice(0, 7);
        const existing = state.wageLedger.find(
          (w) => w.labourerId === lab.id && w.kind === kind && w.date.slice(0, 7) === month
        );
        const site = siteByCode(state, cell(row, "siteCode", "site"));
        const payload: WageLedgerEntry = {
          id: existing?.id ?? uid("wl"),
          labourerId: lab.id,
          date: date.length === 7 ? `${date}-01` : date,
          kind,
          amount,
          note: cell(row, "note") || existing?.note || `Excel ${month}`,
          siteId: site?.id ?? lab.siteId,
          upload: existing?.upload,
        };
        if (existing && existing.amount === amount) {
          return {
            line: i + 2,
            status: "duplicate",
            key: `${lab.epNumber}|${kind}|${month}`,
            summary: `${lab.epNumber} · ${kind} · ${month}`,
            detail: existing.upload
              ? `Already uploaded by ${existing.upload.by} on ${existing.upload.at.slice(0, 10)}`
              : "Same amount already in the ledger",
          };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${lab.epNumber}|${kind}|${month}`,
          summary: `${lab.name} · ${kind} · ₹${amount}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "wageLedger", rows),
  },
  {
    id: "rateCards",
    label: "Rate cards",
    sheetName: "Rate cards",
    headers: ["id", "kind", "label", "unit", "rateInr", "paintLitresPerUnit", "manpowerDaysPerUnit", "materialNote", "editable"],
    exportRows: ({ state }) =>
      state.rateCards.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        unit: r.unit,
        rateInr: r.rateInr,
        paintLitresPerUnit: r.paintLitresPerUnit ?? "",
        manpowerDaysPerUnit: r.manpowerDaysPerUnit,
        materialNote: r.materialNote ?? "",
        editable: yn(r.editable),
      })),
    preview: (rows, { state }) =>
      rows.map((row, i) => {
        const id = cell(row, "id");
        const existing = state.rateCards.find((r) => r.id === id || r.label === cell(row, "label"));
        if (!cell(row, "label") && !existing) {
          return { line: i + 2, status: "error", key: id || `r${i}`, summary: "id or label required" };
        }
        const payload: RateCard = {
          id: existing?.id ?? (id || uid("rc")),
          kind: (cell(row, "kind") || existing?.kind || "pipeline") as RateCard["kind"],
          label: cell(row, "label") || existing?.label || "",
          unit: (cell(row, "unit") || existing?.unit || "m2") as RateCard["unit"],
          rateInr: num(cell(row, "rateInr"), existing?.rateInr ?? 0),
          paintLitresPerUnit: cell(row, "paintLitresPerUnit")
            ? num(cell(row, "paintLitresPerUnit"))
            : existing?.paintLitresPerUnit,
          manpowerDaysPerUnit: num(cell(row, "manpowerDaysPerUnit"), existing?.manpowerDaysPerUnit ?? 0),
          materialNote: cell(row, "materialNote") || existing?.materialNote,
          editable: cell(row, "editable") ? parseYn(cell(row, "editable")) : existing?.editable ?? true,
        };
        if (existing && existing.rateInr === payload.rateInr && existing.manpowerDaysPerUnit === payload.manpowerDaysPerUnit) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: payload.label, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: payload.id,
          summary: `${payload.label} · ₹${payload.rateInr}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyById(ctx, "rateCards", rows),
  },
];

function applyById<K extends keyof AppState>(
  ctx: OpsTransferCtx,
  key: K,
  rows: TransferPreviewRow[]
): { ok: boolean; added: number; updated: number } {
  const added = rows.filter((r) => r.status === "new").length;
  const updated = rows.filter((r) => r.status === "update").length;
  ctx.setState((s) => {
    const list = [...((s[key] as unknown as { id: string }[]) ?? [])];
    for (const r of rows) {
      const p = r.payload as { id: string };
      if (!p?.id) continue;
      const ix = list.findIndex((x) => x.id === p.id);
      if (ix >= 0) list[ix] = p;
      else list.push(p);
    }
    return { ...s, [key]: list };
  });
  return { ok: true, added, updated };
}

export function opsTransferSpec(id: OpsTransferId): OpsSheetSpec | undefined {
  return SPECS.find((s) => s.id === id);
}

export const OPS_TRANSFER_IDS = SPECS.map((s) => s.id);
