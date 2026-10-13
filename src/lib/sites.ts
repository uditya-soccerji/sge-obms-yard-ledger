import type { Site } from "./types";

/** Site code: 2–6 capital letters (docs/rules-decisions.md §3). */
export const SITE_CODE_RE = /^[A-Z]{2,6}$/;

/** Checks for a new or edited site. Returns an error message, or null when valid. */
export function checkSite(site: Site, sites: Site[]): string | null {
  const code = site.code.trim();
  if (!SITE_CODE_RE.test(code)) return "Code: 2–6 capital letters, e.g. DTA";
  if (sites.some((x) => x.id !== site.id && x.code.trim().toUpperCase() === code)) return `Site code ${code} already exists`;
  if (!site.name.trim()) return "Name is required";
  const plants = site.plants.map((p) => p.trim()).filter(Boolean);
  if (!plants.length) return "Add at least one plant";
  const seen = new Set<string>();
  for (const p of plants) {
    const k = p.toUpperCase();
    if (seen.has(k)) return `Plant ${p} is listed twice`;
    seen.add(k);
  }
  return null;
}

/** Is this plant on the site's Master Data list? (§3, §15: trimmed, matched case-insensitively) */
export function isSitePlant(sites: Site[], siteId: string, plant: string): boolean {
  const site = sites.find((s) => s.id === siteId);
  const p = plant.trim().toUpperCase();
  return !!site && site.plants.some((x) => x.trim().toUpperCase() === p);
}
