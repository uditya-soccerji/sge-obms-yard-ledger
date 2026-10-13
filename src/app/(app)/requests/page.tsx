"use client";

import { useState } from "react";
import { EmptyState, KpiTile, Panel, SectionHeader } from "@/components/shared/ui-bits";
import { REQUESTS_TAB, RequestsBoard } from "@/components/requests/requests-board";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/work/common";
import { kindDef } from "@/lib/equipment";
import { canViewModule, effectivePermission, plantScopeFor } from "@/lib/permissions";
import { filterBoard } from "@/lib/requests";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { EquipmentRequest } from "@/lib/types";
import { useWork } from "@/lib/work/store";

export default function RequestsDeskPage() {
  const { state, currentAccount, createEquipmentRequest } = useStore();
  const { notify } = useWork();
  const role = state.currentRole;
  const canView = canViewModule(currentAccount, role, "requests");
  const canCreate = effectivePermission(currentAccount, role, "requests", "create");
  const scope = plantScopeFor(currentAccount, role);
  const siteId = entrySiteId(state);
  // Plants come from the site's Master Data list (docs §3), narrowed to the login's plants
  const sitePlants = state.sites.find((s) => s.id === siteId)?.plants ?? [];
  const scoped = scope === "all" ? sitePlants : sitePlants.filter((p) => scope.includes(p));
  // A login whose assigned plants were removed from Master Data still needs a plant to pick
  const plants = scoped.length ? scoped : sitePlants;
  const mySetup = state.equipment.filter((e) => e.supervisorId && e.supervisorId === state.currentUserId);

  const [kind, setKind] = useState<EquipmentRequest["kind"]>("equipment");
  const [action, setAction] = useState<"issue" | "exchange">("issue");
  const [exchangeItemId, setExchangeItemId] = useState("");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [plant, setPlant] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const all = state.equipmentRequests.filter((r) => scope === "all" || scope.includes(r.plant) || r.createdBy === state.currentUserId);

  if (!canView) {
    return <EmptyState title="No access" detail="The request desk is for supervisors, safety, store, SIC and above." />;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = plant || plants[0] || "";
    if (!description.trim()) return setMsg({ ok: false, text: "Describe what's needed" });
    if (!p) return setMsg({ ok: false, text: "Pick the plant" });
    if (!(Number(qty) > 0)) return setMsg({ ok: false, text: "Quantity must be above 0" });
    if (action === "exchange" && !exchangeItemId) return setMsg({ ok: false, text: "Pick the item you're exchanging" });
    const id = createEquipmentRequest({
      siteId,
      plant: p,
      kind,
      action,
      ...(action === "exchange" ? { exchangeItemId } : {}),
      description: description.trim(),
      qty: Number(qty),
      urgent,
    });
    notify({
      kind: "request_raised",
      siteId,
      subjectStaffId: state.currentUserId ?? undefined,
      // §9 (B06): urgent ones jump the queue and the bell
      problem: urgent,
      title: `${urgent ? "URGENT · " : ""}${action === "exchange" ? "Exchange" : "Request"}: ${description.trim()}`,
      detail: `${kind} · ${p} · qty ${qty} — SIC approval pending`,
      tab: REQUESTS_TAB,
      refId: id,
    });
    setDescription("");
    setUrgent(false);
    setExchangeItemId("");
    setMsg({ ok: true, text: "Request sent — waiting for SIC approval; the store sees it on its board." });
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Equipment & spare requests"
        subtitle="Raise a request → SIC approves → store fulfils (or says why not) → you confirm received (docs §9)."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiTile label="SIC approval pending" value={String(filterBoard(all, "sic_pending").length)} tone="warn" />
        <KpiTile label="To fulfil" value={String(filterBoard(all, "approved").length)} tone="accent" />
        <KpiTile label="Urgent open" value={String(filterBoard(all, "open").filter((r) => r.urgent).length)} tone="crit" />
        <KpiTile label="Total" value={String(all.length)} />
      </div>

      {msg ? (
        <div className={msg.ok ? "rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]" : "rounded-md border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]"}>
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {canCreate ? (
          <Panel>
            <h3 className="mb-3 font-heading text-sm font-bold">New request</h3>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <Label>Type</Label>
                  <select aria-label="Issue or exchange" className={`${selectCls} mt-1`} value={action} onChange={(e) => setAction(e.target.value as "issue" | "exchange")}>
                    <option value="issue">Issue new</option>
                    <option value="exchange">Exchange</option>
                  </select>
                </label>
                <label className="text-sm">
                  <Label>Kind</Label>
                  <select aria-label="Request kind" className={`${selectCls} mt-1`} value={kind} onChange={(e) => setKind(e.target.value as EquipmentRequest["kind"])}>
                    <option value="equipment">Equipment</option>
                    <option value="spare">Spare</option>
                    <option value="material">Material</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>
              {action === "exchange" ? (
                <label className="block text-sm">
                  <Label>Item you&apos;re handing back</Label>
                  <select aria-label="Exchange item" className={`${selectCls} mt-1`} value={exchangeItemId} onChange={(e) => setExchangeItemId(e.target.value)}>
                    <option value="">{mySetup.length ? "Pick from your setup…" : "No items in your setup"}</option>
                    {mySetup.map((e) => (
                      <option key={e.id} value={e.id}>{e.tag} · {kindDef(e.type).label} · {e.status}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm">
                <Label>Plant</Label>
                <select aria-label="Plant" className={`${selectCls} mt-1`} value={plant || plants[0] || ""} onChange={(e) => setPlant(e.target.value)}>
                  {plants.length ? plants.map((p) => <option key={p} value={p}>{p}</option>) : <option value="">No plants on this site</option>}
                </select>
              </label>
              <div>
                <Label>Description</Label>
                <Textarea className="mt-1" aria-label="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Qty</Label>
                  <Input className="mt-1" aria-label="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <Checkbox aria-label="Urgent" checked={urgent} onCheckedChange={(c) => setUrgent(!!c)} />
                  Urgent
                </label>
              </div>
              <Button type="submit" className="w-full">Send request</Button>
            </form>
          </Panel>
        ) : null}
        <div className={canCreate ? undefined : "lg:col-span-2"}>
          <RequestsBoard />
        </div>
      </div>
    </div>
  );
}
