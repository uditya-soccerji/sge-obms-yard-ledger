"use client";
/**
 * Keeps chosen parts of a provider's state in the shared database (app_records, migration 011).
 *
 * - Sign-in: loads every record; the server is the truth. Records only this browser has are
 *   dropped (demo data, or deleted elsewhere) — except, once per device, its own real records
 *   from before sharing ("move up"), and anything changed here that hadn't reached the server.
 * - Every change here is sent up (debounced); every 15 s (and on focus) what other devices
 *   changed comes down. A record changed here and not yet sent wins over the incoming copy.
 * - Arrays of `{ id }` records are one row each; other keys ("meta") are one row per key.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadSharedRecords, saveSharedRecords, sharedRecordChanges, type SharedRow } from "./supabase/records";
import { supabase } from "./supabase/client";

type Rec = { id: string } & Record<string, unknown>;
type AnyState = object;

export interface SharedSyncStatus {
  loaded: boolean;
  error: string | null;
  /** Records changed here and not yet saved to the shared database */
  waiting: number;
}

export interface SharedSyncOptions<S extends AnyState> {
  /** Signed in, hydrated and a database configured */
  enabled: boolean;
  /** Changing it (another login) starts over */
  sessionKey: string;
  state: S;
  stateRef: React.MutableRefObject<S>;
  setState: React.Dispatch<React.SetStateAction<S>>;
  /** "work" → collections "work.reports", "work.jobs" … */
  prefix: string;
  collections: readonly (keyof S & string)[];
  meta?: readonly (keyof S & string)[];
  /** Built-in demo records: never sent up */
  isDemo: (collection: string, id: string) => boolean;
  /** Combine a meta value from this browser with the server's (default: server wins) */
  mergeMeta?: Partial<Record<string, (local: unknown, server: unknown) => unknown>>;
  /** Records keyed by something other than `id` (e.g. service items by `code`) */
  keyOf?: Partial<Record<string, (r: Record<string, unknown>) => string>>;
  /** Order of a collection after merging (default: this browser's order, new ones at the end) */
  order?: Partial<Record<string, (a: Rec, b: Rec) => number>>;
}

const print = (v: unknown) => JSON.stringify(v ?? null);

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

export function useSharedSync<S extends AnyState>(o: SharedSyncOptions<S>): SharedSyncStatus {
  const opts = useRef(o);
  opts.current = o;
  /** A record's key in its collection: `id`, or what keyOf says (service items: `code`) */
  const kid = (col: string, r: Rec): string => String(opts.current.keyOf?.[col]?.(r) ?? r.id);
  const META = `${o.prefix}._meta`;
  const MOVED_KEY = `sge-shared-moved-${o.prefix}-v1`;
  const UNSENT_KEY = `sge-shared-unsent-${o.prefix}-v1`;
  /** collection → id → print of the server's copy */
  const synced = useRef<Map<string, Map<string, string>> | null>(null);
  const cursor = useRef<string>(new Date(0).toISOString());
  const busy = useRef(false);
  const again = useRef(false);
  const [status, setStatus] = useState<SharedSyncStatus>({ loaded: false, error: null, waiting: 0 });

  const names = useCallback(() => [...opts.current.collections.map((c) => `${opts.current.prefix}.${c}`), `${opts.current.prefix}._meta`], []);

  const reorder = (col: string, list: Rec[], localOrder: Map<string, number>) => {
    const by = opts.current.order?.[col];
    if (by) return [...list].sort(by);
    return [...list].sort((a, b) => (localOrder.get(kid(col, a)) ?? Number.MAX_SAFE_INTEGER) - (localOrder.get(kid(col, b)) ?? Number.MAX_SAFE_INTEGER));
  };

  /** Keys changed here and not on the server yet */
  const pendingKeys = (): Set<string> => {
    const s = synced.current;
    const out = new Set<string>();
    if (!s) return out;
    const cur = opts.current.stateRef.current as Record<string, unknown>;
    for (const col of opts.current.collections) {
      const m = s.get(col) ?? new Map<string, string>();
      for (const r of (cur[col] as Rec[] | undefined) ?? []) if (m.get(kid(col, r)) !== print(r)) out.add(`${col}|${kid(col, r)}`);
    }
    const mm = s.get("_meta") ?? new Map<string, string>();
    for (const k of opts.current.meta ?? []) if (mm.get(k) !== print(cur[k])) out.add(`_meta|${k}`);
    return out;
  };

  const fullLoad = useCallback(async () => {
    const { prefix, collections, meta = [], isDemo, mergeMeta } = opts.current;
    const res = await loadSharedRecords(names());
    if (!res) return setStatus((x) => ({ ...x, error: "Couldn't load DPRs, jobs and requests from the shared database" }));
    const cur = opts.current.stateRef.current as Record<string, unknown>;
    const moved = readJson<boolean>(MOVED_KEY, false);
    const unsent = new Set(readJson<string[]>(UNSENT_KEY, []));
    const server = new Map<string, Map<string, unknown>>();
    for (const r of res.rows) {
      const col = r.collection === META ? "_meta" : r.collection.slice(prefix.length + 1);
      if (!server.has(col)) server.set(col, new Map());
      server.get(col)!.set(r.id, r.data);
    }
    const nextSynced = new Map<string, Map<string, string>>();
    const patch: Record<string, unknown> = {};
    for (const col of collections) {
      const srv = server.get(col) ?? new Map<string, unknown>();
      nextSynced.set(col, new Map([...srv].map(([id, d]) => [id, print(d)])));
      const local = (cur[col] as Rec[] | undefined) ?? [];
      const localOrder = new Map(local.map((r, i) => [kid(col, r), i]));
      // This browser's copy is kept where it hasn't reached the server: never-sent changes, and
      // (once per device) its own real records from before sharing
      const keep = local.filter((r) => unsent.has(`${col}|${kid(col, r)}`) || (!moved && !srv.has(kid(col, r)) && !isDemo(col, kid(col, r))));
      const keepIds = new Set(keep.map((r) => kid(col, r)));
      const merged = [...[...srv.entries()].filter(([id]) => !keepIds.has(id)).map(([, d]) => d as Rec), ...keep];
      patch[col] = reorder(col, merged, localOrder);
    }
    const srvMeta = server.get("_meta") ?? new Map<string, unknown>();
    nextSynced.set("_meta", new Map([...srvMeta].map(([k, d]) => [k, print((d as { value?: unknown })?.value)])));
    for (const k of meta) {
      const has = srvMeta.has(k);
      const sv = (srvMeta.get(k) as { value?: unknown } | undefined)?.value;
      const merge = mergeMeta?.[k];
      if (!has) continue; // nothing shared yet: keep ours, it goes up with the next save
      patch[k] = merge ? merge(cur[k], sv) : unsent.has(`_meta|${k}`) ? cur[k] : sv;
    }
    synced.current = nextSynced;
    cursor.current = res.cursor;
    opts.current.setState((s) => ({ ...s, ...patch }));
    setStatus({ loaded: true, error: null, waiting: 0 });
  }, [META, MOVED_KEY, UNSENT_KEY, names]);

  const push = useCallback(async () => {
    const s = synced.current;
    if (!s) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    const { prefix, collections, meta = [], isDemo } = opts.current;
    const cur = opts.current.stateRef.current as Record<string, unknown>;
    const rows: SharedRow[] = [];
    const apply: (() => void)[] = [];
    for (const col of collections) {
      const m = s.get(col) ?? new Map<string, string>();
      if (!s.has(col)) s.set(col, m);
      const list = (cur[col] as Rec[] | undefined) ?? [];
      const ids = new Set<string>();
      for (const r of list) {
        const id = kid(col, r);
        // A record without a key can't be shared (it would be refused and block every other save)
        if (!id || id === "undefined") continue;
        ids.add(id);
        const p = print(r);
        if (m.get(id) === p) continue;
        if (!m.has(id) && isDemo(col, id)) continue;
        const siteId = typeof r.siteId === "string" ? r.siteId : null;
        rows.push({ collection: `${prefix}.${col}`, id, siteId, data: r });
        apply.push(() => m.set(id, p));
      }
      for (const id of [...m.keys()]) {
        if (ids.has(id)) continue;
        rows.push({ collection: `${prefix}.${col}`, id, data: {}, deleted: true });
        apply.push(() => m.delete(id));
      }
    }
    const mm = s.get("_meta") ?? new Map<string, string>();
    if (!s.has("_meta")) s.set("_meta", mm);
    for (const k of meta) {
      const p = print(cur[k]);
      if (mm.get(k) === p) continue;
      rows.push({ collection: META, id: k, data: { value: cur[k] } });
      apply.push(() => mm.set(k, p));
    }
    if (!rows.length) {
      writeJson(MOVED_KEY, true);
      writeJson(UNSENT_KEY, null);
      return;
    }
    writeJson(UNSENT_KEY, rows.filter((r) => !r.deleted).map((r) => `${r.collection === META ? "_meta" : r.collection.slice(prefix.length + 1)}|${r.id}`));
    busy.current = true;
    setStatus((x) => ({ ...x, waiting: rows.length }));
    const res = await saveSharedRecords(rows);
    busy.current = false;
    if (res.ok) {
      for (const f of apply) f();
      writeJson(MOVED_KEY, true);
      writeJson(UNSENT_KEY, null);
      setStatus((x) => ({ ...x, error: null, waiting: 0 }));
    } else {
      setStatus((x) => ({ ...x, error: res.error ?? "Didn't save to the shared database" }));
    }
    if (again.current) {
      again.current = false;
      void push();
    }
  }, [META, MOVED_KEY, UNSENT_KEY]);

  const pull = useCallback(async () => {
    if (!synced.current || busy.current) return;
    const { prefix, collections, meta = [], mergeMeta } = opts.current;
    const res = await sharedRecordChanges(names(), cursor.current);
    if (!res) return;
    cursor.current = res.cursor;
    if (!res.rows.length || !synced.current) return;
    const pend = pendingKeys();
    const s = synced.current;
    const byCol = new Map<string, SharedRow[]>();
    for (const r of res.rows) {
      const col = r.collection === META ? "_meta" : r.collection.slice(prefix.length + 1);
      if (pend.has(`${col}|${r.id}`) && col !== "_meta") continue;
      if (!byCol.has(col)) byCol.set(col, []);
      byCol.get(col)!.push(r);
    }
    if (!byCol.size) return;
    opts.current.setState((st) => {
      const cur = st as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const col of collections) {
        const rows = byCol.get(col);
        if (!rows) continue;
        const m = s.get(col) ?? new Map<string, string>();
        s.set(col, m);
        const local = (cur[col] as Rec[] | undefined) ?? [];
        const localOrder = new Map(local.map((r, i) => [kid(col, r), i]));
        const map = new Map(local.map((r) => [kid(col, r), r]));
        for (const r of rows) {
          if (r.deleted) {
            map.delete(r.id);
            m.delete(r.id);
          } else {
            map.set(r.id, r.data as Rec);
            m.set(r.id, print(r.data));
          }
        }
        patch[col] = reorder(col, [...map.values()], localOrder);
      }
      const metaRows = byCol.get("_meta");
      if (metaRows) {
        const mm = s.get("_meta") ?? new Map<string, string>();
        s.set("_meta", mm);
        for (const r of metaRows) {
          if (!meta.includes(r.id as keyof S & string)) continue;
          const sv = (r.data as { value?: unknown })?.value;
          const merge = mergeMeta?.[r.id];
          const localChanged = pend.has(`_meta|${r.id}`);
          patch[r.id] = merge ? merge(cur[r.id], sv) : localChanged ? cur[r.id] : sv;
          mm.set(r.id, print(sv));
        }
      }
      return { ...st, ...patch };
    });
  }, [META, names]);

  // Sign-in / another login: load everything, then fetch changes every 15 s and on focus
  useEffect(() => {
    synced.current = null;
    cursor.current = new Date(0).toISOString();
    setStatus({ loaded: false, error: null, waiting: 0 });
    if (!o.enabled || !supabase) return;
    void fullLoad();
    const t = setInterval(() => void pull(), 15 * 1000);
    const onFocus = () => void pull();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [o.enabled, o.sessionKey, fullLoad, pull]);

  // Send changes made here (shortly after the last one)
  useEffect(() => {
    if (!status.loaded) return;
    const t = setTimeout(() => void push(), 700);
    return () => clearTimeout(t);
  }, [o.state, status.loaded, push]);

  return status;
}
