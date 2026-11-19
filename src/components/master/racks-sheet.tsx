"use client";
/**
 * Master Data → Racks & bays (owner, 2026-11-19): Site › Plant › Location › Rack › Bay or pillar.
 * First loaded from the DTA OSBL MIS sheets; DPR lines pick from it (components/shared/place-picker).
 */
import { useMemo, useState } from "react";
import { Panel, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import type { PlantBay, PlantRack } from "@/lib/types";
import { SEED_PLANT_RACKS } from "@/lib/rack-book-seed";
import { cn } from "@/lib/utils";

const fmt = (n?: number) => (n ? Math.round(n).toLocaleString("en-IN") : "—");
const sum = (bays: PlantBay[], k: "m3" | "paintM2" | "insM2") => bays.reduce((a, b) => a + (b[k] ?? 0), 0);

type Draft = { id?: string; location: string; name: string; bays: string; newLocation?: boolean };

export function RacksSheet({ showInactive, report }: { showInactive: boolean; report: (r: { ok: boolean; error?: string }) => void }) {
  const { fullState: state, upsertPlantRack, importPlantRacks, upsertSite } = useStore();
  const [addingPlant, setAddingPlant] = useState<string | null>(null);
  const [plantName, setPlantName] = useState("");
  const [plantErr, setPlantErr] = useState<string | null>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  const sites = state.sites.filter((s) => s.enabled);
  const plantList = useMemo(
    () => sites.flatMap((s) => s.plants.map((p) => ({ siteId: s.id, site: s.code, plant: p, racks: state.plantRacks.filter((r) => r.siteId === s.id && r.plant === p) }))),
    [sites, state.plantRacks]
  );
  const firstWithRacks = plantList.find((p) => p.racks.length) ?? plantList[0];
  const [pick, setPick] = useState<string>(firstWithRacks ? `${firstWithRacks.siteId}|${firstWithRacks.plant}` : "");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cur = plantList.find((p) => `${p.siteId}|${p.plant}` === pick) ?? firstWithRacks;
  const query = q.trim().toLowerCase();
  const pool = (query ? state.plantRacks : cur?.racks ?? []).filter((r) => showInactive || r.active);
  const rows = pool
    .map((r) => ({
      r,
      bays: query ? r.bays.filter((b) => `${r.name} ${b.label} ${b.pillar ?? ""}`.toLowerCase().includes(query)) : r.bays,
    }))
    .filter(({ r, bays }) => !query || bays.length || r.name.toLowerCase().includes(query))
    .sort((a, b) => a.r.plant.localeCompare(b.r.plant) || a.r.location.localeCompare(b.r.location) || a.r.name.localeCompare(b.r.name, undefined, { numeric: true }));
  const locations = [...new Set((cur?.racks ?? []).map((r) => r.location))];

  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = () => {
    if (!draft || !cur) return;
    if (draft.newLocation) {
      const l = draft.location.trim();
      if (!l) return setErr("Give the new location a name");
      if (locations.some((x) => x.toLowerCase() === l.toLowerCase())) return setErr(`${cur.plant} already has ${l}; use Add rack`);
    }
    const before = draft.id ? state.plantRacks.find((r) => r.id === draft.id) : undefined;
    const old = new Map((before?.bays ?? []).map((b) => [b.label.toLowerCase(), b]));
    const bays = draft.bays.split("\n").map((l) => l.trim()).filter(Boolean).map((label) => old.get(label.toLowerCase()) ?? { label });
    const r = upsertPlantRack({
      id: draft.id ?? `rk-${Math.random().toString(36).slice(2, 9)}`,
      siteId: cur.siteId,
      plant: cur.plant,
      location: draft.location,
      name: draft.name,
      bays,
      active: before?.active ?? true,
      ...(before?.source ? { source: before.source } : {}),
    });
    if (!r.ok) return setErr(r.error ?? "Couldn't save");
    setErr(null);
    setDraft(null);
  };

  const addPlant = async (siteId: string) => {
    const site = state.sites.find((x) => x.id === siteId);
    const name = plantName.trim().toUpperCase();
    if (!site) return;
    if (!name) return setPlantErr("Give the plant a name");
    if (site.plants.some((p) => p.toUpperCase() === name)) return setPlantErr(`${site.code} already has ${name}`);
    const r = await upsertSite({ ...site, plants: [...site.plants, name] });
    if (!r.ok) return setPlantErr(r.error ?? "Couldn't save");
    setAddingPlant(null);
    setPlantName("");
    setPlantErr(null);
    setPick(`${siteId}|${name}`);
  };

  const have = new Set(state.plantRacks.map((r) => r.id));
  const missing = SEED_PLANT_RACKS.filter((r) => !have.has(r.id));
  let lastLoc = "";
  return (
    <Panel>
      {missing.length ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] px-3 py-2 text-sm">
          <span>
            The DTA OSBL MIS list (27 Aug + P2) has <b>{missing.length} racks</b> and <b>{missing.reduce((a, r) => a + r.bays.length, 0).toLocaleString("en-IN")} bays</b> not loaded here yet.
          </span>
          <Button
            size="sm"
            onClick={() => {
              const r = importPlantRacks(missing);
              setLoadMsg(r.ok ? `Loaded ${r.added} racks` : r.error ?? "Couldn't load");
            }}
          >
            Load MIS list
          </Button>
          {loadMsg ? <span className="w-full text-xs font-semibold text-[var(--sge-crit)]">{loadMsg}</span> : null}
        </div>
      ) : loadMsg ? (
        <div className="mb-4 rounded-sm border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">{loadMsg}</div>
      ) : null}
      <PlaceAsks />
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Plants" className="flex flex-col gap-0.5">
          {sites.map((s) => (
            <div key={s.id}>
              <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sge-ink-3)]">{s.code}</div>
              {plantList.filter((p) => p.siteId === s.id).map((p) => {
                const id = `${p.siteId}|${p.plant}`;
                const on = !query && cur && id === `${cur.siteId}|${cur.plant}`;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={!!on}
                    onClick={() => { setPick(id); setQ(""); setOpen(new Set()); setDraft(null); }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                      on ? "bg-[var(--sge-night)] text-white" : "hover:bg-[var(--sge-paper-2)]"
                    )}
                  >
                    <span>{p.plant}</span>
                    <span className="text-xs tabular-nums opacity-70">{p.racks.length || ""}</span>
                  </button>
                );
              })}
              {addingPlant === s.id ? (
                <div className="mt-1 space-y-1 px-2">
                  <Input
                    id={`new-plant-${s.id}`}
                    aria-label={`New plant on ${s.code}`}
                    className="h-8"
                    autoFocus
                    value={plantName}
                    placeholder="Plant name"
                    onChange={(e) => setPlantName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void addPlant(s.id); }}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7" onClick={() => void addPlant(s.id)}>Add</Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAddingPlant(null); setPlantErr(null); }}>Cancel</Button>
                  </div>
                  {plantErr ? <p className="text-xs text-[var(--sge-crit)]">{plantErr}</p> : null}
                </div>
              ) : (
                <button
                  type="button"
                  className="px-2 py-1 text-left text-xs font-semibold text-[var(--sge-brass-ink)] hover:underline"
                  onClick={() => { setAddingPlant(s.id); setPlantName(""); setPlantErr(null); }}
                >
                  + Add plant
                </button>
              )}
            </div>
          ))}
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="font-heading text-base font-bold uppercase tracking-wide">
                {query ? "Search results" : `${cur?.site ?? ""} › ${cur?.plant ?? ""}`}
              </div>
              <p className="text-xs text-[var(--sge-ink-3)]">
                {query ? "Across every plant." : "Click a rack to see its bays. Scope figures are per bay, from the MIS sheets."}
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-60">
                <Label htmlFor="rack-q" className="text-[10px] uppercase tracking-wider">Search rack, bay or pillar</Label>
                <Input id="rack-q" className="mt-1 h-8" placeholder="e.g. G12, 2A-BC, 7001" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {!query && cur ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setErr(null); setDraft({ location: "", name: "", bays: "", newLocation: true }); }}>
                    Add location
                  </Button>
                  <Button size="sm" onClick={() => { setErr(null); setDraft({ location: locations[0] ?? "OSBL", name: "", bays: "" }); }}>
                    Add rack
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {draft ? (
            <div className="mb-4 grid gap-3 rounded-sm border border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] p-3 sm:grid-cols-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-2)] sm:col-span-2">
                {draft.newLocation ? `New location on ${cur?.plant} · it starts with its first rack` : draft.id ? "Edit rack" : `New rack on ${cur?.plant}`}
              </div>
              <div>
                <Label htmlFor="rack-loc">{draft.newLocation ? "New location" : "Location"}</Label>
                <Input id="rack-loc" className="mt-1" list={draft.newLocation ? undefined : "rack-locs"} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="OSBL, 952 Area, Street-3…" />
                <datalist id="rack-locs">{locations.map((l) => <option key={l} value={l} />)}</datalist>
              </div>
              <div>
                <Label htmlFor="rack-name">Rack</Label>
                <Input id="rack-name" className="mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. D Rack" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="rack-bays">Bays or pillars, one per line</Label>
                <textarea
                  id="rack-bays"
                  rows={6}
                  className="mt-1 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] p-2 font-mono text-xs"
                  value={draft.bays}
                  onChange={(e) => setDraft({ ...draft, bays: e.target.value })}
                  placeholder={"Bay 1A-BC to 2A-BC\nBay 2A-BC to 3A-BC\nPillar 75A-BC"}
                />
                <p className="mt-1 text-xs text-[var(--sge-ink-3)]">Bays that keep their name keep their m³ / m² scope.</p>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button size="sm" onClick={save}>Save rack</Button>
                <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setErr(null); }}>Cancel</Button>
                {err ? <span className="text-xs text-[var(--sge-crit)]">{err}</span> : null}
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            <p className="py-6 text-sm text-[var(--sge-ink-3)]">
              {query ? `Nothing matches "${q.trim()}".` : "No racks on this plant yet. Add one, or they come in from an MIS sheet."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2">
                <thead className="text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                  <tr>
                    <th>Rack</th>
                    {query ? <th>Plant</th> : null}
                    <th className="text-right">Bays</th>
                    <th className="text-right">Scaffold m³</th>
                    <th className="text-right">Paint m²</th>
                    <th className="text-right">Insulation m²</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ r, bays }) => {
                    const head = !query && r.location !== lastLoc ? r.location : null;
                    lastLoc = r.location;
                    const isOpen = open.has(r.id) || !!query;
                    const cols = query ? 7 : 6;
                    return (
                      <RackRows
                        key={r.id}
                        r={r}
                        bays={bays}
                        head={head}
                        isOpen={isOpen}
                        cols={cols}
                        query={!!query}
                        onToggle={() => toggle(r.id)}
                        onEdit={() => { setErr(null); setDraft({ id: r.id, location: r.location, name: r.name, bays: r.bays.map((b) => b.label).join("\n") }); }}
                        onActive={() => report(upsertPlantRack({ ...r, active: !r.active }))}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function RackRows({
  r, bays, head, isOpen, cols, query, onToggle, onEdit, onActive,
}: {
  r: PlantRack; bays: PlantBay[]; head: string | null; isOpen: boolean; cols: number; query: boolean;
  onToggle: () => void; onEdit: () => void; onActive: () => void;
}) {
  return (
    <>
      {head ? (
        <tr>
          <td colSpan={cols} className="bg-[var(--sge-paper-2)] text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--sge-ink-2)]">
            Location · {head}
          </td>
        </tr>
      ) : null}
      <tr
        className={cn("cursor-pointer border-t border-[var(--sge-line)] hover:bg-[var(--sge-paper-2)]", !r.active && "opacity-60")}
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
      >
        <td className="font-semibold">
          <span className={cn("mr-1 inline-block text-[var(--sge-ink-3)] transition-transform", isOpen && "rotate-90")}>›</span>
          {r.name}
          {query ? <span className="ml-1 text-xs font-normal text-[var(--sge-ink-3)]">· {r.location}</span> : null}
          {!r.active ? <span className="ml-2"><StatusPill tone="default">off</StatusPill></span> : null}
        </td>
        {query ? <td>{r.plant}</td> : null}
        <td className="text-right tabular-nums">{r.bays.length}</td>
        <td className="text-right tabular-nums">{fmt(sum(r.bays, "m3"))}</td>
        <td className="text-right tabular-nums">{fmt(sum(r.bays, "paintM2"))}</td>
        <td className="text-right tabular-nums">{fmt(sum(r.bays, "insM2"))}</td>
        <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={onActive}>{r.active ? "Deactivate" : "Activate"}</Button>
        </td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={cols} className="!px-0 !pt-0">
            <div className="max-h-80 overflow-auto border-y border-[var(--sge-line)] bg-[var(--sge-paper-2)]/40">
              <table className="w-full text-xs [&_td]:px-3 [&_td]:py-1.5 [&_th]:px-3 [&_th]:py-1.5">
                <thead className="sticky top-0 bg-[var(--sge-paper)] text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
                  <tr>
                    <th className="text-left">Bay / pillar</th>
                    <th className="text-left">Pillar no.</th>
                    <th className="text-right">m³</th>
                    <th className="text-right">Paint m²</th>
                    <th className="text-right">Ins. m²</th>
                    <th className="text-left">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {bays.map((b) => (
                    <tr key={b.label} className="border-t border-[var(--sge-line)]">
                      <td className="font-mono">{b.label}</td>
                      <td className="font-mono">{b.pillar ?? ""}</td>
                      <td className="text-right tabular-nums">{fmt(b.m3)}</td>
                      <td className="text-right tabular-nums">{fmt(b.paintM2)}</td>
                      <td className="text-right tabular-nums">{fmt(b.insM2)}</td>
                      <td>{b.priority ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Places supervisors asked for from the DPR (Owner / Super Admin add or say no) */
function PlaceAsks() {
  const { fullState: state, decidePlace } = useStore();
  const [why, setWhy] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const owner = state.currentRole === "owner" || state.currentRole === "super_admin";
  const waiting = state.placeRequests.filter((r) => r.status === "pending");
  if (!owner || !waiting.length) return null;
  const site = (id: string) => state.sites.find((x) => x.id === id)?.code ?? id;
  return (
    <div className="mb-4 rounded-sm border border-[var(--sge-brass)] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-2)]">
        Places asked for from DPRs · {waiting.length} waiting
      </div>
      <ul className="divide-y divide-[var(--sge-line)]">
        {waiting.map((r) => {
          const bays = r.bays ? r.bays.split("\n") : [];
          return (
            <li key={r.id} className="flex flex-wrap items-end justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{site(r.siteId)} › {r.plant} › {r.location} › {r.rack}</div>
                <div className="text-xs text-[var(--sge-ink-3)]">
                  {bays.length ? `${bays.length} bay${bays.length > 1 ? "s" : ""}: ${bays.slice(0, 4).join(", ")}${bays.length > 4 ? "…" : ""}` : "No bays given"} · asked by {r.requestedByName} · {r.requestedAt.slice(0, 10)}
                  {r.note ? ` · “${r.note}”` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Reason for not adding"
                  className="h-8 w-48"
                  placeholder="Reason, if not adding"
                  value={why[r.id] ?? ""}
                  onChange={(e) => setWhy({ ...why, [r.id]: e.target.value })}
                />
                <Button size="sm" variant="ghost" onClick={() => { const x = decidePlace(r.id, false, why[r.id]); setErr(x.ok ? null : x.error ?? "Not saved"); }}>Not adding</Button>
                <Button size="sm" onClick={() => { const x = decidePlace(r.id, true); setErr(x.ok ? null : x.error ?? "Not saved"); }}>Add to list</Button>
              </div>
            </li>
          );
        })}
      </ul>
      {err ? <p className="mt-1 text-xs text-[var(--sge-crit)]">{err}</p> : null}
    </div>
  );
}
