/**
 * Excel export / import for Work typed inputs (Owner / Super Admin).
 * Upload previews new / update / duplicate / error before write.
 */
import { cell } from "./excel-io";
import type { TransferPreviewRow } from "./transfer-types";
import type { Site, StaffMember } from "./types";
import type {
  DprEntry,
  DprReport,
  Expense,
  Jms,
  JmsPayment,
  JmsStatus,
  JmsSubmission,
  Job,
  PaintBatch,
  PaintLifecycle,
  PaintStep,
  PlanLine,
  ServiceItem,
  Stage,
  WorkOrder,
  WorkState,
} from "./work/types";
import { STAGES } from "./work/types";

export type WorkTransferId =
  | "serviceItems"
  | "workOrders"
  | "planLines"
  | "jobs"
  | "dprReports"
  | "dprEntries"
  | "jms"
  | "submissions"
  | "payments"
  | "expenses"
  | "paintBatches"
  | "paintSteps";

export interface WorkTransferCtx {
  work: WorkState;
  sites: Site[];
  staff: StaffMember[];
  /** Mutate work state */
  setWork: (fn: (w: WorkState) => WorkState) => void;
}

function siteByCode(sites: Site[], code: string) {
  return sites.find((s) => s.code.toLowerCase() === code.toLowerCase() || s.id === code);
}
function siteCode(sites: Site[], id: string) {
  return sites.find((s) => s.id === id)?.code ?? id;
}
function staffByKey(staff: StaffMember[], key: string) {
  const k = key.toLowerCase();
  return staff.find((s) => s.id === key || s.name.toLowerCase() === k);
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

export interface WorkSheetSpec {
  id: WorkTransferId;
  label: string;
  sheetName: string;
  headers: string[];
  exportRows: (ctx: WorkTransferCtx) => Record<string, string | number | boolean>[];
  preview: (rows: Record<string, string>[], ctx: WorkTransferCtx) => TransferPreviewRow[];
  apply: (rows: TransferPreviewRow[], ctx: WorkTransferCtx) => { ok: boolean; error?: string; added: number; updated: number };
}

const SPECS: WorkSheetSpec[] = [
  {
    id: "serviceItems",
    label: "Service items",
    sheetName: "Service items",
    headers: ["code", "mps", "description", "rate", "ratePending", "paintsPending", "defaultStages", "paintsJson"],
    exportRows: ({ work }) =>
      work.serviceItems.map((s) => ({
        code: s.code,
        mps: s.mps,
        description: s.description,
        rate: s.rate,
        ratePending: yn(!!s.ratePending),
        paintsPending: yn(!!s.paintsPending),
        defaultStages: s.defaultStages.join("|"),
        paintsJson: JSON.stringify(s.paints),
      })),
    preview: (rows, { work }) =>
      rows.map((row, i) => {
        const code = cell(row, "code");
        if (!code) return { line: i + 2, status: "error", key: `r${i}`, summary: "code required" };
        const stageIds = STAGES.map((s) => s.id);
        const stages = cell(row, "defaultStages")
          .split(/[|,]/)
          .map((x) => x.trim())
          .filter((x): x is Stage => stageIds.includes(x as Stage));
        let paints: ServiceItem["paints"] = [];
        try {
          paints = cell(row, "paintsJson") ? (JSON.parse(cell(row, "paintsJson")) as ServiceItem["paints"]) : [];
        } catch {
          return { line: i + 2, status: "error", key: code, summary: "paintsJson invalid" };
        }
        const payload: ServiceItem = {
          code,
          mps: cell(row, "mps") || "MPS-1",
          description: cell(row, "description") || code,
          uom: "M2",
          rate: num(cell(row, "rate")),
          ratePending: cell(row, "ratePending") ? parseYn(cell(row, "ratePending")) : false,
          paintsPending: cell(row, "paintsPending") ? parseYn(cell(row, "paintsPending")) : false,
          paints,
          defaultStages: stages.length ? stages : ["prep", "coat1", "coat2", "final"],
        };
        const existing = work.serviceItems.find((s) => s.code === code);
        if (existing && sameish(existing, payload)) {
          return { line: i + 2, status: "duplicate", key: code, summary: `${code} · ${payload.description}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: code,
          summary: `${code} · ${payload.description}`,
          payload,
        };
      }),
    apply: (rows, ctx) => {
      const added = rows.filter((r) => r.status === "new").length;
      const updated = rows.filter((r) => r.status === "update").length;
      ctx.setWork((w) => {
        const next = [...w.serviceItems];
        for (const r of rows) {
          const p = r.payload as ServiceItem;
          const ix = next.findIndex((x) => x.code === p.code);
          if (ix >= 0) next[ix] = p;
          else next.push(p);
        }
        return { ...w, serviceItems: next };
      });
      return { ok: true, added, updated };
    },
  },
  {
    id: "workOrders",
    label: "Work orders",
    sheetName: "Work orders",
    headers: ["siteCode", "woNo", "foNo", "validFrom", "validTo", "capInr", "scopeJson"],
    exportRows: ({ work, sites }) =>
      work.workOrders.map((o) => ({
        siteCode: siteCode(sites, o.siteId),
        woNo: o.woNo,
        foNo: o.foNo,
        validFrom: o.validFrom,
        validTo: o.validTo,
        capInr: o.capInr,
        scopeJson: JSON.stringify(o.scope),
      })),
    preview: (rows, { work, sites }) =>
      rows.map((row, i) => {
        const woNo = cell(row, "woNo");
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        if (!woNo || !site) {
          return { line: i + 2, status: "error", key: woNo || `r${i}`, summary: "siteCode and woNo required" };
        }
        let scope: Record<string, number> = {};
        try {
          scope = cell(row, "scopeJson") ? (JSON.parse(cell(row, "scopeJson")) as Record<string, number>) : {};
        } catch {
          return { line: i + 2, status: "error", key: woNo, summary: "scopeJson invalid" };
        }
        const existing = work.workOrders.find((o) => o.siteId === site.id && o.woNo === woNo);
        const payload: WorkOrder = {
          id: existing?.id ?? uid("wo"),
          woNo,
          foNo: cell(row, "foNo") || existing?.foNo || "",
          siteId: site.id,
          validFrom: cell(row, "validFrom") || existing?.validFrom || "",
          validTo: cell(row, "validTo") || existing?.validTo || "",
          capInr: num(cell(row, "capInr"), existing?.capInr ?? 0),
          scope,
        };
        if (existing && sameish({ ...existing, id: payload.id }, payload)) {
          return { line: i + 2, status: "duplicate", key: `${site.code}|${woNo}`, summary: woNo, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${site.code}|${woNo}`,
          summary: `${site.code} · ${woNo}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "workOrders", rows, (p) => (p as WorkOrder).id),
  },
  {
    id: "planLines",
    label: "Plan lines",
    sheetName: "Plan lines",
    headers: ["month", "siteCode", "plant", "serviceCode", "jobType", "planM2", "carriedM2", "supervisor"],
    exportRows: ({ work, sites, staff }) =>
      work.planLines.map((l) => ({
        month: l.month,
        siteCode: siteCode(sites, l.siteId),
        plant: l.plant,
        serviceCode: l.serviceCode,
        jobType: l.jobType,
        planM2: l.planM2,
        carriedM2: l.carriedM2,
        supervisor: staff.find((s) => s.id === l.supervisorId)?.name ?? l.supervisorId,
      })),
    preview: (rows, { work, sites, staff }) =>
      rows.map((row, i) => {
        const month = cell(row, "month");
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        const plant = cell(row, "plant");
        const serviceCode = cell(row, "serviceCode", "service");
        const sup = staffByKey(staff, cell(row, "supervisor", "supervisorId"));
        if (!month || !site || !plant || !serviceCode || !sup) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "month, site, plant, serviceCode, supervisor required" };
        }
        const existing = work.planLines.find(
          (l) =>
            l.month === month &&
            l.siteId === site.id &&
            l.plant === plant &&
            l.serviceCode === serviceCode &&
            l.supervisorId === sup.id
        );
        const payload: PlanLine = {
          id: existing?.id ?? uid("pl"),
          month,
          siteId: site.id,
          plant,
          serviceCode,
          jobType: cell(row, "jobType") || existing?.jobType || "painting",
          planM2: num(cell(row, "planM2"), existing?.planM2 ?? 0),
          carriedM2: num(cell(row, "carriedM2"), existing?.carriedM2 ?? 0),
          supervisorId: sup.id,
        };
        if (existing && existing.planM2 === payload.planM2 && existing.carriedM2 === payload.carriedM2) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: `${month} · ${plant} · ${serviceCode}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${month}|${site.code}|${plant}|${serviceCode}|${sup.id}`,
          summary: `${month} · ${plant} · ${serviceCode}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "planLines", rows, (p) => (p as PlanLine).id),
  },
  {
    id: "jobs",
    label: "Jobs",
    sheetName: "Jobs",
    headers: ["jobNo", "planLineId", "location", "startDate", "endDate", "stages", "status", "supervisor", "plannedM2", "plannedEnd"],
    exportRows: ({ work, staff }) =>
      work.jobs.map((j) => ({
        jobNo: j.jobNo,
        planLineId: j.planLineId,
        location: j.location,
        startDate: j.startDate,
        endDate: j.endDate ?? "",
        stages: j.stages.join("|"),
        status: j.status,
        supervisor: staff.find((s) => s.id === j.supervisorId)?.name ?? j.supervisorId,
        plannedM2: j.plannedM2 ?? "",
        plannedEnd: j.plannedEnd ?? "",
      })),
    preview: (rows, { work, staff }) =>
      rows.map((row, i) => {
        const jobNo = cell(row, "jobNo");
        if (!jobNo) return { line: i + 2, status: "error", key: `r${i}`, summary: "jobNo required" };
        const planLineId = cell(row, "planLineId");
        const plan = work.planLines.find((l) => l.id === planLineId);
        if (!plan) return { line: i + 2, status: "error", key: jobNo, summary: `Unknown planLineId ${planLineId}` };
        const sup = staffByKey(staff, cell(row, "supervisor", "supervisorId")) ?? staff.find((s) => s.id === plan.supervisorId);
        if (!sup) return { line: i + 2, status: "error", key: jobNo, summary: "supervisor required" };
        const stageIds = STAGES.map((s) => s.id);
        const stages = cell(row, "stages")
          .split(/[|,]/)
          .map((x) => x.trim())
          .filter((x): x is Stage => stageIds.includes(x as Stage));
        const existing = work.jobs.find((j) => j.jobNo === jobNo);
        const status = (cell(row, "status") || existing?.status || "open") as Job["status"];
        const payload: Job = {
          id: existing?.id ?? uid("job"),
          jobNo,
          planLineId,
          location: cell(row, "location") || existing?.location || "",
          startDate: cell(row, "startDate") || existing?.startDate || "",
          endDate: cell(row, "endDate") || existing?.endDate,
          stages: stages.length ? stages : existing?.stages ?? ["prep", "coat1", "coat2", "final"],
          status: ["open", "awaiting_sic", "closed"].includes(status) ? status : "open",
          supervisorId: sup.id,
          plannedM2: cell(row, "plannedM2") ? num(cell(row, "plannedM2")) : existing?.plannedM2,
          plannedEnd: cell(row, "plannedEnd") || existing?.plannedEnd,
          jmsId: existing?.jmsId,
          planStatus: existing?.planStatus,
        };
        if (existing && sameish(
          { location: existing.location, startDate: existing.startDate, stages: existing.stages, status: existing.status, plannedM2: existing.plannedM2 },
          { location: payload.location, startDate: payload.startDate, stages: payload.stages, status: payload.status, plannedM2: payload.plannedM2 }
        )) {
          return { line: i + 2, status: "duplicate", key: jobNo, summary: jobNo, detail: "Already in the system" };
        }
        return { line: i + 2, status: existing ? "update" : "new", key: jobNo, summary: `${jobNo} · ${payload.location}`, payload };
      }),
    apply: (rows, ctx) => applyList(ctx, "jobs", rows, (p) => (p as Job).id),
  },
  {
    id: "dprReports",
    label: "DPR reports",
    sheetName: "DPR reports",
    headers: [
      "id",
      "date",
      "siteCode",
      "plant",
      "submitterId",
      "submitterType",
      "status",
      "nextDayPlan",
      "note",
      "issues",
      "permitOk",
      "tbtDone",
      "zeroReason",
      "labourMarksJson",
    ],
    exportRows: ({ work, sites }) =>
      work.reports.map((r) => ({
        id: r.id,
        date: r.date,
        siteCode: siteCode(sites, r.siteId),
        plant: r.plant,
        submitterId: r.submitterId,
        submitterType: r.submitterType,
        status: r.status,
        nextDayPlan: r.nextDayPlan,
        note: r.note,
        issues: r.issues ?? "",
        permitOk: yn(!!r.permitOk),
        tbtDone: yn(!!r.tbtDone),
        zeroReason: r.zeroReason ?? "",
        labourMarksJson: JSON.stringify(r.labourMarks),
      })),
    preview: (rows, { work, sites }) =>
      rows.map((row, i) => {
        const date = cell(row, "date");
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        const plant = cell(row, "plant");
        const submitterId = cell(row, "submitterId");
        const submitterType = (cell(row, "submitterType") || "supervisor") as DprReport["submitterType"];
        if (!date || !site || !plant || !submitterId) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "date, site, plant, submitterId required" };
        }
        let labourMarks: DprReport["labourMarks"] = [];
        try {
          labourMarks = cell(row, "labourMarksJson")
            ? (JSON.parse(cell(row, "labourMarksJson")) as DprReport["labourMarks"])
            : [];
        } catch {
          return { line: i + 2, status: "error", key: `${date}|${submitterId}`, summary: "labourMarksJson invalid" };
        }
        const existing =
          work.reports.find((r) => r.id === cell(row, "id")) ||
          work.reports.find(
            (r) =>
              r.date === date &&
              r.siteId === site.id &&
              r.plant === plant &&
              r.submitterId === submitterId &&
              r.submitterType === submitterType
          );
        const now = new Date().toISOString();
        const payload: DprReport = {
          id: existing?.id ?? uid("rpt"),
          date,
          siteId: site.id,
          plant,
          submitterId,
          submitterType,
          status: (cell(row, "status") || existing?.status || "draft") as DprReport["status"],
          labourMarks,
          equipmentMarks: existing?.equipmentMarks ?? [],
          requests: existing?.requests ?? [],
          nextDayPlan: cell(row, "nextDayPlan") || existing?.nextDayPlan || "",
          note: cell(row, "note") || existing?.note || "",
          issues: cell(row, "issues") || existing?.issues,
          telegramDraftLines: existing?.telegramDraftLines ?? [],
          permitOk: cell(row, "permitOk") ? parseYn(cell(row, "permitOk")) : existing?.permitOk,
          tbtDone: cell(row, "tbtDone") ? parseYn(cell(row, "tbtDone")) : existing?.tbtDone,
          zeroReason: cell(row, "zeroReason") || existing?.zeroReason,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        if (existing && existing.note === payload.note && existing.status === payload.status && sameish(existing.labourMarks, payload.labourMarks)) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: `${date} · ${plant}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${date}|${site.code}|${plant}|${submitterId}`,
          summary: `${date} · ${plant} · ${submitterId}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "reports", rows, (p) => (p as DprReport).id),
  },
  {
    id: "dprEntries",
    label: "DPR entries",
    sheetName: "DPR entries",
    headers: ["id", "date", "jobNo", "stage", "litres", "dft", "paintSap", "enteredBy", "supervisor", "membersJson", "crewJson", "note"],
    exportRows: ({ work, staff }) =>
      work.dprs.map((e) => {
        const job = work.jobs.find((j) => j.id === e.jobId);
        return {
          id: e.id,
          date: e.date,
          jobNo: job?.jobNo ?? e.jobId,
          stage: e.stage,
          litres: e.litres,
          dft: e.dft ?? "",
          paintSap: e.paintSap ?? "",
          enteredBy: e.enteredBy,
          supervisor: staff.find((s) => s.id === e.supervisorId)?.name ?? e.supervisorId,
          membersJson: JSON.stringify(e.members),
          crewJson: JSON.stringify(e.crew ?? []),
          note: e.note ?? "",
        };
      }),
    preview: (rows, { work, staff }) =>
      rows.map((row, i) => {
        const date = cell(row, "date");
        const jobNo = cell(row, "jobNo");
        const stage = cell(row, "stage") as Stage;
        const job = work.jobs.find((j) => j.jobNo === jobNo || j.id === jobNo);
        if (!date || !job || !STAGES.some((s) => s.id === stage)) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "date, jobNo, stage required" };
        }
        const enteredBy = (cell(row, "enteredBy") || "supervisor") as DprEntry["enteredBy"];
        const sup = staffByKey(staff, cell(row, "supervisor")) ?? staff.find((s) => s.id === job.supervisorId);
        if (!sup) return { line: i + 2, status: "error", key: `${jobNo}|${date}|${stage}`, summary: "supervisor required" };
        let members: DprEntry["members"] = [];
        let crew: string[] = [];
        try {
          members = cell(row, "membersJson") ? (JSON.parse(cell(row, "membersJson")) as DprEntry["members"]) : [];
          crew = cell(row, "crewJson") ? (JSON.parse(cell(row, "crewJson")) as string[]) : [];
        } catch {
          return { line: i + 2, status: "error", key: `${jobNo}|${date}`, summary: "membersJson/crewJson invalid" };
        }
        const existing =
          work.dprs.find((e) => e.id === cell(row, "id")) ||
          work.dprs.find((e) => e.jobId === job.id && e.date === date && e.stage === stage && e.enteredBy === enteredBy);
        const payload: DprEntry = {
          id: existing?.id ?? uid("dpr"),
          date,
          jobId: job.id,
          reportId: existing?.reportId,
          stage,
          members,
          paintSap: cell(row, "paintSap") || existing?.paintSap,
          litres: num(cell(row, "litres"), existing?.litres ?? 0),
          dft: cell(row, "dft") ? num(cell(row, "dft")) : existing?.dft,
          supervisorId: sup.id,
          enteredBy,
          note: cell(row, "note") || existing?.note,
          crew,
        };
        if (existing && existing.litres === payload.litres && sameish(existing.members, payload.members)) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: `${jobNo} · ${date} · ${stage}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${job.jobNo}|${date}|${stage}|${enteredBy}`,
          summary: `${job.jobNo} · ${date} · ${stage}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "dprs", rows, (p) => (p as DprEntry).id),
  },
  {
    id: "jms",
    label: "Internal JMS",
    sheetName: "Internal JMS",
    headers: ["jmsNo", "jobNo", "serviceCode", "qty", "rate", "amount", "periodFrom", "periodTo", "status", "woId", "confirmedOn", "rilJmsNo"],
    exportRows: ({ work }) =>
      work.jms.map((j) => {
        const job = work.jobs.find((x) => x.id === j.jobId);
        return {
          jmsNo: j.jmsNo,
          jobNo: job?.jobNo ?? j.jobId,
          serviceCode: j.serviceCode,
          qty: j.qty,
          rate: j.rate,
          amount: j.amount,
          periodFrom: j.periodFrom,
          periodTo: j.periodTo,
          status: j.status,
          woId: j.woId,
          confirmedOn: j.confirmedOn,
          rilJmsNo: j.rilJmsNo ?? "",
        };
      }),
    preview: (rows, { work }) =>
      rows.map((row, i) => {
        const jmsNo = cell(row, "jmsNo");
        const job = work.jobs.find((j) => j.jobNo === cell(row, "jobNo") || j.id === cell(row, "jobNo"));
        if (!jmsNo || !job) return { line: i + 2, status: "error", key: jmsNo || `r${i}`, summary: "jmsNo and jobNo required" };
        const plan = work.planLines.find((l) => l.id === job.planLineId);
        const existing = work.jms.find((j) => j.jmsNo === jmsNo) || work.jms.find((j) => j.jobId === job.id);
        const payload: Jms = {
          id: existing?.id ?? uid("jms"),
          jmsNo,
          jobId: job.id,
          planLineId: plan?.id ?? existing?.planLineId ?? job.planLineId,
          serviceCode: cell(row, "serviceCode") || plan?.serviceCode || existing?.serviceCode || "",
          qty: num(cell(row, "qty"), existing?.qty ?? 0),
          rate: num(cell(row, "rate"), existing?.rate ?? 0),
          amount: num(cell(row, "amount"), existing?.amount ?? 0),
          periodFrom: cell(row, "periodFrom") || existing?.periodFrom || "",
          periodTo: cell(row, "periodTo") || existing?.periodTo || "",
          status: (cell(row, "status") || existing?.status || "JMS SUBMITTED") as JmsStatus,
          woId: cell(row, "woId") || existing?.woId || "",
          confirmedOn: cell(row, "confirmedOn") || existing?.confirmedOn || "",
          rilJmsNo: cell(row, "rilJmsNo") || existing?.rilJmsNo,
          payment: existing?.payment,
          adminStatus: existing?.adminStatus,
        };
        if (existing && existing.qty === payload.qty && existing.amount === payload.amount && existing.status === payload.status) {
          return { line: i + 2, status: "duplicate", key: jmsNo, summary: jmsNo, detail: "Already in the system" };
        }
        return { line: i + 2, status: existing ? "update" : "new", key: jmsNo, summary: `${jmsNo} · ${payload.qty} m²`, payload };
      }),
    apply: (rows, ctx) => applyList(ctx, "jms", rows, (p) => (p as Jms).id),
  },
  {
    id: "submissions",
    label: "JMS submissions",
    sheetName: "JMS submissions",
    headers: ["rilJmsNo", "siteCode", "plant", "woNo", "foNo", "periodFrom", "periodTo", "status", "invoiceNo", "itemsJson", "excelName", "pdfName"],
    exportRows: ({ work, sites }) =>
      work.submissions.map((s) => ({
        rilJmsNo: s.rilJmsNo,
        siteCode: siteCode(sites, s.siteId),
        plant: s.plant,
        woNo: s.woNo,
        foNo: s.foNo ?? "",
        periodFrom: s.periodFrom,
        periodTo: s.periodTo,
        status: s.status,
        invoiceNo: s.invoiceNo ?? "",
        itemsJson: JSON.stringify(s.items),
        excelName: s.files.excelName ?? "",
        pdfName: s.files.pdfName ?? "",
      })),
    preview: (rows, { work, sites }) =>
      rows.map((row, i) => {
        const rilJmsNo = cell(row, "rilJmsNo");
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        if (!rilJmsNo || !site) return { line: i + 2, status: "error", key: rilJmsNo || `r${i}`, summary: "rilJmsNo and siteCode required" };
        let items: JmsSubmission["items"] = [];
        try {
          items = cell(row, "itemsJson") ? (JSON.parse(cell(row, "itemsJson")) as JmsSubmission["items"]) : [];
        } catch {
          return { line: i + 2, status: "error", key: rilJmsNo, summary: "itemsJson invalid" };
        }
        const qty = items.reduce((t, x) => t + x.qty, 0);
        const amount = items.reduce((t, x) => t + x.amount, 0);
        const existing = work.submissions.find((s) => s.rilJmsNo === rilJmsNo);
        const now = new Date().toISOString();
        const payload: JmsSubmission = {
          id: existing?.id ?? uid("sub"),
          rilJmsNo,
          siteId: site.id,
          plant: cell(row, "plant") || existing?.plant || "",
          woNo: cell(row, "woNo") || existing?.woNo || "",
          foNo: cell(row, "foNo") || existing?.foNo,
          periodFrom: cell(row, "periodFrom") || existing?.periodFrom || "",
          periodTo: cell(row, "periodTo") || existing?.periodTo || "",
          items,
          qty,
          amount,
          status: (cell(row, "status") || existing?.status || "JMS SUBMITTED") as JmsSubmission["status"],
          statusLog: existing?.statusLog ?? [{ status: "JMS SUBMITTED", at: now, by: "excel-upload" }],
          invoiceNo: cell(row, "invoiceNo") || existing?.invoiceNo,
          files: {
            excelName: cell(row, "excelName") || existing?.files.excelName,
            pdfName: cell(row, "pdfName") || existing?.files.pdfName,
          },
          uploadedBy: existing?.uploadedBy ?? "excel-upload",
          uploadedAt: existing?.uploadedAt ?? now,
          jmsId: existing?.jmsId,
        };
        if (existing && existing.qty === payload.qty && existing.amount === payload.amount && existing.status === payload.status) {
          return { line: i + 2, status: "duplicate", key: rilJmsNo, summary: rilJmsNo, detail: "Already in the system" };
        }
        return { line: i + 2, status: existing ? "update" : "new", key: rilJmsNo, summary: `${rilJmsNo} · ₹${amount}`, payload };
      }),
    apply: (rows, ctx) => applyList(ctx, "submissions", rows, (p) => (p as JmsSubmission).id),
  },
  {
    id: "payments",
    label: "JMS payments",
    sheetName: "Payments",
    headers: ["jmsNo", "receivedOn", "amount", "reason", "note"],
    exportRows: ({ work }) =>
      work.jms
        .filter((j) => j.payment)
        .map((j) => ({
          jmsNo: j.jmsNo,
          receivedOn: j.payment!.receivedOn,
          amount: j.payment!.amount,
          reason: j.payment!.reason ?? "",
          note: j.payment!.note ?? "",
        })),
    preview: (rows, { work }) =>
      rows.map((row, i) => {
        const jmsNo = cell(row, "jmsNo");
        const jms = work.jms.find((j) => j.jmsNo === jmsNo);
        if (!jms) return { line: i + 2, status: "error", key: jmsNo || `r${i}`, summary: `Unknown JMS ${jmsNo}` };
        const payment: JmsPayment = {
          receivedOn: cell(row, "receivedOn"),
          amount: num(cell(row, "amount")),
          reason: (cell(row, "reason") || undefined) as JmsPayment["reason"],
          note: cell(row, "note") || undefined,
        };
        if (!payment.receivedOn) return { line: i + 2, status: "error", key: jmsNo, summary: "receivedOn required" };
        if (jms.payment && jms.payment.amount === payment.amount && jms.payment.receivedOn === payment.receivedOn) {
          return { line: i + 2, status: "duplicate", key: jmsNo, summary: jmsNo, detail: "Same payment already recorded" };
        }
        return {
          line: i + 2,
          status: jms.payment ? "update" : "new",
          key: jmsNo,
          summary: `${jmsNo} · ₹${payment.amount}`,
          payload: { jmsId: jms.id, payment },
        };
      }),
    apply: (rows, ctx) => {
      const added = rows.filter((r) => r.status === "new").length;
      const updated = rows.filter((r) => r.status === "update").length;
      ctx.setWork((w) => ({
        ...w,
        jms: w.jms.map((j) => {
          const hit = rows.find((r) => r.payload?.jmsId === j.id);
          if (!hit) return j;
          return { ...j, payment: hit.payload.payment as JmsPayment };
        }),
      }));
      return { ok: true, added, updated };
    },
  },
  {
    id: "expenses",
    label: "Expenses",
    sheetName: "Expenses",
    headers: ["id", "date", "time", "month", "siteCode", "kind", "category", "amount", "jobNo", "vendor", "paymentMode", "note", "billFile", "billPending"],
    exportRows: ({ work, sites }) =>
      work.expenses.map((e) => {
        const job = e.jobId ? work.jobs.find((j) => j.id === e.jobId) : undefined;
        return {
          id: e.id,
          date: e.date,
          time: e.time ?? "",
          month: e.month,
          siteCode: siteCode(sites, e.siteId),
          kind: e.kind,
          category: e.category,
          amount: e.amount,
          jobNo: job?.jobNo ?? "",
          vendor: e.vendor ?? "",
          paymentMode: e.paymentMode ?? "",
          note: e.note ?? "",
          billFile: e.billFile ?? "",
          billPending: yn(!!e.billPending),
        };
      }),
    preview: (rows, { work, sites }) =>
      rows.map((row, i) => {
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        const date = cell(row, "date");
        const amount = num(cell(row, "amount"));
        const category = cell(row, "category");
        if (!site || !date || !category) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "siteCode, date, category required" };
        }
        const jobNo = cell(row, "jobNo");
        const job = jobNo ? work.jobs.find((j) => j.jobNo === jobNo) : undefined;
        const existing =
          work.expenses.find((e) => e.id === cell(row, "id")) ||
          work.expenses.find(
            (e) =>
              e.siteId === site.id &&
              e.date === date &&
              (e.time || "") === cell(row, "time") &&
              e.amount === amount &&
              e.category === category &&
              !e.voided
          );
        const payload: Expense = {
          id: existing?.id ?? uid("exp"),
          date,
          time: cell(row, "time") || undefined,
          month: cell(row, "month") || date.slice(0, 7),
          siteId: site.id,
          kind: (cell(row, "kind") || "direct") as Expense["kind"],
          category,
          amount,
          jobId: job?.id ?? existing?.jobId,
          vendor: cell(row, "vendor") || existing?.vendor,
          paymentMode: (cell(row, "paymentMode") || existing?.paymentMode) as Expense["paymentMode"],
          note: cell(row, "note") || existing?.note,
          billFile: cell(row, "billFile") || existing?.billFile,
          billPending: cell(row, "billPending") ? parseYn(cell(row, "billPending")) : existing?.billPending,
          enteredBy: existing?.enteredBy ?? "excel-upload",
          enteredAt: existing?.enteredAt ?? new Date().toISOString(),
        };
        if (existing && existing.amount === payload.amount && existing.note === payload.note) {
          return { line: i + 2, status: "duplicate", key: payload.id, summary: `${date} · ${category}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: payload.id,
          summary: `${date} · ${category} · ₹${amount}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "expenses", rows, (p) => (p as Expense).id),
  },
  {
    id: "paintBatches",
    label: "Paint batches",
    sheetName: "Paint batches",
    headers: ["siteCode", "sap", "name", "batch", "qtyL", "lifecycle", "prNo", "poNo", "mps", "mfg", "expiry", "supervisor"],
    exportRows: ({ work, sites, staff }) =>
      work.paint.map((b) => ({
        siteCode: siteCode(sites, b.siteId),
        sap: b.sap,
        name: b.name,
        batch: b.batch,
        qtyL: b.qtyL,
        lifecycle: b.lifecycle ?? "sge_receive",
        prNo: b.prNo ?? "",
        poNo: b.poNo ?? "",
        mps: b.mps ?? "",
        mfg: b.mfg,
        expiry: b.expiry,
        supervisor: b.supervisorId ? staff.find((s) => s.id === b.supervisorId)?.name ?? b.supervisorId : "",
      })),
    preview: (rows, { work, sites, staff }) =>
      rows.map((row, i) => {
        const site = siteByCode(sites, cell(row, "siteCode", "site"));
        const sap = cell(row, "sap");
        const batch = cell(row, "batch");
        if (!site || !sap || !batch) return { line: i + 2, status: "error", key: `r${i}`, summary: "siteCode, sap, batch required" };
        const existing = work.paint.find((b) => b.siteId === site.id && b.sap === sap && b.batch === batch && !b.supervisorId);
        const sup = cell(row, "supervisor") ? staffByKey(staff, cell(row, "supervisor")) : null;
        const payload: PaintBatch = {
          id: existing?.id ?? uid("pb"),
          sap,
          name: cell(row, "name") || existing?.name || sap,
          batch,
          qtyL: num(cell(row, "qtyL"), existing?.qtyL ?? 0),
          supervisorId: sup?.id ?? existing?.supervisorId ?? null,
          mfg: cell(row, "mfg") || existing?.mfg || "",
          expiry: cell(row, "expiry") || existing?.expiry || "",
          siteId: site.id,
          lifecycle: (cell(row, "lifecycle") || existing?.lifecycle || "sge_receive") as PaintLifecycle,
          prNo: cell(row, "prNo") || existing?.prNo,
          poNo: cell(row, "poNo") || existing?.poNo,
          mps: cell(row, "mps") || existing?.mps,
          updatedAt: new Date().toISOString(),
        };
        if (existing && existing.qtyL === payload.qtyL && existing.lifecycle === payload.lifecycle) {
          return { line: i + 2, status: "duplicate", key: `${site.code}|${sap}|${batch}`, summary: `${sap} · ${batch}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${site.code}|${sap}|${batch}`,
          summary: `${sap} · ${batch} · ${payload.qtyL} L`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "paint", rows, (p) => (p as PaintBatch).id),
  },
  {
    id: "paintSteps",
    label: "Paint steps",
    sheetName: "Paint steps",
    headers: ["step", "sap", "month", "supervisor", "litres", "date", "rilRef", "rilLitres", "batchId", "recoId"],
    exportRows: ({ work, staff }) =>
      work.paintSteps.map((s) => ({
        step: s.step,
        sap: s.sap,
        month: s.month,
        supervisor: staff.find((x) => x.id === s.supervisorId)?.name ?? s.supervisorId,
        litres: s.litres,
        date: s.date,
        rilRef: s.rilRef ?? "",
        rilLitres: s.rilLitres ?? "",
        batchId: s.batchId ?? "",
        recoId: s.recoId ?? "",
      })),
    preview: (rows, { work, staff }) =>
      rows.map((row, i) => {
        const step = cell(row, "step") as PaintStep["step"];
        const sap = cell(row, "sap");
        const month = cell(row, "month");
        const sup = staffByKey(staff, cell(row, "supervisor"));
        if (!["941", "942", "261"].includes(step) || !sap || !month || !sup) {
          return { line: i + 2, status: "error", key: `r${i}`, summary: "step, sap, month, supervisor required" };
        }
        const existing = work.paintSteps.find(
          (s) => s.step === step && s.sap === sap && s.month === month && s.supervisorId === sup.id
        );
        const payload: PaintStep = {
          id: existing?.id ?? uid("ps"),
          step,
          sap,
          month,
          supervisorId: sup.id,
          litres: num(cell(row, "litres"), existing?.litres ?? 0),
          date: cell(row, "date") || existing?.date || `${month}-01`,
          by: existing?.by ?? "excel-upload",
          rilRef: cell(row, "rilRef") || existing?.rilRef,
          rilLitres: cell(row, "rilLitres") ? num(cell(row, "rilLitres")) : existing?.rilLitres,
          batchId: cell(row, "batchId") || existing?.batchId,
          recoId: cell(row, "recoId") || existing?.recoId,
        };
        if (existing && existing.litres === payload.litres && existing.rilRef === payload.rilRef && existing.rilLitres === payload.rilLitres) {
          return { line: i + 2, status: "duplicate", key: `${step}|${sap}|${month}|${sup.id}`, summary: `${step} · ${sap} · ${month}`, detail: "Already in the system" };
        }
        return {
          line: i + 2,
          status: existing ? "update" : "new",
          key: `${step}|${sap}|${month}|${sup.id}`,
          summary: `${step} · ${sap} · ${month}`,
          payload,
        };
      }),
    apply: (rows, ctx) => applyList(ctx, "paintSteps", rows, (p) => (p as PaintStep).id),
  },
];

function applyList<K extends keyof WorkState>(
  ctx: WorkTransferCtx,
  key: K,
  rows: TransferPreviewRow[],
  idOf: (p: unknown) => string
): { ok: boolean; added: number; updated: number } {
  const added = rows.filter((r) => r.status === "new").length;
  const updated = rows.filter((r) => r.status === "update").length;
  ctx.setWork((w) => {
    const list = [...(w[key] as unknown as { id: string }[])];
    for (const r of rows) {
      const p = r.payload as { id: string };
      if (!p) continue;
      const id = idOf(p);
      const ix = list.findIndex((x) => x.id === id);
      if (ix >= 0) list[ix] = p;
      else list.push(p);
    }
    return { ...w, [key]: list };
  });
  return { ok: true, added, updated };
}

export function workTransferSpec(id: WorkTransferId): WorkSheetSpec | undefined {
  return SPECS.find((s) => s.id === id);
}

export const WORK_TRANSFER_IDS = SPECS.map((s) => s.id);
