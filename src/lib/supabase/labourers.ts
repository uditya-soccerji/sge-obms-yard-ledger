/**
 * Labourer register in the shared database (migration 20261015_006). Three tables
 * so RLS keeps Aadhaar / mobile (Owner, SA, HR) and wages (plus Admin, Finance)
 * away from other roles; a role that can't read a part simply gets it empty.
 */
import { supabase } from "./client";
import type { Labourer, RoleId } from "../types";

interface LabourerRow {
  id: string;
  name: string;
  trade: string;
  trade_subcategory: string | null;
  ep_number: string;
  gate_pass: string;
  site_id: string;
  supervisor_id: string;
  contractor_id: string | null;
  equipment_ids: string[];
  active: boolean;
  skill: Labourer["skill"] | null;
  ep_history: Labourer["epHistory"] | null;
  eic: string | null;
  ril_status: string | null;
  ril_area: string | null;
  pass_valid_from: string | null;
  pass_expiry: string | null;
  upload: Labourer["upload"] | null;
}

/** Roles that may read / write each part (mirrors the RLS in migration 006) */
const INSERT_ROLES: RoleId[] = ["super_admin", "owner", "hr", "admin"];
const PRIVATE_ROLES: RoleId[] = ["super_admin", "owner", "hr"];
const PAY_WRITE_ROLES: RoleId[] = ["super_admin", "owner", "hr", "admin"];
const DELETE_ROLES: RoleId[] = ["super_admin", "owner"];

const u = <T>(v: T | null | undefined) => (v == null ? undefined : v);

function fromRow(r: LabourerRow, priv?: { aadhaar: string | null; mobile: string | null }, wage?: number): Labourer {
  return {
    id: r.id,
    name: r.name,
    trade: r.trade as Labourer["trade"],
    tradeSubcategory: u(r.trade_subcategory),
    epNumber: r.ep_number,
    gatePass: r.gate_pass,
    siteId: r.site_id,
    supervisorId: r.supervisor_id,
    contractorId: u(r.contractor_id),
    wageDaily: wage ?? 0,
    equipmentIds: r.equipment_ids ?? [],
    active: r.active,
    skill: u(r.skill),
    epHistory: r.ep_history?.length ? r.ep_history : undefined,
    eic: u(r.eic),
    rilStatus: u(r.ril_status),
    rilArea: u(r.ril_area),
    passValidFrom: u(r.pass_valid_from),
    passExpiry: u(r.pass_expiry),
    upload: u(r.upload),
    aadhaar: u(priv?.aadhaar),
    mobile: u(priv?.mobile),
  };
}

function toRow(l: Labourer): LabourerRow {
  return {
    id: l.id,
    name: l.name,
    trade: l.trade,
    trade_subcategory: l.tradeSubcategory ?? null,
    ep_number: l.epNumber,
    gate_pass: l.gatePass ?? "",
    site_id: l.siteId,
    supervisor_id: l.supervisorId ?? "",
    contractor_id: l.contractorId ?? null,
    equipment_ids: l.equipmentIds ?? [],
    active: l.active,
    skill: l.skill ?? null,
    ep_history: l.epHistory ?? [],
    eic: l.eic ?? null,
    ril_status: l.rilStatus ?? null,
    ril_area: l.rilArea ?? null,
    pass_valid_from: l.passValidFrom ?? null,
    pass_expiry: l.passExpiry ?? null,
    upload: l.upload ?? null,
  };
}

/** Comparable fingerprints of each part, to send only what changed */
export const partsOf = (l: Labourer) => ({
  main: JSON.stringify(toRow(l)),
  priv: JSON.stringify([l.aadhaar ?? null, l.mobile ?? null]),
  pay: String(l.wageDaily ?? 0),
});
export type LabourerParts = ReturnType<typeof partsOf>;

/** Page through a table (PostgREST returns 1,000 rows per request) */
async function all<T>(table: string, columns: string): Promise<T[] | null> {
  if (!supabase) return null;
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order(table === "labourers" ? "id" : "labourer_id").range(from, from + 999);
    if (error) return table === "labourers" ? null : out;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export async function remoteLoadLabourers(): Promise<Labourer[] | null> {
  if (!supabase) return null;
  const [rows, priv, pay] = await Promise.all([
    all<LabourerRow>("labourers", "*"),
    all<{ labourer_id: string; aadhaar: string | null; mobile: string | null }>("labourer_private", "labourer_id,aadhaar,mobile"),
    all<{ labourer_id: string; wage_daily: number }>("labourer_pay", "labourer_id,wage_daily"),
  ]);
  if (!rows) return null;
  const p = new Map((priv ?? []).map((x) => [x.labourer_id, x]));
  const w = new Map((pay ?? []).map((x) => [x.labourer_id, Number(x.wage_daily)]));
  return rows.map((r) => fromRow(r, p.get(r.id), w.get(r.id)));
}

const chunks = <T>(xs: T[], n = 400) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Save changed labourers: the main row always, Aadhaar / mobile and wage only for
 * roles allowed to write them (and only when they changed). Removed ids are deleted.
 */
export async function remoteSaveLabourers(
  /** The signed-in account's roles (RLS checks the account, not the "view as" role) */
  roles: RoleId[],
  changed: { labourer: Labourer; main: boolean; priv: boolean; pay: boolean }[],
  removed: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: true };
  const may = (list: RoleId[]) => roles.some((r) => list.includes(r));
  const main = changed.filter((c) => c.main).map((c) => toRow(c.labourer));
  if (may(INSERT_ROLES)) {
    for (const part of chunks(main)) {
      const { error } = await supabase.from("labourers").upsert(part);
      if (error) return { ok: false, error: `Labourers didn't save: ${error.message}` };
    }
  } else {
    // Update-only roles (the SIC moving crews): an upsert would need insert rights
    for (const row of main) {
      const { id, ...rest } = row;
      const { error } = await supabase.from("labourers").update(rest).eq("id", id);
      if (error) return { ok: false, error: `Labourers didn't save: ${error.message}` };
    }
  }
  if (may(PRIVATE_ROLES)) {
    const priv = changed.filter((c) => c.priv).map((c) => ({ labourer_id: c.labourer.id, aadhaar: c.labourer.aadhaar ?? null, mobile: c.labourer.mobile ?? null }));
    for (const part of chunks(priv)) {
      const { error } = await supabase.from("labourer_private").upsert(part);
      if (error) return { ok: false, error: `Aadhaar / mobile didn't save: ${error.message}` };
    }
  }
  if (may(PAY_WRITE_ROLES)) {
    const pay = changed.filter((c) => c.pay).map((c) => ({ labourer_id: c.labourer.id, wage_daily: c.labourer.wageDaily ?? 0 }));
    for (const part of chunks(pay)) {
      const { error } = await supabase.from("labourer_pay").upsert(part);
      if (error) return { ok: false, error: `Wages didn't save: ${error.message}` };
    }
  }
  if (removed.length && may(DELETE_ROLES)) {
    for (const part of chunks(removed)) {
      const { error } = await supabase.from("labourers").delete().in("id", part);
      if (error) return { ok: false, error: `Delete didn't save: ${error.message}` };
    }
  }
  return { ok: true };
}
