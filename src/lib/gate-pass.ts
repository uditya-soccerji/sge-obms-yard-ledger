import type { Labourer } from "./types";

/** HR, Admin and the labourer's supervisor are told this many days before a RIL pass expires (docs §24) */
export const PASS_ALERT_DAYS = 10;

export type PassState = "expired" | "expiring" | "ok";

/** Whole days from `today` to `date` (both YYYY-MM-DD); negative once passed */
export function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export function passState(l: Pick<Labourer, "passExpiry">, today: string): { state: PassState; days: number } | null {
  if (!l.passExpiry) return null;
  const days = daysUntil(l.passExpiry, today);
  return { state: days < 0 ? "expired" : days <= PASS_ALERT_DAYS ? "expiring" : "ok", days };
}

/** Active labourers whose pass has expired or expires within the alert window, soonest first */
export function passesNeedingAction(labourers: Labourer[], today: string) {
  return labourers
    .filter((l) => l.active && l.passExpiry)
    .map((l) => ({ labourer: l, ...passState(l, today)! }))
    .filter((r) => r.state && r.state !== "ok")
    .sort((a, b) => a.days - b.days);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as RIL's export or Excel writes it → YYYY-MM-DD. Accepts 2026-03-31,
 * 31-03-2026, 31/03/2026, 31.03.2026, 31-Mar-2026, 31 Mar 2026 and Excel serials.
 * Blank → undefined; anything else → null (an error for the row).
 */
export function parseDate(raw: string): string | null | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const t = new Date(`${iso}T00:00:00Z`);
    return !isNaN(t.getTime()) && t.getUTCMonth() + 1 === m && t.getUTCDate() === d ? iso : null;
  };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s);
  if (m) return ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]+(\d{2,4})$/.exec(s);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return mon ? ok(m[3].length === 2 ? 2000 + +m[3] : +m[3], mon, +m[1]) : null;
  }
  if (/^\d{5}$/.test(s)) {
    const t = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000);
    return ok(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  return null;
}

/** "31 Mar 2026" */
export function showDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}
