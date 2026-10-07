import type {
  AcplMatchFlag,
  AcplMatchRow,
  AcplPunchRow,
  AppState,
  AttendanceRecord,
  AttendanceStatus,
  Labourer,
} from "./types";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function minutes(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Diff > 15 min between DPR in-time and ACPL in-time → time_mismatch */
export function classifyAcplFlag(
  dprIn?: string,
  acplIn?: string,
  hasDpr?: boolean,
  hasAcpl?: boolean
): AcplMatchFlag {
  if (hasDpr && !hasAcpl) return "dpr_only";
  if (!hasDpr && hasAcpl) return "acpl_only";
  const d = minutes(dprIn);
  const a = minutes(acplIn);
  if (d != null && a != null && Math.abs(d - a) > 15) return "time_mismatch";
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
      dprByLabourer.set(mark.labourerId, {
        status: mark.status,
        inTime: mark.inTime,
        outTime: mark.outTime,
      });
    }
  }

  const epToLabourer = new Map<string, Labourer>();
  for (const l of state.labourers) epToLabourer.set(l.epNumber, l);

  const punchByEp = new Map<string, AcplPunchRow>();
  for (const p of punches.filter((x) => x.date === date)) {
    punchByEp.set(p.epNumber, p);
  }

  const rows: AcplMatchRow[] = [];
  const seen = new Set<string>();

  for (const [labourerId, mark] of dprByLabourer) {
    const labourer = state.labourers.find((l) => l.id === labourerId);
    if (!labourer) continue;
    const punch = punchByEp.get(labourer.epNumber);
    seen.add(labourer.epNumber);
    const flag = classifyAcplFlag(
      mark.inTime,
      punch?.inTime,
      true,
      !!punch
    );
    rows.push({
      id: uid("am"),
      date,
      labourerId,
      epNumber: labourer.epNumber,
      flag,
      dprStatus: mark.status,
      dprInTime: mark.inTime,
      acplInTime: punch?.inTime,
      acplOutTime: punch?.outTime,
      resolveStatus: "open",
    });
  }

  for (const [ep, punch] of punchByEp) {
    if (seen.has(ep)) continue;
    const labourer = epToLabourer.get(ep);
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
  const start = /ep|employee|punch/i.test(lines[0]) ? 1 : 0;

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
      epNumber: ep.toUpperCase().startsWith("EP") ? ep : `EP-${ep}`,
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
