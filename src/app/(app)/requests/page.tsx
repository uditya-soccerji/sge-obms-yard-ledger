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
  fulfilling: "accent",
  fulfilled: "ok",
  cancelled: "default",
};

export default function RequestsDeskPage() {
  const {
    state,
    currentAccount,
    createEquipmentRequest,
    updateEquipmentRequest,
  } = useStore();
  const role = state.currentRole;
  const canView = canViewModule(currentAccount, role, "requests");
  const canCreate = effectivePermission(currentAccount, role, "requests", "create");
  const canFulfill = effectivePermission(currentAccount, role, "requests", "approve") ||
    effectivePermission(currentAccount, role, "requests", "update");

  const scope = plantScopeFor(currentAccount, role);

  const [kind, setKind] = useState<EquipmentRequest["kind"]>("spare");
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("1");
  const [plant, setPlant] = useState(
    currentAccount?.plantIds[0] ?? "CPP"
  );
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(() => {
    return state.equipmentRequests.filter((r) => {
      if (scope === "all") return true;
      return scope.includes(r.plant);
    });
  }, [state.equipmentRequests, scope]);

  const openCount = list.filter((r) => r.status === "open" || r.status === "fulfilling").length;

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
    createEquipmentRequest({
      siteId: entrySiteId(state),
      plant,
      kind,
      description: description.trim(),
      qty: Number(qty) || undefined,
      urgent,
    });
    setDescription("");
    setMsg("Request created — visible to Store and SIC.");
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Equipment & spare requests"
        subtitle="Desk outside DPR — supervisors/safety create; Store fulfills; SIC sees open queue."
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
                <Select value={plant} onValueChange={setPlant}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(scope === "all" ? ["CPP", "CPP-flare"] : scope).map((p) => (
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
                      <StatusPill tone={TONE[r.status]}>{r.status}</StatusPill>
                    </div>
                    <div className="mt-1 text-xs text-[var(--sge-ink-3)]">
                      {r.kind} · {r.plant} · qty {r.qty ?? "—"} · by {creator}
                      {r.sourceDprId ? ` · from ${r.sourceDprId}` : ""}
                    </div>
                    {canFulfill && r.status !== "fulfilled" && r.status !== "cancelled" ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.status === "open" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateEquipmentRequest(r.id, { status: "fulfilling" })
                            }
                          >
                            Start fulfill
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          onClick={() =>
                            updateEquipmentRequest(r.id, {
                              status: "fulfilled",
                              fulfillNote: "Issued from store",
                            })
                          }
                        >
                          Mark fulfilled
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateEquipmentRequest(r.id, { status: "cancelled" })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
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
