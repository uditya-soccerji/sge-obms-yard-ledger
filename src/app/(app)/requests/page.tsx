"use client";

import { useMemo, useState } from "react";
import {
  EmptyState,
  KpiTile,
  Panel,
  SectionHeader,
  StatusPill,
} from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { canViewModule, effectivePermission, plantScopeFor } from "@/lib/permissions";
import { useStore } from "@/lib/store";
import { entrySiteId } from "@/lib/site-scope";
import type { EquipmentRequest } from "@/lib/types";

const TONE: Record<
  EquipmentRequest["status"],
  "ok" | "warn" | "accent" | "default" | "crit"
> = {
  open: "warn",
  sic_approved: "accent",
  fulfilling: "accent",
  fulfilled: "ok",
  part_filled: "warn",
  received: "ok",
  cancelled: "default",
};

const LABEL: Record<EquipmentRequest["status"], string> = {
  open: "Waiting for SIC",
  sic_approved: "SIC approved",
  fulfilling: "Store working on it",
  fulfilled: "Fulfilled — confirm receipt",
  part_filled: "Part filled — confirm receipt",
  received: "Received",
  cancelled: "Cancelled",
};

/** Whole days since the request was raised */
const ageDays = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

export default function RequestsDeskPage() {
  const {
    state,
    currentAccount,
    createEquipmentRequest,
    actOnRequest,
  } = useStore();
  const role = state.currentRole;
  const canView = canViewModule(currentAccount, role, "requests");
  const canCreate = effectivePermission(currentAccount, role, "requests", "create");
  const canApprove = effectivePermission(currentAccount, role, "requests", "approve");
  const canFulfill = effectivePermission(currentAccount, role, "requests", "update");
  const me = state.currentUserId ?? state.currentAccountId;
  const [notes, setNotes] = useState<Record<string, string>>({});

  const scope = plantScopeFor(currentAccount, role);
  // Plants come from the site being entered for, limited to the user's plant scope
  const sitePlants = state.sites.find((x) => x.id === entrySiteId(state))?.plants ?? [];
  const plantOptions = scope === "all" ? sitePlants : sitePlants.filter((p) => scope.includes(p));

  const [kind, setKind] = useState<EquipmentRequest["kind"]>("spare");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [plant, setPlant] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => {
    return state.equipmentRequests.filter((r) => {
      if (scope === "all") return true;
      return scope.includes(r.plant);
    });
  }, [state.equipmentRequests, scope]);

  const openCount = list.filter((r) => ["open", "sic_approved", "fulfilling"].includes(r.status)).length;
  const chosenPlant = plantOptions.includes(plant) ? plant : plantOptions[0] ?? "";

  function act(id: string, action: Parameters<typeof actOnRequest>[1]) {
    const res = actOnRequest(id, action, notes[id]);
    setMsg(res.ok ? "Updated." : res.error ?? "Couldn't update");
    if (res.ok) setNotes((n) => ({ ...n, [id]: "" }));
  }

  if (!canView) {
    return (
      <EmptyState
        title="No access"
        detail="Equipment & spare request desk is for supervisors, safety, store, SIC, and above."
      />
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate || !description.trim()) return;
    if (!chosenPlant) return setMsg("This site has no plants set up — add them in Master Data first.");
    const q = Number(qty);
    if (!(q >= 1)) return setMsg("Quantity must be at least 1.");
    createEquipmentRequest({
      siteId: entrySiteId(state),
      plant: chosenPlant,
      kind,
      description: description.trim(),
      qty: q,
      urgent,
    });
    setDescription("");
    setMsg("Request raised — the SIC approves it, then the store fulfils it.");
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Equipment & spare requests"
        subtitle="Raise → SIC approves → store fulfils (in full or part) → you confirm it arrived."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label="Open / fulfilling" value={String(openCount)} tone="warn" />
        <KpiTile label="Total" value={String(list.length)} />
        <KpiTile
          label="Plant scope"
          value={scope === "all" ? "All plants" : scope.join(", ") || "—"}
        />
      </div>

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {canCreate ? (
          <Panel>
            <h3 className="mb-3 font-heading text-sm font-bold">New request</h3>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <Label>Kind</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as EquipmentRequest["kind"])}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spare">Spare</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="material">Material</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plant</Label>
                <Select value={chosenPlant} onValueChange={setPlant}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plantOptions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  className="mt-1"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label>Qty</Label>
                  <Input
                    className="mt-1"
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={urgent}
                    onCheckedChange={(c) => setUrgent(!!c)}
                  />
                  Urgent
                </label>
              </div>
              <Button type="submit" className="w-full">
                Submit request
              </Button>
            </form>
          </Panel>
        ) : null}

        <Panel className={canCreate ? undefined : "lg:col-span-2"}>
          <h3 className="mb-3 font-heading text-sm font-bold">Queue</h3>
          {list.length === 0 ? (
            <EmptyState title="No requests" detail="Create one or submit a DPR with requests." />
          ) : (
            <div className="space-y-2">
              {list.map((r) => {
                const creator =
                  state.staff.find((s) => s.id === r.createdBy)?.name ??
                  r.createdBy;
                return (
                  <div
                    key={r.id}
                    className="rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-sm">
                        {r.description}
                        {r.urgent ? (
                          <span className="ml-2 text-[10px] font-bold uppercase text-[var(--sge-crit)]">
                            Urgent
                          </span>
                        ) : null}
                      </div>
                      <StatusPill tone={TONE[r.status]}>{LABEL[r.status] ?? r.status}</StatusPill>
                    </div>
                    <div className="mt-1 text-xs text-[var(--sge-ink-3)]">
                      {r.kind} · {r.plant} · qty {r.qty ?? "—"} · by {creator}
                      {r.sourceDprId ? ` · from ${r.sourceDprId}` : ""}
                      {["open", "sic_approved", "fulfilling"].includes(r.status) ? ` · ${ageDays(r.createdAt)} day(s) old` : ""}
                    </div>
                    {(() => {
                      const buttons: [Parameters<typeof actOnRequest>[1], string, "default" | "outline" | "ghost"][] = [];
                      if (canApprove && r.status === "open") buttons.push(["approve", "Approve", "default"]);
                      if (canFulfill && r.status === "sic_approved") buttons.push(["start", "Start", "outline"]);
                      if (canFulfill && (r.status === "sic_approved" || r.status === "fulfilling")) buttons.push(["fulfil", "Fulfilled in full", "default"], ["part_fill", "Part filled", "outline"]);
                      if ((canApprove || canFulfill || r.createdBy === me) && ["open", "sic_approved", "fulfilling"].includes(r.status)) buttons.push(["cancel", "Cancel", "ghost"]);
                      if ((r.createdBy === me || role === "super_admin") && (r.status === "fulfilled" || r.status === "part_filled")) buttons.push(["receive", "Confirm received", "default"]);
                      if (!buttons.length) return null;
                      return (
                        <div className="mt-2 space-y-2">
                          {buttons.some(([a]) => a === "part_fill" || a === "cancel") ? (
                            <Input
                              placeholder="Note — needed for part fill or cancel"
                              value={notes[r.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            />
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {buttons.map(([a, label, variant]) => (
                              <Button key={a} size="sm" variant={variant} onClick={() => act(r.id, a)}>
                                {label}
                              </Button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                    {r.cancelNote ? (
                      <div className="mt-1 text-xs text-[var(--sge-warn)]">Note: {r.cancelNote}</div>
                    ) : null}
                    {r.fulfillNote ? (
                      <div className="mt-1 text-xs text-[var(--sge-ok)]">
                        {r.fulfillNote}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
