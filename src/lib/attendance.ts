import type { AttendanceRecord, AttendanceStatus } from "./types";

/** The one attendance list every screen offers (docs §4). */
export const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "weekly_off", label: "Weekly off" },
];

/**
 * Owner, 2026-11-21: no Half day and no separate Overtime — OT is hours on a Present mark.
 * Marks saved before as Half day or Overtime read as Present (Overtime keeps its OT hours).
 */
export const normStatus = (s: AttendanceStatus): AttendanceStatus => (s === "half" || s === "overtime" ? "present" : s);

/** Statuses that mean the labourer worked (and should be at the gate). */
export const WORKING: AttendanceStatus[] = ["present", "half", "overtime"];

/** Statuses that pay nothing for that day. */
const UNPAID: AttendanceStatus[] = ["absent", "leave", "weekly_off"];

export const attendanceLabel = (s: AttendanceStatus) => ATTENDANCE_OPTIONS.find((o) => o.value === normStatus(s))?.label ?? s;

/** Shift (docs §4): 08:00–18:00. */
export const SHIFT_START = "08:00";
export const SHIFT_END = "18:00";

export type DayMark = {
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
  /** Entered hours win over hours worked out from times (owner, 2026-11-18) */
  otHours?: number;
};

/** OT hours of a day: the hours entered with an Overtime mark, else from in / out times (docs §17). */
export function markOtHours(mark: DayMark): number {
  // OT only for someone present (owner, 2026-11-21)
  if (normStatus(mark.status) !== "present") return 0;
  if (mark.otHours != null && mark.otHours > 0) return mark.otHours;
  return otHours(mark.inTime, mark.outTime);
}

export function minutesOf(t?: string): number | null {
  const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Overtime hours (docs §17): time worked after 18:00, counted in half-hour
 * steps, nothing under 1 hour. 08:00–20:00 → 2 h; 08:00–18:40 → 0 h.
 */
export function otHours(inTime?: string, outTime?: string): number {
  const out = minutesOf(outTime);
  const start = Math.max(minutesOf(inTime) ?? 0, minutesOf(SHIFT_END)!);
  if (out == null || out <= start) return 0;
  const halfHours = Math.floor((out - start) / 30);
  const hours = halfHours / 2;
  return hours >= 1 ? hours : 0;
}

/**
 * Share of a normal day that is payable, from the attendance status only (owner, 2026-11-21).
 */
export function payableFraction(mark: DayMark): number {
  // Owner, 2026-11-21: the status decides the day — present a full day, absent / leave / off nothing.
  // In / out times are kept as recorded and only give the OT hours.
  // Present (and old Half day / Overtime marks, which read as Present) is a full day
  return UNPAID.includes(mark.status) ? 0 : 1;
}

/** OT pay rate: daily wage ÷ 8 (docs §17). */
export const otPay = (dailyWage: number, hours: number) => (dailyWage / 8) * hours;

/**
 * Rupees and labour-days for one person-day from their mark (docs §18).
 * labourDays = payable fraction + OT hours ÷ 8, for sharing fixed costs.
 */
export function dayWage(dailyWage: number, mark: DayMark): { cost: number; labourDays: number; ot: number } {
  const fraction = payableFraction(mark);
  const ot = markOtHours(mark);
  const cost = Math.round((dailyWage * fraction + otPay(dailyWage, ot)) * 100) / 100;
  const labourDays = Math.round((fraction + ot / 8) * 1000) / 1000;
  return { cost, labourDays, ot };
}

/** In/out problems for one mark: out must be after in (docs §4). */
export function timeProblem(inTime?: string, outTime?: string): string | null {
  const a = minutesOf(inTime);
  const b = minutesOf(outTime);
  if (a != null && b != null && b <= a) return "Out-time must be after in-time";
  return null;
}

/**
 * Labourers who worked on a date, counted once each — a split day across two
 * supervisors (docs §4) has two records but is one person.
 */
export function workedCount(records: AttendanceRecord[], date: string): number {
  return new Set(records.filter((a) => a.date === date && WORKING.includes(a.status)).map((a) => a.labourerId)).size;
}
