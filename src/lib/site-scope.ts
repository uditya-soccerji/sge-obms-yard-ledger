import type { AppState, PlantDetail, RoleId, Site } from "./types";

/** `currentSiteId` value meaning "every site" — Owner / Super Admin only. */
export const ALL_SITES = "all";

export function canSeeAllSites(role: RoleId | null | undefined): boolean {
  return role === "owner" || role === "super_admin";
}

/**
 * Roles that work across sites one at a time (docs §2: HR / Finance / Admin
 * cover all sites; SIC one or more; Owner / Super Admin everything).
 */
export function canSwitchSites(role: RoleId | null | undefined): boolean {
  return role === "super_admin" || role === "owner" || role === "sic" || role === "admin" || role === "finance" || role === "hr";
}

/**
 * Plant names from the comma-separated Master Data field. Parsed only on save:
 * splitting on every keystroke deleted a just-typed comma or space (B01).
 * Names are trimmed, inner spaces collapsed, blanks dropped and duplicates
 * (ignoring case) kept once — §15: plant names trimmed + matched.
 */
export function parsePlants(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(",")) {
    const name = raw.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Site code rule (§3): 2–6 capital letters, unique. Returns a message, or null when fine. */
export function checkSiteCode(code: string, siteId: string, sites: Pick<Site, "id" | "code">[]): string | null {
  if (!code) return "Site code is required";
  if (!/^[A-Z]{2,6}$/.test(code)) return "Site code must be 2–6 capital letters (e.g. DTA, MARINE)";
  if (sites.some((s) => s.id !== siteId && s.code === code)) return `Site code ${code} is already used`;
  return null;
}

/** RP tags from a comma field: upper-case, de-duplicated (e.g. "rp2, RP5" → RP2, RP5). */
export function parseRpTags(text: string): string[] {
  return [...new Set(parsePlants(text).map((t) => t.toUpperCase().replace(/\s+/g, "")))];
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Every plant of a site with its RP and locations, in the site's plant order (B02). */
export function sitePlantDetails(site: Pick<Site, "plants" | "plantDetails">): PlantDetail[] {
  return site.plants.map(
    (name) => site.plantDetails?.find((d) => sameName(d.name, name)) ?? { name, locations: [] }
  );
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

/**
 * Clean plant details for saving: one entry per plant still on the site
 * (renamed / removed plants drop out), names trimmed, blank and duplicate
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

export function isAllSites(s: Pick<AppState, "currentSiteId">): boolean {
  return s.currentSiteId === ALL_SITES;
}

/**
 * Site a new record is written to. On a single site that is the active site;
 * in All sites it is the "new entries go to" site picked in the header.
 */
export function entrySiteId(
  s: Pick<AppState, "currentSiteId" | "entrySiteId" | "sites">
): string {
  if (s.currentSiteId !== ALL_SITES) return s.currentSiteId;
  const picked = s.entrySiteId && s.sites.find((x) => x.id === s.entrySiteId && x.enabled);
  return picked ? picked.id : s.sites.find((x) => x.enabled)?.id ?? s.sites[0]?.id ?? "";
}

/**
 * The state every screen reads: on a single site, every site-bearing list is
 * cut down to that site; in All sites it is returned unchanged.
 *
 * A row's site is its own `siteId`, else the site of the labourer / staff /
 * JMS package it points at. Rows with no site at all (company-wide, or saved
 * before sites were tracked) stay visible everywhere.
 *
 * Reference lists (sites, staff, users, rate book, catalogues) and the audit
 * log (it has its own site filter) are never cut.
 */
export function scopeState(s: AppState): AppState {
  if (s.currentSiteId === ALL_SITES) return s;
  const site = s.currentSiteId;

  const labourerSite = new Map(s.labourers.map((l) => [l.id, l.siteId]));
  const staffSite = new Map(s.staff.map((x) => [x.id, x.siteId]));
  const jmsSite = new Map(s.jmsPackages.map((p) => [p.id, p.siteId]));
  const epSite = new Map(s.labourers.map((l) => [l.epNumber, l.siteId]));

  const keep = (own: string | undefined | null, ...linked: (string | undefined)[]) => {
    const resolved = own ?? linked.find((x) => x != null);
    return resolved == null || resolved === site;
  };

  return {
    ...s,
    labourers: s.labourers.filter((l) => l.siteId === site),
    attendance: s.attendance.filter((a) => keep(a.siteId)),
    paintStock: s.paintStock.filter((p) => keep(p.siteId)),
    equipment: s.equipment.filter((e) => keep(e.siteId)),
    dprs: s.dprs.filter((d) => keep(d.siteId)),
    dprDocuments: s.dprDocuments.filter((d) => keep(d.siteId)),
    workPlans: s.workPlans.filter((w) => keep(w.siteId, staffSite.get(w.supervisorId))),
    safetyDays: s.safetyDays.filter((d) => keep(d.siteId)),
    finance: s.finance.filter((f) => keep(f.siteId)),
    predictions: s.predictions.filter((p) => keep(p.siteId)),
    billing: s.billing.filter((b) => keep(b.siteId)),
    compliance: s.compliance.filter((c) => keep(c.siteId)),
    transfers: s.transfers.filter((t) => keep(t.siteId)),
    acplPunches: s.acplPunches.filter((p) => keep(p.siteId, epSite.get(p.epNumber))),
    acplMatches: s.acplMatches.filter((m) =>
      keep(m.siteId, m.labourerId ? labourerSite.get(m.labourerId) : undefined, epSite.get(m.epNumber))
    ),
    jmsPackages: s.jmsPackages.filter((p) => keep(p.siteId)),
    workRatings: s.workRatings.filter((r) =>
      keep(r.siteId, jmsSite.get(r.jmsPackageId) ?? undefined, staffSite.get(r.supervisorId))
    ),
    wageLedger: s.wageLedger.filter((w) =>
      keep(
        w.siteId,
        w.labourerId ? labourerSite.get(w.labourerId) : undefined,
        w.staffId ? staffSite.get(w.staffId) : undefined
      )
    ),
    financeAlerts: s.financeAlerts.filter((a) =>
      keep(a.siteId, a.jmsPackageId ? jmsSite.get(a.jmsPackageId) ?? undefined : undefined)
    ),
    equipmentRequests: s.equipmentRequests.filter((r) => keep(r.siteId)),
  };
}
