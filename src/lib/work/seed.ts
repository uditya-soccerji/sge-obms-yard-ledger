/**
 * Work demo data built from the real DTA documents:
 * - August 2026 plan + actuals: "DTA JOB PLAN AUG-26" / "DTA JOB PLANNED VS ACTUAL AUG-26"
 * - JMS 2741381 (Coker, MPS-1, 681.765 m² × ₹169.78) and its measurement pages
 * - rates from "DTA MONTHLY PAINT RECO JULY 2026"; codes marked PEND-* await the ARC list
 * August is closed; its unfinished balance is carried into September (open),
 * which has live jobs and DPRs to show the flow.
 */
import type { RoleId } from "../types";
import { reasonText, type WorkEvent } from "./events";
import { entryArea, lineStatus, round3 } from "./logic";
import { STAGES } from "./types";
import { blankReport } from "./reports";
import { sampleDprReports } from "../seed";
import type {
  DprEntry,
  DprReport,
  Jms,
  JmsStatus,
  Job,
  Member,
  PaintBatch,
  PlanLine,
  ServiceItem,
  WorkState,
} from "./types";

/** v8: fresh start — a new browser starts on an empty current month; the demo loads from Test tools */
export const WORK_STORAGE_KEY = "sge-work-v9";
/** "Today" for the work demo (DPR dates, expiry warnings). */
export const WORK_TODAY = "2026-09-28";

const SITE = "site-dta";
const SUP_A = "st-sup1"; // V. Chauhan
const SUP_B = "st-sup2"; // K. Solanki
const WO_ID = "wo-dta-rp2";

const ALL4 = ["prep", "coat1", "coat2", "final"] as const;
const T17 = { sap: "2002462162", name: "TYPE 17 PAINT", normL: 0.271 };
const T6 = { sap: "2002462245", name: "TYPE 6 PAINT", normL: 0.156 };

const SERVICE_ITEMS: ServiceItem[] = [
  { code: "3378150", mps: "MPS-1", description: "APLY MPS1 - HANDTOOL CLG - BRUSHROLLER", uom: "M2", rate: 169.78, paints: [T17, T6], defaultStages: [...ALL4] },
  { code: "3378278", mps: "MPS-1", description: "APLY MPS1 - POWER TOOL CLG - BRUSHROLLER", uom: "M2", rate: 216.78, paints: [T17, T6], defaultStages: [...ALL4] },
  { code: "3378180", mps: "MPS-3", description: "APLY MPS3 - BLASTING CLG - SPRAY APLY", uom: "M2", rate: 684.93, paints: [{ sap: "2002462154", name: "TYPE 24 PAINT", normL: 0.411 }, T6], defaultStages: [...ALL4] },
  { code: "3378276", mps: "MPS-4", description: "APLY MPS4 - BLAST CLG - SPRAY APLY", uom: "M2", rate: 629.81, paints: [{ sap: "2002462128", name: "TYPE 23 PAINT", normL: 0.4 }], defaultStages: ["prep", "coat1", "final"] },
  { code: "3378275", mps: "MPS-6", description: "APLY MPS6 - HANDTOOL - BRUSHROLLER APLY", uom: "M2", rate: 191.56, paints: [{ sap: "2002462133", name: "TYPE 2 PAINT", normL: 0.176 }], defaultStages: [...ALL4] },
  { code: "3378301", mps: "MPS-23", description: "APLY MPS23 - HANDTOOL - BRUSHROLLER APLY", uom: "M2", rate: 117.14, paints: [{ sap: "2002462190", name: "TYPE 6 PAINT", normL: 0.156 }], defaultStages: [...ALL4] },
  { code: "PEND-MPS8", mps: "MPS-8", description: "MPS8 - BLASTING & SPRAY PAINTING (rate pending)", uom: "M2", rate: 650, ratePending: true, paintsPending: true,
    // Paint list for MPS-8 not received yet: litres go against a placeholder with no norm
    paints: [{ sap: "PEND-MPS8-PAINT", name: "MPS-8 PAINT (SAP PENDING)", normL: 0 }], defaultStages: [...ALL4] },
  { code: "PEND-MPS13", mps: "MPS-13", description: "MPS13 - MANUAL CLEANING & BRUSH PAINTING (rate pending)", uom: "M2", rate: 180, ratePending: true, paints: [T17, T6], defaultStages: [...ALL4] },
  { code: "PEND-MPS23S", mps: "MPS-23", description: "MPS23 - MANUAL CLEANING & SPRAY PAINTING (rate pending)", uom: "M2", rate: 130, ratePending: true, paints: [{ sap: "2002462190", name: "TYPE 6 PAINT", normL: 0.156 }], defaultStages: [...ALL4] },
  { code: "PEND-BLAST-INT", mps: "BLASTING", description: "INTERNAL BLASTING (rate pending)", uom: "M2", rate: 300, ratePending: true, paints: [], defaultStages: ["prep"] },
  { code: "PEND-BLAST-EXT", mps: "BLASTING", description: "EXTERNAL BLASTING (rate pending)", uom: "M2", rate: 260, ratePending: true, paints: [], defaultStages: ["prep"] },
];

// [plant, service code, job type, plan m², actual m²] — DTA August 2026
const AUG: [string, string, string, number, number][] = [
  ["AROMATIC", "3378276", "BLASTING & SPRAY PAINTING JOB", 400, 405.162],
  ["AROMATIC", "PEND-BLAST-INT", "INTERNAL BLASTING", 10, 10.274],
  ["CES", "3378150", "MANUAL CLEANING & BRUSH PAINTING JOB", 230, 224.433],
  ["COKER", "3378150", "MANUAL CLEANING & BRUSH PAINTING JOB", 800, 781.765],
  ["COKER", "3378180", "BLASTING & SPRAY PAINTING JOB", 580, 557.72],
  ["CRUDE", "3378276", "BLASTING & SPRAY PAINTING JOB", 300, 309.003],
  ["CRUDE", "3378180", "BLASTING & SPRAY PAINTING JOB", 800, 789.377],
  ["CRUDE", "PEND-MPS13", "MANUAL CLEANING & BRUSH PAINTING JOB", 3300, 3171.071],
  ["FCCU", "PEND-MPS13", "MANUAL CLEANING & BRUSH PAINTING JOB", 1550, 1536.428],
  ["FCCU", "3378180", "BLASTING & SPRAY PAINTING JOB", 1000, 964.559],
  ["HYDROGEN", "PEND-BLAST-INT", "INTERNAL BLASTING", 50, 51.757],
  ["HYDROGEN", "3378301", "MANUAL CLEANING & BRUSH PAINTING JOB", 330, 320.355],
  ["HYDROGEN", "PEND-MPS23S", "MANUAL CLEANING & SPRAY PAINTING JOB", 1050, 1042.365],
  ["HYDROGEN", "PEND-MPS13", "MANUAL CLEANING & BRUSH PAINTING JOB", 650, 636.638],
  ["HYDROGEN", "3378180", "BLASTING & SPRAY PAINTING JOB", 600, 595.114],
  ["HYDROTREATER", "3378180", "BLASTING & SPRAY PAINTING JOB", 1600, 1566.782],
  ["HYDROTREATER", "3378275", "MANUAL CLEANING & SPRAY PAINTING JOB", 3000, 3055.396],
  ["HYDROTREATER", "3378278", "POWERTOOL & BRUSH PAINTING JOB", 20, 20.956],
  ["PP", "3378180", "BLASTING & SPRAY PAINTING JOB", 1100, 1134.215],
  ["PRU & HPIB", "3378180", "BLASTING & SPRAY PAINTING JOB", 1000, 1053.55],
  ["PRU & HPIB", "3378276", "BLASTING & SPRAY PAINTING JOB", 80, 80.951],
  ["PRU & HPIB", "PEND-BLAST-EXT", "EXTERNAL BLASTING JOB", 260, 263.41],
  ["PRU & HPIB", "PEND-BLAST-INT", "INTERNAL BLASTING JOB", 125, 122.318],
  ["RTF", "3378180", "BLASTING & SPRAY PAINTING JOB", 6000, 6016.125],
  ["RTF", "3378150", "MANUAL CLEANING & BRUSH PAINTING JOB", 850, 844.844],
  ["SULPHUR", "3378276", "BLASTING & SPRAY PAINTING JOB", 70, 66.928],
  ["SULPHUR", "3378180", "BLASTING & SPRAY PAINTING JOB", 1400, 1348.491],
  ["UTILITY & ETP", "3378180", "BLASTING & SPRAY PAINTING JOB", 1700, 1648.585],
  ["UTILITY & ETP", "PEND-MPS8", "BLASTING & SPRAY PAINTING JOB", 550, 531.894],
];

// Plants per supervisor at DTA
const SUP_OF: Record<string, string> = {
  COKER: SUP_A, CES: SUP_A, AROMATIC: SUP_A, HYDROGEN: SUP_A, PP: SUP_A, SULPHUR: SUP_A,
  CRUDE: SUP_B, FCCU: SUP_B, HYDROTREATER: SUP_B, "PRU & HPIB": SUP_B, RTF: SUP_B, "UTILITY & ETP": SUP_B,
};

// Members from the real Coker measurement sheet 1 (SILO COKE LOADING), total 193.911 m²
const COKER_PAGE1: Member[] = [
  { name: "BOX BEAM 100 X 100", nos: 6, side: 1, length: 5.53, cf: 0.4 },
  { name: "ATTACH PLATE", nos: 8, side: 1, length: 0.35, cf: 0.27 },
  { name: "ATTACH PLATE", nos: 8, side: 1, length: 0.61, cf: 0.42 },
  { name: "VERTICAL BOX BEAM 100 X 100", nos: 12, side: 1, length: 0.22, cf: 0.4 },
  { name: "VERTICAL ISMC 100 X 50", nos: 6, side: 1, length: 0.61, cf: 0.4 },
  { name: "SLOP PLATE", nos: 2, side: 1, length: 5.33, cf: 3.98 },
  { name: "SIDE PLATE", nos: 4, side: 1, length: 5.33, cf: 0.56 },
  { name: "SIDE PLATE", nos: 2, side: 1, length: 3.98, cf: 0.53 },
  { name: "LOAD PLATE", nos: 3, side: 1, length: 6.03, cf: 3.98 },
  { name: "LOAD PLATE SIDE PLATE", nos: 6, side: 1, length: 6.03, cf: 0.49 },
  { name: "LOAD PLATE SIDE PLATE", nos: 6, side: 1, length: 3.98, cf: 0.26 },
  { name: "BOTTOM PLATE", nos: 4, side: 1, length: 4.35, cf: 0.69 },
  { name: "BOX BEAM VERTICAL BOX 50 X 50", nos: 12, side: 1, length: 2.96, cf: 0.2 },
  { name: "TABLE PLATE", nos: 6, side: 1, length: 0.61, cf: 0.46 },
];

// Members from Coker measurement sheet 2 (TT3 AREA)
const COKER_TT3: Member[] = [
  { name: "VERTICAL ISMB 350 X 140", nos: 1, side: 1, length: 3.73, cf: 1.26 },
  { name: "VERTICAL ISMB 350 X 140", nos: 1, side: 1, length: 1.13, cf: 1.26 },
  { name: "VERTICAL ISMB 350 X 140", nos: 1, side: 1, length: 3.69, cf: 1.26 },
  { name: "E/W HORIZONTAL ISMB 350 X 140", nos: 1, side: 1, length: 1.34, cf: 1.26 },
  { name: "CROSS ISA 65 X 65", nos: 2, side: 1, length: 3.47, cf: 0.26 },
  { name: "E/W ISMC 300 X 75", nos: 4, side: 1, length: 1.2, cf: 0.9 },
  { name: "VERTICAL ISMC 100 X 50", nos: 4, side: 1, length: 1.24, cf: 0.4 },
];

/** A simple pipe-rack member list sized to a target area (demo jobs). */
function rack(target: number): Member[] {
  // ISMB 300 × 140 girth ≈ 1.16 m
  const len = round3(target / (10 * 1.16));
  return [{ name: "PIPE RACK ISMB 300 X 140", nos: 10, side: 1, length: len, cf: 1.16 }];
}

/** Demo productivity: labour-days per m² by MPS (August history has no crews). */
const LABOUR_PER_M2: Record<string, number> = {
  "MPS-1": 0.11, "MPS-3": 0.16, "MPS-4": 0.17, "MPS-6": 0.07, "MPS-8": 0.16,
  "MPS-13": 0.09, "MPS-23": 0.08, BLASTING: 0.1,
};
const AUG_WAGE = 820;

// DTA crews (labourer ids from the main seed, by supervisor)
const CREW_A = ["lb-01", "lb-02", "lb-08", "lb-09", "lb-x-2", "lb-x-4"];
const CREW_A2 = ["lb-x-6", "lb-x-8", "lb-x-10", "lb-x-12"];
const CREW_B = ["lb-03", "lb-04", "lb-07"];

const JMS_STATUS_AUG: JmsStatus[] = ["INVOICE UPLOADED", "A3 APR", "A2 APR", "INVOICE UPLOADED", "A1 APR"];

/**
 * The starting state (merge plan Step 1, Owner decision 1): masters only —
 * service items and work orders — and nothing done yet. Plan months start at
 * the month given (the current month).
 */
export function createEmptyWork(month: string): WorkState {
  const demo = createWorkSeed();
  return {
    serviceItems: demo.serviceItems,
    workOrders: demo.workOrders,
    planLines: [],
    jobs: [],
    reports: [],
    dprs: [],
    jms: [],
    paint: [],
    expenses: [],
    events: [],
    lastSeen: {},
    siteMonths: {},
    defaultMonth: month,
  };
}

/** The DTA Aug–Sep demo, loaded only from Test tools. */
export function createWorkSeed(): WorkState {
  const planLines: PlanLine[] = [];
  const jobs: Job[] = [];
  const jms: Jms[] = [];
  const dprs: DprEntry[] = [];
  const rateOf = (code: string) => SERVICE_ITEMS.find((s) => s.code === code)!.rate;
  // Generated JMS numbers start after the real one (2741381) so they never collide
  let jmsSeq = 2741381;
  let jobSeq = 100;

  const addJms = (job: Job, line: PlanLine, qty: number, from: string, to: string, status: JmsStatus, no?: string, confirmedOn = to) => {
    const rate = rateOf(line.serviceCode);
    const id = `jms-${no ?? ++jmsSeq}`;
    jms.push({ id, jmsNo: no ?? String(jmsSeq), jobId: job.id, planLineId: line.id, serviceCode: line.serviceCode, qty, rate, amount: Math.round(qty * rate * 100) / 100, periodFrom: from, periodTo: to, status, woId: WO_ID, confirmedOn, ratePending: SERVICE_ITEMS.find((s) => s.code === line.serviceCode)?.ratePending || undefined });
    job.jmsId = id;
    return jms[jms.length - 1];
  };

  // August — closed month: one closed job + JMS per line (Coker MPS-1 has two)
  AUG.forEach(([plant, code, jobType, plan, actual], i) => {
    const line: PlanLine = { id: `pl-2608-${i + 1}`, month: "2026-08", siteId: SITE, plant, serviceCode: code, jobType, planM2: plan, carriedM2: 0, supervisorId: SUP_OF[plant] };
    planLines.push(line);
    const parts = plant === "COKER" && code === "3378150" ? [681.765, 100] : [actual];
    parts.forEach((qty, k) => {
      const job: Job = { id: `job-2608-${i + 1}-${k + 1}`, jobNo: `J-DTA-${String(++jobSeq).padStart(4, "0")}`, planLineId: line.id, location: k === 0 && parts.length > 1 ? "SILO COKE LOADING / TT3 / C-53 & TT4 / TT5" : `${plant} area`, startDate: "2026-08-01", stages: SERVICE_ITEMS.find((s) => s.code === code)!.defaultStages, status: "closed", closedAt: "2026-08-31", supervisorId: line.supervisorId };
      jobs.push(job);
      const real = plant === "COKER" && code === "3378150" && k === 0;
      // History has no DPR crews: estimated labour-days from typical output per MPS (demo)
      const days = Math.round(qty * (LABOUR_PER_M2[SERVICE_ITEMS.find((s) => s.code === code)!.mps] ?? 0.1));
      job.importedLabour = { days, cost: days * AUG_WAGE };
      const row = addJms(job, line, qty, "2026-08-01", "2026-08-31", real ? "INVOICE UPLOADED" : JMS_STATUS_AUG[i % JMS_STATUS_AUG.length], real ? "2741381" : undefined, "2026-09-03");
      // Payments: a mix of full, short and unpaid so the approved-vs-received check has something to show
      const pattern = real ? "recovery" : (["full", "deduction", "unpaid", "full", "late", "short", "full"] as const)[(i + k) % 7];
      const pay = (factor: number, on: string, reason?: NonNullable<Jms["payment"]>["reason"], note?: string) =>
        (row.payment = { receivedOn: on, amount: Math.round(row.amount * factor * 100) / 100, reason, note });
      if (pattern === "full") pay(1, "2026-09-22");
      else if (pattern === "deduction") pay(0.98, "2026-09-22", "deduction", "2% deducted by RIL");
      else if (pattern === "short") pay(0.95, "2026-09-25", "short_paid", "Qty cut at A2 approval");
      else if (pattern === "late") pay(1, "2026-09-27");
      else if (pattern === "recovery") row.payment = { receivedOn: "2026-09-22", amount: Math.round((row.amount - 3450) * 100) / 100, reason: "recovery", note: "Paint excess recovery ₹3,450" };
      if (row.payment) row.status = "PAID";
    });
  });

  const state: WorkState = {
    serviceItems: SERVICE_ITEMS,
    workOrders: [
      {
        id: WO_ID,
        woNo: "CCM/260069431",
        foNo: "280152290",
        siteId: SITE,
        validFrom: "2026-03-01",
        validTo: "2027-02-28",
        capInr: 100000000,
        scope: {
          "3378150": 2500, "3378278": 300, "3378180": 60000, "3378276": 4000, "3378275": 20000,
          "3378301": 3000, "PEND-MPS8": 5000, "PEND-MPS13": 30000, "PEND-MPS23S": 8000,
          "PEND-BLAST-INT": 1500, "PEND-BLAST-EXT": 2500,
        },
      },
    ],
    planLines,
    jobs,
    reports: [],
    dprs,
    jms,
    paint: [],
    expenses: [],
    events: [],
    lastSeen: {},
    siteMonths: { [SITE]: { current: "2026-09", closed: ["2026-08"] } },
    defaultMonth: "2026-09",
  };

  // September — carry forward August's unfinished balance + new lines
  const sep: Record<string, PlanLine> = {};
  for (const line of planLines.filter((l) => l.month === "2026-08")) {
    const rem = lineStatus(line, state).remaining;
    if (rem <= 0) continue;
    const id = `pl-2609-${line.id.split("-").pop()}`;
    const nl: PlanLine = { ...line, id, month: "2026-09", planM2: 0, carriedM2: rem, carriedFromId: line.id };
    planLines.push(nl);
    sep[`${line.plant}|${line.serviceCode}`] = nl;
  }
  const newPlan: [string, string, string, number][] = [
    ["COKER", "3378150", "MANUAL CLEANING & BRUSH PAINTING JOB", 600],
    ["COKER", "3378180", "BLASTING & SPRAY PAINTING JOB", 400],
    ["RTF", "3378180", "BLASTING & SPRAY PAINTING JOB", 5000],
    ["CRUDE", "PEND-MPS13", "MANUAL CLEANING & BRUSH PAINTING JOB", 2500],
    ["HYDROTREATER", "3378275", "MANUAL CLEANING & SPRAY PAINTING JOB", 2000],
  ];
  newPlan.forEach(([plant, code, jobType, plan], i) => {
    const key = `${plant}|${code}`;
    if (sep[key]) sep[key].planM2 = plan;
    else {
      const nl: PlanLine = { id: `pl-2609-n${i + 1}`, month: "2026-09", siteId: SITE, plant, serviceCode: code, jobType, planM2: plan, carriedM2: 0, supervisorId: SUP_OF[plant] };
      planLines.push(nl);
      sep[key] = nl;
    }
  });

  const job = (key: string, location: string, start: string, status: Job["status"] = "open"): Job => {
    const line = sep[key];
    const j: Job = { id: `job-2609-${++jobSeq}`, jobNo: `J-DTA-${String(jobSeq).padStart(4, "0")}`, planLineId: line.id, location, startDate: start, stages: SERVICE_ITEMS.find((s) => s.code === line.serviceCode)!.defaultStages, status, supervisorId: line.supervisorId };
    jobs.push(j);
    return j;
  };
  let dprSeq = 0;
  const dpr = (j: Job, date: string, stage: DprEntry["stage"], members: Member[], litres: number, paintSap?: string, dft?: number, enteredBy: DprEntry["enteredBy"] = "supervisor") =>
    dprs.push({ id: `wd-${++dprSeq}`, date, jobId: j.id, stage, members, litres, paintSap, dft, supervisorId: j.supervisorId, enteredBy, crew: crewOf.get(j.id) });
  const crewOf = new Map<string, string[]>();

  // 1. Coker silo — all four stages, closed → JMS (193.911 m²)
  const j1 = job("COKER|3378150", "SILO COKE LOADING (NEW WEIGHT BRIDGE)", "2026-09-02", "closed");
  crewOf.set(j1.id, CREW_A);
  dpr(j1, "2026-09-03", "prep", COKER_PAGE1, 0);
  dpr(j1, "2026-09-06", "coat1", COKER_PAGE1, 34, T17.sap);
  dpr(j1, "2026-09-09", "coat2", COKER_PAGE1, 33, T17.sap);
  dpr(j1, "2026-09-12", "final", COKER_PAGE1, 29, T6.sap, 105);
  j1.closedAt = "2026-09-13";
  addJms(j1, sep["COKER|3378150"], round3(COKER_PAGE1.reduce((s, m) => s + m.nos * m.side * m.length * m.cf, 0)), "2026-09-02", "2026-09-13", "JMS SUBMITTED", undefined, "2026-09-13");

  // 2. Coker TT3 — prep + 1st coat done, 2nd coat started
  const j2 = job("COKER|3378150", "TT3 AREA", "2026-09-15");
  crewOf.set(j2.id, CREW_A.slice(0, 4));
  dpr(j2, "2026-09-16", "prep", COKER_TT3, 0);
  dpr(j2, "2026-09-19", "coat1", COKER_TT3, 4, T17.sap);
  dpr(j2, "2026-09-24", "coat2", COKER_TT3.slice(0, 3), 2, T17.sap, undefined, "admin");

  // 3. Coker A-rack — all stages done, ready for the supervisor to close
  const j3 = job("COKER|3378180", "A-RACK PC NO. 505 TO 509 (LOOP LINE)", "2026-09-05");
  // lb-x-2 is also on the Coker silo crew on 6-Sep → split day, cost shared by the two jobs
  crewOf.set(j3.id, [...CREW_A2, "lb-x-2"]);
  const ar = rack(204.48);
  dpr(j3, "2026-09-06", "prep", ar, 0);
  dpr(j3, "2026-09-10", "coat1", ar, 84, "2002462154");
  dpr(j3, "2026-09-14", "coat2", ar, 31, T6.sap);
  dpr(j3, "2026-09-18", "final", ar, 30, T6.sap, 280);

  // 4. Crude MPS-13 — closed by the supervisor, waiting for SIC to confirm
  const j4 = job("CRUDE|PEND-MPS13", "PIPE RACK 311/312", "2026-09-04", "awaiting_sic");
  crewOf.set(j4.id, CREW_B);
  const cr = rack(128.929);
  dpr(j4, "2026-09-05", "prep", cr, 0);
  dpr(j4, "2026-09-09", "coat1", cr, 36, T17.sap);
  dpr(j4, "2026-09-13", "coat2", cr, 34, T17.sap);
  dpr(j4, "2026-09-17", "final", cr, 20, T6.sap, 110);
  j4.closeRequestedAt = "2026-09-18";

  // 5. RTF tank — blasting under way
  const j5 = job("RTF|3378180", "TANK 101 SHELL", "2026-09-20");
  crewOf.set(j5.id, CREW_B);
  dpr(j5, "2026-09-21", "prep", rack(640), 0);
  dpr(j5, "2026-09-26", "coat1", rack(310), 128, "2002462154");

  // Paint: supervisor holdings (issued 1-Sep) and SGE store batches
  const paint: PaintBatch[] = [
    { id: "pb-1", sap: T17.sap, name: "TYPE 17 PAINT", batch: "1006976037", qtyL: 120, supervisorId: SUP_A, issuedOn: "2026-09-01", mfg: "2025-11-12", expiry: "2026-11-10", siteId: SITE },
    { id: "pb-2", sap: T6.sap, name: "TYPE 6 PAINT", batch: "1007007418", qtyL: 120, supervisorId: SUP_A, issuedOn: "2026-09-01", mfg: "2026-03-01", expiry: "2027-03-01", siteId: SITE },
    { id: "pb-3", sap: "2002462154", name: "TYPE 24 PAINT", batch: "1007020864", qtyL: 180, supervisorId: SUP_A, issuedOn: "2026-09-01", mfg: "2026-02-10", expiry: "2027-02-10", siteId: SITE },
    { id: "pb-4", sap: T17.sap, name: "TYPE 17 PAINT", batch: "1007020865", qtyL: 100, supervisorId: SUP_B, issuedOn: "2026-09-01", mfg: "2025-12-01", expiry: "2026-12-01", siteId: SITE },
    { id: "pb-5", sap: T6.sap, name: "TYPE 6 PAINT", batch: "1007020866", qtyL: 30, supervisorId: SUP_B, issuedOn: "2026-09-01", mfg: "2026-03-01", expiry: "2027-03-01", siteId: SITE },
    { id: "pb-6", sap: "2002462154", name: "TYPE 24 PAINT", batch: "1007029147", qtyL: 400, supervisorId: SUP_B, issuedOn: "2026-09-01", mfg: "2026-02-10", expiry: "2027-02-10", siteId: SITE },
    { id: "pb-7", sap: "2002462128", name: "TYPE 23 PAINT", batch: "15184659", qtyL: 150, supervisorId: null, mfg: "2024-08-20", expiry: "2026-08-15", siteId: SITE },
    { id: "pb-8", sap: T17.sap, name: "TYPE 17 PAINT", batch: "14993776", qtyL: 500, supervisorId: null, mfg: "2025-10-22", expiry: "2026-10-20", siteId: SITE },
    { id: "pb-9", sap: "2002462216", name: "TYPE 6 PAINT", batch: "13852256", qtyL: 80, supervisorId: null, mfg: "2024-09-10", expiry: "2026-09-10", siteId: SITE },
    { id: "pb-10", sap: "2002462133", name: "TYPE 2 PAINT", batch: "12030113", qtyL: 900, supervisorId: null, mfg: "2026-05-01", expiry: "2027-05-01", siteId: SITE },
    { id: "pb-11", sap: "2002462154", name: "TYPE 24 PAINT", batch: "12053789", qtyL: 1200, supervisorId: null, mfg: "2026-04-15", expiry: "2027-04-15", siteId: SITE },
  ];
  state.paint = paint;

  state.events = seedEvents(state);

  // Costs (demo figures, shaped like the monthly expense split in the JMS book):
  // DTA fixed overhead for August, shared over August jobs by labour-days.
  // September fixed costs are entered at month end, so they aren't seeded.
  const fx = (category: string, amount: number) =>
    ({ id: `ex-2608-${category.toLowerCase().replace(/\W+/g, "-")}`, date: "2026-08-31", month: "2026-08", siteId: SITE, kind: "fixed" as const, category, amount });
  state.expenses = [
    fx("Staff salaries", 3000000),
    fx("Compressor rent", 900000),
    fx("Bus rent", 240000),
    fx("Car rent", 180000),
    fx("Diesel", 1600000),
    fx("Machinery", 300000),
    fx("PPE items", 250000),
    { id: "ex-d-1", date: "2026-09-04", month: "2026-09", siteId: SITE, kind: "direct", category: "Thinner + rollers", amount: 6500, jobId: j1.id },
    { id: "ex-d-2", date: "2026-09-06", month: "2026-09", siteId: SITE, kind: "direct", category: "Copper slag abrasive", amount: 18400, jobId: j3.id },
    { id: "ex-d-3", date: "2026-09-21", month: "2026-09", siteId: SITE, kind: "direct", category: "Copper slag abrasive", amount: 42000, jobId: j5.id },
  ];
  state.reports = demoReports(state);
  return state;
}

/**
 * Daily reports for the demo (merge plan Step 2): September job lines grouped
 * per supervisor · plant · day (Admin double entries get their own report),
 * approved, with the crew marked present. The last two days stay with the SIC
 * (submitted) so the review queue has something in it. Plus the sample safety,
 * store and scaffolding reports, moved onto the demo dates.
 */
function demoReports(w: WorkState): DprReport[] {
  const reports = new Map<string, DprReport>();
  for (const e of w.dprs) {
    const job = w.jobs.find((j) => j.id === e.jobId);
    const line = job && w.planLines.find((l) => l.id === job.planLineId);
    if (!job || !line) continue;
    const admin = e.enteredBy === "admin";
    const key = [job.supervisorId, line.plant, e.date, admin].join("|");
    let r = reports.get(key);
    if (!r) {
      const pending = e.date >= "2026-09-27";
      r = {
        ...blankReport({ submitterId: job.supervisorId, submitterType: "painting_blasting", siteId: line.siteId, plant: line.plant, date: e.date }),
        id: `dprd-demo-${reports.size + 1}`,
        enteredBy: admin ? "admin" : undefined,
        enteredByName: admin ? "N. Sharma" : undefined,
        status: pending ? "submitted" : "sic_approved",
        permitOk: true,
        tbtDone: true,
        permitNos: [`WP-${e.date.slice(5).replace("-", "")}-${reports.size + 11}`],
        submittedAt: `${e.date}T18:30:00+05:30`,
        sicReviewedBy: pending ? undefined : "R. Mehta",
        sicReviewedAt: pending ? undefined : `${e.date}T20:00:00+05:30`,
        createdAt: `${e.date}T17:00:00+05:30`,
        updatedAt: `${e.date}T18:30:00+05:30`,
      };
      reports.set(key, r);
    }
    e.reportId = r.id;
    for (const id of e.crew ?? []) {
      if (!r.labourMarks.some((m) => m.labourerId === id)) r.labourMarks.push({ labourerId: id, status: "present", inTime: "08:00", outTime: "18:00" });
    }
  }
  // Sample non-painting reports (safety, store, scaffolding) from the old DPR desk demo
  const shift = (d: string) => (d === "2026-10-05" ? WORK_TODAY : d === "2026-10-04" ? "2026-09-27" : "2026-09-26");
  const samples: DprReport[] = sampleDprReports()
    .filter((d) => d.submitterType !== "painting_blasting")
    .map(({ paintWork: _drop, ...d }) => {
      void _drop;
      return { ...d, date: shift(d.date), status: d.status, createdAt: `${shift(d.date)}T08:00:00+05:30`, updatedAt: `${shift(d.date)}T17:00:00+05:30` };
    });
  return [...reports.values(), ...samples];
}

/** Demo staff names for seeded history (the live app uses the signed-in account). */
const DEMO_NAMES: Record<string, { name: string; role: RoleId }> = {
  "st-sup1": { name: "V. Chauhan", role: "supervisor" },
  "st-sup2": { name: "K. Solanki", role: "supervisor" },
  sic: { name: "R. Mehta", role: "sic" },
  finance: { name: "D. Trivedi", role: "finance" },
  owner: { name: "K. Sisodia", role: "owner" },
  admin: { name: "N. Sharma", role: "admin" },
};

/** Activity history matching the seed: September DPRs, closes, JMS and short payments. */
function seedEvents(w: WorkState): WorkEvent[] {
  const out: Omit<WorkEvent, "id" | "seq">[] = [];
  const jobOf = (id: string) => w.jobs.find((j) => j.id === id)!;
  const add = (day: string, time: string, who: keyof typeof DEMO_NAMES, e: Omit<WorkEvent, "id" | "seq" | "at" | "day" | "actorName" | "actorRole" | "siteId">) =>
    out.push({ ...e, siteId: SITE, day, at: `${day}T${time}:00+05:30`, actorName: DEMO_NAMES[who].name, actorRole: DEMO_NAMES[who].role });

  add("2026-08-31", "18:00", "owner", { kind: "month_closed", title: "2026-08 closed", detail: "Unfinished plan lines carried into 2026-09", tab: "plan" });
  for (const d of w.dprs) {
    const job = jobOf(d.jobId);
    // T3: an entry keyed in by Admin is credited to Admin, not the supervisor
    add(d.date, "17:30", (d.enteredBy === "admin" ? "admin" : d.supervisorId) as keyof typeof DEMO_NAMES, {
      kind: "dpr_added",
      subjectStaffId: job.supervisorId,
      title: `${job.jobNo} · ${STAGES.find((s) => s.id === d.stage)?.label} ${round3(entryArea(d))} m²`,
      detail: `${job.location}${d.enteredBy === "admin" ? " · entered by Admin" : ""}${d.crew?.length ? ` · crew ${d.crew.length}` : ""}`,
      tab: "jobs",
      refId: job.id,
    });
  }
  for (const job of w.jobs) {
    if (job.closeRequestedAt) {
      add(job.closeRequestedAt, "18:10", job.supervisorId as keyof typeof DEMO_NAMES, { kind: "job_closed", subjectStaffId: job.supervisorId, title: `${job.jobNo} closed — confirm JMS`, detail: job.location, tab: "jobs", refId: job.id });
    }
  }
  for (const j of w.jms) {
    const job = jobOf(j.jobId);
    if (j.confirmedOn >= "2026-09-10") {
      add(j.confirmedOn, "09:30", "sic", { kind: "jms_confirmed", subjectStaffId: job.supervisorId, title: `JMS ${j.jmsNo} confirmed · ${job.jobNo}`, detail: `${j.qty} m² × ₹${j.rate}`, tab: "jms", refId: j.id });
    }
    const gap = j.payment ? Math.round((j.payment.amount - j.amount) * 100) / 100 : 0;
    if (j.payment && gap <= -1) {
      add(j.payment.receivedOn, "11:00", "finance", { kind: "payment_recorded", problem: true, subjectStaffId: job.supervisorId, title: `JMS ${j.jmsNo} paid ₹${j.payment.amount.toLocaleString("en-IN")}`, detail: `Short by ₹${(-gap).toLocaleString("en-IN")} (${reasonText(j.payment.reason)})`, tab: "payments", refId: j.id });
    }
  }
  return out
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((e, i) => ({ ...e, id: `ev-${i + 1}`, seq: i + 1 }));
}
