"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Upload } from "lucide-react";
import { Panel } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/work/common";
import { cell, downloadXlsxWithHeaders, readSpreadsheet } from "@/lib/excel-io";
import { useStore } from "@/lib/store";
import { allStoreItems, batchesInStore, GROUP_LABEL, heldBy, inStore } from "@/lib/store-ledger";
import { today } from "@/lib/today";
import type { EquipmentItem, StoreItem } from "@/lib/types";
import { useWork } from "@/lib/work/store";

type Msg = { ok: boolean; text: string } | null;
const show = (m: Msg) => (m ? <p className={m.ok ? "text-sm text-[var(--sge-ok)]" : "text-sm text-[var(--sge-crit)]"}>{m.text}</p> : null);

/** Pick an item: type to narrow, then choose (grouped by group · category) */
export function ItemPicker({ items, value, onChange }: { items: StoreItem[]; value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const shown = items.filter((i) => i.active && (!q.trim() || `${i.category} ${i.name} ${i.code ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const groups = [...new Set(shown.map((i) => `${GROUP_LABEL[i.group]} · ${i.category}`))];
  return (
    <div className="space-y-1">
      <Input aria-label="Find an item" placeholder="Type to find: e.g. mask, hose, MIO" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Item" className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{shown.length ? `Pick the item… (${shown.length})` : "No item matches"}</option>
        {groups.map((g) => (
          <optgroup key={g} label={g}>
            {shown.filter((i) => `${GROUP_LABEL[i.group]} · ${i.category}` === g).map((i) => (
              <option key={i.id} value={i.id}>{i.name}{i.code ? ` · ${i.code}` : ""} ({i.unit})</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Receive new stock, or enter opening stock (one line) */
export function ReceiveForm({ siteId }: { siteId: string }) {
  const { fullState: state, recordStoreMove } = useStore();
  const items = useMemo(() => allStoreItems(state), [state]);
  const blank = { kind: "receive" as "receive" | "opening", date: today(), itemId: "", qty: "", batch: "", expiry: "", pr: "", po: "", billNo: "", vendor: "", note: "" };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<Msg>(null);
  const item = items.find((i) => i.id === f.itemId);
  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold">Receive stock</h3>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = recordStoreMove({ kind: f.kind, date: f.date, itemId: f.itemId, qty: Number(f.qty), siteId, batch: f.batch, expiry: f.expiry || undefined, pr: f.pr || undefined, po: f.po || undefined, billNo: f.billNo || undefined, vendor: f.vendor || undefined, note: f.note || undefined });
          if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Couldn't save" });
          setMsg({ ok: true, text: `${f.kind === "opening" ? "Opening stock" : "Received"}: ${item?.name} ${f.qty} ${item?.unit}. In store now: ${inStore(state.storeMoves, siteId, f.itemId) + Number(f.qty)} ${item?.unit}.` });
          setF({ ...blank, kind: f.kind, date: f.date });
        }}
      >
        <div>
          <Label>Entry</Label>
          <select aria-label="Entry" className={selectCls + " mt-1"} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "receive" | "opening" })}>
            <option value="receive">Receive (new stock)</option>
            <option value="opening">Opening stock (count)</option>
          </select>
        </div>
        <div>
          <Label>Date</Label>
          <Input aria-label="Date" className="mt-1" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Item</Label>
          <div className="mt-1"><ItemPicker items={items} value={f.itemId} onChange={(itemId) => setF({ ...f, itemId })} /></div>
        </div>
        <div>
          <Label>Quantity{item ? ` (${item.unit})` : ""}</Label>
          <Input aria-label="Quantity" className="mt-1" type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
        </div>
        <div>
          <Label>Batch no.{item?.trackExpiry ? " *" : ""}</Label>
          <Input aria-label="Batch" className="mt-1" value={f.batch} onChange={(e) => setF({ ...f, batch: e.target.value })} />
        </div>
        <div>
          <Label>Expiry</Label>
          <Input aria-label="Expiry" className="mt-1" type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
        </div>
        {f.kind === "receive" ? (
          <>
            <div>
              <Label>Vendor</Label>
              <Input aria-label="Vendor" className="mt-1" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
            </div>
            <div>
              <Label>PR no.</Label>
              <Input aria-label="PR no." className="mt-1" value={f.pr} onChange={(e) => setF({ ...f, pr: e.target.value })} />
            </div>
            <div>
              <Label>PO no.</Label>
              <Input aria-label="PO no." className="mt-1" value={f.po} onChange={(e) => setF({ ...f, po: e.target.value })} />
            </div>
            <div>
              <Label>Bill / challan no.</Label>
              <Input aria-label="Bill no." className="mt-1" value={f.billNo} onChange={(e) => setF({ ...f, billNo: e.target.value })} />
            </div>
          </>
        ) : null}
        <div className={f.kind === "receive" ? "" : "sm:col-span-2"}>
          <Label>Note</Label>
          <Input aria-label="Note" className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit">{f.kind === "opening" ? "Save opening stock" : "Save receipt"}</Button>
          {show(msg)}
        </div>
      </form>
    </Panel>
  );
}

const OPENING_HEADERS = ["Item ID", "Group", "Category", "Item", "Unit", "Qty", "Batch", "Expiry (YYYY-MM-DD)", "Note"];

/** Opening stock from Excel: download the item list, fill Qty, upload — all or nothing */
export function OpeningStockUpload({ siteId }: { siteId: string }) {
  const { fullState: state, importOpeningStock } = useStore();
  const items = useMemo(() => allStoreItems(state).filter((i) => i.active), [state]);
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, setPending] = useState<{ itemId: string; qty: number; batch?: string; expiry?: string; note?: string }[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const siteCode = state.sites.find((x) => x.id === siteId)?.code ?? siteId;
  return (
    <Panel>
      <h3 className="mb-1 font-heading text-sm font-bold">Opening stock from Excel</h3>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">Download the item list, fill <b>Qty</b> (and batch / expiry for paint) for what you counted, upload it. Rows left at 0 are skipped. One bad row stops the whole upload, so nothing half-loads.</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label>Count date</Label>
          <Input aria-label="Count date" className="mt-1 w-40" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => downloadXlsxWithHeaders(`opening-stock-${siteCode}.xlsx`, "Opening stock", OPENING_HEADERS, items.map((i) => ({ "Item ID": i.id, Group: GROUP_LABEL[i.group], Category: i.category, Item: i.name, Unit: i.unit, Qty: 0, Batch: "", "Expiry (YYYY-MM-DD)": "", Note: "" })))}
        >
          <Download aria-hidden className="h-4 w-4" /> Item list to fill
        </Button>
        <input
          ref={file}
          type="file"
          accept=".xlsx,.xls,.csv"
          aria-label="Upload opening stock"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const rows = (await readSpreadsheet(f))[0]?.rows ?? [];
              const out: { itemId: string; qty: number; batch?: string; expiry?: string; note?: string }[] = [];
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const qty = Number(cell(r, "Qty"));
                if (!qty) continue;
                const id = cell(r, "Item ID");
                const it = items.find((x) => x.id === id) ?? items.find((x) => x.name.toLowerCase() === cell(r, "Item").toLowerCase() && x.category.toLowerCase() === cell(r, "Category").toLowerCase());
                if (!it) return setMsg({ ok: false, text: `Row ${i + 2}: "${cell(r, "Item")}" isn't on the item list` });
                out.push({ itemId: it.id, qty, batch: cell(r, "Batch") || undefined, expiry: cell(r, "Expiry (YYYY-MM-DD)", "Expiry") || undefined, note: cell(r, "Note") || undefined });
              }
              if (!out.length) return setMsg({ ok: false, text: "No row has a Qty — fill the Qty column first" });
              setPending(out);
              setMsg({ ok: true, text: `${out.length} item(s) ready to load into ${siteCode} as opening stock on ${date}.` });
            } catch {
              setMsg({ ok: false, text: "Couldn't read that file — use the downloaded item list" });
            }
          }}
        />
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => file.current?.click()}>
          <Upload aria-hidden className="h-4 w-4" /> Upload filled list
        </Button>
        {pending ? (
          <Button
            type="button"
            onClick={() => {
              const r = importOpeningStock(siteId, date, pending);
              setPending(null);
              setMsg(r.ok ? { ok: true, text: `Opening stock loaded: ${r.count} item(s) into ${siteCode}.` } : { ok: false, text: r.error ?? "Couldn't load" });
            }}
          >
            Load {pending.length} item(s)
          </Button>
        ) : null}
      </div>
      <div className="mt-2">{show(msg)}</div>
    </Panel>
  );
}

/** Issue to a supervisor — shows what he already holds; an extra issue is flagged for Owner / SA */
export function IssueForm({ siteId }: { siteId: string }) {
  const { fullState: state, recordStoreMove } = useStore();
  const { notify } = useWork();
  const items = useMemo(() => allStoreItems(state), [state]);
  const supervisors = state.staff.filter((x) => x.role === "supervisor" && x.siteId === siteId);
  const blank = { date: today(), supervisorId: "", itemId: "", qty: "", batch: "", note: "" };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<Msg>(null);
  const item = items.find((i) => i.id === f.itemId);
  const stock = f.itemId ? inStore(state.storeMoves, siteId, f.itemId) : 0;
  const batches = f.itemId ? batchesInStore(state.storeMoves, siteId, f.itemId) : [];
  const batch = f.batch || batches[0]?.batch || "";
  const held = f.supervisorId && f.itemId ? heldBy(state.storeMoves, f.supervisorId, f.itemId) : 0;
  const supName = (id: string) => state.staff.find((x) => x.id === id)?.name ?? id;
  return (
    <Panel>
      <h3 className="mb-3 font-heading text-sm font-bold">Issue to a supervisor</h3>
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          const r = recordStoreMove({ kind: "issue", date: f.date, itemId: f.itemId, qty: Number(f.qty), siteId, supervisorId: f.supervisorId, batch: batches.length ? batch : undefined, expiry: batches.find((b) => b.batch === batch)?.expiry, note: f.note || undefined });
          if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Couldn't issue" });
          if (r.extraIssue) {
            notify({ kind: "store_extra_issue", problem: true, siteId, subjectStaffId: f.supervisorId, title: `Extra issue: ${item?.name} ${f.qty} ${item?.unit} to ${supName(f.supervisorId)}`, detail: `He already held ${r.extraIssue.heldBefore} ${item?.unit} unused`, tab: "/home?tab=stock", refId: r.id });
          }
          setMsg({ ok: true, text: `Issued ${item?.name} ${f.qty} ${item?.unit} to ${supName(f.supervisorId)}.${r.extraIssue ? ` Flagged: he already held ${r.extraIssue.heldBefore} ${item?.unit} — Owner / Super Admin can see it.` : ""}` });
          setF({ ...blank, supervisorId: f.supervisorId, date: f.date });
        }}
      >
        <div>
          <Label>Supervisor</Label>
          <select aria-label="Supervisor" className={selectCls + " mt-1"} value={f.supervisorId} onChange={(e) => setF({ ...f, supervisorId: e.target.value })}>
            <option value="">Pick the supervisor…</option>
            {supervisors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Date</Label>
          <Input aria-label="Date" className="mt-1" type="date" max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Item</Label>
          <div className="mt-1"><ItemPicker items={items} value={f.itemId} onChange={(itemId) => setF({ ...f, itemId, batch: "" })} /></div>
        </div>
        <div>
          <Label>Quantity{item ? ` (${item.unit})` : ""}</Label>
          <Input aria-label="Quantity" className="mt-1" type="number" min="0" step="any" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} />
          {item ? <p className="mt-1 text-xs text-[var(--sge-ink-3)]">In store: <b>{stock}</b> {item.unit}</p> : null}
        </div>
        {batches.length ? (
          <div>
            <Label>Batch (oldest expiry first)</Label>
            <select aria-label="Batch" className={selectCls + " mt-1"} value={batch} onChange={(e) => setF({ ...f, batch: e.target.value })}>
              {batches.map((b) => <option key={b.batch} value={b.batch}>{b.batch} · {b.qty} left{b.expiry ? ` · exp ${b.expiry}` : ""}</option>)}
            </select>
          </div>
        ) : null}
        <div className={batches.length ? "" : "sm:col-span-2"}>
          <Label>Note</Label>
          <Input aria-label="Note" className="mt-1" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        {held > 0 ? (
          <p className="flex items-start gap-1.5 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)] sm:col-span-2 lg:col-span-4">
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {supName(f.supervisorId)} already holds {held} {item?.unit} of {item?.name} unused. You can still issue — it will be flagged on his profile for the Owner / Super Admin.
          </p>
        ) : null}
        <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Issue</Button>
          {show(msg)}
        </div>
      </form>
    </Panel>
  );
}

/** What the store keeper can add: a counted item in any group, or a tagged machine (2026-10-27) */
type AddKind = StoreItem["group"] | "machinery";
const ADD_KINDS: { id: AddKind; label: string; unit: string; hint: string }[] = [
  { id: "paint", label: "Paint", unit: "L", hint: "By SAP code; tracked by batch + expiry" },
  { id: "material", label: "Materials", unit: "nos", hint: "Pipes, hoses, brushes, abrasives, fittings…" },
  { id: "equipment", label: "Equipment", unit: "nos", hint: "Hand tools, guns, machines counted by number" },
  { id: "ppe", label: "PPE", unit: "nos", hint: "Gloves, masks, goggles, helmets, harness…" },
  { id: "machinery", label: "Machinery (tagged)", unit: "", hint: "Hopper, compressor, airless… one per tag no." },
  { id: "fuel", label: "Fuel", unit: "L", hint: "Diesel and the like" },
  { id: "other", label: "Others", unit: "nos", hint: "Stationery and anything else" },
];
const MACHINE_TYPES: EquipmentItem["type"][] = ["hopper", "compressor", "airless", "harness", "ifr", "rope_access"];

/** Add an item to the store's list — paint, materials, equipment, PPE, tagged machinery, fuel or others */
export function AddItemForm() {
  const { fullState: state, addStoreItem, addTagged } = useStore();
  const items = allStoreItems(state);
  const [kind, setKind] = useState<AddKind>("material");
  const k = ADD_KINDS.find((x) => x.id === kind)!;
  const categories = [...new Set(items.filter((i) => i.group === kind).map((i) => i.category))];
  const [f, setF] = useState({ category: "", name: "", code: "", unit: "", trackExpiry: false, machine: "hopper" as EquipmentItem["type"], tag: "", expiry: "", value: "" });
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <Panel>
      <h3 className="mb-1 font-heading text-sm font-bold">Add an item to the store</h3>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">Pick what kind of item it is. Once added it can be received, issued and counted like everything else.</p>
      <div role="group" aria-label="Kind of item" className="mb-3 flex flex-wrap gap-1">
        {ADD_KINDS.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-pressed={kind === x.id}
            onClick={() => { setKind(x.id); setMsg(null); setF({ ...f, category: "", unit: "" }); }}
            className={kind === x.id ? "rounded-sm bg-[var(--sge-night)] px-2.5 py-1.5 text-xs font-semibold text-[var(--sge-brass-wash)]" : "rounded-sm bg-[var(--sge-paper-2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"}
          >
            {x.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">{k.hint}</p>
      {kind === "machinery" ? (
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const r = addTagged({ type: f.machine, tag: f.tag, expiryDate: f.expiry || undefined, value: Number(f.value) || undefined });
            setMsg(r.ok ? { ok: true, text: `Added ${f.machine} ${f.tag.toUpperCase()} to the equipment register (Machinery tab).` } : { ok: false, text: r.error ?? "Couldn't add" });
            if (r.ok) setF({ ...f, tag: "", expiry: "", value: "" });
          }}
        >
          <div>
            <Label>Type</Label>
            <select aria-label="Machine type" className={selectCls + " mt-1"} value={f.machine} onChange={(e) => setF({ ...f, machine: e.target.value as EquipmentItem["type"] })}>
              {MACHINE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <Label>Tag / serial no.</Label>
            <Input aria-label="Tag no." className="mt-1" placeholder="e.g. CMP-DTA-02" value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value })} />
          </div>
          <div>
            <Label>Inspection expiry</Label>
            <Input aria-label="Inspection expiry" className="mt-1" type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
          </div>
          <div>
            <Label>Value (₹, optional)</Label>
            <Input aria-label="Value" className="mt-1" type="number" min="0" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
          </div>
          <div className="flex items-end"><Button type="submit" variant="outline">Add machine</Button></div>
          <div className="sm:col-span-2 lg:col-span-5">{show(msg)}</div>
        </form>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            const r = addStoreItem({ group: kind, category: f.category || k.label, name: f.name, code: f.code, unit: f.unit || k.unit, trackExpiry: kind === "paint" || f.trackExpiry });
            setMsg(r.ok ? { ok: true, text: `Added to ${k.label}: ${f.name}${f.code ? ` (${f.code})` : ""}` } : { ok: false, text: r.error ?? "Couldn't add" });
            if (r.ok) setF({ ...f, name: "", code: "" });
          }}
        >
          <div>
            <Label>Category</Label>
            <Input aria-label="New item category" className="mt-1" list={`store-categories-${kind}`} placeholder={categories[0] ?? k.label} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id={`store-categories-${kind}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="sm:col-span-2">
            <Label>{kind === "paint" ? "Paint name" : "Item name"}</Label>
            <Input aria-label="New item name" className="mt-1" placeholder={kind === "paint" ? "e.g. Epoxy MIO intermediate" : ""} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div>
            <Label>{kind === "paint" ? "SAP code *" : "Code (optional)"}</Label>
            <Input aria-label="New item code" className="mt-1" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
          </div>
          <div>
            <Label>Unit</Label>
            <Input aria-label="New item unit" className="mt-1" placeholder={k.unit} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
          </div>
          <label className="flex items-end gap-1.5 pb-2 text-xs">
            <input type="checkbox" checked={kind === "paint" || f.trackExpiry} disabled={kind === "paint"} onChange={(e) => setF({ ...f, trackExpiry: e.target.checked })} /> Batch + expiry
          </label>
          <div className="flex items-end gap-3 sm:col-span-3 lg:col-span-6">
            <Button type="submit" variant="outline">Add to {k.label}</Button>
            {show(msg)}
          </div>
        </form>
      )}
    </Panel>
  );
}
