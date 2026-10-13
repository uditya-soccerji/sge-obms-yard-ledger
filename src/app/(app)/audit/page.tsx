"use client";

import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  Panel,
  SectionHeader,
} from "@/components/shared/ui-bits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { canViewModule } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { remoteLoadAudit } from "@/lib/supabase/remote";
import type { AuditEntry } from "@/lib/types";

export default function AuditLogPage() {
  const { state, currentAccount } = useStore();
  const { work } = useWork();
  // Shared trail from Supabase (Step 11) when there's a backend; else this browser's log plus the Work events
  const [remote, setRemote] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    let live = true;
    void remoteLoadAudit().then((rows) => {
      if (live) setRemote(rows);
    });
    return () => {
      live = false;
    };
  }, []);
  const auditLog = useMemo<AuditEntry[]>(() => {
    if (remote) return remote;
    const workRows: AuditEntry[] = work.events.map((ev) => ({
      id: ev.id,
      at: ev.at,
      userId: null,
      username: ev.actorName,
      role: ev.actorRole,
      siteId: ev.siteId || null,
      plant: null,
      module: "work",
      action: ev.kind,
      detail: ev.detail ? `${ev.title} — ${ev.detail}` : ev.title,
      impersonatedBy: ev.impersonatedBy ?? null,
    }));
    return [...state.auditLog, ...workRows].sort((a, b) => b.at.localeCompare(a.at));
  }, [remote, state.auditLog, work.events]);
  const allowed = canViewModule(currentAccount, state.currentRole, "audit");

  const [timeFrom, setTimeFrom] = useState("");
  const [user, setUser] = useState("all");
  const [role, setRole] = useState("all");
  const [site, setSite] = useState("all");
  const [plant, setPlant] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");

  const modules = useMemo(
    () => [...new Set(auditLog.map((a) => a.module))].sort(),
    [auditLog]
  );
  const actions = useMemo(
    () => [...new Set(auditLog.map((a) => a.action))].sort(),
    [auditLog]
  );
  const plants = useMemo(
    () =>
      [...new Set(auditLog.map((a) => a.plant).filter(Boolean) as string[])].sort(),
    [auditLog]
  );

  const filtered = useMemo(() => {
    return auditLog.filter((a) => {
      if (timeFrom && a.at < timeFrom) return false;
      if (user !== "all" && a.username !== user) return false;
      if (role !== "all" && a.role !== role) return false;
      if (site !== "all" && a.siteId !== site) return false;
      if (plant !== "all" && a.plant !== plant) return false;
      if (module !== "all" && a.module !== module) return false;
      if (action !== "all" && a.action !== action) return false;
      return true;
    });
  }, [auditLog, timeFrom, user, role, site, plant, module, action]);

  if (!allowed) {
    return (
      <EmptyState
        title="Audit log restricted"
        detail="Visible to Super Admin and Owner only."
      />
    );
  }

  return (
    <div className="sge-enter space-y-6">
      <SectionHeader
        title="Audit log"
        subtitle="Login, create, update, submit, approve, reject, upload, user-admin — filterable by time, user, role, site, plant, module, action."
      />

      <Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>From (ISO)</Label>
            <Input
              className="mt-1"
              placeholder="2026-10-05T00:00"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
            />
          </div>
          <div>
            <Label>User</Label>
            <Select value={user} onValueChange={setUser}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {state.users.map((u) => (
                  <SelectItem key={u.id} value={u.username}>
                    {u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Site</Label>
            <Select value={site} onValueChange={setSite}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {state.sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.code}
                  </SelectItem>
                ))}
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
                <SelectItem value="all">All plants</SelectItem>
                {plants.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Module</Label>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modules</SelectItem>
                {modules.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-2 text-xs text-[var(--sge-ink-3)]">
          Showing {filtered.length} of {auditLog.length} events
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No events" detail="Adjust filters or perform actions." />
        ) : (
          <div className="max-h-[560px] space-y-1 overflow-y-auto">
            {filtered.map((a) => (
              <div
                key={a.id}
                className="grid gap-1 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] px-3 py-2 text-xs sm:grid-cols-[140px_1fr]"
              >
                <div className="font-mono text-[var(--sge-ink-3)]">
                  {a.at.replace("T", " ").slice(0, 19)}
                </div>
                <div>
                  <span className="font-semibold text-[var(--sge-ink)]">
                    {a.username}
                  </span>
                  {a.role ? (
                    <span className="text-[var(--sge-ink-3)]"> · {a.role}</span>
                  ) : null}
                  <span className="mx-1 text-[var(--sge-accent)]">
                    {a.module}/{a.action}
                  </span>
                  <span className="text-[var(--sge-ink-2)]">{a.detail}</span>
                  {a.plant ? (
                    <span className="text-[var(--sge-ink-3)]"> · {a.plant}</span>
                  ) : null}
                  {a.impersonatedBy ? (
                    <span className="ml-1 text-[var(--sge-warn)]">
                      · via @{a.impersonatedBy}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
