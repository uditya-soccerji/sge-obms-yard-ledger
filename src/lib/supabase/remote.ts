import { supabase, usernameToEmail } from "./client";
import type {
  CatalogItem,
  Contractor,
  MasterCatalog,
  MaterialItem,
} from "../master/types";
import type { PermissionOverride, RoleId, Site, UserAccount } from "../types";

interface ProfileRow {
  id: string;
  username: string;
  name: string;
  roles: RoleId[];
  site_ids: string[];
  plant_ids: string[];
  staff_id: string | null;
  labourer_id: string | null;
  permission_overrides: PermissionOverride[];
  active: boolean;
}

interface SiteRow {
  id: string;
  code: string;
  name: string;
  client: string;
  enabled: boolean;
  rp_tags: string[];
  plants: string[];
}

function toAccount(p: ProfileRow): UserAccount {
  return {
    id: p.id,
    username: p.username,
    password: "",
    name: p.name,
    roles: p.roles,
    siteIds: p.site_ids,
    plantIds: p.plant_ids,
    staffId: p.staff_id ?? undefined,
    labourerId: p.labourer_id ?? undefined,
    permissionOverrides: p.permission_overrides ?? [],
    active: p.active,
  };
}

function toSite(s: SiteRow): Site {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    client: s.client,
    enabled: s.enabled,
    rpTags: s.rp_tags,
    plants: s.plants,
  };
}

export interface RemoteSession {
  /** The signed-in user's account. */
  me: UserAccount;
  /** Every profile this user is allowed to see (all for admins, just self otherwise). */
  users: UserAccount[];
  sites: Site[];
}

export async function remoteLogin(
  username: string,
  password: string
): Promise<{ ok: true; session: RemoteSession } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: "Backend not configured" };

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (authError || !auth.user) {
    return { ok: false, error: "Invalid username or password" };
  }

  const [profiles, sites] = await Promise.all([
    supabase.from("profiles").select("*").order("username"),
    supabase.from("sites").select("*").order("code"),
  ]);
  if (profiles.error || sites.error) {
    await supabase.auth.signOut();
    return { ok: false, error: "Could not load your profile. Try again." };
  }

  const users = (profiles.data as ProfileRow[]).map(toAccount);
  const me = users.find((u) => u.id === auth.user.id);
  if (!me || !me.active || me.roles.length === 0) {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is inactive or has no role assigned" };
  }

  return {
    ok: true,
    session: { me, users, sites: (sites.data as SiteRow[]).map(toSite) },
  };
}

/* ---------- admin user management (edge function) ---------- */

type FnResult = { ok: true; profile?: ProfileRow } | { ok: false; error: string };

async function callAdminUsers(body: Record<string, unknown>): Promise<FnResult> {
  if (!supabase) return { ok: false, error: "Backend not configured" };
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (data && typeof data === "object" && "ok" in data) return data as FnResult;
  // Non-2xx responses carry the JSON body on error.context
  try {
    const res = (error as { context?: Response } | null)?.context;
    if (res) {
      const parsed = (await res.json()) as FnResult;
      if (parsed && "ok" in parsed) return parsed;
    }
  } catch {
    /* fall through */
  }
  return { ok: false, error: "Request failed. Try again." };
}

export async function remoteCreateUser(
  input: Omit<UserAccount, "id">
): Promise<{ ok: true; account: UserAccount } | { ok: false; error: string }> {
  const r = await callAdminUsers({
    action: "create",
    username: input.username,
    password: input.password,
    name: input.name,
    roles: input.roles,
    site_ids: input.siteIds,
    plant_ids: input.plantIds,
    staff_id: input.staffId ?? null,
    labourer_id: input.labourerId ?? null,
    permission_overrides: input.permissionOverrides,
  });
  if (!r.ok || !r.profile) return { ok: false, error: r.ok ? "Create failed" : r.error };
  return { ok: true, account: toAccount(r.profile) };
}

export async function remoteUpdateUser(id: string, patch: Partial<UserAccount>) {
  const map: Record<string, unknown> = {};
  if (patch.name !== undefined) map.name = patch.name;
  if (patch.roles !== undefined) map.roles = patch.roles;
  if (patch.siteIds !== undefined) map.site_ids = patch.siteIds;
  if (patch.plantIds !== undefined) map.plant_ids = patch.plantIds;
  if (patch.staffId !== undefined) map.staff_id = patch.staffId ?? null;
  if (patch.labourerId !== undefined) map.labourer_id = patch.labourerId ?? null;
  if (patch.permissionOverrides !== undefined)
    map.permission_overrides = patch.permissionOverrides;
  if (patch.active !== undefined) map.active = patch.active;
  return callAdminUsers({ action: "update", id, patch: map });
}

export async function remoteSetPassword(id: string, password: string) {
  return callAdminUsers({ action: "set_password", id, password });
}

/* ---------- master data ---------- */

type MasterSheet = Exclude<keyof MasterCatalog, never>;

interface MasterRow {
  id: string;
  sheet: string;
  site_id: string | null;
  code: string;
  label: string;
  active: boolean;
  note: string | null;
  extra: Record<string, string>;
}

export async function remoteLoadMaster(): Promise<MasterCatalog | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("master_items").select("*").order("code");
  if (error || !data?.length) return null;
  const rows = data as MasterRow[];
  const plain = (sheet: string): CatalogItem[] =>
    rows
      .filter((r) => r.sheet === sheet)
      .map((r) => ({
        id: r.id,
        siteId: r.site_id,
        code: r.code,
        label: r.label,
        active: r.active,
        note: r.note ?? undefined,
      }));
  return {
    contractors: rows
      .filter((r) => r.sheet === "contractors")
      .map((r) => ({
        id: r.id,
        siteId: r.site_id,
        code: r.code,
        name: r.label,
        gstin: r.extra?.gstin || undefined,
        active: r.active,
      })),
    dprTypes: plain("dprTypes"),
    activityTemplates: plain("activityTemplates"),
    units: plain("units"),
    materials: rows
      .filter((r) => r.sheet === "materials")
      .map((r) => ({
        id: r.id,
        siteId: r.site_id,
        code: r.code,
        label: r.label,
        active: r.active,
        note: r.note ?? undefined,
        sapCode: r.extra?.sapCode ?? "",
        paintSystem: r.extra?.paintSystem ?? "",
        uom: r.extra?.uom ?? "L",
        varianceTolerancePct: typeof r.extra?.varianceTolerancePct === "number" ? r.extra.varianceTolerancePct : undefined,
      })),
    storeBooks: plain("storeBooks"),
    fimStages: plain("fimStages"),
    safetyFormCodes: plain("safetyFormCodes"),
    shiftTypes: plain("shiftTypes"),
    attendanceStatuses: plain("attendanceStatuses"),
  };
}

/** Write-through save of one master row. Errors are logged, never thrown. */
export async function remoteSaveMaster(
  sheet: MasterSheet,
  item: CatalogItem | Contractor | MaterialItem
) {
  if (!supabase) return;
  const c = item as Contractor;
  const m = item as MaterialItem;
  const row = {
    id: item.id,
    sheet,
    site_id: item.siteId,
    code: item.code,
    label: sheet === "contractors" ? c.name : (item as CatalogItem).label,
    active: item.active,
    note: (item as CatalogItem).note ?? null,
    extra:
      sheet === "contractors"
        ? { gstin: c.gstin ?? "" }
        : sheet === "materials"
          ? { sapCode: m.sapCode, paintSystem: m.paintSystem, uom: m.uom, varianceTolerancePct: m.varianceTolerancePct ?? null }
          : {},
  };
  const { error } = await supabase.from("master_items").upsert(row);
  if (error) console.error("master save failed", sheet, item.code, error.message);
}

export async function remoteSaveSite(site: Site) {
  if (!supabase) return;
  const { error } = await supabase.from("sites").upsert({
    id: site.id,
    code: site.code,
    name: site.name,
    client: site.client,
    enabled: site.enabled,
    rp_tags: site.rpTags,
    plants: site.plants,
  });
  if (error) console.error("site save failed", site.code, error.message);
}

export async function remoteLogout() {
  if (supabase) await supabase.auth.signOut();
}

export async function remoteAudit(entry: {
  userId: string;
  username: string;
  role: string | null;
  siteId: string | null;
  module: string;
  action: string;
  detail: string;
}) {
  if (!supabase) return;
  await supabase.from("audit_log").insert({
    user_id: entry.userId,
    username: entry.username,
    role: entry.role,
    site_id: entry.siteId,
    module: entry.module,
    action: entry.action,
    detail: entry.detail,
  });
}
