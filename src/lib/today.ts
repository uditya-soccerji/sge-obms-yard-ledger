/**
 * The app's one "today" (YYYY-MM-DD, India time). Every screen and action uses
 * this, so dates agree everywhere and ageing / escalation move with the clock.
 *
 * Test tools can pin a demo date (stored per browser) to replay the seeded
 * months; without it the real date is used.
 */
export const DEMO_TODAY_KEY = "sge-demo-today";

/** Real date in Asia/Kolkata — not UTC, which is a day behind before 05:30 IST. */
export function realToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function demoToday(): string | null {
  try {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(DEMO_TODAY_KEY) : null;
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setDemoToday(date: string | null) {
  try {
    if (date) window.localStorage.setItem(DEMO_TODAY_KEY, date);
    else window.localStorage.removeItem(DEMO_TODAY_KEY);
  } catch {
    /* storage blocked: the real date stays in use */
  }
}

export function today(): string {
  return demoToday() ?? realToday();
}

/** today() minus n days. */
export function daysAgo(n: number): string {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Current time HH:MM in India time. */
export function nowTime(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}
