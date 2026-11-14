-- Staff records in the shared database (owner, 2026-11-14). Until now each browser kept its own
-- staff list, so a login created on one laptop showed "Not linked" everywhere else and its
-- supervisor was missing from DPR, crew and plan pickers on other devices.
-- Ids stay the app's own text ids (st-…), so logins (profiles.staff_id), crews, DPRs and plan
-- lines keep pointing at the same person. Also: the RIL plant code on sites (docs §33).

create table public.staff (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  role text not null check (role in ('super_admin','owner','sic','hr','admin','finance','supervisor','store','safety','labourer')),
  site_id text not null references public.sites(id),
  -- Every site the person works on besides the home site (docs §34)
  site_ids text[] not null default '{}',
  phone text,
  designation text,
  supervisor_type text check (supervisor_type is null or supervisor_type in ('painting_blasting','scaffolding','rope_access','safety')),
  engagement text check (engagement is null or engagement in ('payroll','subcontract')),
  contractor_id text,
  employee_code text,
  joined_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_site_idx on public.staff (site_id);

create trigger staff_touch before update on public.staff for each row execute function private.touch_updated_at();

alter table public.staff enable row level security;

-- Read: every active login (pickers, crews, DPR submitters, names on reports)
create policy staff_read on public.staff for select to authenticated
  using (private.is_active_user());
-- Add / edit: the people who create seats and keep staff records (Master Data, HR)
create policy staff_insert on public.staff for insert to authenticated
  with check (private.has_any_role('super_admin','owner','hr','admin'));
create policy staff_update on public.staff for update to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin'))
  with check (private.has_any_role('super_admin','owner','hr','admin'));
-- No delete: staff records are switched off (active = false), never removed

-- RIL plant code per site (3611, 3622, 36AG …); empty when a site has none
alter table public.sites add column if not exists plant_code text;
