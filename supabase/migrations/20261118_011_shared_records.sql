-- Work and store records in the shared database (owner, 2026-11-18).
-- Until now DPRs, jobs, plan lines, store / PPE requests, the safety DPR and the rest of the
-- Work data lived only in the browser that entered them, so a supervisor's DPR never reached
-- the Admin, the SIC or the store. One row per record, keyed by (collection, id) — the app's
-- own ids — with the record itself as JSON. Last write wins per record; deletions are kept as
-- `deleted = true` so every device drops them on its next fetch.

create table public.app_records (
  collection text not null check (length(collection) between 1 and 60),
  id text not null check (length(id) between 1 and 200),
  site_id text,
  data jsonb not null,
  deleted boolean not null default false,
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index app_records_updated_idx on public.app_records (updated_at);
create index app_records_collection_idx on public.app_records (collection);

-- Server time on every write, so "what changed since" never depends on a device's clock
create or replace function private.app_records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger app_records_touch before insert or update on public.app_records
  for each row execute function private.app_records_touch();

alter table public.app_records enable row level security;

-- Every active staff login reads and writes; what each role may do is checked by the app
-- (workRights / permissions), as it was while the data lived in the browser. Labourer logins
-- get nothing here. No hard delete: records are marked deleted.
create policy app_records_read on public.app_records for select to authenticated
  using (private.is_active_user() and not private.has_any_role('labourer'));
create policy app_records_insert on public.app_records for insert to authenticated
  with check (private.is_active_user() and not private.has_any_role('labourer'));
create policy app_records_update on public.app_records for update to authenticated
  using (private.is_active_user() and not private.has_any_role('labourer'))
  with check (private.is_active_user() and not private.has_any_role('labourer'));

-- Overtime hours on a day's attendance (no in / out times on the DPR, owner 2026-11-14)
alter table public.attendance add column if not exists ot_hours numeric check (ot_hours is null or (ot_hours >= 0 and ot_hours <= 16));
