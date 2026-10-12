import { supabase, usernameToEmail } from "./client";
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
