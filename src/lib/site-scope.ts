import type { AppState, RoleId } from "./types";

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

/**
 * Where a user lands after signing in or being viewed as (B4): Owner / Super
 * Admin open on All sites, everyone else on their first site.
 */
export function landingSite(role: RoleId, siteIds: string[], fallback: string): string {
  return canSeeAllSites(role) ? ALL_SITES : siteIds[0] ?? fallback;
}
