-- Sub-contractor login (owner, 2026-11-21): like the SIC but view only, and only his own sub-con's
-- supervisors, crew, attendance and DPRs. Changes go to Owner / Super Admin as a request.

-- 1. The role and the login's sub-con
alter table public.profiles drop constraint if exists profiles_roles_check;
alter table public.profiles add constraint profiles_roles_check
  check (roles <@ array['super_admin','owner','sic','hr','admin','finance','supervisor','store','safety','labourer','subcontractor']);
alter table public.profiles add column if not exists contractor_id text;

create or replace function private.my_contractor_id() returns text
language sql stable security definer set search_path = '' as $$
  select p.contractor_id from public.profiles p
  where p.id = (select auth.uid()) and p.active and 'subcontractor' = any(p.roles);
$$;
revoke all on function private.my_contractor_id() from public;
grant execute on function private.my_contractor_id() to authenticated;

-- His supervisors: staff records tagged with his sub-con
create or replace function private.my_subcon_staff() returns setof text
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff s where s.contractor_id is not null and s.contractor_id = private.my_contractor_id();
$$;
revoke all on function private.my_subcon_staff() from public;
grant execute on function private.my_subcon_staff() to authenticated;

-- 2. Labourers and attendance: his sub-con's crew only
drop policy if exists labourers_read on public.labourers;
create policy labourers_read on public.labourers for select to authenticated
  using (
    private.has_any_role('super_admin','owner','sic','hr','admin','finance','supervisor','store','safety')
    or id = private.my_labourer_id()
    or (contractor_id is not null and contractor_id = private.my_contractor_id())
  );
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (
    private.has_any_role('super_admin','owner','sic','hr','admin','finance','supervisor','store','safety')
    or labourer_id = private.my_labourer_id()
    or labourer_id in (select l.id from public.labourers l where l.contractor_id is not null and l.contractor_id = private.my_contractor_id())
  );

-- 3. Shared records: a sub-con reads only his supervisors' DPRs, work lines, jobs and plan lines,
--    the rack list and his own requests; he writes only his requests and his read marks
drop policy if exists app_records_read on public.app_records;
create policy app_records_read on public.app_records for select to authenticated
  using (
    private.is_active_user() and not private.has_any_role('labourer', 'subcontractor')
    or (
      private.has_any_role('subcontractor') and (
        (collection = 'work.reports' and data->>'submitterId' in (select private.my_subcon_staff()))
        or (collection in ('work.dprs', 'work.jobs', 'work.planLines') and data->>'supervisorId' in (select private.my_subcon_staff()))
        or (collection = 'ops.subconRequests' and data->>'contractorId' = private.my_contractor_id())
        or collection in ('ops.plantRacks', 'work._meta')
      )
    )
  );
drop policy if exists app_records_insert on public.app_records;
create policy app_records_insert on public.app_records for insert to authenticated
  with check (
    private.is_active_user() and not private.has_any_role('labourer', 'subcontractor')
    or (private.has_any_role('subcontractor') and (
      (collection = 'ops.subconRequests' and data->>'contractorId' = private.my_contractor_id())
      or (collection = 'work._meta' and id in ('lastSeen', 'readIds'))
    ))
  );
drop policy if exists app_records_update on public.app_records;
create policy app_records_update on public.app_records for update to authenticated
  using (
    private.is_active_user() and not private.has_any_role('labourer', 'subcontractor')
    or (private.has_any_role('subcontractor') and (
      (collection = 'ops.subconRequests' and data->>'contractorId' = private.my_contractor_id())
      or (collection = 'work._meta' and id in ('lastSeen', 'readIds'))
    ))
  )
  with check (
    private.is_active_user() and not private.has_any_role('labourer', 'subcontractor')
    or (private.has_any_role('subcontractor') and (
      (collection = 'ops.subconRequests' and data->>'contractorId' = private.my_contractor_id())
      or (collection = 'work._meta' and id in ('lastSeen', 'readIds'))
    ))
  );

-- 4. A sub-con can't take job / JMS numbers
create or replace function public.next_counter(counter_key text, at_least bigint default 0) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not private.is_active_user() or private.has_any_role('labourer', 'subcontractor') then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  insert into public.app_counters as c (key, value) values (counter_key, greatest(at_least, 0) + 1)
  on conflict (key) do update set value = greatest(c.value, at_least) + 1
  returning value into v;
  return v;
end $$;

-- 5. Staff list: a sub-con sees only his own supervisors
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (
    private.is_active_user() and not private.has_any_role('subcontractor')
    or (private.has_any_role('subcontractor') and contractor_id is not null and contractor_id = private.my_contractor_id())
  );
