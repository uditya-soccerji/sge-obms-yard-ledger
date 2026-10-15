-- Labourer register in the shared database (owner, 2026-10-15). Until now it lived in each browser.
-- Three tables so RLS can keep sensitive fields narrow:
--   labourers          identity, site, crew, trade, skill, RIL pass — every staff role reads;
--                      a labourer login reads only its own row
--   labourer_private   Aadhaar, mobile — Super Admin, Owner, HR only (docs §1)
--   labourer_pay       daily wage — Super Admin, Owner, HR, Admin, Finance
-- Ids are the app's own text ids (lb-…), so attendance, crews and DPR marks keep pointing at them.

create table public.labourers (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  trade text not null,
  trade_subcategory text,
  ep_number text not null unique,
  gate_pass text not null default '',
  site_id text not null references public.sites(id),
  supervisor_id text not null default '',
  contractor_id text,
  equipment_ids text[] not null default '{}',
  active boolean not null default true,
  skill text check (skill in ('highly_skilled','skilled','semi_skilled','unskilled')),
  ep_history jsonb not null default '[]'::jsonb check (jsonb_typeof(ep_history) = 'array'),
  eic text,
  ril_status text,
  ril_area text,
  pass_valid_from date,
  pass_expiry date,
  upload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index labourers_site_idx on public.labourers (site_id);
create index labourers_supervisor_idx on public.labourers (supervisor_id);

create table public.labourer_private (
  labourer_id text primary key references public.labourers(id) on delete cascade,
  aadhaar text check (aadhaar is null or aadhaar ~ '^[0-9]{12}$'),
  mobile text check (mobile is null or mobile ~ '^[6-9][0-9]{9}$'),
  updated_at timestamptz not null default now()
);

create table public.labourer_pay (
  labourer_id text primary key references public.labourers(id) on delete cascade,
  wage_daily numeric(10,2) not null default 0 check (wage_daily >= 0),
  updated_at timestamptz not null default now()
);

create trigger labourers_touch before update on public.labourers for each row execute function private.touch_updated_at();
create trigger labourer_private_touch before update on public.labourer_private for each row execute function private.touch_updated_at();
create trigger labourer_pay_touch before update on public.labourer_pay for each row execute function private.touch_updated_at();

-- The signed-in labourer's own register id (null for staff)
create or replace function private.my_labourer_id() returns text
language sql stable security definer set search_path = '' as $$
  select p.labourer_id from public.profiles p where p.id = (select auth.uid()) and p.active;
$$;
revoke all on function private.my_labourer_id() from public;
grant execute on function private.my_labourer_id() to authenticated;

alter table public.labourers enable row level security;
alter table public.labourer_private enable row level security;
alter table public.labourer_pay enable row level security;

create policy labourers_read on public.labourers for select to authenticated
  using (
    private.has_any_role('super_admin','owner','sic','hr','admin','finance','supervisor','store','safety')
    or id = private.my_labourer_id()
  );
-- Add: Owner / SA / HR / Admin (bulk upload). Update: also the SIC (crew changes, docs §23).
create policy labourers_insert on public.labourers for insert to authenticated
  with check (private.has_any_role('super_admin','owner','hr','admin'));
create policy labourers_update on public.labourers for update to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin','sic'))
  with check (private.has_any_role('super_admin','owner','hr','admin','sic'));
-- Delete: Owner / SA only; everyone else deactivates (docs §1)
create policy labourers_delete on public.labourers for delete to authenticated
  using (private.has_any_role('super_admin','owner'));

create policy labourer_private_all on public.labourer_private for all to authenticated
  using (private.has_any_role('super_admin','owner','hr'))
  with check (private.has_any_role('super_admin','owner','hr'));

create policy labourer_pay_read on public.labourer_pay for select to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin','finance'));
create policy labourer_pay_write on public.labourer_pay for all to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin'))
  with check (private.has_any_role('super_admin','owner','hr','admin'));
