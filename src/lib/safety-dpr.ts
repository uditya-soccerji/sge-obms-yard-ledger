import { today as todayDate } from "./today";
import type {
  DprSafetyBody,
  SafetyChecklistAnswer,
  SafetyChecklistItem,
  SafetyGlanceNumbers,
  SafetyNearMissType,
  SafetyObservation,
  SafetyPermitType,
  SafetyShift,
} from "./types";

export type SafetyChecklistSeed = {
  id: number;
  group: string;
  label: string;
};

/** F/HSE/008-C daily checklist (~40 points), grouped for the web form. */
export const SAFETY_CHECKLIST_SEED: SafetyChecklistSeed[] = [
  { id: 1, group: "Today's numbers", label: "SGE worker headcount verified" },
  { id: 2, group: "Today's numbers", label: "Sub-contractor manpower logged" },
  { id: 3, group: "Today's numbers", label: "Man-hours calculated and recorded" },
  { id: 4, group: "Today's numbers", label: "TBT attendance matches sign sheet" },
  { id: 5, group: "Today's numbers", label: "Hurt / near-miss count logged or nil" },
  { id: 6, group: "Today's numbers", label: "SAFE observation tally updated" },
  { id: 7, group: "Today's numbers", label: "UNSAFE observation tally updated" },
  { id: 8, group: "Today's numbers", label: "Closed observations verified" },
  { id: 9, group: "Today's numbers", label: "Open observations reviewed" },
  { id: 10, group: "Today's numbers", label: "Observations >10 days late escalated" },
  { id: 11, group: "PPE", label: "Hard hat compliance at work face" },
  { id: 12, group: "PPE", label: "Safety shoes / gum boots worn" },
  { id: 13, group: "PPE", label: "Safety goggles / face shield" },
  { id: 14, group: "PPE", label: "Hand gloves appropriate to task" },
  { id: 15, group: "PPE", label: "Ear protection in noisy zones" },
  { id: 16, group: "PPE", label: "Full body harness for work at height" },
  { id: 17, group: "PPE", label: "Respiratory protection where required" },
  { id: 18, group: "Scaffold", label: "Scaffold green tag valid and visible" },
  { id: 19, group: "Scaffold", label: "Scaffold access ladder secured" },
  { id: 20, group: "Scaffold", label: "Toe boards and guardrails complete" },
  { id: 21, group: "Scaffold", label: "Scaffold base plates and sole boards" },
  { id: 22, group: "Scaffold", label: "Tag-out on incomplete / red scaffold" },
  { id: 23, group: "Paint & chemicals", label: "Paint drums labelled and sealed" },
  { id: 24, group: "Paint & chemicals", label: "SDS available at chemical store" },
  { id: 25, group: "Paint & chemicals", label: "Spill kit at paint mix area" },
  { id: 26, group: "Paint & chemicals", label: "Fire extinguisher at hot work bay" },
  { id: 27, group: "Paint & chemicals", label: "Ventilation for enclosed painting" },
  { id: 28, group: "Permit & client", label: "Hot work permit displayed" },
  { id: 29, group: "Permit & client", label: "Confined space permit where applicable" },
  { id: 30, group: "Permit & client", label: "Work at height permit issued" },
  { id: 31, group: "Permit & client", label: "Client safety rep informed of high-risk jobs" },
  { id: 32, group: "Blasting & equipment", label: "Blasting helmet / deadman functional" },
  { id: 33, group: "Blasting & equipment", label: "Compressor guards in place" },
  { id: 34, group: "Blasting & equipment", label: "Air hose whip checks fitted" },
  { id: 35, group: "Blasting & equipment", label: "Lifting plan for heavy materials" },
  { id: 36, group: "Site & welfare", label: "Housekeeping and walk paths clear" },
  { id: 37, group: "Site & welfare", label: "Emergency assembly point marked" },
  { id: 38, group: "Site & welfare", label: "Drinking water / welfare facilities OK" },
  { id: 39, group: "Site & welfare", label: "Waste paint drums in designated area" },
  { id: 40, group: "Site & welfare", label: "First aid box stocked and accessible" },
];

export const SAFETY_SHIFTS: SafetyShift[] = ["Gen", "A", "B", "C"];

export const SAFETY_PERMIT_TYPES: { value: SafetyPermitType; label: string }[] =
  [
    { value: "hot_work", label: "Hot work" },
    { value: "cold_work", label: "Cold work" },
    { value: "confined_space", label: "Confined space" },
    { value: "work_at_height", label: "Work at height" },
    { value: "other", label: "Other" },
  ];

export const SAFETY_NEAR_MISS_TYPES: {
  value: SafetyNearMissType;
  label: string;
}[] = [
  { value: "fall", label: "Fall" },
  { value: "struck_by", label: "Struck-by" },
  { value: "caught_in", label: "Caught-in" },
  { value: "electrical", label: "Electrical" },
  { value: "fire", label: "Fire" },
  { value: "other", label: "Other" },
];

export function emptyGlance(): SafetyGlanceNumbers {
  return {
    sgeWorkers: 0,
    subContractor: 0,
    manHours: 0,
    tbtPeople: 0,
    hurtNearMiss: 0,
    safeObs: 0,
    unsafeObs: 0,
    closed: 0,
    stillOpen: 0,
    lateOver10Days: 0,
  };
}

export function blankChecklist(): SafetyChecklistItem[] {
  return SAFETY_CHECKLIST_SEED.map((row) => ({
    id: row.id,
    group: row.group,
    label: row.label,
    answer: null,
    linkedObsNo: "",
  }));
}

export function blankSafetyBody(): DprSafetyBody {
  return {
    shift: "Gen",
    safetyOfficer: "",
    rilEic: "",
    siteInCharge: "",
    glance: emptyGlance(),
    observations: [],
    checklist: blankChecklist(),
    permits: [],
    talks: {
      tbtCount: 0,
      inductionCount: 0,
      rilSessionCount: 0,
      ppeGivenNote: "",
      tomorrowRiskyJobs: [],
      tomorrowTopic: "",
    },
    metRilNote: "",
    nearMissType: "other",
    nearMissNote: "",
    incidentCounts: {
      lti: 0,
      mtc: 0,
      firstAid: 0,
      nearMiss: 0,
      damageFire: 0,
    },
    signOff: {
      safetyOfficerName: "",
      safetyOfficerTime: "",
      sicName: "",
      sicTime: "",
      rilName: "",
      rilTime: "",
    },
  };
}

export function recomputeGlanceFromObservations(
  observations: SafetyObservation[],
  base: SafetyGlanceNumbers
): SafetyGlanceNumbers {
  const safeObs = observations.filter((o) => o.type === "SAFE").length;
  const unsafeObs = observations.filter(
    (o) => o.type === "UA" || o.type === "UC"
  ).length;
  const closed = observations.filter((o) => o.status === "CLOSED").length;
  const stillOpen = observations.filter((o) => o.status === "OPEN").length;
  const today = todayDate();
  const lateOver10Days = observations.filter((o) => {
    if (!o.firstFoundOn || o.status === "CLOSED") return false;
    const found = new Date(o.firstFoundOn);
    const ref = new Date(today);
    const days = (ref.getTime() - found.getTime()) / (86400000);
    return days > 10;
  }).length;
  return {
    ...base,
    safeObs,
    unsafeObs,
    closed,
    stillOpen,
    lateOver10Days,
  };
}

export function newObservationId() {
  return `obs-${Math.random().toString(36).slice(2, 9)}`;
}

export function blankObservation(): SafetyObservation {
  return {
    id: newObservationId(),
    obsNo: "",
    type: "UA",
    from: "R",
    risk: "MEDIUM",
    status: "OPEN",
    checkedBy: "R",
    whereWhat: "",
    actionTaken: "",
    whoWillFix: "",
    firstFoundOn: new Date().toISOString().slice(0, 10),
    fixByDate: "",
  };
}

/** Legacy v4 safety body (boolean checklist) → F/HSE/008 v5 shape. */
export function migrateLegacySafetyBody(raw: unknown): DprSafetyBody {
  const base = blankSafetyBody();
  if (!raw || typeof raw !== "object") return base;
  const legacy = raw as Record<string, unknown>;

  if ("observations" in legacy && Array.isArray(legacy.observations)) {
    return { ...base, ...(raw as DprSafetyBody) };
  }

  const labourCovered =
    typeof legacy.labourCovered === "number" ? legacy.labourCovered : 0;
  const incidents =
    typeof legacy.incidents === "string" ? legacy.incidents : "Nil";
  const tbtDone = legacy.tbtDone === true;
  const permitsOk = legacy.permitsOk === true;

  const checklist = blankChecklist();
  if (Array.isArray(legacy.checklist)) {
    for (const item of legacy.checklist as {
      id?: number;
      label?: string;
      checked?: boolean;
    }[]) {
      const idx = checklist.findIndex((c) => c.id === item.id);
      if (idx >= 0) {
        checklist[idx] = {
          ...checklist[idx],
          answer: item.checked ? "pass" : "fail",
        };
      }
    }
  }

  if (tbtDone) {
    const i = checklist.findIndex((c) => c.id === 4);
    if (i >= 0) checklist[i].answer = "pass";
  }
  if (permitsOk) {
    const i = checklist.findIndex((c) => c.id === 28);
    if (i >= 0) checklist[i].answer = "pass";
  }

  return {
    ...base,
    glance: { ...base.glance, sgeWorkers: labourCovered },
    talks: {
      ...base.talks,
      tbtCount: tbtDone ? 1 : 0,
    },
    nearMissNote: incidents !== "Nil" ? incidents : "",
    checklist,
  };
}

export function checklistGroups(
  items: SafetyChecklistItem[]
): { group: string; items: SafetyChecklistItem[] }[] {
  const order = SAFETY_CHECKLIST_SEED.map((s) => s.group).filter(
    (g, i, a) => a.indexOf(g) === i
  );
  return order.map((group) => ({
    group,
    items: items.filter((i) => i.group === group),
  }));
}

export const CHECKLIST_ANSWERS: {
  value: SafetyChecklistAnswer;
  label: string;
  short: string;
}[] = [
  { value: "pass", label: "OK", short: "✓" },
  { value: "fail", label: "Not OK", short: "✗" },
  { value: "na", label: "N/A", short: "NA" },
];
