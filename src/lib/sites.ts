import type { PlantDetail, Site } from "./types";

/** Site code: 2–6 capitals, digits allowed after the first letter, e.g. DTA, MTF5 (docs §3, §33). */
export const SITE_CODE_RE = /^[A-Z][A-Z0-9]{1,5}$/;

/** How a site reads in the header pickers (owner, 2026-11-13): plant code - site - server, e.g. "3611 - DTA - RP2" */
export function siteLabel(s: Pick<Site, "name" | "rpTags" | "plantCode">): string {
  return `${s.plantCode?.trim() || "----"} - ${s.name} - ${s.rpTags.join("/") || "—"}`;
}

/**
 * The owner's site list (2026-11-13). Existing sites keep their id so their data stays;
 * the rest are new. Applied once to saved data by migrateState (a site without a plant
 * code yet takes these values; anything edited later in Master Data is kept).
 */
export const SITE_LIST_2026_11: Pick<Site, "id" | "code" | "name" | "plantCode" | "rpTags" | "client" | "plants">[] = [
  { id: "site-dta", code: "DTA", name: "DTA", plantCode: "3611", rpTags: ["RP2"], client: "Reliance Industries Limited", plants: [] },
  { id: "site-mtf", code: "MTF", name: "MTF", plantCode: "3611", rpTags: ["RP2"], client: "Sikka Ports & Terminals Limited", plants: [] },
  { id: "site-mtf-rp5", code: "MTF5", name: "MTF", plantCode: "3622", rpTags: ["RP5"], client: "Sikka Ports & Terminals Limited", plants: ["MTF"] },
  { id: "site-swro", code: "SWRO", name: "SWRO", plantCode: "3611", rpTags: ["RP2"], client: "Reliance Industries Limited", plants: ["SWRO"] },
  { id: "site-jetty", code: "JETTY", name: "Jetty Mech", plantCode: "3622", rpTags: ["RP5"], client: "Sikka Ports & Terminals Limited", plants: [] },
  { id: "site-marine", code: "MARINE", name: "Marine Ops", plantCode: "3622", rpTags: ["RP5"], client: "Sikka Ports & Terminals Limited", plants: [] },
  { id: "site-cpp", code: "CPP", name: "CPP", plantCode: "36AG", rpTags: ["RP5"], client: "Reliance Industries Limited", plants: ["CPP"] },
  { id: "site-pcg", code: "PCG", name: "PCG", plantCode: "36KK", rpTags: ["RP2"], client: "Reliance Syngas Limited", plants: [] },
  { id: "site-pccs", code: "PCCS", name: "PCG (PCCS)", plantCode: "", rpTags: ["RP2"], client: "Reliance Syngas Limited", plants: ["PCCS"] },
  { id: "site-hpib", code: "HPIB", name: "HPIB", plantCode: "36IY", rpTags: ["RP2"], client: "Reliance Industries Limited", plants: ["HPIB"] },
];
/**
 * Plants renamed when CPP and HPIB became sites of their own (owner, 2026-11-13): DTA's
 * "PRU & HPIB" is now "PRU". Plan lines, DPRs and JMS hold the plant by name, so the Work
 * store renames those too (renameWorkPlants). Safe to run again: the old name never returns.
 */
export const PLANT_RENAMES_2026_11: { siteId: string; from: string; to: string }[] = [
  { siteId: "site-dta", from: "PRU & HPIB", to: "PRU" },
];
export function renamedPlant(siteId: string, plant: string): string {
  const r = PLANT_RENAMES_2026_11.find((x) => x.siteId === siteId && x.from.toUpperCase() === plant.trim().toUpperCase());
  return r ? r.to : plant;
}

/** Sites not on the owner's list: switched off (read only, data kept) */
export const SITES_OFF_2026_11 = ["site-gagva"];

/**
 * Sites as the shared database has them, plus what the database can't hold yet (owner, 2026-11-14):
 * the plant code from the owner's list (no plant_code column yet), and any listed site the database
 * doesn't have (saved there by the next Owner / SA sign-in). Names, RPs and on / off come from the
 * database as edited in Master Data → Sites — never overridden here.
 */
export function withPlantCodes(dbSites: Site[]): Site[] {
  const out: Site[] = dbSites.map((s) => {
    const want = SITE_LIST_2026_11.find((w) => w.id === s.id);
    const plants = s.plants.map((p) => renamedPlant(s.id, p));
    return { ...s, plants, plantCode: s.plantCode ?? want?.plantCode ?? "" };
  });
  for (const w of SITE_LIST_2026_11) {
    if (out.some((s) => s.id === w.id || s.code === w.code)) continue;
    out.push({ ...w, enabled: true, plantDetails: [] });
  }
  const rank = (id: string) => {
    const i = SITE_LIST_2026_11.findIndex((w) => w.id === id);
    return i < 0 ? 999 : i;
  };
  return out.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.id) - rank(b.s.id) || a.i - b.i).map((x) => x.s);
}

/** Bring saved sites in line with the owner's list, once per site (see SITE_LIST_2026_11) */
export function applySiteList(sites: Site[]): Site[] {
  const out = sites.map((s) => {
    const plants = s.plants.map((p) => renamedPlant(s.id, p));
    if (plants.some((p, i) => p !== s.plants[i])) {
      const keep = new Set<string>();
      s = {
        ...s,
        plants: plants.filter((p) => !keep.has(p.toUpperCase()) && keep.add(p.toUpperCase())),
        plantDetails: (s.plantDetails ?? []).map((d) => ({ ...d, name: renamedPlant(s.id, d.name) })),
      };
    }
    if (s.plantCode !== undefined) return s;
    const want = SITE_LIST_2026_11.find((w) => w.id === s.id);
    if (want) return { ...s, name: want.name, plantCode: want.plantCode, rpTags: want.rpTags };
    if (SITES_OFF_2026_11.includes(s.id)) return { ...s, plantCode: "", enabled: false };
    return s;
  });
  for (const w of SITE_LIST_2026_11) {
    if (out.some((s) => s.id === w.id)) continue;
    if (out.some((s) => s.code === w.code)) continue; // a site with that code was added by hand: leave it
    out.push({ ...w, enabled: true, plantDetails: [] });
  }
  // Keep the owner's order in the pickers
  const rank = (id: string) => {
    const i = SITE_LIST_2026_11.findIndex((w) => w.id === id);
    return i < 0 ? 999 : i;
  };
  return out.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.id) - rank(b.s.id) || a.i - b.i).map((x) => x.s);
}

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
