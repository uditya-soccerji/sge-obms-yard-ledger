"use client";

import { CENTRAL_STORE, isCentralStore } from "@/lib/site-scope";
import React, { createContext, useContext, useMemo, useState } from "react";
import { BlurInput } from "@/components/shared/blur-input";
import { normalizeEp } from "@/lib/ep";
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
import { canAccessMasterData, masterSheetsFor } from "@/lib/desk";
import { ROLES } from "@/lib/roles";
import { useStore } from "@/lib/store";
import { useWork } from "@/lib/work/store";
import { missingFields } from "@/lib/labourers";
import { rilStatusProblem, SKILL_LEVELS } from "@/lib/labour-import";
import { LabourImport } from "./labour-import";
import { buildPlantDetails, parseRpTags, plantRp, sitePlantDetails } from "@/lib/sites";
import type { CatalogItem, MasterCatalog, MaterialItem } from "@/lib/master/types";
import type { ExperienceLevel, Labourer, PlantDetail, RoleId, Site, SkillLevel, UserAccount } from "@/lib/types";
import { EXPERIENCE_LEVELS, experienceLabel, suggestedWage } from "@/lib/wages";
import { ExcelTransfer } from "./excel-transfer";
import { canExcelTransfer } from "@/lib/excel-io";
import { entrySiteId } from "@/lib/site-scope";
import { checkSeat, checkSites, MIN_PASSWORD } from "@/lib/users";
import type { StaffMember, WageChangeRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

type ScopeFilter = "site" | "company" | "all";

/** Sheets report save results here; the desk shows the latest problem */
const DeskMsg = createContext<(msg: string | null) => void>(() => {});
function useReport() {
  const set = useContext(DeskMsg);
  return (r: { ok: boolean; error?: string }) => set(r.ok ? null : r.error ?? "Couldn't save");
}

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function MasterDesk() {
  const params = useSearchParams();
  const router = useRouter();
  const { fullState: state, currentAccount } = useStore();
  const allowed = masterSheetsFor(state.currentRole);
  const sheets = MASTER_SHEETS.filter((s) => allowed === "all" || allowed.includes(s.id));
  const asked = params.get("sheet") as MasterSheetId | null;
  // Admin sees only Trades and Rate book (M3); an unknown or off-limits sheet opens the first allowed one
  const sheet: MasterSheetId = asked && sheets.some((s) => s.id === asked) ? asked : sheets[0]?.id ?? "sites";
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [showInactive, setShowInactive] = useState(true);
  const [deskMsg, setDeskMsg] = useState<string | null>(null);

  if (!canAccessMasterData(state.currentRole)) {
    return null;
  }

  const meta = sheets.find((s) => s.id === sheet) ?? sheets[0];

  return (
    <div className="sge-enter space-y-4">
      <SectionHeader
        title="Master Data"
        subtitle={
          allowed === "all"
            ? "Owner & Super Admin. Deactivate instead of delete. Site rows first; company-wide fills the rest. Dropdowns elsewhere read this store."
            : state.currentRole === "store"
              ? "Store: the materials list (view). Owner / Super Admin add or change materials."
              : "Admin: trades, daily wages, the rate book, materials and units. Other sheets are Owner / Super Admin."
        }
      />
      <div className="flex flex-wrap gap-1 border-b border-[var(--sge-line)] pb-2">
        {sheets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setDeskMsg(null);
              router.replace(`/master-data?sheet=${s.id}`);
            }}
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
      {deskMsg ? (
        <div className="rounded-sm border border-[var(--sge-crit)]/30 bg-[var(--sge-crit-wash)] px-3 py-2 text-sm text-[var(--sge-crit)]">
          {deskMsg}
        </div>
      ) : null}
      <DeskMsg.Provider value={setDeskMsg}>
        <SheetBody sheet={sheet} scope={scope} showInactive={showInactive} />
      </DeskMsg.Provider>
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
  const body =
    sheet === "sites" ? (
      <SitesSheet showInactive={showInactive} />
    ) : sheet === "users" ? (
      <UsersSheet showInactive={showInactive} />
    ) : sheet === "labourers" ? (
      <LabourSheet scope={scope} showInactive={showInactive} />
    ) : sheet === "contractors" ? (
      <ContractorsSheet scope={scope} showInactive={showInactive} />
    ) : sheet === "trades" ? (
      <TradesSheet scope={scope} showInactive={showInactive} />
    ) : sheet === "wageBands" ? (
      <WageBandsSheet showInactive={showInactive} />
    ) : sheet === "rateBook" ? (
      <RatesSheet scope={scope} showInactive={showInactive} />
    ) : sheet === "materials" ? (
      <MaterialsSheet scope={scope} showInactive={showInactive} />
    ) : (
      <CatalogSheet sheet={sheet} scope={scope} showInactive={showInactive} />
    );
  return (
    <>
      <ExcelTransfer sheet={sheet} />
      {body}
    </>
  );
}

function SitesSheet({ showInactive }: { showInactive: boolean }) {
  const { fullState: state, upsertSite } = useStore();
  const report = useReport();
  const rows = state.sites.filter((s) => showInactive || s.enabled);
  const [draft, setDraft] = useState<Site | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

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
          onChange={setDraft}
          error={formErr}
          onSave={async () => {
            const r = await upsertSite({
              ...draft,
              code: draft.code.toUpperCase(),
              plantDetails: buildPlantDetails(draft.plants, sitePlantDetails(draft)),
            });
            if (!r.ok) return setFormErr(r.error ?? "Couldn't save");
            setFormErr(null);
            setDraft(null);
          }}
          onCancel={() => {
            setFormErr(null);
            setDraft(null);
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
              <td>
                <StatusPill tone={s.enabled ? "ok" : "default"}>
                  {s.enabled ? "active" : "switched off · read only"}
                </StatusPill>
              </td>
              <td className="text-right">
                <Button size="sm" variant="outline" onClick={() => setDraft(s)}>
                  Edit
                </Button>{" "}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => report(await upsertSite({ ...s, enabled: !s.enabled }))}
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
  error,
}: {
  value: Site;
  onChange: (s: Site) => void;
  onSave: () => void;
  onCancel: () => void;
  error?: string | null;
}) {
  // Typed as text so a trailing comma survives while typing; split on save
  const [plantsText, setPlantsText] = useState(value.plants.join(", "));
  const [rpText, setRpText] = useState(value.rpTags.join(", "));
  return (
    <div className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-2">
      <div>
        <Label>Code</Label>
        <Input
          className="mt-1"
          value={value.code}
          placeholder="2–6 capitals, e.g. DTA"
          onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
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
        <Label>Plants (comma between each)</Label>
        <Input
          className="mt-1"
          value={plantsText}
          onChange={(e) => {
            setPlantsText(e.target.value);
            onChange({
              ...value,
              plants: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            });
          }}
        />
      </div>
      <div className="sm:col-span-2">
        <Label>RPs run at this site (comma between each)</Label>
        <Input
          className="mt-1"
          value={rpText}
          placeholder="e.g. RP2, RP5"
          onChange={(e) => {
            setRpText(e.target.value);
            onChange({ ...value, rpTags: parseRpTags(e.target.value) });
          }}
        />
      </div>
      {value.plants.length ? (
        <div className="sm:col-span-2">
          <PlantDetailsEditor
            plants={value.plants}
            rpTags={value.rpTags}
            details={value.plantDetails ?? []}
            onDetails={(plantDetails) => onChange({ ...value, plantDetails })}
          />
        </div>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {error ? <span className="self-center text-xs text-[var(--sge-crit)]">{error}</span> : null}
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
  // Only a Super Admin grants or touches Super Admin (M2)
  const roleChoices = ROLES.filter((r) => isSa || r.id !== "super_admin");
  const [showPw, setShowPw] = useState(false);
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
          <div className="mt-1 flex gap-1">
            <Input
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD} characters`}
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowPw((v) => !v)}>
              {showPw ? "Hide" : "Show"}
            </Button>
          </div>
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onValueChange={(v) => pickRole(v as RoleId)}>
            <SelectTrigger className="mt-1 rounded-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleChoices.map((r) => (
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
              canEdit={canEdit && (isSa || !u.roles.includes("super_admin"))}
              isMe={u.id === state.currentAccountId}
              onToggle={async () => {
                const r = await updateUser(u.id, { active: !u.active });
                if (!r.ok) setMsg({ ok: false, text: r.error ?? "Failed" });
              }}
              onResetPassword={async (pw) => {
                const r = await setUserPassword(u.id, pw);
                setMsg({
                  ok: r.ok,
                  text: r.ok ? `Password reset for @${u.username}` : r.error ?? "Failed",
                });
                return r.ok;
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
              onCentral={(on) => {
                // Round 2 (§27): a central store login works across every site
                const rest = u.permissionOverrides.filter((o) => !(o.module === "store" && o.action === "admin"));
                void updateUser(u.id, { permissionOverrides: on ? [...rest, { ...CENTRAL_STORE }] : rest, ...(on ? { siteIds: state.sites.map((x) => x.id) } : {}) }).then((r) => {
                  setMsg(r.ok ? { ok: true, text: `@${u.username} ${on ? "is now a central store (all sites)" : "is a site store again"}` } : { ok: false, text: r.error ?? "Failed" });
                });
              }}
              onLink={(staffId) => {
                void updateUser(u.id, { staffId }).then((r) => {
                  if (!r.ok) setMsg({ ok: false, text: r.error ?? "Failed" });
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
  isMe,
  onToggle,
  onResetPassword,
  onSites,
  onViewAs,
  onLink,
  onCentral,
}: {
  user: UserAccount;
  isSa: boolean;
  canEdit: boolean;
  isMe: boolean;
  onToggle: () => void;
  /** Resolves true when the password was changed */
  onResetPassword: (password: string) => Promise<boolean>;
  /** Returns an error message, or null when saved */
  onSites: (ids: string[]) => string | null;
  onViewAs: () => void;
  onLink: (staffId: string) => void;
  onCentral: (on: boolean) => void;
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
  const [pwOpen, setPwOpen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
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
        {user.roles.includes("store") ? (
          <label className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--sge-ink-2)]">
            <input
              type="checkbox"
              aria-label={`@${user.username} central store`}
              disabled={!canEdit}
              checked={isCentralStore(user)}
              onChange={(e) => onCentral(e.target.checked)}
            />
            Central store (all sites)
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
        <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setPwOpen((v) => !v)}>
          Reset password
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!canEdit || (isMe && user.active)}
          title={isMe && user.active ? "You can't deactivate yourself" : undefined}
          onClick={onToggle}
        >
          {user.active ? "Deactivate" : "Activate"}
        </Button>
        {pwOpen ? (
          <form
            className="mt-2 flex flex-wrap items-center justify-end gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pw1.length < MIN_PASSWORD) return setPwErr(`At least ${MIN_PASSWORD} characters`);
              if (pw1 !== pw2) return setPwErr("The two passwords don't match");
              setPwErr(null);
              if (await onResetPassword(pw1)) {
                setPw1("");
                setPw2("");
                setPwOpen(false);
              }
            }}
          >
            <Input type="password" autoComplete="new-password" className="h-8 w-36" placeholder="New password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            <Input type="password" autoComplete="new-password" className="h-8 w-36" placeholder="Type it again" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            <Button type="submit" size="sm">Save</Button>
            {pwErr ? <span className="w-full text-right text-xs text-[var(--sge-crit)]">{pwErr}</span> : null}
          </form>
        ) : null}
      </td>
    </tr>
  );
}

/** HR's Labourers screen (round 2): the Master Data register on its own, for the site in view */
export function LabourRegister() {
  const [showInactive, setShowInactive] = useState(true);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-heading text-xl font-bold uppercase tracking-wide">Labourers</h2>
          <p className="text-sm text-[var(--sge-ink-3)]">Add, edit, deactivate or re-activate labourers; upload a CSV for many at once. Crews are changed by the SIC.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>
      <LabourSheet scope="all" showInactive={showInactive} />
    </div>
  );
}

function LabourSheet({
  scope,
  showInactive,
}: {
  scope: ScopeFilter;
  showInactive: boolean;
}) {
  const { fullState: state, updateLabourer, addLabourer, removeLabourer, assignCrew, removeFromCrew } = useStore();
  const report = useReport();
  const { notify } = useWork();
  const staffName = (id: string) => state.staff.find((x) => x.id === id)?.name ?? id;
  /** A supervisor change here is a crew change: logged and notified (docs §23) */
  function setSupervisor(l: Labourer, supervisorId: string) {
    if (supervisorId === l.supervisorId) return;
    const r = supervisorId ? assignCrew([l.id], supervisorId) : removeFromCrew(l.id);
    report(r);
    if (!r.ok) return;
    notify({
      kind: "crew_changed",
      siteId: l.siteId,
      problem: !!l.supervisorId,
      subjectStaffId: l.supervisorId || supervisorId,
      alsoStaffId: supervisorId || undefined,
      title: supervisorId ? `${l.name} → ${staffName(supervisorId)}'s crew` : `${l.name} taken off ${staffName(l.supervisorId)}'s crew`,
      detail: l.supervisorId ? `Was with ${staffName(l.supervisorId)} · changed in Master Data` : "Was unassigned · changed in Master Data",
      tab: "/operations?p=crew",
      refId: l.id,
    });
  }
  const [q, setQ] = useState("");
  const contractors = state.masterCatalog.contractors.filter((c) => c.active);
  const trades = state.tradeCatalogue.filter((t) => t.active);
  const activeSite = entrySiteId(state);
  // Aadhaar is private: Owner, Super Admin and HR only (docs §1)
  const seesAadhaar = ["owner", "super_admin", "hr"].includes(state.currentRole ?? "");
  const canDelete = state.currentRole === "owner" || state.currentRole === "super_admin";
  // A supervisor change is a crew change: SIC / Owner / SA only (HR edits everything else)
  const movesCrew = ["sic", "owner", "super_admin"].includes(state.currentRole ?? "");
  const supervisorsOn = (siteId: string) => state.staff.filter((x) => x.role === "supervisor" && x.siteId === siteId);
  const siteCode = (id: string) => state.sites.find((s) => s.id === id)?.code ?? id;
  const rows = useMemo(() => {
    return state.labourers.filter((l) => {
      if (!showInactive && !l.active) return false;
      if (!matchScope(l.siteId, activeSite, scope)) return false;
      if (!q.trim()) return true;
      const hay = `${l.name} ${l.epNumber} ${l.trade} ${l.skill ?? ""} ${l.eic ?? ""} ${l.rilStatus ?? ""} ${(l.epHistory ?? []).map((h) => h.ep).join(" ")}`.toLowerCase();
      return hay.includes(q.trim().toLowerCase());
    });
  }, [state.labourers, activeSite, scope, showInactive, q]);

  const blank = () => ({
    name: "",
    epNumber: "",
    aadhaar: "",
    mobile: "",
    trade: trades[0]?.id ?? "",
    tradeSubcategory: "",
    skill: "" as "" | SkillLevel,
    experience: "" as "" | ExperienceLevel,
    contractorId: "",
    siteId: activeSite,
    supervisorId: "",
    wageDaily: "",
  });
  const [form, setForm] = useState<ReturnType<typeof blank> | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((f) => (f ? { ...f, ...patch } : f));

  function applyTableRate(next: Partial<ReturnType<typeof blank>>) {
    if (!form) return;
    const trade = next.trade ?? form.trade;
    const skill = (next.skill !== undefined ? next.skill : form.skill) || undefined;
    const experience = (next.experience !== undefined ? next.experience : form.experience) || undefined;
    const sug = suggestedWage(state.wageBands, trade, skill as SkillLevel | undefined, experience as ExperienceLevel | undefined);
    const clearSub =
      next.trade !== undefined && next.trade !== form.trade
        ? { tradeSubcategory: "" }
        : {};
    set({ ...next, ...clearSub, ...(sug != null ? { wageDaily: String(sug) } : {}) });
  }

  function save() {
    if (!form) return;
    const tradeDef = trades.find((t) => t.id === form.trade);
    if (tradeDef && tradeDef.subcategories.length > 0 && !form.tradeSubcategory) {
      return setFormErr("Pick a trade sub-type for this trade");
    }
    const r = addLabourer({
      name: form.name,
      epNumber: form.epNumber,
      aadhaar: form.aadhaar.trim() || undefined,
      mobile: form.mobile.trim() || undefined,
      trade: form.trade,
      tradeSubcategory: form.tradeSubcategory || undefined,
      skill: form.skill || undefined,
      experience: form.experience || undefined,
      gatePass: "",
      siteId: form.siteId,
      supervisorId: form.supervisorId,
      contractorId: form.contractorId,
      wageDaily: Number(form.wageDaily),
      equipmentIds: [],
      active: true,
    });
    if (!r.ok) return setFormErr(r.error ?? "Couldn't add");
    setFormErr(null);
    setForm(null);
  }

  const sel = "h-8 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs";
  // B10: fixed minimum widths; cells may shrink, the register scrolls sideways on small screens
  const cols = "grid-cols-[minmax(10rem,1.3fr)_minmax(7rem,0.8fr)_minmax(6.5rem,0.6fr)_minmax(6.5rem,0.6fr)_minmax(8rem,0.8fr)_minmax(8rem,0.9fr)_minmax(8.5rem,0.9fr)_3.5rem_minmax(7rem,0.7fr)_4.5rem_6.5rem] [&>*]:min-w-0";
  const [importing, setImporting] = useState(false);

  function setSkillOrExp(l: Labourer, patch: { skill?: Labourer["skill"]; experience?: Labourer["experience"] }) {
    const next = { ...l, ...patch };
    const oldSug = suggestedWage(state.wageBands, l.trade, l.skill, l.experience);
    const sug = suggestedWage(state.wageBands, next.trade, next.skill, next.experience);
    // Apply the table rate when wage was empty or still equal to the previous table rate
    const apply = sug != null && (l.wageDaily === 0 || (oldSug != null && l.wageDaily === oldSug));
    report(updateLabourer(l.id, { ...patch, ...(apply ? { wageDaily: sug } : {}) }));
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
        <Button size="sm" onClick={() => setForm(form ? null : blank())}>
          {form ? "Close form" : "Add labourer"}
        </Button>
        {/* Round 2: HR uploads labourers from its own Labourers screen too */}
        {canExcelTransfer(state.currentRole) || state.currentRole === "hr" ? (
          <Button size="sm" variant="outline" onClick={() => setImporting(!importing)}>
            {importing ? "Close CSV" : "Upload CSV (RIL)"}
          </Button>
        ) : null}
        <span className="text-xs text-[var(--sge-ink-3)]">{rows.length} rows</span>
      </div>
      {form ? (
        <div className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-4">
          <div>
            <Label>Name</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>EP</Label>
            <Input className="mt-1 font-mono" placeholder="PP + 10 digits" value={form.epNumber} onChange={(e) => set({ epNumber: e.target.value.toUpperCase() })} />
          </div>
          {seesAadhaar ? (
            <div>
              <Label>Aadhaar (optional)</Label>
              <Input className="mt-1 font-mono" inputMode="numeric" maxLength={12} value={form.aadhaar} onChange={(e) => set({ aadhaar: e.target.value.replace(/\D/g, "") })} />
            </div>
          ) : null}
          <div>
            <Label>Mobile (optional)</Label>
            <Input className="mt-1 font-mono" inputMode="numeric" maxLength={10} value={form.mobile} onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div>
            <Label>Trade</Label>
            <select className={cn(sel, "mt-1 h-9")} value={form.trade} onChange={(e) => applyTableRate({ trade: e.target.value })}>
              {trades.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          {(() => {
            const subs = trades.find((t) => t.id === form.trade)?.subcategories ?? [];
            if (!subs.length) return null;
            return (
              <div>
                <Label>Trade type</Label>
                <select
                  className={cn(sel, "mt-1 h-9")}
                  value={form.tradeSubcategory}
                  onChange={(e) => set({ tradeSubcategory: e.target.value })}
                >
                  <option value="">Pick…</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            );
          })()}
          <div>
            <Label>Skill</Label>
            <select
              className={cn(sel, "mt-1 h-9")}
              value={form.skill}
              onChange={(e) => applyTableRate({ skill: (e.target.value || "") as "" | SkillLevel })}
            >
              <option value="">—</option>
              {SKILL_LEVELS.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Experience</Label>
            <select
              className={cn(sel, "mt-1 h-9")}
              value={form.experience}
              onChange={(e) => applyTableRate({ experience: (e.target.value || "") as "" | ExperienceLevel })}
            >
              <option value="">—</option>
              {EXPERIENCE_LEVELS.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Contractor</Label>
            <select className={cn(sel, "mt-1 h-9")} value={form.contractorId} onChange={(e) => set({ contractorId: e.target.value })}>
              <option value="">Pick…</option>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Site</Label>
            <select className={cn(sel, "mt-1 h-9")} value={form.siteId} onChange={(e) => set({ siteId: e.target.value, supervisorId: "" })}>
              {state.sites.filter((s) => s.enabled).map((s) => (
                <option key={s.id} value={s.id}>{s.code}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Supervisor</Label>
            <select className={cn(sel, "mt-1 h-9")} value={form.supervisorId} onChange={(e) => set({ supervisorId: e.target.value })}>
              <option value="">Pick…</option>
              {supervisorsOn(form.siteId).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Daily wage ₹</Label>
            <Input className="mt-1" type="number" min={1} value={form.wageDaily} onChange={(e) => set({ wageDaily: e.target.value })} />
            {(() => {
              const sug = suggestedWage(
                state.wageBands,
                form.trade,
                form.skill || undefined,
                form.experience || undefined
              );
              if (sug == null) return <p className="mt-1 text-[10px] text-[var(--sge-ink-3)]">No table rate for this skill × experience — type the wage, or add a row under Daily wages.</p>;
              const same = Number(form.wageDaily) === sug;
              return (
                <p className="mt-1 text-[10px] text-[var(--sge-ink-3)]">
                  Table rate ₹{sug}
                  {same ? " (applied)" : (
                    <>
                      {" · "}
                      <button type="button" className="underline" onClick={() => set({ wageDaily: String(sug) })}>
                        Use table rate
                      </button>
                    </>
                  )}
                </p>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 sm:col-span-4">
            <Button size="sm" onClick={save}>Add to register</Button>
            {formErr ? <span className="text-xs text-[var(--sge-crit)]">{formErr}</span> : null}
          </div>
        </div>
      ) : null}
      {importing ? <LabourImport onClose={() => setImporting(false)} /> : null}
      <div className="overflow-x-auto">
      <div className="min-w-[1280px]">
      <div className={cn("grid gap-2 border-b border-[var(--sge-line)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sge-ink-3)]", cols)}>
        <span>Name</span>
        <span>Trade</span>
        <span>Skill</span>
        <span>Experience</span>
        <span>Contractor</span>
        <span>Supervisor</span>
        <span>EP</span>
        <span>Site</span>
        <span>RIL pass · EIC</span>
        <span>Wage</span>
        <span />
      </div>
      <VirtualRows
        rows={rows}
        rowHeight={44}
        height={Math.min(520, Math.max(180, rows.length * 44 + 8))}
        render={(l: Labourer) => (
          <div className={cn("grid h-full items-center gap-2 border-b border-[var(--sge-line)] px-2 text-sm", cols)}>
            <div className="flex min-w-0 items-center gap-1">
              <BlurInput value={l.name} onSave={(v) => report(updateLabourer(l.id, { name: v }))} />
              {missingFields(l).length ? (
                <span title={`Still to fill: ${missingFields(l).join(", ")}`} className="shrink-0 rounded-sm bg-[var(--sge-warn-wash)] px-1 text-[10px] font-semibold text-[var(--sge-brass-ink)]">
                  {missingFields(l).length}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 space-y-0.5">
              <select
                className={sel}
                aria-label={`Trade for ${l.name}`}
                value={l.trade}
                onChange={(e) => {
                  const trade = e.target.value;
                  const oldSug = suggestedWage(state.wageBands, l.trade, l.skill, l.experience);
                  const sug = suggestedWage(state.wageBands, trade, l.skill, l.experience);
                  const apply = sug != null && (l.wageDaily === 0 || (oldSug != null && l.wageDaily === oldSug));
                  report(updateLabourer(l.id, { trade, tradeSubcategory: undefined, ...(apply ? { wageDaily: sug! } : {}) }));
                }}
              >
                {trades.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              {(() => {
                const subs = trades.find((t) => t.id === l.trade)?.subcategories ?? [];
                if (!subs.length) return null;
                return (
                  <select
                    className={sel}
                    aria-label={`Trade type for ${l.name}`}
                    value={l.tradeSubcategory ?? ""}
                    onChange={(e) => report(updateLabourer(l.id, { tradeSubcategory: e.target.value || undefined }))}
                  >
                    <option value="">Type…</option>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                );
              })()}
            </div>
            <select
              aria-label={`Skill for ${l.name}`}
              className={sel}
              value={l.skill ?? ""}
              onChange={(e) => setSkillOrExp(l, { skill: (e.target.value || undefined) as Labourer["skill"] })}
            >
              <option value="">—</option>
              {SKILL_LEVELS.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
            <select
              aria-label={`Experience for ${l.name}`}
              className={sel}
              value={l.experience ?? ""}
              onChange={(e) => setSkillOrExp(l, { experience: (e.target.value || undefined) as Labourer["experience"] })}
            >
              <option value="">—</option>
              {EXPERIENCE_LEVELS.map((x) => (
                <option key={x.id} value={x.id}>{x.label}</option>
              ))}
            </select>
            <select className={sel} value={l.contractorId ?? ""} onChange={(e) => report(updateLabourer(l.id, { contractorId: e.target.value }))}>
              {contractors.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select aria-label={`Supervisor for ${l.name}`} className={sel} disabled={!movesCrew} title={movesCrew ? undefined : "Crews are changed by the SIC (Operations → Crews)"} value={l.supervisorId} onChange={(e) => setSupervisor(l, e.target.value)}>
              <option value="">—</option>
              {supervisorsOn(l.siteId).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
            <span title={l.epHistory?.length ? `Old EPs: ${l.epHistory.map((h) => `${h.ep} (until ${h.until})`).join(", ")}` : undefined}>
              <BlurInput
                className="font-mono text-xs"
                value={l.epNumber}
                onSave={(v) => report(updateLabourer(l.id, { epNumber: normalizeEp(v) ?? v }))}
              />
            </span>
            <span className="text-xs">{siteCode(l.siteId)}</span>
            <span className="truncate text-[11px]" title={[l.rilStatus && `RIL pass: ${l.rilStatus}`, l.rilArea && `Area: ${l.rilArea}`, l.eic && `EIC: ${l.eic}`].filter(Boolean).join(" · ") || undefined}>
              {l.rilStatus ? (
                <span className={rilStatusProblem(l.rilStatus) ? "font-semibold text-[var(--sge-crit)]" : "text-[var(--sge-ok)]"}>{l.rilStatus}</span>
              ) : (
                <span className="text-[var(--sge-ink-3)]">—</span>
              )}
              {l.eic ? <span className="block truncate text-[var(--sge-ink-3)]">{l.eic}</span> : null}
            </span>
            <div className="min-w-0">
              <BlurInput
                type="number"
                min={1}
                value={String(l.wageDaily)}
                onSave={(v) => report(updateLabourer(l.id, { wageDaily: Number(v) || 0 }))}
              />
              {(() => {
                const sug = suggestedWage(state.wageBands, l.trade, l.skill, l.experience);
                if (sug == null || sug === l.wageDaily) return null;
                return (
                  <button
                    type="button"
                    className="block text-[10px] text-[var(--sge-brass-ink)] underline"
                    title={`Table rate ₹${sug}`}
                    onClick={() => report(updateLabourer(l.id, { wageDaily: sug }))}
                  >
                    Table ₹{sug}
                  </button>
                );
              })()}
            </div>
            <div className="flex">
              <Button size="sm" variant="ghost" onClick={() => report(updateLabourer(l.id, { active: !l.active }))}>
                {l.active ? "Deactivate" : "Activate"}
              </Button>
              {canDelete ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[var(--sge-crit)]"
                  onClick={() => {
                    if (window.confirm(`Delete ${l.name} from the register? This can't be undone.`)) report(removeLabourer(l.id));
                  }}
                >
                  Del
                </Button>
              ) : null}
            </div>
          </div>
        )}
      />
      </div>
      </div>
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
  const { fullState: state, upsertContractor, setContractorActive } = useStore();
  const report = useReport();
  const rows = state.masterCatalog.contractors.filter((c) => {
    if (!showInactive && !c.active) return false;
    return matchScope(c.siteId, entrySiteId(state), scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={async () =>
            report(
              await upsertContractor({
                id: uid("con"),
                siteId: entrySiteId(state),
                code: "NEW",
                name: "New contractor",
                active: true,
              })
            )
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
                <BlurInput value={c.name} onSave={async (v) => report(await upsertContractor({ ...c, name: v }))} />
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
                  onClick={async () => report(await setContractorActive(c.id, !c.active))}
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
  const report = useReport();
  const [newTrade, setNewTrade] = useState("");
  const [subFor, setSubFor] = useState<string>("");
  const [newSub, setNewSub] = useState("");
  const rows = state.tradeCatalogue.filter((t) => {
    if (!showInactive && !t.active) return false;
    return matchScope(t.siteId ?? null, entrySiteId(state), scope);
  });

  function addSubcategory(tradeId: string, label: string) {
    const trade = state.tradeCatalogue.find((t) => t.id === tradeId);
    if (!trade) return report({ ok: false, error: "Trade not found" });
    const name = label.trim();
    if (!name) return report({ ok: false, error: "Sub-type name is required" });
    if (trade.subcategories.some((s) => s.label.toLowerCase() === name.toLowerCase())) {
      return report({ ok: false, error: "That sub-type already exists" });
    }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || uid("sub");
    report(
      updateTrade(tradeId, {
        subcategories: [...trade.subcategories, { id, label: name }],
      })
    );
  }

  return (
    <Panel>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">
        Trades appear on the labourer register and the daily wage table. Examples: Painter, Blaster, Spray Painter, Scaffolder. Optional sub-types (e.g. Driver → LMV / HMV) show when that trade is picked.
      </p>
      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const r = addTrade({ label: newTrade, subcategories: [], active: true, siteId: null });
          report(r);
          if (r.ok) setNewTrade("");
        }}
      >
        <div>
          <Label className="text-[10px] uppercase tracking-wider">New trade</Label>
          <Input
            className="mt-1 h-8 w-56"
            placeholder="e.g. Spray Painter"
            value={newTrade}
            onChange={(e) => setNewTrade(e.target.value)}
          />
        </div>
        <Button size="sm" type="submit">
          Add trade
        </Button>
      </form>
      <form
        className="mb-4 flex flex-wrap items-end gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!subFor) return report({ ok: false, error: "Pick a trade first" });
          addSubcategory(subFor, newSub);
          setNewSub("");
        }}
      >
        <div>
          <Label className="text-[10px] uppercase tracking-wider">Add sub-type to</Label>
          <select
            className="mt-1 h-8 w-48 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs"
            value={subFor}
            onChange={(e) => setSubFor(e.target.value)}
          >
            <option value="">Pick trade…</option>
            {rows.filter((t) => t.active).map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider">Sub-type name</Label>
          <Input className="mt-1 h-8 w-48" placeholder="e.g. LMV" value={newSub} onChange={(e) => setNewSub(e.target.value)} />
        </div>
        <Button size="sm" type="submit" variant="outline">
          Add sub-type
        </Button>
      </form>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
            <th className="py-2">Trade</th>
            <th>Sub-types</th>
            <th>Scope</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={cn("border-t border-[var(--sge-line)]", !t.active && "opacity-50")}>
              <td className="py-2">
                <BlurInput value={t.label} onSave={(v) => report(updateTrade(t.id, { label: v }))} />
                <div className="font-mono text-[10px] text-[var(--sge-ink-3)]">{t.id}</div>
              </td>
              <td className="text-xs">
                {t.subcategories.length
                  ? t.subcategories.map((s) => s.label).join(", ")
                  : <span className="text-[var(--sge-ink-3)]">—</span>}
              </td>
              <td className="text-xs">{t.siteId ? "Site" : "Company"}</td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => report(updateTrade(t.id, { active: !t.active }))}
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

function WageBandsSheet({ showInactive }: { showInactive: boolean }) {
  const { fullState: state, upsertWageBand, setWageBandActive, decideWageChange } = useStore();
  const report = useReport();
  const { notify } = useWork();
  // Owner rule (2026-10-24): the Admin's changes are requests; Owner / SA approve before a rate changes
  const isAdmin = state.currentRole === "admin";
  const isBoss = state.currentRole === "owner" || state.currentRole === "super_admin";
  const [decideNote, setDecideNote] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(null);
  const tradeLabel = (id: string) => state.tradeCatalogue.find((t) => t.id === id)?.label ?? id;
  const skillLabelOf = (id: string) => SKILL_LEVELS.find((x) => x.id === id)?.label ?? id;
  const describe = (r: WageChangeRequest) =>
    `${tradeLabel(r.tradeId)} · ${skillLabelOf(r.skill)} · ${experienceLabel(r.experience)}: ${r.active !== undefined ? (r.active ? "switch on" : "switch off") : r.fromWage != null ? `₹${r.fromWage} → ₹${r.toWage}` : `new rate ₹${r.toWage}`}`;
  const pending = state.wageChangeRequests.filter((r) => r.status === "pending");
  const recent = state.wageChangeRequests.filter((r) => r.status !== "pending").slice(0, 5);
  const waitingFor = (bandId: string) => pending.find((r) => r.bandId === bandId);
  /** Save, or — for the Admin — send the change for approval */
  function send(r: { ok: boolean; error?: string; requested?: boolean; id?: string }, what: string) {
    if (r.ok && r.requested) {
      notify({ kind: "wage_change_requested", problem: true, siteId: "", subjectStaffId: state.currentUserId ?? undefined, title: `Wage change to approve: ${what}`, detail: `Asked by ${state.users.find((u) => u.id === state.currentAccountId)?.name ?? "Admin"}`, tab: "/master-data?sheet=wageBands", refId: r.id });
      setInfo("Sent to the Owner / Super Admin — the rate changes when they approve.");
      return;
    }
    setInfo(null);
    report(r);
  }
  function decide(r: WageChangeRequest, approve: boolean) {
    const res = decideWageChange(r.id, approve, decideNote[r.id] ?? "");
    report(res);
    if (res.ok) setInfo(approve ? "Approved — the rate is updated." : "Rejected — the Admin is told.");
    if (res.ok) notify({ kind: "wage_change_decided", problem: !approve, siteId: "", subjectStaffId: r.requestedBy, title: `Wage change ${approve ? "approved" : "rejected"}: ${describe(r)}`, detail: decideNote[r.id]?.trim() || (approve ? "Rate updated" : ""), tab: "/master-data?sheet=wageBands", refId: r.id });
  }
  const trades = state.tradeCatalogue.filter((t) => t.active);
  const [tradeId, setTradeId] = useState(trades[0]?.id ?? "");
  const [skill, setSkill] = useState<SkillLevel>("skilled");
  const [experience, setExperience] = useState<ExperienceLevel>("experienced");
  const [dailyWage, setDailyWage] = useState("");
  const rows = state.wageBands
    .filter((b) => showInactive || b.active)
    .filter((b) => !tradeId || b.tradeId === tradeId)
    .sort((a, b) => a.tradeId.localeCompare(b.tradeId) || a.skill.localeCompare(b.skill) || a.experience.localeCompare(b.experience));

  return (
    <Panel>
      <p className="mb-3 text-xs text-[var(--sge-ink-3)]">
        Default ₹ per day for a trade at a skill and experience level. The labourer register uses this when you pick skill and experience; you can still type a different wage on the person.
      </p>
      {isAdmin ? (
        <p className="mb-3 rounded-sm border border-[var(--sge-warn)]/40 bg-[var(--sge-warn-wash)] px-3 py-2 text-xs text-[var(--sge-warn)]">
          Your changes go to the Owner / Super Admin as a request. A rate changes only after they approve it.
        </p>
      ) : null}
      {info ? <p className="mb-3 text-sm text-[var(--sge-ok)]">{info}</p> : null}
      {pending.length || (isAdmin && recent.length) ? (
        <div className="mb-4 rounded-sm border border-[var(--sge-line)] p-3">
          <div className="mb-2 font-heading text-xs font-bold uppercase tracking-wide">
            Wage change requests {pending.length ? `· ${pending.length} waiting` : ""}
          </div>
          <div className="space-y-1.5">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-sm bg-[var(--sge-warn-wash)] px-1.5 text-[11px] font-semibold uppercase text-[var(--sge-warn)]">waiting</span>
                <span className="font-semibold">{describe(r)}</span>
                <span className="text-xs text-[var(--sge-ink-3)]">by {r.requestedByName} · {r.requestedAt.slice(0, 10)}</span>
                {isBoss ? (
                  <span className="ml-auto flex items-center gap-1">
                    <Input aria-label="Reason" className="h-8 w-44" placeholder="Reason (to reject)" value={decideNote[r.id] ?? ""} onChange={(e) => setDecideNote({ ...decideNote, [r.id]: e.target.value })} />
                    <Button size="sm" variant="outline" onClick={() => decide(r, false)}>Reject</Button>
                    <Button size="sm" onClick={() => decide(r, true)}>Approve</Button>
                  </span>
                ) : null}
              </div>
            ))}
            {isAdmin
              ? recent.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-[var(--sge-ink-2)]">
                    <span className={cn("rounded-sm px-1.5 font-semibold uppercase", r.status === "approved" ? "bg-[var(--sge-ok-wash)] text-[var(--sge-ok)]" : "bg-[var(--sge-crit-wash)] text-[var(--sge-crit)]")}>{r.status}</span>
                    {describe(r)}
                    {r.decidedNote ? ` · ${r.decidedNote}` : ""}
                  </div>
                ))
              : null}
          </div>
        </div>
      ) : null}
      <form
        className="mb-4 grid gap-2 rounded-sm border border-[var(--sge-line)] bg-[var(--sge-linen)] p-3 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          const r = upsertWageBand({ tradeId, skill, experience, dailyWage: Number(dailyWage) });
          send(r, `${tradeLabel(tradeId)} · ${skillLabelOf(skill)} · ${experienceLabel(experience)} → ₹${dailyWage}`);
          if (r.ok) setDailyWage("");
        }}
      >
        <div>
          <Label>Trade</Label>
          <select className="mt-1 h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs" value={tradeId} onChange={(e) => setTradeId(e.target.value)}>
            {trades.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Skill</Label>
          <select className="mt-1 h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs" value={skill} onChange={(e) => setSkill(e.target.value as SkillLevel)}>
            {SKILL_LEVELS.map((x) => (
              <option key={x.id} value={x.id}>{x.label}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Experience</Label>
          <select className="mt-1 h-9 w-full rounded-sm border border-[var(--sge-line)] bg-[var(--sge-paper)] text-xs" value={experience} onChange={(e) => setExperience(e.target.value as ExperienceLevel)}>
            {EXPERIENCE_LEVELS.map((x) => (
              <option key={x.id} value={x.id}>{x.label} · {x.hint}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Daily wage ₹</Label>
          <Input className="mt-1" type="number" min={1} value={dailyWage} onChange={(e) => setDailyWage(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button size="sm" type="submit">{isAdmin ? "Request change" : "Save rate"}</Button>
        </div>
      </form>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-[var(--sge-ink-3)]">
              <th className="py-2">Trade</th>
              <th>Skill</th>
              <th>Experience</th>
              <th className="text-right">₹ / day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const trade = state.tradeCatalogue.find((t) => t.id === b.tradeId);
              return (
                <tr key={b.id} className={cn("border-t border-[var(--sge-line)]", !b.active && "opacity-50")}>
                  <td className="py-1.5">{trade?.label ?? b.tradeId}</td>
                  <td>{SKILL_LEVELS.find((s) => s.id === b.skill)?.label ?? b.skill}</td>
                  <td title={EXPERIENCE_LEVELS.find((e) => e.id === b.experience)?.hint}>{experienceLabel(b.experience)}</td>
                  <td className="text-right tabular-nums">
                    <div className="flex items-center justify-end gap-2">
                      {waitingFor(b.id) ? (
                        <span className="whitespace-nowrap rounded-sm bg-[var(--sge-warn-wash)] px-1.5 text-[11px] font-semibold text-[var(--sge-warn)]" title={`Waiting for Owner / SA · asked by ${waitingFor(b.id)!.requestedByName}`}>
                          waiting {waitingFor(b.id)!.active !== undefined ? (waitingFor(b.id)!.active ? "on" : "off") : `₹${waitingFor(b.id)!.toWage}`}
                        </span>
                      ) : null}
                      <BlurInput
                        // A request sent: show the current rate again (the tag shows the asked one)
                        key={`${b.id}-${waitingFor(b.id)?.id ?? ""}`}
                        type="number"
                        min={1}
                        className="w-24 text-right"
                        value={String(b.dailyWage)}
                        onSave={(v) => send(upsertWageBand({ ...b, dailyWage: Number(v) || 0 }), `${tradeLabel(b.tradeId)} · ${skillLabelOf(b.skill)} · ${experienceLabel(b.experience)}: ₹${b.dailyWage} → ₹${v}`)}
                      />
                    </div>
                  </td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => send(setWageBandActive(b.id, !b.active), `${tradeLabel(b.tradeId)} · ${skillLabelOf(b.skill)} · ${experienceLabel(b.experience)}: switch ${b.active ? "off" : "on"}`)}>
                      {b.active ? "Off" : "On"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
  const report = useReport();
  // Round 2: the store reads the list; Owner / SA change it
  const readOnly = state.currentRole === "store";
  const rows = state.masterCatalog.materials.filter((m) => {
    if (!showInactive && !m.active) return false;
    return matchScope(m.siteId, entrySiteId(state), scope);
  });
  return (
    <Panel>
      <fieldset disabled={readOnly} className="contents">
      <div className={readOnly ? "hidden" : "mb-3"}>
        <Button
          size="sm"
          onClick={async () =>
            report(await upsertMaterial({
              id: uid("mat"),
              siteId: null,
              code: "Type ",
              label: "New material",
              sapCode: "",
              paintSystem: "",
              uom: "L",
              active: true,
            }))
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
            <th title="Allowed SGE vs RIL difference">Tolerance %</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((m: MaterialItem) => (
            <tr key={m.id} className="border-t border-[var(--sge-line)]">
              <td className="py-1.5 font-mono text-xs">{m.code}</td>
              <td>
                <BlurInput value={m.label} onSave={async (v) => report(await upsertMaterial({ ...m, label: v }))} />
              </td>
              <td className="font-mono text-xs">{m.sapCode || "—"}</td>
              <td className="text-xs">{m.paintSystem}</td>
              <td>
                <BlurInput
                  type="number"
                  min={0}
                  max={50}
                  className="w-20"
                  placeholder="8"
                  value={m.varianceTolerancePct != null ? String(m.varianceTolerancePct) : ""}
                  onSave={async (v) =>
                    report(
                      await upsertMaterial({
                        ...m,
                        varianceTolerancePct: v === "" ? undefined : Math.min(50, Math.max(0, Number(v))),
                      })
                    )
                  }
                />
              </td>
              <td className="text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () =>
                    report(await setCatalogActive("materials", m.id, !m.active))
                  }
                >
                  {m.active ? "Deactivate" : "Activate"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </fieldset>
    </Panel>
  );
}

type CatalogSheetKey = keyof Omit<MasterCatalog, "contractors" | "materials">;
const CATALOG_SHEETS: CatalogSheetKey[] = [
  "dprTypes",
  "activityTemplates",
  "units",
  "storeBooks",
  "fimStages",
  "safetyFormCodes",
  "shiftTypes",
  "attendanceStatuses",
];

function isCatalogSheet(sheet: MasterSheetId): sheet is CatalogSheetKey {
  return (CATALOG_SHEETS as string[]).includes(sheet);
}

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
  const report = useReport();
  if (!isCatalogSheet(sheet)) return null;
  const key: CatalogSheetKey = sheet;
  const rows = (state.masterCatalog[key] as CatalogItem[]).filter((r) => {
    if (!showInactive && !r.active) return false;
    return matchScope(r.siteId, entrySiteId(state), scope);
  });
  return (
    <Panel>
      <div className="mb-3">
        <Button
          size="sm"
          onClick={async () =>
            report(
              await upsertCatalogItem(key, {
                id: uid("cat"),
                siteId: null,
                code: "NEW",
                label: "New row",
                active: true,
              })
            )
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
                <BlurInput value={r.code} onSave={async (v) => report(await upsertCatalogItem(key, { ...r, code: v }))} />
              </td>
              <td>
                <BlurInput value={r.label} onSave={async (v) => report(await upsertCatalogItem(key, { ...r, label: v }))} />
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
                  onClick={async () => report(await setCatalogActive(key, r.id, !r.active))}
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
