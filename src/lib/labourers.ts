import { normalizeEp } from "./ep";
import type { Labourer } from "./types";

export const AADHAAR_RE = /^\d{12}$/;
export const MOBILE_RE = /^[6-9]\d{9}$/;

/**
 * Labour register rules (docs/rules-decisions.md §1): name, EP (PP + 10 digits,
 * unique), optional Aadhaar (12 digits, unique) and mobile (10 digits, 6–9),
 * a trade, a contractor, a supervisor, a site and a daily wage above zero.
 * Returns an error message, or null when valid.
 */
export function checkLabourer(l: Labourer, all: Labourer[]): string | null {
  if (!l.name.trim()) return "Name is required";
  const ep = normalizeEp(l.epNumber);
  if (!ep) return "EP must be PP followed by 10 digits";
  if (all.some((x) => x.id !== l.id && normalizeEp(x.epNumber) === ep)) return `EP ${ep} is already on ${all.find((x) => x.id !== l.id && normalizeEp(x.epNumber) === ep)!.name}`;
  if (l.aadhaar) {
    if (!AADHAAR_RE.test(l.aadhaar)) return "Aadhaar must be 12 digits";
    if (all.some((x) => x.id !== l.id && x.aadhaar === l.aadhaar)) return "This Aadhaar is already registered";
  }
  if (l.mobile && !MOBILE_RE.test(l.mobile)) return "Mobile must be 10 digits starting 6–9";
  if (!l.trade) return "Pick a trade";
  if (!l.contractorId) return "Pick a contractor";
  if (!l.supervisorId) return "Pick a supervisor";
  if (!l.siteId) return "Pick a site";
  if (!(l.wageDaily > 0)) return "Daily wage must be above zero";
  return null;
}

/**
 * "field old → new" for every field the patch changes, for audit lines.
 * Fields in `hide` are reported as changed without their values.
 */
export function describeChanges<T extends object>(before: T, patch: Partial<T>, hide: (keyof T)[] = []): string {
  const parts: string[] = [];
  for (const k of Object.keys(patch) as (keyof T)[]) {
    const a = before[k];
    const b = patch[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    parts.push(hide.includes(k) ? `${String(k)} changed` : `${String(k)} ${fmt(a)} → ${fmt(b)}`);
  }
  return parts.join(", ");
}

const fmt = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : Array.isArray(v) ? v.join("/") : String(v));
