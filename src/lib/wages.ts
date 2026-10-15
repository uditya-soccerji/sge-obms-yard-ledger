/**
 * Daily wage table by trade × skill × experience (docs §1).
 * The rate on the labourer (wageDaily) is what pay and P&L use; this table
 * is the default when Owner / HR / Admin picks skill and experience.
 */
import type { ExperienceLevel, SkillLevel, WageBand } from "./types";
import { SKILL_LEVELS } from "./labour-import";

export const EXPERIENCE_LEVELS: { id: ExperienceLevel; label: string; hint: string }[] = [
  { id: "junior", label: "Junior", hint: "Up to about 2 years" },
  { id: "experienced", label: "Experienced", hint: "About 2–5 years" },
  { id: "senior", label: "Senior", hint: "About 5 years and above" },
];

export const experienceLabel = (e?: ExperienceLevel) =>
  EXPERIENCE_LEVELS.find((x) => x.id === e)?.label ?? "—";

export const skillLabelShort = (s?: SkillLevel) =>
  SKILL_LEVELS.find((x) => x.id === s)?.label ?? "—";

/** Exact match on trade + skill + experience among active bands. */
export function lookupWage(
  bands: WageBand[],
  tradeId: string,
  skill?: SkillLevel,
  experience?: ExperienceLevel
): WageBand | undefined {
  if (!skill || !experience) return undefined;
  return bands.find(
    (b) => b.active && b.tradeId === tradeId && b.skill === skill && b.experience === experience
  );
}

/** Suggested daily wage from the table, or null when no row matches. */
export function suggestedWage(
  bands: WageBand[],
  tradeId: string,
  skill?: SkillLevel,
  experience?: ExperienceLevel
): number | null {
  const b = lookupWage(bands, tradeId, skill, experience);
  return b && b.dailyWage > 0 ? b.dailyWage : null;
}

/** Seed rates: trade × skill × experience. Owner edits these in Master Data. */
export function seedWageBands(): WageBand[] {
  const rows: WageBand[] = [];
  const base: Record<string, number> = {
    painter: 750,
    spray_painter: 780,
    manual_painter: 740,
    blaster: 800,
    scaffolder: 780,
    scaffold_fitter: 790,
    rigger: 720,
    helper: 550,
    fitter: 760,
    welder: 820,
    foreman: 950,
    compressor_operator: 700,
    driver: 680,
    rope_access: 900,
    store_helper: 560,
    safety_steward: 650,
  };
  const skillBump: Record<SkillLevel, number> = {
    unskilled: 0,
    semi_skilled: 40,
    skilled: 90,
    highly_skilled: 150,
  };
  const expBump: Record<ExperienceLevel, number> = {
    junior: 0,
    experienced: 50,
    senior: 100,
  };
  for (const [tradeId, start] of Object.entries(base)) {
    for (const skill of SKILL_LEVELS.map((s) => s.id)) {
      for (const experience of EXPERIENCE_LEVELS.map((e) => e.id)) {
        rows.push({
          id: `wb-${tradeId}-${skill}-${experience}`,
          tradeId,
          skill,
          experience,
          dailyWage: start + skillBump[skill] + expBump[experience],
          active: true,
        });
      }
    }
  }
  return rows;
}
