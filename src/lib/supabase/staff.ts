/**
 * Staff records in the shared database (migration 20261114_009). Until now each browser kept its
 * own staff list, so a login made on one laptop was "Not linked" on every other device.
 */
import { supabase } from "./client";
import type { RoleId, StaffMember } from "../types";

interface StaffRow {
  id: string;
  name: string;
  role: RoleId;
  site_id: string;
  site_ids: string[];
  phone: string | null;
  designation: string | null;
  supervisor_type: StaffMember["supervisorType"] | null;
  engagement: StaffMember["engagement"] | null;
  contractor_id: string | null;
  employee_code: string | null;
  joined_on: string | null;
  active: boolean;
  /** Migration 010 */
  ep_number?: string | null;
  /** Migration 016 */
  plants?: string[];
  subcon_owner?: boolean;
}

/** Roles the database lets add / edit staff (mirrors the RLS in migration 009) */
export const STAFF_WRITE_ROLES: RoleId[] = ["super_admin", "owner", "hr", "admin"];

const u = <T>(v: T | null | undefined) => (v == null ? undefined : v);

function fromRow(r: StaffRow): StaffMember {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    siteId: r.site_id,
    siteIds: r.site_ids?.length ? r.site_ids : undefined,
    phone: u(r.phone),
    designation: u(r.designation),
    supervisorType: u(r.supervisor_type),
    engagement: u(r.engagement),
    contractorId: u(r.contractor_id),
    employeeCode: u(r.employee_code),
    epNumber: u(r.ep_number),
    joinedOn: u(r.joined_on),
    active: r.active,
    plants: r.plants?.length ? r.plants : undefined,
    subconOwner: r.subcon_owner || undefined,
  };
}

function toRow(s: StaffMember): StaffRow {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    site_id: s.siteId,
    site_ids: s.siteIds ?? [],
    phone: s.phone || null,
    designation: s.designation || null,
    supervisor_type: s.supervisorType ?? null,
    engagement: s.engagement ?? null,
    contractor_id: s.contractorId || null,
    employee_code: s.employeeCode || null,
    ep_number: s.epNumber || null,
    joined_on: s.joinedOn || null,
    active: s.active !== false,
    plants: s.plants ?? [],
    subcon_owner: !!s.subconOwner,
  };
}

/** Comparable fingerprint, to send only what changed */
export const staffPrint = (s: StaffMember) => JSON.stringify(toRow(s));

export async function remoteLoadStaff(): Promise<StaffMember[] | null> {
  if (!supabase) return null;
  const out: StaffMember[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("staff").select("*").order("id").range(from, from + 999);
    if (error) return null;
    out.push(...((data ?? []) as StaffRow[]).map(fromRow));
    if (!data || data.length < 1000) return out;
  }
}

export async function remoteSaveStaff(roles: RoleId[], changed: StaffMember[]): Promise<{ ok: boolean; error?: string }> {
  if (!supabase || !changed.length) return { ok: true };
  if (!roles.some((r) => STAFF_WRITE_ROLES.includes(r))) return { ok: true };
  for (let i = 0; i < changed.length; i += 400) {
    const { error } = await supabase.from("staff").upsert(changed.slice(i, i + 400).map(toRow));
    if (error) return { ok: false, error: `Staff records didn't save: ${error.message}` };
  }
  return { ok: true };
}
