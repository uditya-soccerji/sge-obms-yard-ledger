/**
 * Demo data for the five sites other than DTA, so each site — and the
 * All sites roll-up — has its own numbers. DTA's hand-written rows stay in
 * seed.ts; this file only adds rows, keyed by site so ids never collide.
 *
 * Each site has a different character on purpose (see SITE_PROFILES) so a
 * site switch visibly changes the dashboard:
 *   MTF    — tank farm, big painted areas, healthy attendance, rich billing
 *   MARINE — marine epoxy on jetty structures, weak attendance, safety flags
 *   PCG    — pipeline blasting heavy, best attendance, variance alert
 *   JETTY  — scaffolding heavy, small crew, lowest attendance, overdue kit
 *   GAGVA  — new site ramping up, few DPRs, mostly PR/PO paint
 */
import { SAFETY_CHECKLIST_SEED } from "./safety-dpr";
import type {
  AcplMatchRow,
  AttendanceRecord,
  AttendanceStatus,
  ComplianceDoc,
  EquipmentItem,
  EquipmentRequest,
  FinanceEntry,
  Labourer,
  MaterialTransfer,
  PaintLifecycleStage,
  SafetyChecklistDay,
  StaffMember,
  WageLedgerEntry,
  WorkPlanItem,
} from "./types";

const TODAY = "2026-10-05";
const YDAY = "2026-10-04";
const D2 = "2026-10-03";

interface SiteProfile {
  siteId: string;
  code: string;
  plant: string;
  /** Labourer head-count on the roll */
  crew: number;
  /** Share of the roll present today, 0..1 */
  presentRate: number;
  sic: string;
  painter: string;
  scaffolder: string;
  store: string;
  safety: string;
  /** Today's work lines (thin DPR) */
  work: {
    type: "painting" | "blasting" | "scaffolding";
    location: string;
    areaM2?: number;
    volumeM3?: number;
    mps?: number;
    litres?: number;
    note: string;
  }[];
  paint: {
    desc: string;
    sap: string;
    mps: number;
    stage: PaintLifecycleStage;
    litres: number;
    sgeUsed?: number;
    rilPosted?: number;
  }[];
  equipment: { type: EquipmentItem["type"]; status: EquipmentItem["status"]; expiry: string }[];
  finance: { date: string; kind: FinanceEntry["kind"]; category: string; amount: number; description: string }[];
  billing: { label: string; amount: number; status: "draft" | "submitted" | "approved" | "paid"; period: string }[];
  requests: { kind: EquipmentRequest["kind"]; description: string; qty: number; urgent?: boolean; status: EquipmentRequest["status"] }[];
  prediction?: { kind: string; severity: "warn" | "crit"; title: string; detail: string; value: number; threshold: number };
  jms?: { label: string; lines: { description: string; activity: "painting" | "blasting" | "scaffolding"; qty: number; unit: "m2" | "m3"; rate: number; claimed: number }[] };
  plans: { task: string; target?: number; status: WorkPlanItem["status"] }[];
  safetyNote: string;
  /** ACPL gate punches that disagree with the DPR */
  acplFlags: { flag: AcplMatchRow["flag"]; dprIn?: string; acplIn?: string }[];
}

const SITE_PROFILES: SiteProfile[] = [
  {
    siteId: "site-mtf",
    code: "MTF",
    plant: "MTF",
    crew: 32,
    presentRate: 0.84,
    sic: "H. Bhatt",
    painter: "J. Parmar",
    scaffolder: "L. Vasava",
    store: "T. Rana",
    safety: "G. Nair",
    work: [
      { type: "painting", location: "Tank T-311 shell", areaM2: 640, mps: 3, litres: 288, note: "Shell 2nd coat, 3 strakes done." },
      { type: "blasting", location: "Tank T-312 roof", areaM2: 260, note: "SA2.5 on roof plates; dehumidifier on." },
      { type: "scaffolding", location: "T-311 shell scaffold", volumeM3: 1180, note: "Ring scaffold raised to +14 m." },
    ],
    paint: [
      { desc: "Type 24 glass reinforced epoxy", sap: "2002462154", mps: 3, stage: "issued", litres: 300, sgeUsed: 288 },
      { desc: "Type 17 HB epoxy ST", sap: "2002462162", mps: 1, stage: "sge_receive", litres: 520 },
      { desc: "Type 4 Zn rich epoxy primer", sap: "2002462179", mps: 2, stage: "posted", litres: 0, sgeUsed: 402, rilPosted: 410 },
    ],
    equipment: [
      { type: "airless", status: "ok", expiry: "2027-01-10" },
      { type: "compressor", status: "ok", expiry: "2026-12-02" },
      { type: "harness", status: "due", expiry: "2026-10-12" },
    ],
    finance: [
      { date: TODAY, kind: "expense", category: "Transport", amount: 18400, description: "Crew bus — MTF two trips" },
      { date: TODAY, kind: "expense", category: "Consumables", amount: 9600, description: "Thinner + rollers for T-311" },
      { date: YDAY, kind: "income", category: "RA bill", amount: 742000, description: "RA-11 tank painting T-309/T-310" },
      { date: D2, kind: "expense", category: "Vendor", amount: 88000, description: "Dehumidifier hire — 2 weeks" },
    ],
    billing: [
      { label: "RA-11 Tank painting", amount: 742000, status: "approved", period: "Sep 2026" },
      { label: "RA-12 Tank blasting (draft)", amount: 214000, status: "draft", period: "Oct 2026" },
    ],
    requests: [
      { kind: "equipment", description: "Second dehumidifier for T-312", qty: 1, urgent: true, status: "open" },
      { kind: "material", description: "Type 24 top-up 200 L", qty: 200, status: "fulfilling" },
    ],
    jms: {
      label: "JMS Oct W1 — MTF tanks",
      lines: [
        { description: "T-311 shell painting MPS-3", activity: "painting", qty: 600, unit: "m2", rate: 520, claimed: 640 },
        { description: "T-312 roof blasting", activity: "blasting", qty: 250, unit: "m2", rate: 380, claimed: 260 },
      ],
    },
    plans: [
      { task: "T-311 shell final coat", target: 650, status: "in_progress" },
      { task: "T-312 roof primer", target: 260, status: "planned" },
    ],
    safetyNote: "UC: loose plank on T-311 ring scaffold — tagged and fixed.",
    acplFlags: [{ flag: "time_mismatch", dprIn: "07:45", acplIn: "08:25" }],
  },
  {
    siteId: "site-marine",
    code: "MARINE",
    plant: "Marine",
    crew: 18,
    presentRate: 0.61,
    sic: "F. Qureshi",
    painter: "S. D'Souza",
    scaffolder: "P. Koli",
    store: "N. Mistry",
    safety: "A. Fernandes",
    work: [
      { type: "painting", location: "Berth 4 fender frames", areaM2: 140, mps: 28, litres: 84, note: "Tide window only 4 h; splash zone coat." },
      { type: "blasting", location: "Loading arm LA-2 base", areaM2: 70, note: "Wet abrasive — salt test passed." },
    ],
    paint: [
      { desc: "Type 25 HB marine epoxy", sap: "2002462116", mps: 28, stage: "issued", litres: 90, sgeUsed: 84 },
      { desc: "Type 25 HB marine epoxy", sap: "2002462116", mps: 28, stage: "consumed", litres: 0, sgeUsed: 131, rilPosted: 110 },
      { desc: "Type 6 urethane — Signal Red", sap: "T6-SRD", mps: 2, stage: "po", litres: 60 },
    ],
    equipment: [
      { type: "hopper", status: "fault", expiry: "2026-10-30" },
      { type: "harness", status: "ok", expiry: "2026-12-20" },
      { type: "harness", status: "ok", expiry: "2027-02-01" },
    ],
    finance: [
      { date: TODAY, kind: "expense", category: "Boat hire", amount: 15000, description: "Work boat — Berth 4 access" },
      { date: YDAY, kind: "expense", category: "PPE", amount: 7200, description: "Life jackets x 12" },
      { date: D2, kind: "income", category: "RA bill", amount: 168000, description: "RA-05 marine coating" },
    ],
    billing: [
      { label: "RA-05 Marine coating", amount: 168000, status: "submitted", period: "Sep 2026" },
    ],
    requests: [
      { kind: "spare", description: "Hopper deadman valve", qty: 1, urgent: true, status: "open" },
      { kind: "other", description: "Extra life buoys at Berth 4", qty: 4, urgent: true, status: "open" },
    ],
    prediction: {
      kind: "high_variance",
      severity: "crit",
      title: "Paint variance high — Marine Type 25",
      detail: "SGE used 131 L vs RIL posted 110 L (+19%). Splash-zone overspray suspected.",
      value: 19,
      threshold: 8,
    },
    jms: {
      label: "JMS Oct W1 — Marine berths",
      lines: [
        { description: "Berth 4 fender frames MPS-28", activity: "painting", qty: 120, unit: "m2", rate: 610, claimed: 140 },
      ],
    },
    plans: [{ task: "Berth 4 splash zone 2nd coat", target: 150, status: "in_progress" }],
    safetyNote: "UA: two workers on pontoon without life jackets — stopped work 20 min.",
    acplFlags: [
      { flag: "dpr_only", dprIn: "08:00" },
      { flag: "acpl_only", acplIn: "09:10" },
    ],
  },
  {
    siteId: "site-pcg",
    code: "PCG",
    plant: "PCG",
    crew: 26,
    presentRate: 0.92,
    sic: "B. Thakkar",
    painter: "R. Chavda",
    scaffolder: "U. Damor",
    store: "K. Pandya",
    safety: "S. Iyer",
    work: [
      { type: "blasting", location: "Syngas line 24\" PR-07", areaM2: 380, note: "SA2.5, 3 spools; profile 75 µm." },
      { type: "painting", location: "Syngas line 24\" PR-06", areaM2: 410, mps: 4, litres: 205, note: "HT multi-polymeric 1st coat." },
      { type: "scaffolding", location: "PR-07 pipe bridge", volumeM3: 520, note: "Hanging scaffold under bridge." },
    ],
    paint: [
      { desc: "Type 23 HT multi-polymeric", sap: "2002462128", mps: 4, stage: "issued", litres: 240, sgeUsed: 205 },
      { desc: "Type 23 HT multi-polymeric", sap: "2002462128", mps: 4, stage: "reco", litres: 0, sgeUsed: 330 },
      { desc: "Type 3 epoxy primer", sap: "2002462140", mps: 1, stage: "ril_receive", litres: 400 },
    ],
    equipment: [
      { type: "hopper", status: "ok", expiry: "2026-12-11" },
      { type: "hopper", status: "ok", expiry: "2027-01-05" },
      { type: "compressor", status: "due", expiry: "2026-10-09" },
    ],
    finance: [
      { date: TODAY, kind: "expense", category: "Diesel", amount: 31000, description: "2 compressors diesel fill" },
      { date: TODAY, kind: "expense", category: "Abrasive", amount: 26500, description: "Copper slag 12 MT" },
      { date: YDAY, kind: "income", category: "RA bill", amount: 538000, description: "RA-07 pipeline blasting/painting" },
    ],
    billing: [
      { label: "RA-07 Pipeline", amount: 538000, status: "paid", period: "Aug 2026" },
      { label: "RA-08 Pipeline", amount: 455000, status: "submitted", period: "Sep 2026" },
    ],
    requests: [{ kind: "material", description: "Copper slag 8 MT", qty: 8, status: "fulfilled" }],
    prediction: {
      kind: "scope_slip",
      severity: "warn",
      title: "Scope slip — PR-06 painting",
      detail: "Plan 450 m²; run-rate projects ~410 m² (−8.9%).",
      value: 8.9,
      threshold: 5,
    },
    jms: {
      label: "JMS Oct W1 — PCG pipeline",
      lines: [
        { description: "PR-07 blasting SA2.5", activity: "blasting", qty: 370, unit: "m2", rate: 360, claimed: 380 },
        { description: "PR-06 painting MPS-4", activity: "painting", qty: 400, unit: "m2", rate: 430, claimed: 410 },
        { description: "PR-07 hanging scaffold", activity: "scaffolding", qty: 500, unit: "m3", rate: 90, claimed: 520 },
      ],
    },
    plans: [
      { task: "PR-06 1st coat complete", target: 450, status: "in_progress" },
      { task: "PR-07 primer after blast", target: 380, status: "planned" },
    ],
    safetyNote: "SAFE: hot-work permit and gas test logged for PR-07 tie-in.",
    acplFlags: [],
  },
  {
    siteId: "site-jetty",
    code: "JETTY",
    plant: "Jetty",
    crew: 14,
    presentRate: 0.57,
    sic: "M. Jadeja",
    painter: "C. Patel",
    scaffolder: "D. Bariya",
    store: "Y. Shah",
    safety: "R. Menon",
    work: [
      { type: "scaffolding", location: "Jetty head trestle J-3", volumeM3: 760, note: "Cantilever scaffold over water, netting fixed." },
      { type: "painting", location: "Trestle J-2 handrails", areaM2: 90, mps: 2, litres: 36, note: "Touch-up only; wind stopped spray." },
    ],
    paint: [
      { desc: "Type 6 urethane — Lt. Grey", sap: "T6-LGY", mps: 2, stage: "issued", litres: 40, sgeUsed: 36 },
      { desc: "Type 5 HB MIO epoxy", sap: "2002462171", mps: 2, stage: "pr", litres: 180 },
    ],
    equipment: [
      { type: "harness", status: "fault", expiry: "2026-09-28" },
      { type: "harness", status: "due", expiry: "2026-10-07" },
      { type: "compressor", status: "ok", expiry: "2026-11-30" },
    ],
    finance: [
      { date: TODAY, kind: "expense", category: "Vendor", amount: 42000, description: "Cantilever scaffold material hire" },
      { date: YDAY, kind: "expense", category: "Transport", amount: 6800, description: "Crew jeep — Jetty" },
    ],
    billing: [{ label: "RA-03 Jetty scaffolding", amount: 126000, status: "draft", period: "Oct 2026" }],
    requests: [
      { kind: "equipment", description: "Replace FBH harness (failed webbing)", qty: 2, urgent: true, status: "open" },
      { kind: "other", description: "Safety net 20 m roll", qty: 1, status: "open" },
    ],
    prediction: {
      kind: "low_stock",
      severity: "warn",
      title: "Low stock — Jetty urethane",
      detail: "40 L issued vs ~15 L/day burn; PR for MIO not yet a PO.",
      value: 40,
      threshold: 60,
    },
    plans: [{ task: "J-3 cantilever scaffold to deck level", status: "in_progress" }],
    safetyNote: "UC: harness FBH expired 28-Sep still in use — withdrawn.",
    acplFlags: [{ flag: "time_mismatch", dprIn: "08:00", acplIn: "08:40" }],
  },
  {
    siteId: "site-gagva",
    code: "GAGVA",
    plant: "Gagva",
    crew: 22,
    presentRate: 0.77,
    sic: "A. Rathod",
    painter: "V. Gamit",
    scaffolder: "I. Malek",
    store: "H. Soni",
    safety: "K. Pillai",
    work: [
      { type: "blasting", location: "Pipe rack GR-1 (new)", areaM2: 150, note: "Mobilisation week — first blast trial." },
    ],
    paint: [
      { desc: "Type 4 Zn rich epoxy primer", sap: "2002462179", mps: 2, stage: "po", litres: 300 },
      { desc: "Type 5 HB MIO epoxy", sap: "2002462171", mps: 2, stage: "pr", litres: 300 },
    ],
    equipment: [
      { type: "compressor", status: "ok", expiry: "2027-03-01" },
      { type: "hopper", status: "ok", expiry: "2027-02-15" },
    ],
    finance: [
      { date: TODAY, kind: "expense", category: "Mobilisation", amount: 56000, description: "Site cabin + store container" },
      { date: D2, kind: "expense", category: "Transport", amount: 12000, description: "Equipment shifting DTA → Gagva" },
    ],
    billing: [{ label: "Mobilisation advance", amount: 150000, status: "approved", period: "Oct 2026" }],
    requests: [{ kind: "equipment", description: "Airless pump for Gagva", qty: 1, status: "open" }],
    plans: [{ task: "GR-1 blasting trial + inspection", target: 150, status: "in_progress" }],
    safetyNote: "Induction for 22 new workers completed; TBT board installed.",
    acplFlags: [],
  },
];

const FIRST = ["Arjun", "Bhavesh", "Chirag", "Dinesh", "Gopal", "Hitesh", "Jayesh", "Kalpesh", "Lalit", "Manoj", "Naresh", "Paresh", "Rakesh", "Sanjay", "Tushar", "Vijay", "Yogesh", "Ashok", "Hemant", "Pravin", "Sunil", "Mukesh", "Nilesh", "Kishor"];
const LAST = ["Patel", "Solanki", "Rathod", "Parmar", "Chauhan", "Vaghela", "Makwana", "Gohil", "Thakor", "Bariya", "Damor", "Vasava", "Koli", "Bhil", "Rabari", "Jadeja"];
const TRADES = ["painter", "blaster", "scaffolder", "helper", "rigger", "painter", "helper", "scaffolder"];

/** Status for crew member i so that exactly round(rate * crew) are present. */
function statusFor(i: number, crew: number, rate: number): AttendanceStatus {
  const present = Math.round(crew * rate);
  if (i < present) return i % 9 === 4 ? "half" : "present";
  return i % 3 === 0 ? "leave" : "absent";
}

export interface SiteSeedRows {
  staff: StaffMember[];
  labourers: Labourer[];
  attendance: AttendanceRecord[];
  equipment: EquipmentItem[];
  workPlans: WorkPlanItem[];
  safetyDays: SafetyChecklistDay[];
  finance: FinanceEntry[];
  compliance: ComplianceDoc[];
  transfers: MaterialTransfer[];
  acplMatches: AcplMatchRow[];
  wageLedger: WageLedgerEntry[];
  equipmentRequests: EquipmentRequest[];
}

export function seedOtherSites(): SiteSeedRows {
  const out: SiteSeedRows = {
    staff: [], labourers: [], attendance: [], equipment: [],
    workPlans: [], safetyDays: [], finance: [],
    compliance: [], transfers: [], acplMatches: [],
    wageLedger: [], equipmentRequests: [],
  };

  SITE_PROFILES.forEach((p, siteIdx) => {
    const k = p.code.toLowerCase();
    const sid = p.siteId;
    const sup1 = `st-${k}-sup1`;
    const sup2 = `st-${k}-sup2`;

    out.staff.push(
      { id: `st-${k}-sic`, name: p.sic, role: "sic", siteId: sid, designation: "Site InCharge" },
      { id: sup1, name: p.painter, role: "supervisor", siteId: sid, designation: "Painting & Blasting Supervisor", supervisorType: "painting_blasting" },
      { id: sup2, name: p.scaffolder, role: "supervisor", siteId: sid, designation: "Scaffolding Supervisor", supervisorType: "scaffolding" },
      { id: `st-${k}-store`, name: p.store, role: "store", siteId: sid, designation: "Store Keeper" },
      { id: `st-${k}-safety`, name: p.safety, role: "safety", siteId: sid, designation: "Safety Supervisor", supervisorType: "safety" }
    );

    // Crew + today's and yesterday's attendance
    for (let i = 0; i < p.crew; i++) {
      const id = `lb-${k}-${String(i + 1).padStart(2, "0")}`;
      const trade = TRADES[(i + siteIdx) % TRADES.length];
      const supervisorId = trade === "scaffolder" || trade === "rigger" ? sup2 : sup1;
      out.labourers.push({
        id,
        name: `${FIRST[(i * 7 + siteIdx * 3) % FIRST.length]} ${LAST[(i * 5 + siteIdx) % LAST.length]}`,
        trade,
        epNumber: `PP59201${7 + siteIdx}${String(1000 + i * 3 + siteIdx).slice(-4)}`,
        gatePass: `GP-${p.code}-${String(2100 + i)}`,
        siteId: sid,
        supervisorId,
        contractorId: i % 5 === 0 ? "con-sub-a" : "con-sge",
        wageDaily: 650 + ((i + siteIdx) % 6) * 40,
        equipmentIds: [],
        active: i !== p.crew - 1, // last one on each roll is inactive
      });
      if (i === p.crew - 1) continue;
      const status = statusFor(i, p.crew - 1, p.presentRate);
      out.attendance.push({
        id: `att-${k}-t-${i + 1}`,
        date: TODAY,
        labourerId: id,
        status,
        inTime: status === "present" || status === "half" ? `0${7 + (i % 2)}:${String((i * 7) % 60).padStart(2, "0")}` : undefined,
        outTime: status === "half" ? "13:00" : undefined,
        markedBy: supervisorId,
        siteId: sid,
      });
      const ystatus = statusFor((i + 3) % (p.crew - 1), p.crew - 1, Math.min(1, p.presentRate + 0.05));
      out.attendance.push({
        id: `att-${k}-y-${i + 1}`,
        date: YDAY,
        labourerId: id,
        status: ystatus,
        inTime: ystatus === "present" || ystatus === "half" ? "07:55" : undefined,
        outTime: ystatus === "present" ? "18:00" : undefined,
        markedBy: supervisorId,
        siteId: sid,
      });
    }

    p.equipment.forEach((e, i) =>
      out.equipment.push({
        id: `eq-${k}-${i + 1}`,
        type: e.type,
        tag: `${e.type.slice(0, 3).toUpperCase()}-${p.code}-${String(i + 1).padStart(2, "0")}`,
        status: e.status,
        lastCheck: YDAY,
        expiryDate: e.expiry,
        siteId: sid,
        checklist: [
          { item: "Visual inspection", ok: e.status !== "fault" },
          { item: "Certificate valid", ok: e.status === "ok" },
        ],
      })
    );

    p.finance.forEach((f, i) =>
      out.finance.push({ id: `fin-${k}-${i + 1}`, ...f, siteId: sid, enteredBy: i % 2 ? `st-${k}-sic` : "st-owner" })
    );


    p.requests.forEach((r, i) =>
      out.equipmentRequests.push({
        id: `er-${k}-${i + 1}`,
        createdAt: `${i ? YDAY : TODAY}T09:${String(10 + i * 15).padStart(2, "0")}:00Z`,
        updatedAt: `${TODAY}T12:00:00Z`,
        createdBy: sup1,
        siteId: sid,
        plant: p.plant,
        kind: r.kind,
        description: r.description,
        qty: r.qty,
        urgent: r.urgent,
        status: r.status,
        fulfilledBy: r.status === "fulfilled" ? `st-${k}-store` : undefined,
        fulfilledAt: r.status === "fulfilled" ? `${TODAY}T15:00:00Z` : undefined,
      })
    );


    p.plans.forEach((w, i) =>
      out.workPlans.push({ id: `wp-${k}-${i + 1}`, date: i ? "2026-10-06" : TODAY, supervisorId: sup1, plant: p.plant, task: w.task, targetM2: w.target, status: w.status, siteId: sid })
    );

    out.safetyDays.push({
      id: `sd-${k}`,
      date: TODAY,
      officerId: `st-${k}-safety`,
      siteId: sid,
      items: SAFETY_CHECKLIST_SEED.map((row) => ({
        id: row.id,
        label: row.label,
        // Weaker sites leave more checklist items open
        checked: (row.id + siteIdx) % Math.max(2, Math.round(p.presentRate * 10)) !== 0,
      })),
      observations: p.safetyNote,
      incidents: "Nil",
      signed: siteIdx % 2 === 0,
    });

    out.compliance.push({
      id: `comp-${k}`,
      title: `Gate pass renewals — ${p.code}`,
      category: "Statutory",
      uploadedBy: "st-hr",
      uploadedAt: YDAY,
      status: siteIdx % 2 ? "pending" : "filed",
      siteId: sid,
    });

    out.transfers.push({
      id: `xf-${k}`,
      date: YDAY,
      fromLoc: "RIL FIM store",
      toLoc: `SGE site store ${p.code}`,
      sapCode: p.paint[0].sap,
      qty: Math.max(40, p.paint[0].litres),
      note: `GRN for ${p.paint[0].desc}`,
      siteId: sid,
    });

    p.acplFlags.forEach((f, i) => {
      const lab = out.labourers.filter((l) => l.siteId === sid)[i + 2];
      out.acplMatches.push({
        id: `am-${k}-${i + 1}`,
        date: YDAY,
        labourerId: f.flag === "acpl_only" ? undefined : lab.id,
        epNumber: f.flag === "acpl_only" ? `PP59209${String(siteIdx)}${String(i + 1).padStart(4, "0")}` : lab.epNumber,
        flag: f.flag,
        dprStatus: f.flag === "acpl_only" ? undefined : "present",
        dprInTime: f.dprIn,
        acplInTime: f.acplIn,
        acplOutTime: f.acplIn ? "17:30" : undefined,
        resolveStatus: "open",
        siteId: sid,
      });
    });

    const firstLab = out.labourers.find((l) => l.siteId === sid)!;
    out.wageLedger.push({
      id: `wg-${k}-1`,
      labourerId: firstLab.id,
      date: YDAY,
      kind: siteIdx % 2 ? "advance" : "ot",
      amount: siteIdx % 2 ? 1500 : 520,
      note: siteIdx % 2 ? "Medical advance" : "2 hrs OT — tide/shift overrun",
      flaggedToSic: false,
      siteId: sid,
    });
  });

  return out;
}
