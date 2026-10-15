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
import type { EquipmentRequest, RequestReason } from "@/lib/types";
import { OPEN_STATUSES, queueOrder, reasonLabel, REQUEST_REASONS } from "@/lib/requests";
import { useWork } from "@/lib/work/store";
import { OpsExcelTransfer } from "@/components/ops/ops-excel-transfer";

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
  rejected: "crit",
};

const LABEL: Record<EquipmentRequest["status"], string> = {
  open: "With the store",
  sic_approved: "SIC override — store to fulfil",
  fulfilling: "Store working on it",
  fulfilled: "Fulfilled — confirm receipt",
  part_filled: "Part filled — confirm receipt",
  received: "Received",
  cancelled: "Cancelled",
  rejected: "Rejected by store — SIC to decide",
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
  const { notify } = useWork();
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
  const [reason, setReason] = useState<RequestReason | "">("");
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => {
    // Rejected (SIC to decide) and urgent first (docs §24)
    return state.equipmentRequests.filter((r) => scope === "all" || scope.includes(r.plant)).sort(queueOrder);
  }, [state.equipmentRequests, scope]);

  const openCount = list.filter((r) => OPEN_STATUSES.includes(r.status)).length;
  const chosenPlant = plantOptions.includes(plant) ? plant : plantOptions[0] ?? "";

  function act(id: string, action: Parameters<typeof actOnRequest>[1]) {
    const r = state.equipmentRequests.find((x) => x.id === id);
    const res = actOnRequest(id, action, notes[id]);
    setMsg(res.ok ? "Updated." : res.error ?? "Couldn't update");
    if (!res.ok || !r) return;
    setNotes((n) => ({ ...n, [id]: "" }));
    // docs §24: a rejection is urgent for the SIC; an override goes back to the store; the requester hears the outcome
    const note = notes[id]?.trim();
    const base = { siteId: r.siteId, subjectStaffId: r.createdBy, tab: "/requests", refId: id };
    if (action === "reject") notify({ ...base, kind: "request_rejected", problem: true, title: `Store rejected: ${r.description}`, detail: `${note ?? ""} · ${r.plant} · SIC can override` });
    if (action === "override") notify({ ...base, kind: "request_overridden", problem: true, title: `SIC override — fulfil: ${r.description}`, detail: note || `${r.plant} · qty ${r.qty ?? "—"}` });
    if (action === "fulfil" || action === "part_fill") notify({ ...base, kind: "request_done", title: `${action === "fulfil" ? "Fulfilled" : "Part filled"}: ${r.description}`, detail: note || "Confirm when it arrives" });
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
    if (!reason) return setMsg("Pick a reason: urgent, damaged, required, replacement, scrapped or expired.");
    if (!chosenPlant) return setMsg("This site has no plants set up — add them in Master Data first.");
    const q = Number(qty);
    if (!(q >= 1)) return setMsg("Quantity must be at least 1.");
    const siteId = entrySiteId(state);
    const id = createEquipmentRequest({
      siteId,
      plant: chosenPlant,
      kind,
      description: description.trim(),
      qty: q,
      urgent: reason === "urgent",
      reason,
    });
    notify({ kind: "request_raised", problem: reason === "urgent", siteId, subjectStaffId: me ?? undefined, title: reason === "urgent" ? `URGENT · ${description.trim()}` : `${reasonLabel(reason)}: ${description.trim()}`, detail: `${kind} · qty ${q} · ${chosenPlant}`, tab: "/requests", refId: id });
    setDescription("");
    setReason("");
    setMsg("Request sent to the store — the SIC is told.");
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Equipment & spare requests"
        subtitle="Raise → store fulfils (in full or part) or rejects → if rejected, the SIC can override → you confirm it arrived. The SIC is told of every request."
      />

      <OpsExcelTransfer kind="equipmentRequests" />

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
                <div className="flex-1">
                  <Label htmlFor="req-reason">Reason</Label>
                  <select
                    id="req-reason"
                    className="mt-1 h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as RequestReason | "")}
                  >
                    <option value="">Pick…</option>
                    {REQUEST_REASONS.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </div>
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
                        {r.urgent || r.reason === "urgent" ? (
                          <span className="ml-2 text-[10px] font-bold uppercase text-[var(--sge-crit)]">
                            Urgent
                          </span>
                        ) : null}
                        {r.reason && r.reason !== "urgent" ? (
                          <span className="ml-2 text-[10px] font-bold uppercase text-[var(--sge-brass-ink)]">{reasonLabel(r.reason)}</span>
                        ) : null}
                      </div>
                      <StatusPill tone={TONE[r.status]}>{LABEL[r.status] ?? r.status}</StatusPill>
                    </div>
                    <div className="mt-1 text-xs text-[var(--sge-ink-3)]">
                      {r.kind} · {r.plant} · qty {r.qty ?? "—"} · by {creator}
                      {r.sourceDprId ? ` · from ${r.sourceDprId}` : ""}
                      {OPEN_STATUSES.includes(r.status) ? ` · ${ageDays(r.createdAt)} day(s) old` : ""}
                    </div>
                    {(() => {
                      const buttons: [Parameters<typeof actOnRequest>[1], string, "default" | "outline" | "ghost"][] = [];
                      // docs §24: no SIC approval step; the store fulfils or rejects, the SIC overrides a rejection
                      if (canFulfill && (r.status === "open" || r.status === "sic_approved")) buttons.push(["start", "Start", "outline"]);
                      if (canFulfill && (r.status === "open" || r.status === "sic_approved" || r.status === "fulfilling")) buttons.push(["fulfil", "Fulfilled in full", "default"], ["part_fill", "Part filled", "outline"]);
                      if (canFulfill && (r.status === "open" || r.status === "fulfilling")) buttons.push(["reject", "Reject", "outline"]);
                      if (canApprove && r.status === "rejected") buttons.push(["override", "Override — store must fulfil", "default"]);
                      if ((canApprove || canFulfill || r.createdBy === me) && OPEN_STATUSES.includes(r.status)) buttons.push(["cancel", "Cancel", "ghost"]);
                      if ((r.createdBy === me || role === "super_admin") && (r.status === "fulfilled" || r.status === "part_filled")) buttons.push(["receive", "Confirm received", "default"]);
                      if (!buttons.length) return null;
                      return (
                        <div className="mt-2 space-y-2">
                          {buttons.some(([a]) => a === "part_fill" || a === "cancel" || a === "reject" || a === "override") ? (
                            <Input
                              placeholder="Note — needed for part fill, reject or cancel"
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
                    {r.rejectNote ? (
                      <div className="mt-1 text-xs text-[var(--sge-crit)]">Rejected: {r.rejectNote}</div>
                    ) : null}
                    {r.overriddenAt ? (
                      <div className="mt-1 text-xs text-[var(--sge-brass-ink)]">SIC overrode the store{r.overrideNote ? `: ${r.overrideNote}` : ""}</div>
                    ) : null}
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
