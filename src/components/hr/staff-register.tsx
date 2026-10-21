"use client";

import { useState } from "react";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES } from "@/lib/roles";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { RoleId, StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Staff roles HR keeps records for (labourers have their own register) */
const STAFF_ROLES = ROLES.filter((r) => r.id !== "labourer" && r.id !== "super_admin");
const selectCls = "h-9 w-full rounded-md border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm";

type Draft = Omit<StaffMember, "id"> & { id?: string };

/**
 * Staff list (round 2, §27): HR keeps the office and site staff records — name,
 * role, designation, site, employee code, mobile, joining date. Logins are made
 * by Owner / Super Admin in Master Data → Users and linked to these records.
 */
export function StaffRegister() {
  const { state, fullState, addStaff, updateStaff } = useStore();
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const siteCode = (id: string) => fullState.sites.find((s) => s.id === id)?.code ?? id;
  const roleLabel = (id: RoleId) => ROLES.find((r) => r.id === id)?.label ?? id;
  const linked = (id: string) => fullState.users.find((u) => u.staffId === id);

  const rows = state.staff
    .filter((s) => showInactive || s.active !== false)
    .filter((s) => !q.trim() || `${s.name} ${s.designation ?? ""} ${s.employeeCode ?? ""} ${s.phone ?? ""} ${s.role}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const blank = (): Draft => ({ name: "", role: "supervisor", siteId: entrySiteId(state), designation: "", phone: "", employeeCode: "", joinedOn: "", active: true });

  function save() {
    if (!form) return;
    const name = form.name.trim();
    if (!name) return setMsg({ ok: false, text: "Name is required" });
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) return setMsg({ ok: false, text: "Mobile is 10 digits starting 6–9" });
    const code = form.employeeCode?.trim();
    if (code && fullState.staff.some((s) => s.id !== form.id && s.employeeCode?.trim().toLowerCase() === code.toLowerCase())) {
      return setMsg({ ok: false, text: `Employee code ${code} is already used` });
    }
    const clean = { ...form, name, designation: form.designation?.trim() || undefined, phone: form.phone?.trim() || undefined, employeeCode: code || undefined, joinedOn: form.joinedOn || undefined };
    if (form.id) {
      const r = updateStaff(form.id, clean);
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Not saved" });
    } else if (!addStaff(clean)) return setMsg({ ok: false, text: "Your role can't add staff" });
    setMsg({ ok: true, text: `${name} saved` });
    setForm(null);
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Staff" subtitle="Office and site staff records. Logins are made by Owner / Super Admin (Master Data → Users) and linked here." />
      {msg ? <p className={cn("text-sm", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</p> : null}
      <Panel>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Input className="h-9 max-w-xs" placeholder="Search name, code, designation…" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
          <Button size="sm" className="ml-auto" onClick={() => setForm(form ? null : blank())}>
            {form ? "Close form" : "Add staff"}
          </Button>
        </div>

        {form ? (
          <div className="mb-4 grid gap-3 rounded-md border border-[var(--sge-line)] bg-[var(--sge-ground)] p-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs">Name<Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-xs">
              Role
              <select className={cn(selectCls, "mt-1")} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as RoleId })}>
                {STAFF_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-xs">Designation<Input className="mt-1" value={form.designation ?? ""} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Painting Supervisor" /></label>
            <label className="text-xs">
              Site
              <select className={cn(selectCls, "mt-1")} value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                {fullState.sites.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </select>
            </label>
            <label className="text-xs">Employee code<Input className="mt-1" value={form.employeeCode ?? ""} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} /></label>
            <label className="text-xs">Mobile<Input className="mt-1" inputMode="numeric" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
            <label className="text-xs">Joined on<Input className="mt-1" type="date" value={form.joinedOn ?? ""} onChange={(e) => setForm({ ...form, joinedOn: e.target.value })} /></label>
            <div className="flex items-end"><Button onClick={save}>{form.id ? "Save changes" : "Add"}</Button></div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title="No staff here" detail="Add staff, or switch site / show inactive." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr><th className="py-1">Name</th><th>Role</th><th>Designation</th><th>Site</th><th>Code</th><th>Mobile</th><th>Joined</th><th>Login</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--sge-line)]">
                    <td className="py-1.5 font-semibold">{s.name}</td>
                    <td>{roleLabel(s.role)}</td>
                    <td className="text-[var(--sge-ink-2)]">{s.designation ?? "—"}</td>
                    <td>{siteCode(s.siteId)}</td>
                    <td className="font-mono text-xs">{s.employeeCode ?? "—"}</td>
                    <td className="font-mono text-xs">{s.phone ?? "—"}</td>
                    <td className="font-mono text-xs">{s.joinedOn ?? "—"}</td>
                    <td>{linked(s.id) ? <StatusPill tone="ok">@{linked(s.id)!.username}</StatusPill> : <span className="text-xs text-[var(--sge-ink-3)]">none</span>}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setForm({ ...s })}>Edit</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const r = updateStaff(s.id, { active: s.active === false });
                          setMsg(r.ok ? { ok: true, text: `${s.name} ${s.active === false ? "activated" : "deactivated"}` } : { ok: false, text: r.error ?? "Not saved" });
                        }}
                      >
                        {s.active === false ? "Activate" : "Deactivate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
