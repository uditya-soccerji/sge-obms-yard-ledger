/**
 * Smoke checks for Repair 1 day-wage helpers (run: node scripts/check-day-wage.mjs).
 * Mirrors src/lib/attendance.ts — keep in sync when changing the rules.
 */
const SHIFT_START = 8 * 60;
const SHIFT_END = 18 * 60;
const SHIFT_MINUTES = 8 * 60;

function minutesOf(t) {
  const m = t ? /^(\d{1,2}):(\d{2})$/.exec(t) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function otHours(inTime, outTime) {
  const out = minutesOf(outTime);
  const start = Math.max(minutesOf(inTime) ?? 0, SHIFT_END);
  if (out == null || out <= start) return 0;
  const hours = Math.floor((out - start) / 30) / 2;
  return hours >= 1 ? hours : 0;
}

function payableFraction(mark) {
  if (["absent", "leave", "weekly_off"].includes(mark.status)) return 0;
  const a = minutesOf(mark.inTime);
  const b = minutesOf(mark.outTime);
  if (a != null && b != null && b > a) {
    const start = Math.max(a, SHIFT_START);
    const end = Math.min(b, SHIFT_END);
    if (end <= start) return 0;
    return Math.min(1, (end - start) / SHIFT_MINUTES);
  }
  if (mark.status === "half") return 0.5;
  return 1;
}

function dayWage(dailyWage, mark) {
  const fraction = payableFraction(mark);
  const ot = ["present", "half", "overtime"].includes(mark.status) ? otHours(mark.inTime, mark.outTime) : 0;
  const cost = Math.round((dailyWage * fraction + (dailyWage / 8) * ot) * 100) / 100;
  return { cost, fraction, ot };
}

const wage = 800;
const cases = [
  [{ status: "half" }, 400, 0.5, 0],
  // 08:00–13:00 = 5 h inside shift → 5/8 day
  [{ status: "present", inTime: "08:00", outTime: "13:00" }, 500, 0.625, 0],
  [{ status: "present", inTime: "08:00", outTime: "20:00" }, 1000, 1, 2],
  [{ status: "absent" }, 0, 0, 0],
  [{ status: "present", inTime: "08:00", outTime: "18:00" }, 800, 1, 0],
];

let failed = 0;
for (const [mark, expectCost, expectFrac, expectOt] of cases) {
  const r = dayWage(wage, mark);
  const ok = r.cost === expectCost && r.fraction === expectFrac && r.ot === expectOt;
  if (!ok) {
    failed++;
    console.error("FAIL", mark, "got", r, "expected", { cost: expectCost, fraction: expectFrac, ot: expectOt });
  } else {
    console.log("ok", mark.status, mark.inTime || "", mark.outTime || "", "→", r.cost);
  }
}
// Split day: half day on two jobs → ₹200 each
const half = dayWage(wage, { status: "half" });
const perJob = Math.round(half.cost * 0.5 * 100) / 100;
if (perJob !== 200) {
  failed++;
  console.error("FAIL split half", perJob);
} else {
  console.log("ok split half-day across 2 jobs →", perJob, "each");
}

process.exit(failed ? 1 : 0);
