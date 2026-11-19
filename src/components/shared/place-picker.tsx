"use client";
/**
 * Where the work was: Location › Rack › Bay (from – to), picked from Master Data → Racks & bays
 * (owner, 2026-11-19). `location` always carries the full text, so print, search and older
 * DPRs keep working; rackId / bayFrom / bayTo let the app add work up per rack and bay.
 * "Not in the list" falls back to typing, so a supervisor is never stuck.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import type { PlantRack } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Place {
  location: string;
  rackId?: string;
  bayFrom?: string;
  bayTo?: string;
}

const OTHER = "__other";
const sel = "mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm disabled:bg-[var(--sge-paper-2)]";

export function placeText(rack: PlantRack, from?: string, to?: string): string {
  const bays = from ? (to && to !== from ? `${from} → ${to}` : from) : "";
  return [rack.location, rack.name, bays].filter(Boolean).join(" · ");
}

/** Racks on this site's plant (plant names match ignoring case) */
export function racksFor(racks: PlantRack[], siteId: string, plant: string): PlantRack[] {
  const p = plant.trim().toUpperCase();
  return p ? racks.filter((r) => r.active && r.siteId === siteId && r.plant.toUpperCase() === p) : [];
}

export function PlacePicker({
  siteId,
  plant,
  value,
  onChange,
  readOnly,
  idPrefix,
  className,
}: {
  siteId: string;
  plant: string;
  value: Place;
  onChange: (p: Place) => void;
  readOnly?: boolean;
  idPrefix: string;
  className?: string;
}) {
  const { fullState: state, requestPlace } = useStore();
  const racks = racksFor(state.plantRacks, siteId, plant);
  const rack = value.rackId ? state.plantRacks.find((r) => r.id === value.rackId) : undefined;
  const locations = [...new Set(racks.map((r) => r.location))];
  const [typing, setTyping] = useState(false);
  const [loc, setLoc] = useState(rack?.location ?? locations[0] ?? "");
  const curLoc = rack?.location ?? (locations.includes(loc) ? loc : locations[0] ?? "");
  const typed = !racks.length || typing || (!!value.location && !rack);
  const [asking, setAsking] = useState(false);

  if (typed) {
    return (
      <div className={className}>
        {asking && plant ? (
          <AskPlace
            siteId={siteId}
            plant={plant}
            locations={locations}
            typed={value.location}
            onSend={requestPlace}
            onClose={() => setAsking(false)}
          />
        ) : null}
        <Label htmlFor={`${idPrefix}-loc`}>Location</Label>
        <Input
          id={`${idPrefix}-loc`}
          className="mt-1"
          disabled={readOnly}
          value={value.location}
          placeholder={racks.length ? "Type the place" : plant ? "Location / area" : "Pick the plant first"}
          onChange={(e) => onChange({ location: e.target.value })}
        />
        {racks.length && !readOnly ? (
          <button
            type="button"
            className="mt-1 text-xs font-semibold text-[var(--sge-brass-ink)] underline"
            onClick={() => { setTyping(false); onChange({ location: "" }); }}
          >
            Pick rack and bay from the list ({racks.length} racks)
          </button>
        ) : null}
        {plant && !readOnly && !asking ? (
          <button type="button" className="ml-3 mt-1 text-xs font-semibold text-[var(--sge-brass-ink)] underline" onClick={() => setAsking(true)}>
            Ask to add this place to the list
          </button>
        ) : null}
        <MyAsks siteId={siteId} plant={plant} />
      </div>
    );
  }

  const inLoc = racks.filter((r) => r.location === curLoc);
  const bays = rack?.bays ?? [];
  const fromIdx = bays.findIndex((b) => b.label === value.bayFrom);
  const toIdx = bays.findIndex((b) => b.label === value.bayTo);
  const span = fromIdx < 0 ? [] : bays.slice(Math.min(fromIdx, toIdx < 0 ? fromIdx : toIdx), Math.max(fromIdx, toIdx < 0 ? fromIdx : toIdx) + 1);
  const m3 = span.reduce((a, b) => a + (b.m3 ?? 0), 0);
  const m2 = span.reduce((a, b) => a + (b.paintM2 ?? 0), 0);
  const pickRack = (id: string) => {
    if (id === OTHER) { setTyping(true); onChange({ location: "" }); return; }
    const r = racks.find((x) => x.id === id);
    if (!r) return onChange({ location: "" });
    onChange({ location: placeText(r), rackId: r.id });
  };
  const pickBays = (from?: string, to?: string) => {
    if (!rack) return;
    const t = to && to !== from ? to : undefined;
    onChange({ location: placeText(rack, from, t), rackId: rack.id, ...(from ? { bayFrom: from } : {}), ...(t ? { bayTo: t } : {}) });
  };

  return (
    <div className={cn("grid gap-2 sm:grid-cols-4", className)}>
      <div>
        <Label htmlFor={`${idPrefix}-area`}>Location</Label>
        <select
          id={`${idPrefix}-area`}
          className={sel}
          disabled={readOnly}
          value={curLoc}
          onChange={(e) => { setLoc(e.target.value); onChange({ location: "" }); }}
        >
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-rack`}>Rack</Label>
        <select id={`${idPrefix}-rack`} className={sel} disabled={readOnly} value={rack?.id ?? ""} onChange={(e) => pickRack(e.target.value)}>
          <option value="">Pick rack…</option>
          {inLoc.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.bays.length}</option>)}
          <option value={OTHER}>Not in the list…</option>
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-from`}>Bay / pillar</Label>
        <select id={`${idPrefix}-from`} className={sel} disabled={readOnly || !rack} value={value.bayFrom ?? ""} onChange={(e) => pickBays(e.target.value || undefined, value.bayTo)}>
          <option value="">{rack ? "Whole rack / pick…" : "—"}</option>
          {bays.map((b) => <option key={b.label} value={b.label}>{b.label}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-to`}>to (optional)</Label>
        <select id={`${idPrefix}-to`} className={sel} disabled={readOnly || !value.bayFrom} value={value.bayTo ?? ""} onChange={(e) => pickBays(value.bayFrom, e.target.value || undefined)}>
          <option value="">— one bay —</option>
          {bays.map((b) => <option key={b.label} value={b.label}>{b.label}</option>)}
        </select>
      </div>
      {rack ? (
        <p className="text-xs text-[var(--sge-ink-3)] sm:col-span-4">
          <span className="font-semibold text-[var(--sge-ink-2)]">{plant} · {value.location}</span>
          {span.length ? ` · ${span.length} bay${span.length > 1 ? "s" : ""}` : ""}
          {m3 || m2 ? ` · MIS scope ${[m3 ? `${Math.round(m3).toLocaleString("en-IN")} m³` : "", m2 ? `${Math.round(m2).toLocaleString("en-IN")} m² paint` : ""].filter(Boolean).join(", ")}` : ""}
        </p>
      ) : null}
    </div>
  );
}

/** Places this person asked for on this plant: waiting, or turned down with the reason */
function MyAsks({ siteId, plant }: { siteId: string; plant: string }) {
  const { fullState: state } = useStore();
  const me = state.currentUserId ?? state.currentAccountId;
  const mine = state.placeRequests
    .filter((r) => r.requestedBy === me && r.siteId === siteId && r.plant === plant && r.status !== "added")
    .slice(0, 3);
  if (!mine.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-[var(--sge-ink-3)]">
      {mine.map((r) => (
        <li key={r.id}>
          {r.location} › {r.rack}:{" "}
          {r.status === "pending" ? "waiting for Owner / Super Admin" : <span className="text-[var(--sge-crit)]">not added — {r.decidedNote}</span>}
        </li>
      ))}
    </ul>
  );
}

function AskPlace({
  siteId, plant, locations, typed, onSend, onClose,
}: {
  siteId: string;
  plant: string;
  locations: string[];
  typed: string;
  onSend: (input: { siteId: string; plant: string; location: string; rack: string; bays: string; note?: string }) => { ok: boolean; error?: string };
  onClose: () => void;
}) {
  const [location, setLocation] = useState(locations[0] ?? "OSBL");
  const [rack, setRack] = useState(typed);
  const [bays, setBays] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const id = `ask-${plant.replace(/\W+/g, "-")}`;
  if (msg?.ok) {
    return (
      <div className="mb-2 rounded-sm border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-xs text-[var(--sge-ok)]">
        {msg.text}{" "}
        <button type="button" className="underline" onClick={onClose}>Close</button>
      </div>
    );
  }
  return (
    <div className="mb-2 grid gap-2 rounded-sm border border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] p-3 sm:grid-cols-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--sge-ink-2)] sm:col-span-2">Ask to add a place on {plant}</div>
      <div>
        <Label htmlFor={`${id}-loc`}>Location</Label>
        <Input id={`${id}-loc`} className="mt-1" list={`${id}-locs`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="OSBL, 952 Area, Street-3…" />
        <datalist id={`${id}-locs`}>{locations.map((l) => <option key={l} value={l} />)}</datalist>
      </div>
      <div>
        <Label htmlFor={`${id}-rack`}>Rack or area</Label>
        <Input id={`${id}-rack`} className="mt-1" value={rack} onChange={(e) => setRack(e.target.value)} placeholder="e.g. G12 Rack" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-bays`}>Bays or pillars, one per line (optional)</Label>
        <textarea id={`${id}-bays`} rows={3} className="mt-1 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] p-2 font-mono text-xs" value={bays} onChange={(e) => setBays(e.target.value)} placeholder={"Bay 40-41\nBay 41-42"} />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-note`}>Note (optional)</Label>
        <Input id={`${id}-note`} className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where it is, permit no., anything that helps" />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button
          type="button"
          className="h-8 rounded-md bg-[var(--sge-night)] px-3 text-xs font-semibold text-white"
          onClick={() => {
            const r = onSend({ siteId, plant, location, rack, bays, note });
            setMsg(r.ok ? { ok: true, text: "Sent to Owner / Super Admin. Keep the typed place on this DPR; it shows in the list once added." } : { ok: false, text: r.error ?? "Not sent" });
          }}
        >
          Send request
        </button>
        <button type="button" className="h-8 px-2 text-xs underline" onClick={onClose}>Cancel</button>
        {msg && !msg.ok ? <span className="text-xs text-[var(--sge-crit)]">{msg.text}</span> : null}
      </div>
    </div>
  );
}
