/**
 * Work and store records in the shared database (migration 20261118_011, owner 2026-11-18).
 * One row per record: (collection, id) → data. Until now these lived only in the browser that
 * entered them, so a supervisor's DPR never reached the Admin, SIC or store on another device.
 */
import { supabase } from "./client";

export interface SharedRow {
  collection: string;
  id: string;
  siteId?: string | null;
  data: unknown;
  deleted?: boolean;
  /** Server time of this copy (from the database) */
  updatedAt?: string;
  /** Saving: the server time of the copy this change started from (stale saves are refused, migration 013) */
  base?: string | null;
}

interface DbRow {
  collection: string;
  id: string;
  site_id: string | null;
  data: unknown;
  deleted: boolean;
  updated_at: string;
}

const PAGE = 1000;

/** Every live record (deleted ones left out) and the newest server time seen. */
export async function loadSharedRecords(collections: string[]): Promise<{ rows: SharedRow[]; cursor: string } | null> {
  if (!supabase) return null;
  const rows: SharedRow[] = [];
  let cursor = new Date(0).toISOString();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("app_records")
      .select("collection,id,site_id,data,deleted,updated_at")
      .in("collection", collections)
      .order("collection")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("Shared records didn't load:", error.message);
      return null;
    }
    for (const r of (data ?? []) as DbRow[]) {
      if (r.updated_at > cursor) cursor = r.updated_at;
      if (!r.deleted) rows.push({ collection: r.collection, id: r.id, siteId: r.site_id, data: r.data, updatedAt: r.updated_at });
    }
    if (!data || data.length < PAGE) return { rows, cursor };
  }
}

/** Records changed (or deleted) on any device since `cursor` (server time). */
export async function sharedRecordChanges(collections: string[], cursor: string): Promise<{ rows: SharedRow[]; cursor: string } | null> {
  if (!supabase) return null;
  const rows: SharedRow[] = [];
  let next = cursor;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("app_records")
      .select("collection,id,site_id,data,deleted,updated_at")
      .in("collection", collections)
      .gt("updated_at", cursor)
      .order("updated_at")
      .range(from, from + PAGE - 1);
    if (error) return null;
    for (const r of (data ?? []) as DbRow[]) {
      if (r.updated_at > next) next = r.updated_at;
      rows.push({ collection: r.collection, id: r.id, siteId: r.site_id, data: r.data, deleted: r.deleted, updatedAt: r.updated_at });
    }
    if (!data || data.length < PAGE) return { rows, cursor: next };
  }
}

export async function saveSharedRecords(rows: SharedRow[]): Promise<{ ok: boolean; error?: string; saved: SharedRow[] }> {
  if (!supabase || !rows.length) return { ok: true, saved: [] };
  const saved: SharedRow[] = [];
  for (let i = 0; i < rows.length; i += 300) {
    const { data, error } = await supabase
      .from("app_records")
      .upsert(rows.slice(i, i + 300).map((r) => ({ collection: r.collection, id: r.id, site_id: r.siteId ?? null, data: r.deleted ? {} : r.data, deleted: !!r.deleted, base_updated_at: r.base ?? null })))
      .select("collection,id,site_id,data,deleted,updated_at");
    if (error) return { ok: false, error: `Didn't save to the shared database: ${error.message}`, saved };
    for (const r of (data ?? []) as DbRow[]) saved.push({ collection: r.collection, id: r.id, siteId: r.site_id, data: r.data, deleted: r.deleted, updatedAt: r.updated_at });
  }
  return { ok: true, saved };
}
