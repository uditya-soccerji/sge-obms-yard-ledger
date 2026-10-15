import type { AttendanceRecord, AttendanceStatus } from "./types";

/** The one attendance list every screen offers (docs §4). */
export const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "half", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "weekly_off", label: "Weekly off" },
  { value: "overtime", label: "Overtime" },
];

/** Statuses that mean the labourer worked (and should be at the gate). */
export const WORKING: AttendanceStatus[] = ["present", "half", "overtime"];

/** Statuses that pay nothing for that day. */
const UNPAID: AttendanceStatus[] = ["absent", "leave", "weekly_off"];

export const attendanceLabel = (s: AttendanceStatus) => ATTENDANCE_OPTIONS.find((o) => o.value === s)?.label ?? s;

/** Shift (docs §4): 08:00–18:00. */
export const SHIFT_START = "08:00";
export const SHIFT_END = "18:00";
const SHIFT_MINUTES = 8 * 60;

export type DayMark = {
  status: AttendanceStatus;
  inTime?: string;
  outTime?: string;
};

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
 * Share of a normal day that is payable (docs §4, §17). Hours inside the
 * shift ÷ 8 when both times are set (capped at 1). Half day with no times is
 * 0.5; present / overtime with no times is 1. Absent / leave / weekly off is 0.
 */
export function payableFraction(mark: DayMark): number {
  if (UNPAID.includes(mark.status)) return 0;
  const a = minutesOf(mark.inTime);
  const b = minutesOf(mark.outTime);
  if (a != null && b != null && b > a) {
    const start = Math.max(a, minutesOf(SHIFT_START)!);
    const end = Math.min(b, minutesOf(SHIFT_END)!);
    if (end <= start) return 0;
    return Math.min(1, (end - start) / SHIFT_MINUTES);
  }
  if (mark.status === "half") return 0.5;
  return 1;
}

/** OT pay rate: daily wage ÷ 8 (docs §17). */
export const otPay = (dailyWage: number, hours: number) => (dailyWage / 8) * hours;

/**
 * Rupees and labour-days for one person-day from their mark (docs §18).
 * labourDays = payable fraction + OT hours ÷ 8, for sharing fixed costs.
 */
export function dayWage(dailyWage: number, mark: DayMark): { cost: number; labourDays: number; ot: number } {
  const fraction = payableFraction(mark);
  const ot = WORKING.includes(mark.status) ? otHours(mark.inTime, mark.outTime) : 0;
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
