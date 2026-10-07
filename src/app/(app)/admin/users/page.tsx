"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmptyState,
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
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import type { PermissionOverride, RoleId, UserAccount } from "@/lib/types";

const ALL_ROLES = ROLES.map((r) => r.id);
const PLANTS = ["CPP", "CPP-flare"];

const OVERRIDE_PRESETS: { module: PermissionOverride["module"]; action: PermissionOverride["action"]; label: string }[] = [
  { module: "telegram", action: "view", label: "Telegram view" },
  { module: "calculators", action: "view", label: "Calculators view" },
  { module: "dpr", action: "approve", label: "DPR approve" },
  { module: "audit", action: "view", label: "Audit view" },
  { module: "finance", action: "export", label: "Finance export" },
];

export default function UsersAdminPage() {
  const { state, currentAccount, createUser, updateUser, startImpersonation } =
    useStore();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("password");
  const [name, setName] = useState("");
  const [roles, setRoles] = useState<RoleId[]>(["supervisor"]);
  const [plantIds, setPlantIds] = useState<string[]>(["CPP"]);
  const [siteIds, setSiteIds] = useState<string[]>([state.currentSiteId]);
  const [overrides, setOverrides] = useState<PermissionOverride[]>([]);

  const isSa =
    state.currentRole === "super_admin" && !state.impersonatorAccountId;

  const editing = useMemo(
    () => state.users.find((u) => u.id === editId) ?? null,
    [state.users, editId]
  );

  if (!isSa) {
    return (
      <EmptyState
        title="Super Admin only"
        detail="Users & rights is locked to Super Admin. Owner can view business data and audit logs, but cannot mint logins."
      />
    );
  }

  function toggleRole(r: RoleId) {
    setRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  }

  function togglePlant(p: string) {
    setPlantIds((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  function loadUser(u: UserAccount) {
    setEditId(u.id);
    setUsername(u.username);
    setPassword(u.password);
    setName(u.name);
    setRoles([...u.roles]);
    setPlantIds([...u.plantIds]);
    setSiteIds([...u.siteIds]);
    setOverrides([...u.permissionOverrides]);
    setMsg(null);
  }

  function clearForm() {
    setEditId(null);
    setUsername("");
    setPassword("password");
    setName("");
    setRoles(["supervisor"]);
    setPlantIds(["CPP"]);
    setSiteIds([state.currentSiteId]);
    setOverrides([]);
  }

  function save() {
    const payload: Omit<UserAccount, "id"> = {
      username: username.trim(),
      password,
      name: name.trim() || username.trim(),
      roles,
      siteIds: siteIds.length ? siteIds : [state.currentSiteId],
      plantIds,
      staffId: editing?.staffId,
      labourerId: editing?.labourerId,
      permissionOverrides: overrides,
      active: editing?.active ?? true,
    };
    if (editId) {
      const r = updateUser(editId, payload);
      setMsg(r.ok ? `Updated ${payload.username}` : r.error ?? "Failed");
    } else {
      const r = createUser(payload);
      setMsg(r.ok ? `Created ${payload.username}` : r.error ?? "Failed");
      if (r.ok) clearForm();
    }
  }

  function toggleOverride(preset: (typeof OVERRIDE_PRESETS)[0], allow: boolean) {
    setOverrides((prev) => {
      const without = prev.filter(
        (o) => !(o.module === preset.module && o.action === preset.action)
      );
      return [...without, { module: preset.module, action: preset.action, allow }];
    });
  }

  function viewAs(u: UserAccount) {
    if (u.roles.includes("super_admin")) {
      setMsg("Cannot impersonate another Super Admin");
      return;
    }
    const r = startImpersonation(u.id);
    if (!r.ok) {
      setMsg(r.error ?? "Impersonation failed");
      return;
    }
    router.push(r.home);
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Users & rights"
        subtitle={`Super Admin desk — create logins, multi-role assign, plant/site scope, per-login overrides. Signed in as ${currentAccount?.username}.`}
      />

      {msg ? (
        <div className="rounded-md border border-[var(--sge-ok)]/30 bg-[var(--sge-ok-wash)] px-3 py-2 text-sm text-[var(--sge-ok)]">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-heading text-sm font-bold">
              {editId ? `Edit · ${editing?.username}` : "Create user"}
            </h3>
            {editId ? (
              <Button variant="ghost" size="sm" onClick={clearForm}>
                New
              </Button>
            ) : null}
          </div>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div>
              <Label>Display name</Label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Roles (multi OK)</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_ROLES.map((r) => (
                  <label
                    key={r}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--sge-line)] px-2 py-1 text-xs"
                  >
                    <Checkbox
                      checked={roles.includes(r)}
                      onCheckedChange={() => toggleRole(r)}
                    />
                    {ROLES.find((x) => x.id === r)?.short ?? r}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Plant scope (empty = all for SIC/Owner)</Label>
              <div className="flex flex-wrap gap-2">
                {PLANTS.map((p) => (
                  <label
                    key={p}
                    className="flex items-center gap-1.5 rounded-md border border-[var(--sge-line)] px-2 py-1 text-xs"
                  >
                    <Checkbox
                      checked={plantIds.includes(p)}
                      onCheckedChange={() => togglePlant(p)}
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Site scope</Label>
              <Select
                value={siteIds[0] ?? state.currentSiteId}
                onValueChange={(v) => setSiteIds([v])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Permission overrides</Label>
              <div className="space-y-1.5">
                {OVERRIDE_PRESETS.map((p) => {
                  const cur = overrides.find(
                    (o) => o.module === p.module && o.action === p.action
                  );
                  return (
                    <div
                      key={`${p.module}:${p.action}`}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span>{p.label}</span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant={cur?.allow === true ? "default" : "outline"}
                          onClick={() => toggleOverride(p, true)}
                        >
                          Allow
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={cur?.allow === false ? "default" : "outline"}
                          onClick={() => toggleOverride(p, false)}
                        >
                          Deny
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Button onClick={save} className="w-full">
              {editId ? "Save changes" : "Create user"}
            </Button>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 font-heading text-sm font-bold">
            Accounts ({state.users.length})
          </h3>
          <div className="space-y-2">
            {state.users.map((u) => {
              const isSelf = u.id === currentAccount?.id;
              const isOtherSa = u.roles.includes("super_admin");
              const canViewAs = !isSelf && !isOtherSa && u.active;
              return (
                <div
                  key={u.id}
                  className="flex flex-col rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => loadUser(u)}
                    className="w-full text-left transition hover:opacity-90"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{u.name}</span>
                      <StatusPill tone={u.active ? "ok" : "crit"}>
                        {u.active ? "active" : "off"}
                      </StatusPill>
                    </div>
                    <div className="text-xs text-[var(--sge-ink-3)]">
                      @{u.username} · {u.roles.join(", ")}
                      {u.plantIds.length
                        ? ` · plants ${u.plantIds.join("/")}`
                        : " · all plants"}
                    </div>
                    {u.permissionOverrides.length ? (
                      <div className="mt-1 text-[10px] text-[var(--sge-warn)]">
                        {u.permissionOverrides.length} override(s)
                      </div>
                    ) : null}
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!canViewAs}
                      title={
                        isOtherSa
                          ? "Cannot impersonate Super Admin"
                          : isSelf
                            ? "Already signed in as this account"
                            : !u.active
                              ? "Account inactive"
                              : "View the app as this user"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        viewAs(u);
                      }}
                    >
                      View as
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={!canViewAs}
                      title={
                        isOtherSa
                          ? "Cannot impersonate Super Admin"
                          : "Impersonate mid-session for critique"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        viewAs(u);
                      }}
                    >
                      Impersonate
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => router.push("/audit")}
          >
            Open audit log
          </Button>
        </Panel>
      </div>
    </div>
  );
}
