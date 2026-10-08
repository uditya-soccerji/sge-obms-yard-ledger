/** Site rows win; company-wide fills keys the site did not define. Inactive stay for history. */

export type Scoped = { id: string; siteId: string | null; active: boolean };

export function resolveSiteThenCompany<T extends Scoped & { code: string }>(
  rows: T[],
  siteId: string,
  opts?: { includeInactive?: boolean }
): T[] {
  const siteRows = rows.filter((r) => r.siteId === siteId);
  const company = rows.filter((r) => r.siteId == null);
  const used = new Set(siteRows.map((r) => r.code));
  const merged = [...siteRows, ...company.filter((r) => !used.has(r.code))];
  if (opts?.includeInactive) return merged;
  return merged.filter((r) => r.active);
}

export function dropdownOptions<T extends Scoped & { code: string; label: string }>(
  rows: T[],
  siteId: string
): { id: string; code: string; label: string }[] {
  return resolveSiteThenCompany(rows, siteId).map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
  }));
}
