"use client";

import React, { useMemo, useState } from "react";
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
import { useWork } from "@/lib/work/store";
import { hasPickRight, withPickRight } from "@/lib/crew";
import { EP_RE, normEp, SKILL_LEVELS } from "@/lib/labour-import";
import { LabourImport } from "./labour-import";
import type { CatalogItem, MaterialItem } from "@/lib/master/types";
import type { Labourer, PlantDetail, RoleId, Site, UserAccount } from "@/lib/types";
import {
  buildPlantDetails,
  checkPlantRps,
  checkSiteCode,
  entrySiteId,
  parsePlants,
  parseRpTags,
  plantRp,
  sitePlantDetails,
} from "@/lib/site-scope";
import { checkSeat, checkSites, MIN_PASSWORD } from "@/lib/users";
import type { StaffMember } from "@/lib/types";
import { cn } from "@/lib/utils";

type ScopeFilter = "site" | "company" | "all";

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function MasterDesk() {
  const params = useSearchParams();
  const router = useRouter();
  const { fullState: state, currentAccount } = useStore();
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
          Active site {state.sites.find((s) => s.id === entrySiteId(state))?.code} ·{" "}
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
  const { fullState: state, upsertSite } = useStore();
  const rows = state.sites.filter((s) => showInactive || s.enabled);
  const [draft, setDraft] = useState<Site | null>(null);
  // Plants and RPs are edited as free text and split only on save (B01)
  const [plantsText, setPlantsText] = useState("");
  const [rpText, setRpText] = useState("");
  // Per-plant RP + locations (B02), matched to the typed plant names on save
  const [details, setDetails] = useState<PlantDetail[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function open(site: Site) {
    setDraft(site);
    setPlantsText(site.plants.join(", "));
    setRpText(site.rpTags.join(", "));
    setDetails(sitePlantDetails(site));
    setMsg(null);
  }

  async function save() {
    if (!draft) return;
    const plants = parsePlants(plantsText);
    const rpTags = parseRpTags(rpText);
    const plantDetails = buildPlantDetails(plants, details);
    const site = {
      ...draft,
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim() || draft.code.trim().toUpperCase(),
      rpTags,
      plants,
      plantDetails,
    };
    const bad = checkSiteCode(site.code, site.id, state.sites) ?? checkPlantRps(rpTags, plantDetails);
    if (bad) return setMsg({ ok: false, text: bad });
    setSaving(true);
    const err = await upsertSite(site);
    setSaving(false);
    if (err) return setMsg({ ok: false, text: err });
    setDraft(null);
    const locs = plantDetails.reduce((n, d) => n + d.locations.length, 0);
    setMsg({
      ok: true,
      text: `Saved ${site.code} · ${plants.length} plant${plants.length === 1 ? "" : "s"} · ${locs} location${locs === 1 ? "" : "s"}`,
    });
  }

  async function toggle(site: Site) {
    const err = await upsertSite({ ...site, enabled: !site.enabled });
    setMsg(err ? { ok: false, text: err } : null);
  }

  return (
    <Panel>
      <div className="mb-3 flex items-center justify-end gap-3">
        {msg && !draft ? (
          <span className={cn("text-xs", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>{msg.text}</span>
        ) : null}
        <Button
          size="sm"
          onClick={() =>
            open({
              id: uid("site"),
              code: "",
              name: "",
              client: "Reliance Industries Limited",
              enabled: true,
              rpTags: [],
              plants: [],
              plantDetails: [],
            })
          }
        >
          Add site
        </Button>
      </div>
      {draft ? (
        <SiteForm
          value={draft}
          plantsText={plantsText}
          rpText={rpText}
          details={details}
          saving={saving}
          error={msg && !msg.ok ? msg.text : null}
          onChange={setDraft}
          onPlantsText={setPlantsText}
          onRpText={setRpText}
          onDetails={setDetails}
          onSave={() => void save()}
          onCancel={() => {
            setDraft(null);
            setMsg(null);
          }}
        />
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Code</th>
            <th>Name</th>
            <th>RP</th>
            <th>Plants · RP · locations</th>
            <th>State</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t border-[var(--sge-line)] align-top">
              <td className="py-2 pr-3 font-mono text-xs">{s.code}</td>
              <td className="py-2 pr-3">{s.name}</td>
              <td className="whitespace-nowrap py-2 pr-3 text-xs">{s.rpTags.join(" / ") || "—"}</td>
              <td className="py-2 pr-3 text-xs">
                {sitePlantDetails(s).map((d, i) => {
                  const rp = plantRp(s, d.name);
                  const extra = [rp, d.locations.length ? `${d.locations.length} loc` : ""].filter(Boolean).join(" · ");
                  return (
                    <span key={d.name}>
                      {i ? ", " : ""}
                      {d.name}
                      {extra ? <span className="text-[var(--sge-ink-3)]"> ({extra})</span> : null}
                    </span>
                  );
                })}
              </td>
              <td className="py-2">
                <StatusPill tone={s.enabled ? "ok" : "default"}>
                  {s.enabled ? "active" : "inactive"}
                </StatusPill>
              </td>
              <td className="py-2 text-right">
                <Button size="sm" variant="outline" onClick={() => open(s)}>
                  Edit
                </Button>{" "}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void toggle(s)}
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
  plantsText,
  rpText,
  details,
  saving,
  error,
  onChange,
  onPlantsText,
  onRpText,
  onDetails,
  onSave,
  onCancel,
}: {
  value: Site;
  plantsText: string;
  rpText: string;
  details: PlantDetail[];
  saving: boolean;
  error: string | null;
  onChange: (s: Site) => void;
  onPlantsText: (text: string) => void;
  onRpText: (text: string) => void;
  onDetails: (d: PlantDetail[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const plants = parsePlants(plantsText);
  const rpTags = parseRpTags(rpText);
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
        <Label>RPs run at this site (comma)</Label>
        <Input
          className="mt-1"
          value={rpText}
          placeholder="e.g. RP2, RP5"
          onChange={(e) => onRpText(e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <Label>Plants (comma)</Label>
        <Input
          className="mt-1"
          value={plantsText}
          placeholder="e.g. COKER, CRUDE, PRU & HPIB"
          onChange={(e) => onPlantsText(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
          {plants.length} plant{plants.length === 1 ? "" : "s"} · separate with commas
        </p>
      </div>
      {plants.length ? (
        <div className="sm:col-span-2">
          <PlantDetailsEditor plants={plants} rpTags={rpTags} details={details} onDetails={onDetails} />
        </div>
      ) : null}
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {error ? <span className="text-xs text-[var(--sge-crit)]">{error}</span> : null}
      </div>
    </div>
  );
}

const rpSelectCls =
  "h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] px-1.5 text-xs text-[var(--sge-ink)]";

/** Each plant's RP and its locations (a location may override the RP). B02. */
function PlantDetailsEditor({
  plants,
  rpTags,
  details,
  onDetails,
}: {
  plants: string[];
  rpTags: string[];
  details: PlantDetail[];
  onDetails: (d: PlantDetail[]) => void;
}) {
  const key = (n: string) => n.trim().toLowerCase();
  const find = (name: string) => details.find((d) => key(d.name) === key(name));
  const put = (name: string, next: PlantDetail) =>
    onDetails([...details.filter((d) => key(d.name) !== key(name)), next]);
  const siteRp = rpTags.length === 1 ? rpTags[0] : "";

  return (
    <div className="rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)]">
      <div className="border-b border-[var(--sge-line)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
        Plants · RP · locations
      </div>
      {plants.map((plant) => {
        const d: PlantDetail = find(plant) ?? { name: plant, locations: [] };
        const setLocs = (locations: PlantDetail["locations"]) => put(plant, { ...d, name: plant, locations });
        return (
          <div key={key(plant)} className="border-b border-[var(--sge-line)] px-3 py-2 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading text-sm font-bold tracking-wide">{plant}</span>
              <select
                aria-label={`RP for ${plant}`}
                className={rpSelectCls}
                value={d.rp ?? ""}
                onChange={(e) => put(plant, { ...d, name: plant, rp: e.target.value || undefined })}
              >
                <option value="">{siteRp ? `Site RP (${siteRp})` : "RP —"}</option>
                {rpTags.map((rp) => (
                  <option key={rp} value={rp}>
                    {rp}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-[var(--sge-ink-3)]">
                {d.locations.length} location{d.locations.length === 1 ? "" : "s"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs"
                onClick={() => setLocs([...d.locations, { name: "" }])}
              >
                Add location
              </Button>
            </div>
            {d.locations.length ? (
              <div className="mt-2 space-y-1.5 pl-3">
                {d.locations.map((loc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      aria-label={`${plant} location ${i + 1}`}
                      className="h-8 text-sm"
                      value={loc.name}
                      placeholder="Location / area"
                      onChange={(e) => setLocs(d.locations.map((l, j) => (j === i ? { ...l, name: e.target.value } : l)))}
                    />
                    <select
                      aria-label={`RP for ${plant} location ${i + 1}`}
                      className={rpSelectCls}
                      value={loc.rp ?? ""}
                      onChange={(e) =>
                        setLocs(
                          d.locations.map((l, j) =>
                            j === i ? { name: l.name, ...(e.target.value ? { rp: e.target.value } : {}) } : l
                          )
                        )
                      }
                    >
                      <option value="">Same as plant</option>
                      {rpTags.map((rp) => (
                        <option key={rp} value={rp}>
                          {rp}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      aria-label={`Remove ${loc.name || "location"}`}
                      onClick={() => setLocs(d.locations.filter((_, j) => j !== i))}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function UsersSheet({ showInactive }: { showInactive: boolean }) {
  const {
    fullState: state,
    createUser,
    updateUser,
    setUserPassword,
    startImpersonation,
    addStaff,
  } = useStore();
  const router = useRouter();
  const isSa =
    state.currentRole === "super_admin" && !state.impersonatorAccountId;
  const canEdit = state.currentRole === "super_admin" || state.currentRole === "owner";
  const rows = state.users.filter((u) => showInactive || u.active);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<RoleId>("supervisor");
  const [siteIds, setSiteIds] = useState<string[]>([entrySiteId(state)]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Who this login belongs to: an existing staff record / labourer, or "new" to create the staff record
  const [link, setLink] = useState<string>("new");
  const [supType, setSupType] = useState<NonNullable<StaffMember["supervisorType"]>>("painting_blasting");
  const linkedStaff = new Set(state.users.map((u) => u.staffId).filter(Boolean));
  const linkedLabourers = new Set(state.users.map((u) => u.labourerId).filter(Boolean));
  const staffChoices = state.staff.filter(
    (x) => x.role === role && siteIds.includes(x.siteId) && !linkedStaff.has(x.id)
  );
  const labourerChoices = state.labourers.filter(
    (l) => l.active && siteIds.includes(l.siteId) && !linkedLabourers.has(l.id)
  );
  const isLabourerRole = role === "labourer";
  // Keep the pick valid as role / sites change
  const linkValue = isLabourerRole
    ? labourerChoices.some((l) => l.id === link) ? link : ""
    : link === "new" || staffChoices.some((x) => x.id === link) ? link : "new";

  // Supervisors work on one site: picking a role trims the selection to fit
  const pickRole = (r: RoleId) => {
    setRole(r);
    if (r === "supervisor" && siteIds.length > 1) setSiteIds(siteIds.slice(0, 1));
  };

  return (
    <Panel>
      <div className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-4">
        <div>
          <Label>Display name</Label>
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="R. Mehta" />
        </div>
        <div>
          <Label>Username</Label>
          <Input
            className="mt-1"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
            placeholder="r.mehta"
          />
        </div>
        <div>
          <Label>Password</Label>
          <Input
            className="mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={`At least ${MIN_PASSWORD} characters`}
          />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => pickRole(v as RoleId)}>
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
          <Label>Sites</Label>
          <SitePicker
            className="mt-1"
            value={siteIds}
            single={role === "supervisor"}
            onChange={setSiteIds}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>{isLabourerRole ? "Labourer" : "Staff record"}</Label>
          <select
            className="mt-1 h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
            value={linkValue}
            onChange={(e) => setLink(e.target.value)}
          >
            {isLabourerRole ? (
              <>
                <option value="">Pick the labourer…</option>
                {labourerChoices.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} · {l.epNumber}</option>
                ))}
              </>
            ) : (
              <>
                <option value="new">Create a new staff record for this person</option>
                {staffChoices.map((x) => (
                  <option key={x.id} value={x.id}>{x.name} · {x.designation}</option>
                ))}
              </>
            )}
          </select>
          <p className="mt-1 text-[11px] text-[var(--sge-ink-3)]">
            The login sees this person&apos;s jobs, DPRs and crew.
          </p>
        </div>
        {role === "supervisor" && linkValue === "new" ? (
          <div>
            <Label>Supervisor type</Label>
            <select
              className="mt-1 h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] px-2 text-sm"
              value={supType}
              onChange={(e) => setSupType(e.target.value as NonNullable<StaffMember["supervisorType"]>)}
            >
              <option value="painting_blasting">Painting &amp; blasting</option>
              <option value="scaffolding">Scaffolding</option>
            </select>
          </div>
        ) : null}
        <div className="sm:col-span-4">
          <Button
            size="sm"
            disabled={!canEdit}
            onClick={async () => {
              const newStaff = !isLabourerRole && linkValue === "new";
              const input = {
                username: username.trim().toLowerCase(),
                password,
                name: name.trim(),
                roles: [role],
                siteIds,
                plantIds: [],
                permissionOverrides: [],
                active: true,
                // "pending" stands in for the staff record created just below
                staffId: isLabourerRole ? undefined : newStaff ? "pending" : linkValue,
                labourerId: isLabourerRole ? linkValue || undefined : undefined,
              };
              // Check here too: the store's result isn't known until React applies the update
              const invalid = checkSeat(input, state.users);
              if (invalid) return setMsg({ ok: false, text: invalid });
              if (newStaff) {
                const meta = ROLES.find((r) => r.id === role);
                const staffId = addStaff({
                  name: input.name,
                  role,
                  siteId: siteIds[0],
                  designation: role === "supervisor" ? (supType === "scaffolding" ? "Scaffolding Supervisor" : "Painting & Blasting Supervisor") : meta?.label ?? role,
                  ...(role === "supervisor" ? { supervisorType: supType } : {}),
                });
                if (!staffId) return setMsg({ ok: false, text: "Your role can't create staff records" });
                input.staffId = staffId;
              }
              const r = await createUser(input);
              if (!r.ok) return setMsg({ ok: false, text: r.error ?? "Failed" });
              setMsg({ ok: true, text: `Created @${input.username} · ${siteCodes(state, siteIds)}` });
              setUsername("");
              setName("");
              setPassword("");
              setLink("new");
            }}
          >
            Add seat
          </Button>
          {msg ? (
            <span className={cn("ml-3 text-xs", msg.ok ? "text-[var(--sge-ok)]" : "text-[var(--sge-crit)]")}>
              {msg.text}
            </span>
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
              canEdit={canEdit}
              onToggle={async () => {
                const r = await updateUser(u.id, { active: !u.active });
                if (!r.ok) setMsg({ ok: false, text: r.error ?? "Failed" });
              }}
              onResetPassword={async () => {
                const pw = window.prompt(`New password for @${u.username} (min ${MIN_PASSWORD} characters)`);
                if (!pw) return;
                const r = await setUserPassword(u.id, pw);
                setMsg({
                  ok: r.ok,
                  text: r.ok ? `Password reset for @${u.username}` : r.error ?? "Failed",
                });
              }}
              onSites={(ids) => {
                const bad = checkSites(u.roles, ids);
                if (bad) return bad;
                void updateUser(u.id, { siteIds: ids }).then((r) => {
                  if (!r.ok) setMsg({ ok: false, text: r.error ?? "Failed" });
                });
                return null;
              }}
              onViewAs={() => {
                const r = startImpersonation(u.id);
                if (r.ok) router.push(r.home);
              }}
              onLink={(staffId) => {
                void updateUser(u.id, { staffId }).then((r) => {
                  if (!r.ok) setMsg({ ok: false, text: r.error ?? "Failed" });
                });
              }}
              onPickRight={(on) => {
                // docs §20: Owner / SA let a supervisor pick their own crew (requests still need the SIC)
                void updateUser(u.id, { permissionOverrides: withPickRight(u.permissionOverrides, on) }).then((r) => {
                  setMsg(r.ok ? { ok: true, text: `@${u.username} ${on ? "can now" : "can no longer"} pick their own crew` } : { ok: false, text: r.error ?? "Failed" });
                });
              }}
            />
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function siteCodes(state: { sites: Site[] }, ids: string[]) {
  return ids.map((id) => state.sites.find((s) => s.id === id)?.code ?? id).join(", ");
}

/** Toggle chips for sites; "All sites" picks every enabled site (not for supervisors). */
function SitePicker({
  value,
  onChange,
  single,
  className,
}: {
  value: string[];
  // A state setter: updates use the latest value, so quick clicks never drop a site
  onChange: React.Dispatch<React.SetStateAction<string[]>>;
  single?: boolean;
  className?: string;
}) {
  const { fullState: state } = useStore();
  const sites = state.sites.filter((s) => s.enabled);
  const all = sites.length > 0 && sites.every((s) => value.includes(s.id));
  const chip = (on: boolean) =>
    cn(
      "rounded-sm border px-2.5 py-1 text-xs font-semibold",
      on
        ? "border-[var(--sge-night)] bg-[var(--sge-night)] text-white"
        : "border-[var(--sge-line)] bg-[var(--sge-paper)] text-[var(--sge-ink-2)] hover:border-[var(--sge-brass)]"
    );
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {!single ? (
        <button type="button" className={chip(all)} onClick={() => onChange(all ? [] : sites.map((s) => s.id))}>
          All sites
        </button>
      ) : null}
      {sites.map((s) => {
        const on = value.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={chip(on)}
            onClick={() => onChange((prev) => (single ? [s.id] : prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
          >
            {s.code}
          </button>
        );
      })}
      {single ? <span className="text-[11px] text-[var(--sge-ink-3)]">Supervisor: one site</span> : null}
    </div>
  );
}

function UserRow({
  user,
  isSa,
  canEdit,
  onToggle,
  onResetPassword,
  onSites,
  onViewAs,
  onLink,
  onPickRight,
}: {
  user: UserAccount;
  isSa: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onResetPassword: () => void;
  /** Returns an error message, or null when saved */
  onSites: (ids: string[]) => string | null;
  onViewAs: () => void;
  onLink: (staffId: string) => void;
  onPickRight: (on: boolean) => void;
}) {
  const { fullState: state } = useStore();
  const linked = user.staffId
    ? state.staff.find((x) => x.id === user.staffId)
    : undefined;
  const linkedLabourer = user.labourerId ? state.labourers.find((l) => l.id === user.labourerId) : undefined;
  const takenStaff = new Set(state.users.filter((u) => u.id !== user.id).map((u) => u.staffId).filter(Boolean));
  const linkChoices = state.staff.filter(
    (x) => user.roles.includes(x.role) && user.siteIds.includes(x.siteId) && !takenStaff.has(x.id)
  );
  const [editing, setEditing] = useState(false);
  const [ids, setIds] = useState(user.siteIds);
  const [err, setErr] = useState<string | null>(null);
  return (
    <tr className="border-t border-[var(--sge-line)] align-top">
      <td className="py-2">
        <div className="font-medium">{user.name || <span className="text-[var(--sge-crit)]">(no name)</span>}</div>
        <div className="font-mono text-[11px] text-[var(--sge-ink-3)]">
          @{user.username}
        </div>
        <div className="text-[11px]">
          {linkedLabourer ? (
            <span className="text-[var(--sge-ink-3)]">Labourer: {linkedLabourer.name}</span>
          ) : linked ? (
            <span className="text-[var(--sge-ink-3)]">Staff: {linked.name}</span>
          ) : user.roles.includes("labourer") ? (
            <span className="text-[var(--sge-crit)]">Not linked to a labourer</span>
          ) : canEdit && linkChoices.length ? (
            <select
              aria-label={`Link @${user.username} to a staff record`}
              className="mt-0.5 h-7 rounded-sm border border-[var(--sge-crit)]/50 bg-[var(--sge-paper)] px-1 text-[11px] text-[var(--sge-crit)]"
              value=""
              onChange={(e) => e.target.value && onLink(e.target.value)}
            >
              <option value="">Not linked — pick staff record…</option>
              {linkChoices.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          ) : (
            <span className="text-[var(--sge-crit)]">Not linked to a staff record</span>
          )}
        </div>
      </td>
      <td className="py-2 text-xs">
        {user.roles.join(", ")}
        {user.roles.includes("supervisor") ? (
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--sge-ink-2)]">
            <input
              type="checkbox"
              aria-label={`@${user.username} can pick own crew`}
              disabled={!canEdit}
              checked={hasPickRight(user)}
              onChange={(e) => onPickRight(e.target.checked)}
            />
            Can pick own crew
          </label>
        ) : null}
      </td>
      <td className="py-2 text-xs">
        {editing ? (
          <div className="space-y-1.5">
            <SitePicker value={ids} single={user.roles.includes("supervisor")} onChange={setIds} />
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const bad = onSites(ids);
                  if (bad) return setErr(bad);
                  setErr(null);
                  setEditing(false);
                }}
              >
                Save sites
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIds(user.siteIds);
                  setErr(null);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              {err ? <span className="text-[var(--sge-crit)]">{err}</span> : null}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span>{siteCodes(state, user.siteIds) || "—"}</span>
            {canEdit ? (
              <button
                type="button"
                className="text-[11px] text-[var(--sge-brass-ink)] underline"
                onClick={() => {
                  setIds(user.siteIds);
                  setEditing(true);
                }}
              >
                Edit sites
              </button>
            ) : null}
          </div>
        )}
      </td>
      <td className="py-2">
        <StatusPill tone={user.active ? "ok" : "default"}>
          {user.active ? "active" : "inactive"}
        </StatusPill>
      </td>
      <td className="py-2 text-right">
        {isSa && user.username !== "uditya" ? (
          <Button size="sm" variant="outline" className="mr-1" onClick={onViewAs}>
            View as
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={onResetPassword}>
          Reset password
        </Button>
        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={onToggle}>
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
  const { fullState: state, updateLabourer, addLabourer, assignCrew, removeFromCrew } = useStore();
  const { notify } = useWork();
  const [q, setQ] = useState("");
  const [crewMsg, setCrewMsg] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const supsOf = (siteId: string) => state.staff.filter((x) => x.role === "supervisor" && x.siteId === siteId);
  const nameOf = (id: string) => state.staff.find((x) => x.id === id)?.name ?? id;

  /** Changing a labourer's supervisor here is a crew change: logged and notified (docs §20). */
  function setSupervisor(l: Labourer, supervisorId: string) {
    if (supervisorId === l.supervisorId) return;
    const r = supervisorId ? assignCrew([l.id], supervisorId) : removeFromCrew(l.id);
    if (!r.ok) return setCrewMsg(r.error ?? "Not changed");
    setCrewMsg(null);
    notify({
      kind: "crew_changed",
      siteId: l.siteId,
      problem: !!l.supervisorId,
      subjectStaffId: l.supervisorId || supervisorId,
      alsoStaffId: supervisorId || undefined,
      title: supervisorId ? `${l.name} → ${nameOf(supervisorId)}'s crew` : `${l.name} taken off ${nameOf(l.supervisorId)}'s crew`,
      detail: l.supervisorId ? `Was with ${nameOf(l.supervisorId)} · changed in Master Data` : "Was unassigned · changed in Master Data",
      tab: "/operations?p=crew",
      refId: l.id,
    });
  }
  const contractors = state.masterCatalog.contractors.filter((c) => c.active);
  const trades = state.tradeCatalogue.filter((t) => t.active);
  const activeSite = entrySiteId(state);
  const rows = useMemo(() => {
    return state.labourers.filter((l) => {
      if (!showInactive && !l.active) return false;
      if (!matchScope(l.siteId, activeSite, scope)) return false;
      if (!q.trim()) return true;
      const hay = `${l.name} ${l.epNumber} ${l.trade} ${l.skill ?? ""} ${(l.epHistory ?? []).map((h) => h.ep).join(" ")}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [state.labourers, activeSite, scope, showInactive, q]);

  function addBlank() {
    addLabourer({
      name: "New labourer",
      trade: trades[0]?.id ?? "helper",
      epNumber: "EP-",
      gatePass: "GP-",
      siteId: entrySiteId(state),
      // Starts on no crew; the SIC (or Owner / SA) puts them on one (docs §20, B03)
      supervisorId: "",
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
        <Button size="sm" variant="outline" onClick={() => setImporting(true)}>
          Upload CSV
        </Button>
        <span className="text-xs text-[var(--sge-ink-3)]">{rows.length} rows</span>
        {crewMsg ? <span className="text-xs text-[var(--sge-crit)]">{crewMsg}</span> : null}
      </div>
      {importing ? <LabourImport onClose={() => setImporting(false)} /> : null}
      {/* B10: the register scrolls sideways on narrow screens instead of squeezing columns */}
      <div className="overflow-x-auto">
      <div className="min-w-[1000px]">
      <div className="grid grid-cols-[minmax(10rem,1.4fr)_minmax(7rem,0.8fr)_minmax(7rem,0.7fr)_minmax(9rem,1fr)_minmax(8rem,0.9fr)_minmax(9rem,0.9fr)_4.5rem_4rem] [&>*]:min-w-0 gap-2 border-b border-[var(--sge-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]">
        <span>Name</span>
        <span>Trade</span>
        <span>Skill</span>
        <span>Contractor</span>
        <span>Supervisor</span>
        <span>EP</span>
        <span>Wage</span>
        <span />
      </div>
      <VirtualRows
        rows={rows}
        rowHeight={44}
        height={Math.min(520, Math.max(180, rows.length * 44 + 8))}
        render={(l: Labourer) => (
          <div className="grid h-full grid-cols-[minmax(10rem,1.4fr)_minmax(7rem,0.8fr)_minmax(7rem,0.7fr)_minmax(9rem,1fr)_minmax(8rem,0.9fr)_minmax(9rem,0.9fr)_4.5rem_4rem] [&>*]:min-w-0 items-center gap-2 border-b border-[var(--sge-line)] px-2 text-sm">
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
              aria-label={`Skill for ${l.name}`}
              className="h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs"
              value={l.skill ?? ""}
              onChange={(e) => updateLabourer(l.id, { skill: (e.target.value || undefined) as Labourer["skill"] })}
            >
              <option value="">—</option>
              {SKILL_LEVELS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
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
            <select
              aria-label={`Supervisor for ${l.name}`}
              className="h-8 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs"
              value={l.supervisorId}
              onChange={(e) => setSupervisor(l, e.target.value)}
            >
              <option value="">— No crew —</option>
              {l.supervisorId && !supsOf(l.siteId).some((x) => x.id === l.supervisorId) ? (
                <option value={l.supervisorId}>{nameOf(l.supervisorId)}</option>
              ) : null}
              {supsOf(l.siteId).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <EpCell labourer={l} onSave={(ep) => updateLabourer(l.id, { epNumber: ep })} />
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
      </div>
      </div>
    </Panel>
  );
}

/**
 * EP box that saves when you leave it (or press Enter), so the EP history only
 * records real changes, not every keystroke (docs §1, B09). Old EPs show on hover.
 */
function EpCell({ labourer, onSave }: { labourer: Labourer; onSave: (ep: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? labourer.epNumber;
  const commit = () => {
    if (draft !== null && normEp(draft) !== normEp(labourer.epNumber)) onSave(draft);
    setDraft(null);
  };
  const history = labourer.epHistory?.length
    ? `Old EPs: ${labourer.epHistory.map((h) => `${h.ep} (until ${h.until})`).join(", ")}`
    : undefined;
  return (
    <Input
      aria-label={`EP for ${labourer.name}`}
      title={history}
      className={cn("font-mono text-xs", draft !== null && !EP_RE.test(normEp(draft)) && "border-[var(--sge-crit)]")}
      value={value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

function ContractorsSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { fullState: state, upsertContractor, setContractorActive } = useStore();
  const rows = state.masterCatalog.contractors.filter((c) => {
    if (!showInactive && !c.active) return false;
    return matchScope(c.siteId, entrySiteId(state), scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={() =>
            upsertContractor({
              id: uid("con"),
              siteId: entrySiteId(state),
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
  const { fullState: state, updateTrade, addTrade } = useStore();
  const rows = state.tradeCatalogue.filter((t) => {
    if (!showInactive && !t.active) return false;
    return matchScope(t.siteId ?? null, entrySiteId(state), scope);
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
  const { fullState: state, upsertRateLine } = useStore();
  const rows = state.rateLines.filter((r) => {
    if (!showInactive && r.superseded) return false;
    if (scope === "company") return r.siteIds.length === 0;
    if (scope === "site") return r.siteIds.includes(entrySiteId(state));
    return r.siteIds.length === 0 || r.siteIds.includes(entrySiteId(state));
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
  const { fullState: state, upsertMaterial, setCatalogActive } = useStore();
  const rows = state.masterCatalog.materials.filter((m) => {
    if (!showInactive && !m.active) return false;
    return matchScope(m.siteId, entrySiteId(state), scope);
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
  const { fullState: state, upsertCatalogItem, setCatalogActive } = useStore();
  if (!CATALOG_SHEETS.includes(sheet as (typeof CATALOG_SHEETS)[number])) {
    return null;
  }
  const key = sheet as (typeof CATALOG_SHEETS)[number];
  const rows = (state.masterCatalog[key] as CatalogItem[]).filter((r) => {
    if (!showInactive && !r.active) return false;
    return matchScope(r.siteId, entrySiteId(state), scope);
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
