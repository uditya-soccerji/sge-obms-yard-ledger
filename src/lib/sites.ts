import type { PlantDetail, Site } from "./types";

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

/** Comma field → clean list: trimmed, inner spaces collapsed, blanks and repeats (ignoring case) dropped. */
export function parseList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out;
}

/** RP tags from a comma field: upper-case, no spaces (e.g. "rp2, RP5" → RP2, RP5). */
export function parseRpTags(text: string): string[] {
  return [...new Set(parseList(text).map((t) => t.toUpperCase().replace(/\s+/g, "")))];
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every plant of a site with its RP and locations, in the site's plant order (B02). */
export function sitePlantDetails(site: Pick<Site, "plants" | "plantDetails">): PlantDetail[] {
  return site.plants.map((name) => site.plantDetails?.find((d) => sameName(d.name, name)) ?? { name, locations: [] });
}

/** A plant's RP: its own, else the site's when the site runs a single RP. */
export function plantRp(site: Pick<Site, "plants" | "plantDetails" | "rpTags">, plant: string): string | undefined {
  const own = site.plantDetails?.find((d) => sameName(d.name, plant))?.rp;
  return own ?? (site.rpTags.length === 1 ? site.rpTags[0] : undefined);
}

/** A location's RP: its own, else its plant's. */
export function locationRp(site: Pick<Site, "plants" | "plantDetails" | "rpTags">, plant: string, location: string): string | undefined {
  const loc = site.plantDetails?.find((d) => sameName(d.name, plant))?.locations.find((l) => sameName(l.name, location));
  return loc?.rp ?? plantRp(site, plant);
}

/** Locations listed under a plant (Master Data), for DPR / job pickers. */
export function plantLocations(site: Pick<Site, "plants" | "plantDetails"> | undefined, plant: string): string[] {
  if (!site || !plant) return [];
  return (site.plantDetails?.find((d) => sameName(d.name, plant))?.locations ?? []).map((l) => l.name);
}

/**
 * Clean plant details for saving: one entry per plant still on the site
 * (renamed / removed plants drop out), names trimmed, blank and repeated
 * locations removed, and only plants with an RP or locations kept.
 */
export function buildPlantDetails(plants: string[], details: PlantDetail[]): PlantDetail[] {
  return plants.flatMap((name) => {
    const d = details.find((x) => sameName(x.name, name));
    if (!d) return [];
    const seen = new Set<string>();
    const locations = d.locations.flatMap((l) => {
      const n = l.name.trim().replace(/\s+/g, " ");
      if (!n || seen.has(n.toLowerCase())) return [];
      seen.add(n.toLowerCase());
      return [{ name: n, ...(l.rp ? { rp: l.rp } : {}) }];
    });
    if (!d.rp && locations.length === 0) return [];
    return [{ name, ...(d.rp ? { rp: d.rp } : {}), locations }];
  });
}

/** Every plant / location RP must be one of the site's RPs. Returns a message, or null. */
export function checkPlantRps(rpTags: string[], details: PlantDetail[]): string | null {
  for (const d of details) {
    if (d.rp && !rpTags.includes(d.rp)) return `${d.name}: ${d.rp} isn't one of this site's RPs (${rpTags.join(", ") || "none"})`;
    for (const l of d.locations) {
      if (l.rp && !rpTags.includes(l.rp)) return `${d.name} · ${l.name}: ${l.rp} isn't one of this site's RPs`;
    }
  }
  return null;
}
