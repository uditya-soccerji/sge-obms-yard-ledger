-- Foundation: sites, profiles (roles), audit_log, master_items + RLS.
-- Applied to Supabase project "sge-obms". Username check was later relaxed to 2-32 chars (see 002).
create extension if not exists citext with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create table public.sites (
  id text primary key, code text not null unique, name text not null,
  client text not null default '', enabled boolean not null default true,
  rp_tags text[] not null default '{}', plants text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  name text not null,
  roles text[] not null default '{}'
    check (roles <@ array['super_admin','owner','sic','hr','admin','finance','supervisor','store','safety','labourer']),
  site_ids text[] not null default '{}', plant_ids text[] not null default '{}',
  staff_id text, labourer_id text,
  permission_overrides jsonb not null default '[]'::jsonb,
  active boolean not null default true, must_change_password boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  username text not null, role text, site_id text, plant text,
  module text not null, action text not null, detail text not null default '',
  impersonated_by text
);
create index audit_log_at_idx on public.audit_log (at desc);

create table public.master_items (
  id uuid primary key default gen_random_uuid(),
  sheet text not null check (sheet in (
    'contractors','trades','dprTypes','activityTemplates','units','materials',
    'storeBooks','fimStages','safetyFormCodes','shiftTypes','attendanceStatuses')),
  site_id text references public.sites(id),
  code text not null, label text not null, active boolean not null default true,
  note text, extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index master_items_unique on public.master_items (sheet, coalesce(site_id,''), code);

create trigger sites_touch before update on public.sites for each row execute function private.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger master_items_touch before update on public.master_items for each row execute function private.touch_updated_at();

create or replace function private.has_any_role(variadic wanted text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.roles && wanted);
$$;
create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.active);
$$;
revoke all on function private.has_any_role(text[]) from public;
revoke all on function private.is_active_user() from public;
grant execute on function private.has_any_role(text[]) to authenticated;
grant execute on function private.is_active_user() to authenticated;

alter table public.sites enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;
alter table public.master_items enable row level security;

create policy sites_read on public.sites for select to authenticated using (private.is_active_user());
create policy sites_write on public.sites for all to authenticated
  using (private.has_any_role('super_admin','owner')) with check (private.has_any_role('super_admin','owner'));
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.has_any_role('super_admin','owner','admin','hr'));
create policy profiles_update on public.profiles for update to authenticated
  using (private.has_any_role('super_admin')) with check (private.has_any_role('super_admin'));
create policy master_read on public.master_items for select to authenticated using (private.is_active_user());
create policy master_write on public.master_items for all to authenticated
  using (private.has_any_role('super_admin','owner')) with check (private.has_any_role('super_admin','owner'));
create policy audit_insert on public.audit_log for insert to authenticated with check (user_id = (select auth.uid()));
create policy audit_read on public.audit_log for select to authenticated using (private.has_any_role('super_admin','owner'));
