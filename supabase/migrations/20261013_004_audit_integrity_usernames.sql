-- B1: audit rows are written by the server from the caller's own profile, so a
-- signed-in user can no longer insert a row claiming another username or role.
-- B3: usernames follow the app rule (docs/rules-decisions.md §2, lib/users.ts USERNAME_RE).
-- Not yet applied to the live project: confirm with the Owner first (AGENTS.md).

-- ── B1 ────────────────────────────────────────────────────────────────────
drop policy if exists audit_insert on public.audit_log;
revoke insert on public.audit_log from authenticated;

create or replace function public.write_audit(
  p_module text,
  p_action text,
  p_detail text default '',
  p_site_id text default null,
  p_plant text default null,
  p_impersonated_by text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me record;
begin
  select p.username, p.roles, p.active into me
  from public.profiles p where p.id = (select auth.uid());
  if me is null or not me.active then
    raise exception 'not an active user';
  end if;
  insert into public.audit_log (user_id, username, role, site_id, plant, module, action, detail, impersonated_by)
  values ((select auth.uid()), me.username, me.roles[1], p_site_id, p_plant, p_module, p_action, coalesce(p_detail, ''), p_impersonated_by);
end;
$$;
revoke all on function public.write_audit(text, text, text, text, text, text) from public, anon;
grant execute on function public.write_audit(text, text, text, text, text, text) to authenticated;

-- ── B3 ────────────────────────────────────────────────────────────────────
-- Check first: select username from public.profiles where username !~ '^[a-z0-9.]{3,20}$';
-- (rename any rows it returns before applying)
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_check check (username ~ '^[a-z0-9.]{3,20}$');
