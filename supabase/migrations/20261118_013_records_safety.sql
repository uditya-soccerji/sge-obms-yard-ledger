-- Shared records: save conflicts, who may approve, and numbers handed out by the database
-- (owner, 2026-11-18 — logic review items 4, 5 and 11).

-- 4. A save carries the version it started from (base_updated_at). If someone else saved the
--    record since, this save is not applied: the newer copy is kept and re-sent to every device
--    (updated_at bumped), so the device that tried to save gets the newer copy on its next fetch.
alter table public.app_records add column if not exists base_updated_at timestamptz;

-- A refused save: keep the stored copy and make every device fetch it again
create or replace function private.app_records_keep(r public.app_records) returns public.app_records
language plpgsql set search_path = '' as $$
begin
  r.updated_at := clock_timestamp();
  r.base_updated_at := null;
  return r;
end $$;

create or replace function private.app_records_touch() returns trigger
language plpgsql set search_path = '' as $$
declare
  st_old text; st_new text;
begin
  if tg_op = 'UPDATE' and new.base_updated_at is not null and old.updated_at > new.base_updated_at then
    -- Stale save: keep what is there, make every device fetch it again
    return private.app_records_keep(old);
  end if;

  -- 11. Approvals only by the roles that may give them (the app checks too; this is the backstop).
  --     A save that breaks the rule is not applied; the stored copy goes back to every device.
  if tg_op = 'UPDATE' then
    st_old := old.data->>'status'; st_new := new.data->>'status';
    if st_old is distinct from st_new then
      if new.collection = 'work.reports' then
        if st_new in ('sic_approved', 'sic_rejected') and not private.has_any_role('sic', 'admin', 'owner', 'super_admin') then
          return private.app_records_keep(old);
        end if;
        if st_old = 'sic_approved' and not private.has_any_role('owner', 'super_admin') then
          return private.app_records_keep(old);
        end if;
      elsif new.collection = 'work.planRequests' and st_new in ('approved', 'rejected') then
        if not private.has_any_role('sic', 'owner', 'super_admin') then
          return private.app_records_keep(old);
        end if;
      elsif new.collection in ('ops.wageChangeRequests', 'ops.masterChangeRequests') and st_new in ('approved', 'rejected') then
        if not private.has_any_role('owner', 'super_admin') then
          return private.app_records_keep(old);
        end if;
      end if;
    end if;
  end if;

  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  new.base_updated_at := null;
  return new;
end $$;

-- 5. Job and JMS numbers: the next number comes from the database, so two devices never get the same one
create table if not exists public.app_counters (
  key text primary key,
  value bigint not null default 0
);
alter table public.app_counters enable row level security;
-- No direct access; only through next_counter()

create or replace function public.next_counter(counter_key text, at_least bigint default 0) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not private.is_active_user() or private.has_any_role('labourer') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.app_counters as c (key, value) values (counter_key, greatest(at_least, 0) + 1)
  on conflict (key) do update set value = greatest(c.value, at_least) + 1
  returning value into v;
  return v;
end $$;
revoke all on function public.next_counter(text, bigint) from public;
grant execute on function public.next_counter(text, bigint) to authenticated;
