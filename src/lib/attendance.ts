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

export const attendanceLabel = (s: AttendanceStatus) => ATTENDANCE_OPTIONS.find((o) => o.value === s)?.label ?? s;

/** Shift (docs §4): 08:00–18:00. */
export const SHIFT_START = "08:00";
export const SHIFT_END = "18:00";

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
