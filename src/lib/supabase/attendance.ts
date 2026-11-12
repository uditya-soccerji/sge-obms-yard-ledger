/**
 * Attendance in the shared database (migration 20261112_008). The browser keeps only a
 * recent window (ATTENDANCE_WINDOW_MONTHS back from the 1st of this month): it loads that
 * window at sign-in, then fetches only rows changed since the last fetch, and sends back
 * what changed here. Nothing is kept in localStorage any more, so a browser never fills up.
 */
import { supabase } from "./client";
import type { AttendanceRecord, AttendanceStatus, RoleId } from "../types";

interface AttendanceRow {
  id: string;
  date: string;
  labourer_id: string;
  status: AttendanceStatus;
  in_time: string | null;
  out_time: string | null;
  marked_by: string;
  site_id: string;
  note: string | null;
  source_dpr_id: string | null;
  reconciled: boolean | null;
  corrected_from: AttendanceStatus | null;
  updated_at?: string;
}

/** Roles that may write (mirrors the RLS in migration 008) */
export const ATTENDANCE_WRITE_ROLES: RoleId[] = ["super_admin", "owner", "hr", "admin", "sic", "supervisor"];
/** Months loaded before this one (Oct + Nov + … ; pay and the profile month picker look back this far) */
export const ATTENDANCE_WINDOW_MONTHS = 3;

const u = <T>(v: T | null | undefined) => (v == null ? undefined : v);

function fromRow(r: AttendanceRow): AttendanceRecord {
  return {
    id: r.id,
    date: r.date,
    labourerId: r.labourer_id,
    status: r.status,
    inTime: u(r.in_time),
    outTime: u(r.out_time),
    markedBy: r.marked_by,
    siteId: r.site_id,
    note: u(r.note),
    sourceDprId: u(r.source_dpr_id),
    reconciled: u(r.reconciled),
    correctedFrom: u(r.corrected_from),
  };
}

function toRow(a: AttendanceRecord): AttendanceRow {
  return {
    id: a.id,
    date: a.date,
    labourer_id: a.labourerId,
    status: a.status,
    in_time: a.inTime || null,
    out_time: a.outTime || null,
    marked_by: a.markedBy ?? "",
    site_id: a.siteId,
    note: a.note ?? null,
    source_dpr_id: a.sourceDprId ?? null,
    reconciled: a.reconciled ?? null,
    corrected_from: a.correctedFrom ?? null,
  };
}

/** Comparable fingerprint, to send only what changed */
export const attendancePrint = (a: AttendanceRecord) => JSON.stringify(toRow(a));

/** First day of the loaded window, YYYY-MM-DD */
export function attendanceWindowStart(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - ATTENDANCE_WINDOW_MONTHS, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const COLS = "id,date,labourer_id,status,in_time,out_time,marked_by,site_id,note,source_dpr_id,reconciled,corrected_from,updated_at";

/** Page through (PostgREST returns 1,000 rows per request); null when the read failed */
async function pages(build: (from: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<AttendanceRow[] | null> {
  const out: AttendanceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from);
    if (error) return null;
    out.push(...((data ?? []) as AttendanceRow[]));
    if (!data || data.length < 1000) return out;
  }
}

const latest = (rows: AttendanceRow[], prev: string | null) =>
  rows.reduce<string | null>((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), prev);

/** Every row in the window, plus the newest updated_at (where the next change fetch starts) */
export async function remoteLoadAttendance(from: string): Promise<{ records: AttendanceRecord[]; cursor: string | null } | null> {
  const sb = supabase;
  if (!sb) return null;
  const rows = await pages((at) => sb.from("attendance").select(COLS).gte("date", from).order("id").range(at, at + 999));
  if (!rows) return null;
  return { records: rows.map(fromRow), cursor: latest(rows, null) };
}

/** Rows changed since `cursor` (inside the window). Deletions show up at the next full load. */
export async function remoteAttendanceChanges(from: string, cursor: string): Promise<{ records: AttendanceRecord[]; cursor: string } | null> {
  const sb = supabase;
  if (!sb) return null;
  const rows = await pages((at) => sb.from("attendance").select(COLS).gte("date", from).gt("updated_at", cursor).order("updated_at").range(at, at + 999));
  if (!rows) return null;
  return { records: rows.map(fromRow), cursor: latest(rows, cursor) ?? cursor };
}

const chunks = <T>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Save: removals first (a DPR re-submit replaces a day's mark under a new id), then upserts */
export async function remoteSaveAttendance(
  roles: RoleId[],
  changed: AttendanceRecord[],
  removed: string[],
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: true };
  if (!roles.some((r) => ATTENDANCE_WRITE_ROLES.includes(r))) return { ok: true };
  const total = changed.length + removed.length;
  let done = 0;
  for (const part of chunks(removed)) {
    const { error } = await supabase.from("attendance").delete().in("id", part);
    if (error) return { ok: false, error: `Attendance didn't save: ${error.message}` };
    onProgress?.((done += part.length), total);
  }
  for (const part of chunks(changed.map(toRow))) {
    const { error } = await supabase.from("attendance").upsert(part);
    if (error) return { ok: false, error: `Attendance didn't save: ${error.message}` };
    onProgress?.((done += part.length), total);
  }
  return { ok: true };
}
