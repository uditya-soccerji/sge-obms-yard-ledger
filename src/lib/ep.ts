/**
 * RIL gate-pass (EP) numbers: `PP` + 10 digits, e.g. `PP5920136007`
 * (docs/rules-decisions.md §1, §13, §16).
 */
export const EP_RE = /^PP\d{10}$/;

/**
 * Clean an EP as typed or exported: trim, uppercase, drop spaces, and add the
 * missing `PP` to a bare 10-digit code (eSSL exports often omit it).
 * Returns null when the value isn't an EP at all.
 */
export function normalizeEp(raw: string): string | null {
  const v = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (EP_RE.test(v)) return v;
  if (/^\d{10}$/.test(v)) return `PP${v}`;
  return null;
}

/** Names compared loosely for the EP-missing fallback match (docs §12). */
export const sameName = (a?: string, b?: string) =>
  !!a && !!b && a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
