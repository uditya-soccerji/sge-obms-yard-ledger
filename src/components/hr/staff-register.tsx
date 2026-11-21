"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, Panel, SectionHeader, StatusPill } from "@/components/shared/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLES } from "@/lib/roles";
import { entrySiteId } from "@/lib/site-scope";
import { useStore } from "@/lib/store";
import type { RoleId, StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";
import { loadStaffSalaries, SALARY_ROLES, type StaffSalary } from "@/lib/supabase/staff-salary";
import { StaffSalaryPanel } from "@/components/hr/staff-salary-panel";
import { formatINR } from "@/components/shared/ui-bits";

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
  // Owner, 2026-11-18: monthly salary from the staff salary sheet — Owner, SA, HR and Finance only
  const canPay = SALARY_ROLES.includes(state.currentRole as RoleId);
  // Owner, 2026-11-18: every staff member can have a login — Owner / SA make it from here
  const router = useRouter();
  const canLogin = state.currentRole === "owner" || state.currentRole === "super_admin";
  const [salaries, setSalaries] = useState<StaffSalary[]>([]);
  const [openPay, setOpenPay] = useState<string | null>(null);
  useEffect(() => {
    if (!canPay) return;
    void loadStaffSalaries().then((r) => r && setSalaries(r));
  }, [canPay]);
  const payOf = (id: string) => salaries.filter((x) => x.staffId === id);
  const rateOf = (id: string) => payOf(id)[0]?.monthlyRate;

  const rows = state.staff
    .filter((s) => showInactive || s.active !== false)
    .filter((s) => !q.trim() || `${s.name} ${s.designation ?? ""} ${s.employeeCode ?? ""} ${s.epNumber ?? ""} ${s.phone ?? ""} ${s.role}`.toLowerCase().includes(q.trim().toLowerCase()))
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
          <Input className="h-9 max-w-xs" placeholder="Search name, EP, code, designation…" value={q} onChange={(e) => setQ(e.target.value)} />
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
            {/* Owner, 2026-11-21: usual plants — several allowed, change any time */}
            <div className="text-xs sm:col-span-full">
              Plants
              <div className="mt-1 flex flex-wrap gap-1.5" role="group" aria-label="Plants">
                {[...new Set([form.siteId, ...(form.siteIds ?? [])])].flatMap((sid) => fullState.sites.find((x) => x.id === sid)?.plants ?? []).filter((p, i, a) => a.indexOf(p) === i).map((p) => {
                  const on = (form.plants ?? []).includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setForm({ ...form, plants: on ? (form.plants ?? []).filter((x) => x !== p) : [...(form.plants ?? []), p] })}
                      className={cn("rounded-full border px-2.5 py-1 font-semibold", on ? "border-[var(--sge-brass)] bg-[var(--sge-brass-wash)] text-[var(--sge-brass-ink)]" : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)]")}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-full">
              <input type="checkbox" checked={!!form.subconOwner} onChange={(e) => setForm({ ...form, subconOwner: e.target.checked || undefined })} />
              Owner of a sub-con firm (not shown in supervisor pick lists)
            </label>
            <div className="flex items-end"><Button onClick={save}>{form.id ? "Save changes" : "Add"}</Button></div>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title="No staff here" detail="Add staff, or switch site / show inactive." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle [&_td:first-child]:pl-0 [&_td:last-child]:pr-0 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold [&_th]:tracking-wider [&_th:first-child]:pl-0 [&_th:last-child]:pr-0">
              <thead className="text-[11px] uppercase text-[var(--sge-ink-3)]">
                <tr><th>Name</th><th>EP</th><th>Role</th><th>Designation</th><th>Site</th>{canPay ? <th className="text-right">Basic / month</th> : null}<th>Mobile</th><th>Login</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <Fragment key={s.id}>
                  <tr className="border-t border-[var(--sge-line)]">
                    <td className="font-semibold">{s.name}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{s.epNumber ?? "—"}</td>
                    <td className="whitespace-nowrap">{roleLabel(s.role)}</td>
                    <td className="text-[var(--sge-ink-2)]">{s.designation ?? "—"}</td>
                    <td className="whitespace-nowrap">{siteCode(s.siteId)}</td>
                    {canPay ? <td className="whitespace-nowrap text-right font-mono text-xs">{rateOf(s.id) ? formatINR(Math.round(rateOf(s.id)!)) : "—"}</td> : null}
                    <td className="whitespace-nowrap font-mono text-xs">{s.phone ?? "—"}</td>
                    <td>
                      {linked(s.id) ? (
                        <StatusPill tone="ok">@{linked(s.id)!.username}</StatusPill>
                      ) : canLogin && s.active !== false ? (
                        <button type="button" className="text-xs font-semibold text-[var(--sge-brass-ink)] underline" onClick={() => router.push(`/master-data?sheet=users&staff=${s.id}`)}>
                          Create login
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--sge-ink-3)]">none</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-right">
                      {canPay && payOf(s.id).length ? (
                        <Button size="sm" variant="ghost" onClick={() => setOpenPay(openPay === s.id ? null : s.id)}>{openPay === s.id ? "Hide salary" : "Salary"}</Button>
                      ) : null}
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
                  {openPay === s.id ? (
                    <tr><td colSpan={canPay ? 9 : 8} className="pb-3"><StaffSalaryPanel rows={payOf(s.id)} /></td></tr>
                  ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
