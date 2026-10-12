import type {
  AcplMatchFlag,
  AcplMatchRow,
  AcplPunchRow,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  Labourer,
} from "./types";
import { normalizeEp, sameName } from "./ep";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function minutes(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Statuses that mean the labourer worked that day. */
const WORKING: AttendanceStatus[] = ["present", "half"];

/**
 * One labourer-day, DPR vs gate (docs §12):
 * - worked on the DPR, no punch -> dpr_only
 * - absent / leave / off on the DPR, but punched in -> punched_but_absent
 * - absent / leave / off on the DPR and no punch -> match (they agree)
 * - punch with no DPR mark -> acpl_only
 * - both say worked: in- or out-time more than 15 min apart -> time_mismatch
 */
export function classifyAcplFlag(
  mark: { status: AttendanceStatus; inTime?: string; outTime?: string } | undefined,
  punch: { inTime?: string; outTime?: string } | undefined
): AcplMatchFlag {
  if (!mark) return punch ? "acpl_only" : "match";
  const worked = WORKING.includes(mark.status);
  if (!worked) return punch ? "punched_but_absent" : "match";
  if (!punch) return "dpr_only";
  const off = (a?: string, b?: string) => {
    const x = minutes(a);
    const y = minutes(b);
    return x != null && y != null && Math.abs(x - y) > 15;
  };
  if (off(mark.inTime, punch.inTime) || off(mark.outTime, punch.outTime)) return "time_mismatch";
  return "match";
}

export function matchAcplAgainstApproved(
  state: AppState,
  punches: AcplPunchRow[],
  date: string
): AcplMatchRow[] {
  const approved = state.dprDocuments.filter(
    (d) => d.date === date && d.status === "sic_approved"
  );

  const dprByLabourer = new Map<
    string,
    { status: AttendanceStatus; inTime?: string; outTime?: string }
  >();
  for (const dpr of approved) {
    for (const mark of dpr.labourMarks) {
      // Split day across two DPRs: a working mark wins over an absent one
      const prev = dprByLabourer.get(mark.labourerId);
      if (prev && WORKING.includes(prev.status) && !WORKING.includes(mark.status)) continue;
      dprByLabourer.set(mark.labourerId, {
        status: mark.status,
        inTime: prev?.inTime ?? mark.inTime,
        outTime: mark.outTime ?? prev?.outTime,
      });
    }
  }

  const epToLabourer = new Map<string, Labourer>();
  for (const l of state.labourers) epToLabourer.set(l.epNumber, l);

  const punchByEp = new Map<string, AcplPunchRow>();
  for (const p of punches.filter((x) => x.date === date)) {
    punchByEp.set(p.epNumber, p);
  }
  // Punches whose EP isn't in our register can still match by name (docs §12 fallback)
  const unknownPunches = [...punchByEp.values()].filter((p) => !epToLabourer.has(p.epNumber));

  const rows: AcplMatchRow[] = [];
  const usedEps = new Set<string>();

  for (const [labourerId, mark] of dprByLabourer) {
    const labourer = state.labourers.find((l) => l.id === labourerId);
    if (!labourer) continue;
    let punch = punchByEp.get(labourer.epNumber);
    let matchedBy: AcplMatchRow["matchedBy"] = punch ? "ep" : undefined;
    if (!punch) {
      punch = unknownPunches.find((p) => !usedEps.has(p.epNumber) && sameName(p.labourerName, labourer.name));
      if (punch) matchedBy = "name";
    }
    if (punch) usedEps.add(punch.epNumber);
    rows.push({
      id: uid("am"),
      date,
      labourerId,
      epNumber: labourer.epNumber,
      flag: classifyAcplFlag(mark, punch),
      matchedBy,
      dprStatus: mark.status,
      dprInTime: mark.inTime,
      dprOutTime: mark.outTime,
      acplInTime: punch?.inTime,
      acplOutTime: punch?.outTime,
      resolveStatus: "open",
    });
  }

  for (const [ep, punch] of punchByEp) {
    if (usedEps.has(ep)) continue;
    const labourer = epToLabourer.get(ep);
    if (labourer && dprByLabourer.has(labourer.id)) continue;
    rows.push({
      id: uid("am"),
      date,
      labourerId: labourer?.id,
      epNumber: ep,
      flag: "acpl_only",
      acplInTime: punch.inTime,
      acplOutTime: punch.outTime,
      resolveStatus: "open",
    });
  }

  return rows;
}

/** Does the first line look like column names rather than a punch? */
function isHeaderLine(line: string): boolean {
  const first = line.split(/[,\t|;]/)[0]?.trim() ?? "";
  // A real EP or a date in the first cell means it's data, whatever words follow
  if (normalizeEp(first) || /^EP-?\d/i.test(first) || /^\d{4}-\d{2}-\d{2}$/.test(first)) return false;
  return /\b(ep|emp(loyee)?|code|name|date|punch|in|out)\b/i.test(line);
}

export function parseAcplCsv(
  text: string,
  defaultDate: string
): Omit<AcplPunchRow, "id" | "source">[] {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const rows: Omit<AcplPunchRow, "id" | "source">[] = [];
  const start = isHeaderLine(lines[0]) ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(/[,\t|;]/).map((p) => p.trim());
    if (parts.length < 2) continue;
    // Formats: EP,Name,In,Out  OR  Date,EP,Name,In,Out  OR  EP,In,Out
    let date = defaultDate;
    let ep = "";
    let name = "";
    let inTime = "";
    let outTime = "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
      date = parts[0];
      ep = parts[1] ?? "";
      if (parts.length >= 5) {
        name = parts[2];
        inTime = parts[3];
        outTime = parts[4];
      } else {
        inTime = parts[2] ?? "";
        outTime = parts[3] ?? "";
      }
    } else {
      ep = parts[0];
      if (parts.length >= 4 && /:/.test(parts[2])) {
        name = parts[1];
        inTime = parts[2];
        outTime = parts[3];
      } else {
        inTime = parts[1] ?? "";
        outTime = parts[2] ?? "";
        name = parts[3] ?? "";
      }
    }

    if (!ep) continue;
    rows.push({
      date,
      // PP + 10 digits; a bare 10-digit code gets its PP. Anything else is kept
      // as typed so it shows up as an unknown EP for Admin to sort out.
      epNumber: normalizeEp(ep) ?? ep.trim().toUpperCase(),
      labourerName: name || undefined,
      inTime: inTime || undefined,
      outTime: outTime || undefined,
    });
  }
  return rows;
}

export function attendanceFromApprovedDpr(
  dprId: string,
  date: string,
  siteId: string,
  marks: { labourerId: string; status: AttendanceStatus; inTime?: string; outTime?: string; note?: string }[],
  markedBy: string
): AttendanceRecord[] {
  return marks.map((m) => ({
    id: uid("att"),
    date,
    labourerId: m.labourerId,
    status: m.status,
    inTime: m.inTime,
    outTime: m.outTime,
    note: m.note,
    markedBy,
    siteId,
    sourceDprId: dprId,
    reconciled: false,
  }));
}
