"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { VirtualRows } from "@/components/shared/virtual-rows";
import { Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
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
import { MASTER_SHEETS, type MasterSheetId } from "@/lib/master/types";
import { canAccessMasterData } from "@/lib/desk";
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import type { CatalogItem, MaterialItem } from "@/lib/master/types";
import type { Labourer, RoleId, Site, UserAccount } from "@/lib/types";
import { cn } from "@/lib/utils";

type ScopeFilter = "site" | "company" | "all";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function MasterDesk() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, currentAccount } = useStore();
  const sheet = (params.get("sheet") as MasterSheetId) || "sites";
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [showInactive, setShowInactive] = useState(true);

  if (!canAccessMasterData(state.currentRole)) {
    return null;
  }

  const meta = MASTER_SHEETS.find((s) => s.id === sheet) ?? MASTER_SHEETS[0];

  return (
    <div className="sge-enter space-y-4">
      <SectionHeader
        title="Master Data"
        subtitle="Owner & Super Admin only. Deactivate instead of delete. Site rows first; company-wide fills the rest. Dropdowns elsewhere read this store."
      />
      <div className="flex flex-wrap gap-1 border-b border-[var(--sge-line)] pb-2">
        {MASTER_SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => router.replace(`/master-data?sheet=${s.id}`)}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
              s.id === sheet
                ? "bg-[var(--sge-night)] text-[var(--sge-brass-wash)]"
                : "bg-[var(--sge-paper-2)] text-[var(--sge-ink-2)] hover:bg-[var(--sge-brass-wash)]"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider">Scope</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as ScopeFilter)}>
            <SelectTrigger className="mt-1 h-8 w-44 rounded-sm text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">This site + company</SelectItem>
              <SelectItem value="site">This site only</SelectItem>
              <SelectItem value="company">Company-wide only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--sge-ink-2)]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
        <div className="text-xs text-[var(--sge-ink-3)]">
          Active site {state.sites.find((s) => s.id === state.currentSiteId)?.code} ·{" "}
          {currentAccount?.name}
        </div>
      </div>
      <p className="text-sm text-[var(--sge-ink-2)]">{meta.hint}</p>
      <SheetBody sheet={sheet} scope={scope} showInactive={showInactive} />
    </div>
  );
}

function matchScope(
  siteId: string | null | undefined,
  currentSite: string,
  scope: ScopeFilter
) {
  if (scope === "all") return siteId == null || siteId === currentSite;
  if (scope === "company") return siteId == null;
  return siteId === currentSite;
}

function SheetBody({
  sheet,
  scope,
  showInactive,
}: {
  sheet: MasterSheetId;
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  if (sheet === "sites") return <SitesSheet showInactive={showInactive} />;
  if (sheet === "users") return <UsersSheet showInactive={showInactive} />;
  if (sheet === "labourers")
    return (
      <LabourSheet scope={scope} showInactive={showInactive} />
    );
  if (sheet === "contractors")
    return <ContractorsSheet scope={scope} showInactive={showInactive} />;
  if (sheet === "trades")
    return <TradesSheet scope={scope} showInactive={showInactive} />;
  if (sheet === "rateBook")
    return <RatesSheet scope={scope} showInactive={showInactive} />;
  if (sheet === "materials")
    return <MaterialsSheet scope={scope} showInactive={showInactive} />;
  return (
    <CatalogSheet sheet={sheet} scope={scope} showInactive={showInactive} />
  );
}

function SitesSheet({ showInactive }: { showInactive: boolean }) {
  const { state, upsertSite } = useStore();
  const rows = state.sites.filter((s) => showInactive || s.enabled);
  const [draft, setDraft] = useState<Site | null>(null);

  return (
    <Panel>
      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            setDraft({
              id: uid("site"),
              code: "",
              name: "",
              client: "Reliance Industries Limited",
              enabled: true,
              rpTags: [],
              plants: [],
            })
          }
        >
          Add site
        </Button>
      </div>
      {draft ? (
        <SiteForm
          value={draft}
          onChange={setDraft}
          onSave={() => {
            if (!draft.code.trim()) return;
            upsertSite({ ...draft, code: draft.code.toUpperCase() });
            setDraft(null);
          }}
          onCancel={() => setDraft(null)}
        />
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Code</th>
            <th>Name</th>
            <th>RP</th>
            <th>Plants</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-[var(--sge-line)]">
              <td className="py-2 font-mono text-xs">{s.code}</td>
              <td>{s.name}</td>
              <td className="text-xs">{s.rpTags.join("/") || "—"}</td>
              <td className="text-xs">{s.plants.join(", ")}</td>
              <td>
                <StatusPill tone={s.enabled ? "ok" : "default"}>
                  {s.enabled ? "active" : "inactive"}
                </StatusPill>
              </td>
              <td className="text-right">
                <Button size="sm" variant="outline" onClick={() => setDraft(s)}>
                  Edit
                </Button>{" "}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => upsertSite({ ...s, enabled: !s.enabled })}
                >
                  {s.enabled ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function SiteForm({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: Site;
  onChange: (s: Site) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-2">
      <div>
        <Label>Code</Label>
        <Input
          className="mt-1"
          value={value.code}
          onChange={(e) => onChange({ ...value, code: e.target.value })}
        />
      </div>
      <div>
        <Label>Name</Label>
        <Input
          className="mt-1"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <Label>Plants (comma)</Label>
        <Input
          className="mt-1"
          value={value.plants.join(", ")}
          onChange={(e) =>
            onChange({
              ...value,
              plants: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function UsersSheet({ showInactive }: { showInactive: boolean }) {
  const { state, createUser, updateUser, setUserPassword, startImpersonation } = useStore();
  const router = useRouter();
  const isSa =
    state.currentRole === "super_admin" && !state.impersonatorAccountId;
  const rows = state.users.filter((u) => showInactive || u.active);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("password");
  const [role, setRole] = useState<RoleId>("supervisor");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <Panel>
      <div className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-4">
        <div>
          <Label>Display name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Username</Label>
          <Input
            className="mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            className="mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => setRole(v as RoleId)}>
            <SelectTrigger className="mt-1 rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-4">
          <Button
            size="sm"
            onClick={async () => {
              const r = await createUser({
                username: username.trim().toLowerCase(),
                password,
                name: name.trim() || username.trim(),
                roles: [role],
                siteIds: [state.currentSiteId],
                plantIds: [],
                permissionOverrides: [],
                active: true,
              });
              setMsg(r.ok ? `Created @${username}` : r.error ?? "Failed");
              if (r.ok) {
                setUsername("");
                setName("");
              }
            }}
          >
            Add seat
          </Button>
          {msg ? (
            <span className="ml-3 text-xs text-[var(--sge-ink-2)]">{msg}</span>
          ) : null}
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">User</th>
            <th>Roles</th>
            <th>Sites</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSa={isSa}
              onToggle={async () => {
                const r = await updateUser(u.id, { active: !u.active });
                if (!r.ok) setMsg(r.error ?? "Failed");
              }}
              onResetPassword={async () => {
                const pw = window.prompt(`New password for @${u.username} (min 6 characters)`);
                if (!pw) return;
                const r = await setUserPassword(u.id, pw);
                setMsg(r.ok ? `Password reset for @${u.username}` : r.error ?? "Failed");
              }}
              onViewAs={() => {
                const r = startImpersonation(u.id);
                if (r.ok) router.push(r.home);
              }}
            />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function UserRow({
  user,
  isSa,
  onToggle,
  onResetPassword,
  onViewAs,
}: {
  user: UserAccount;
  isSa: boolean;
  onToggle: () => void;
  onResetPassword: () => void;
  onViewAs: () => void;
}) {
  const { state } = useStore();
  return (
    <tr className="border-t border-[var(--sge-line)]">
      <td className="py-2">
        <div className="font-medium">{user.name}</div>
        <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
          @{user.username}
        </div>
      </td>
      <td className="text-xs">{user.roles.join(", ")}</td>
      <td className="text-xs">
        {user.siteIds
          .map((id) => state.sites.find((s) => s.id === id)?.code ?? id)
          .join(", ")}
      </td>
      <td>
        <StatusPill tone={user.active ? "ok" : "default"}>
          {user.active ? "active" : "inactive"}
        </StatusPill>
      </td>
      <td className="text-right">
        {isSa && user.username !== "uditya" ? (
          <Button size="sm" variant="outline" className="mr-1" onClick={onViewAs}>
            View as
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onResetPassword}>
          Reset password
        </Button>
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {user.active ? "Deactivate" : "Activate"}
        </Button>
      </td>
    </tr>
  );
}

function LabourSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, updateLabourer, addLabourer } = useStore();
  const [q, setQ] = useState("");
  const contractors = state.masterCatalog.contractors.filter((c) => c.active);
  const trades = state.tradeCatalogue.filter((t) => t.active);
  const rows = useMemo(() => {
    return state.labourers.filter((l) => {
      if (!showInactive && !l.active) return false;
      if (!matchScope(l.siteId, state.currentSiteId, scope)) return false;
      if (!q.trim()) return true;
      const hay = `${l.name} ${l.epNumber} ${l.trade} ${l.gatePass}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [state.labourers, state.currentSiteId, scope, showInactive, q]);

  function addBlank() {
    addLabourer({
      name: "New labourer",
      trade: trades[0]?.id ?? "helper",
      epNumber: "EP-",
      gatePass: "GP-",
      siteId: state.currentSiteId,
      supervisorId: state.staff[0]?.id ?? "",
      contractorId: contractors[0]?.id ?? "con-sge",
      wageDaily: 0,
      equipmentIds: [],
      active: true,
    });
  }

  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Label>Search register</Label>
          <Input
            className="mt-1"
            value={q}
            placeholder="Name, EP, trade…"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={addBlank}>
          Add labourer
        </Button>
        <span className="text-xs text-[var(--sge-ink-3)]">{rows.length} rows</span>
      </div>
      <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_4.5rem_5.5rem] gap-2 border-b border-[var(--sge-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
        <span>Name</span>
        <span>Trade</span>
        <span>Contractor</span>
        <span>EP</span>
        <span>Wage</span>
        <span />
      </div>
      <VirtualRows
        rows={rows}
        rowHeight={44}
        height={Math.min(520, Math.max(180, rows.length * 44 + 8))}
        render={(l: Labourer) => (
          <div className="grid h-full grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_4.5rem_5.5rem] items-center gap-2 border-b border-[var(--sge-line)] px-2 text-sm">
            <Input
              value={l.name}
              onChange={(e) => updateLabourer(l.id, { name: e.target.value })}
            />
            <select
              className="h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs"
              value={l.trade}
              onChange={(e) => updateLabourer(l.id, { trade: e.target.value })}
            >
              {trades.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs"
              value={l.contractorId ?? ""}
              onChange={(e) =>
                updateLabourer(l.id, { contractorId: e.target.value })
              }
            >
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Input
              value={l.epNumber}
              onChange={(e) => updateLabourer(l.id, { epNumber: e.target.value })}
            />
            <Input
              value={String(l.wageDaily)}
              onChange={(e) =>
                updateLabourer(l.id, {
                  wageDaily: Number(e.target.value) || 0,
                })
              }
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => updateLabourer(l.id, { active: !l.active })}
            >
              {l.active ? "Off" : "On"}
            </Button>
          </div>
        )}
      />
    </Panel>
  );
}

function ContractorsSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, upsertContractor, setContractorActive } = useStore();
  const rows = state.masterCatalog.contractors.filter((c) => {
    if (!showInactive && !c.active) return false;
    return matchScope(c.siteId, state.currentSiteId, scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={() =>
            upsertContractor({
              id: uid("con"),
              siteId: state.currentSiteId,
              code: "NEW",
              name: "New contractor",
              active: true,
            })
          }
        >
          Add contractor
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Code</th>
            <th>Name</th>
            <th>Scope</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-[var(--sge-line)]">
              <td className="py-2 font-mono text-xs">{c.code}</td>
              <td>
                <Input
                  value={c.name}
                  onChange={(e) =>
                    upsertContractor({ ...c, name: e.target.value })
                  }
                />
              </td>
              <td className="text-xs">
                {c.siteId
                  ? state.sites.find((s) => s.id === c.siteId)?.code
                  : "Company"}
              </td>
              <td>
                <StatusPill tone={c.active ? "ok" : "default"}>
                  {c.active ? "active" : "inactive"}
                </StatusPill>
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setContractorActive(c.id, !c.active)}
                >
                  {c.active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function TradesSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, updateTrade, addTrade } = useStore();
  const rows = state.tradeCatalogue.filter((t) => {
    if (!showInactive && !t.active) return false;
    return matchScope(t.siteId ?? null, state.currentSiteId, scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={() =>
            addTrade({
              label: "New trade",
              subcategories: [],
              active: true,
              siteId: null,
            })
          }
        >
          Add trade
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Label</th>
            <th>Subs</th>
            <th>Scope</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-[var(--sge-line)]">
              <td className="py-2">
                <Input
                  value={t.label}
                  onChange={(e) => updateTrade(t.id, { label: e.target.value })}
                />
              </td>
              <td className="text-xs">
                {t.subcategories.map((s) => s.label).join(", ") || "—"}
              </td>
              <td className="text-xs">{t.siteId ? "Site" : "Company"}</td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => updateTrade(t.id, { active: !t.active })}
                >
                  {t.active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function RatesSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, upsertRateLine } = useStore();
  const rows = state.rateLines.filter((r) => {
    if (!showInactive && r.superseded) return false;
    if (scope === "company") return r.siteIds.length === 0;
    if (scope === "site") return r.siteIds.includes(state.currentSiteId);
    return r.siteIds.length === 0 || r.siteIds.includes(state.currentSiteId);
  });
  return (
    <Panel>
      <p className="mb-2 text-xs text-[var(--sge-ink-3)]">
        Latest wins per site + item + UOM. Superseded rows stay for history.
      </p>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
              <th className="py-2">PO</th>
              <th>Item</th>
              <th>UOM</th>
              <th>₹</th>
              <th>Sites</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r) => (
              <tr key={r.id} className="border-t border-[var(--sge-line)]">
                <td className="py-1.5 font-mono text-[11px]">{r.poNumber}</td>
                <td className="text-xs">{r.description}</td>
                <td className="font-mono text-xs">{r.uom}</td>
                <td className="tabular-nums">{r.rateInr}</td>
                <td className="text-xs">
                  {r.siteIds.length
                    ? r.siteIds
                        .map(
                          (id) =>
                            state.sites.find((s) => s.id === id)?.code ?? id
                        )
                        .join(",")
                    : "Company"}
                </td>
                <td>
                  {r.superseded ? (
                    <StatusPill>old</StatusPill>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        upsertRateLine({ ...r, superseded: true })
                      }
                    >
                      Deactivate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function MaterialsSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, upsertMaterial, setCatalogActive } = useStore();
  const rows = state.masterCatalog.materials.filter((m) => {
    if (!showInactive && !m.active) return false;
    return matchScope(m.siteId, state.currentSiteId, scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={() =>
            upsertMaterial({
              id: uid("mat"),
              siteId: null,
              code: "Type ",
              label: "New material",
              sapCode: "",
              paintSystem: "",
              uom: "L",
              active: true,
            })
          }
        >
          Add material
        </Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Type</th>
            <th>Description</th>
            <th>SAP</th>
            <th>System</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m: MaterialItem) => (
            <tr key={m.id} className="border-t border-[var(--sge-line)]">
              <td className="py-1.5 font-mono text-xs">{m.code}</td>
              <td>
                <Input
                  value={m.label}
                  onChange={(e) =>
                    upsertMaterial({ ...m, label: e.target.value })
                  }
                />
              </td>
              <td className="font-mono text-xs">{m.sapCode || "—"}</td>
              <td className="text-xs">{m.paintSystem}</td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setCatalogActive("materials", m.id, !m.active)
                  }
                >
                  {m.active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

const CATALOG_SHEETS: Exclude<
  MasterSheetId,
  | "sites"
  | "users"
  | "labourers"
  | "contractors"
  | "trades"
  | "rateBook"
  | "materials"
>[] = [
  "dprTypes",
  "activityTemplates",
  "units",
  "storeBooks",
  "fimStages",
  "safetyFormCodes",
  "shiftTypes",
  "attendanceStatuses",
];

function CatalogSheet({
  sheet,
  scope,
  showInactive,
}: {
  sheet: MasterSheetId;
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { state, upsertCatalogItem, setCatalogActive } = useStore();
  if (!CATALOG_SHEETS.includes(sheet as (typeof CATALOG_SHEETS)[number])) {
    return null;
  }
  const key = sheet as (typeof CATALOG_SHEETS)[number];
  const rows = (state.masterCatalog[key] as CatalogItem[]).filter((r) => {
    if (!showInactive && !r.active) return false;
    return matchScope(r.siteId, state.currentSiteId, scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={() =>
            upsertCatalogItem(key, {
              id: uid("cat"),
              siteId: null,
              code: "NEW",
              label: "New row",
              active: true,
            })
          }
        >
          Add row
        </Button>
        <span className="ml-2 text-xs text-[var(--sge-ink-3)]">
          Company-wide unless you set a site on the row.
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Code</th>
            <th>Label</th>
            <th>Scope</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[var(--sge-line)]">
              <td className="py-1.5">
                <Input
                  value={r.code}
                  onChange={(e) =>
                    upsertCatalogItem(key, { ...r, code: e.target.value })
                  }
                />
              </td>
              <td>
                <Input
                  value={r.label}
                  onChange={(e) =>
                    upsertCatalogItem(key, { ...r, label: e.target.value })
                  }
                />
              </td>
              <td className="text-xs">
                {r.siteId
                  ? state.sites.find((s) => s.id === r.siteId)?.code
                  : "Company"}
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCatalogActive(key, r.id, !r.active)}
                >
                  {r.active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
