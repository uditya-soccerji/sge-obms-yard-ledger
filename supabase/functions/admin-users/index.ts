// Admin-only user management: create user, set password, update profile.
// Runs with the service role, so it re-checks the caller's role itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const ROLES = [
  "super_admin", "owner", "sic", "hr", "admin",
  "finance", "supervisor", "store", "safety", "labourer",
];
const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const PATCHABLE = [
  "name", "roles", "site_ids", "plant_ids", "staff_id",
  "labourer_id", "permission_overrides", "active",
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
const fail = (error: string, status = 400) => json({ ok: false, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("POST only", 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: caller } = await admin.auth.getUser(jwt);
  if (!caller.user) return fail("Not signed in", 401);

  const { data: me } = await admin
    .from("profiles").select("username, roles, active").eq("id", caller.user.id).single();
  const isSA = !!me?.active && me.roles.includes("super_admin");
  const isOwner = !!me?.active && me.roles.includes("owner");
  if (!isSA && !isOwner) return fail("Only Owner or Super Admin can manage users", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("Invalid JSON"); }

  const audit = (action: string, detail: string) =>
    admin.from("audit_log").insert({
      user_id: caller.user!.id, username: me!.username, role: isSA ? "super_admin" : "owner",
      module: "users", action, detail,
    });

  // Only Super Admin may grant or touch the super_admin role.
  const touchesSA = (roles: unknown) => Array.isArray(roles) && roles.includes("super_admin");
  const validRoles = (roles: unknown) =>
    Array.isArray(roles) && roles.length > 0 && roles.every((r) => ROLES.includes(r));

  if (body.action === "create") {
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!USERNAME_RE.test(username)) return fail("Username: 2–32 chars, a-z 0-9 . _ -");
    if (password.length < 6) return fail("Password must be at least 6 characters");
    if (!validRoles(body.roles)) return fail("Assign at least one valid role");
    if (touchesSA(body.roles) && !isSA) return fail("Only Super Admin can create a Super Admin", 403);

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email: `${username}@obms.internal`,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (authErr || !created.user) {
      const dup = /already|registered|exists/i.test(authErr?.message ?? "");
      return fail(dup ? "Username already exists" : "Could not create user");
    }
    const row = {
      id: created.user.id,
      username,
      name: String(body.name ?? username).trim() || username,
      roles: body.roles,
      site_ids: body.site_ids ?? [],
      plant_ids: body.plant_ids ?? [],
      staff_id: body.staff_id ?? null,
      labourer_id: body.labourer_id ?? null,
      permission_overrides: body.permission_overrides ?? [],
      active: true,
    };
    const { error: profErr } = await admin.from("profiles").insert(row);
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail("Could not create profile");
    }
    await audit("create", `Created ${username} · roles [${row.roles.join(", ")}]`);
    return json({ ok: true, profile: row });
  }

  // update / set_password need an existing target
  const id = String(body.id ?? "");
  const { data: target } = await admin
    .from("profiles").select("id, username, roles").eq("id", id).single();
  if (!target) return fail("User not found", 404);
  if (target.roles.includes("super_admin") && !isSA) {
    return fail("Only Super Admin can change a Super Admin", 403);
  }

  if (body.action === "set_password") {
    const password = String(body.password ?? "");
    if (password.length < 6) return fail("Password must be at least 6 characters");
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return fail("Could not change password");
    await audit("set_password", `Password reset for ${target.username}`);
    return json({ ok: true });
  }

  if (body.action === "update") {
    const patch: Record<string, unknown> = {};
    for (const k of PATCHABLE) if (k in (body.patch ?? {})) patch[k] = body.patch[k];
    if ("roles" in patch) {
      if (!validRoles(patch.roles)) return fail("Assign at least one valid role");
      if (touchesSA(patch.roles) && !isSA) return fail("Only Super Admin can grant Super Admin", 403);
    }
    if (patch.active === false && id === caller.user.id) {
      return fail("You cannot deactivate yourself");
    }
    if (!Object.keys(patch).length) return fail("Nothing to update");
    const { error } = await admin.from("profiles").update(patch).eq("id", id);
    if (error) return fail("Could not update user");
    await audit("update", `Updated ${target.username}: ${Object.keys(patch).join(", ")}`);
    return json({ ok: true });
  }

  return fail("Unknown action");
});
