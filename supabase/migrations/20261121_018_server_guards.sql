-- Server-side guards (owner, 2026-11-21 bug review). The app already checks these in the browser;
-- the database now refuses them too, so a login can't skip the screen and write them directly.
--
-- A refused change to an existing record keeps the server's copy (the app shows "not saved — the
-- latest copy is shown"). A refused brand-new record is stored as deleted, so it never counts.
-- Saves are upserts: BEFORE INSERT runs for rows that already exist too, so the insert check only
-- judges rows that are really new and leaves existing ones to the update check.

create or replace function private.app_records_exists(c text, i text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_records r where r.collection = c and r.id = i);
$$;
revoke all on function private.app_records_exists(text, text) from public;
grant execute on function private.app_records_exists(text, text) to authenticated;

/** May the signed-in login write this record? o = the server's copy (null for a new record) */
create or replace function private.app_records_may(c text, o jsonb, n jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  -- Money and stock: only the roles whose screens write them
  if c = 'work.jms' then
    return private.has_any_role('sic', 'admin', 'finance', 'owner', 'super_admin');
  elsif c = 'work.expenses' then
    return private.has_any_role('finance', 'owner', 'super_admin');
  elsif c = 'work.scaffoldMaterial' then
    return private.has_any_role('store', 'sic', 'admin', 'owner', 'super_admin');
  elsif c = 'ops.storeMoves' then
    return private.has_any_role('store', 'owner', 'super_admin');
  elsif c in ('ops.wageLedger', 'ops.advances', 'ops.vendorBills') then
    return private.has_any_role('finance', 'hr', 'admin', 'owner', 'super_admin');
  -- Jobs: closing (JMS confirmed) and approving the supervisor's plan
  elsif c = 'work.jobs' then
    if n->>'status' = 'closed' and (o is null or o->>'status' is distinct from 'closed')
       and not private.has_any_role('sic', 'admin', 'owner', 'super_admin') then
      return false;
    end if;
    if n->>'planStatus' in ('approved', 'sent_back') and (o is null or o->>'planStatus' is distinct from n->>'planStatus')
       and not private.has_any_role('sic', 'owner', 'super_admin') then
      return false;
    end if;
  -- Scaffolding jobs: the SIC (or Owner / SA) approves
  elsif c = 'work.scaffoldJobs' then
    if n->>'approval' in ('approved', 'rejected') and (o is null or o->>'approval' is distinct from n->>'approval')
       and not private.has_any_role('sic', 'owner', 'super_admin') then
      return false;
    end if;
  -- DPRs: approve / send back is the SIC's (Admin for the SIC); un-approving is Owner / SA, or the
  -- Admin sending an approved DPR back with a returned JMS
  elsif c = 'work.reports' then
    if o is null then
      if n->>'status' in ('sic_approved', 'sic_rejected') and not private.has_any_role('sic', 'admin', 'owner', 'super_admin') then
        return false;
      end if;
    elsif (o->>'status') is distinct from (n->>'status') then
      if n->>'status' in ('sic_approved', 'sic_rejected') and not private.has_any_role('sic', 'admin', 'owner', 'super_admin') then
        return false;
      end if;
      if o->>'status' = 'sic_approved'
         and not private.has_any_role('owner', 'super_admin')
         and not (n->>'status' = 'sic_rejected' and private.has_any_role('admin')) then
        return false;
      end if;
    end if;
  elsif c = 'work.planRequests' then
    if n->>'status' in ('approved', 'rejected') and (o is null or (o->>'status') is distinct from (n->>'status'))
       and not private.has_any_role('sic', 'owner', 'super_admin') then
      return false;
    end if;
  elsif c in ('ops.wageChangeRequests', 'ops.masterChangeRequests') then
    if n->>'status' in ('approved', 'rejected') and (o is null or (o->>'status') is distinct from (n->>'status'))
       and not private.has_any_role('owner', 'super_admin') then
      return false;
    end if;
  end if;
  return true;
end $$;

create or replace function private.app_records_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    -- Someone else saved first: keep theirs
    if new.base_updated_at is not null and old.updated_at > new.base_updated_at then
      return private.app_records_keep(old);
    end if;
    if not private.app_records_may(new.collection, case when old.deleted then null else old.data end, case when new.deleted then '{}'::jsonb else new.data end) then
      return private.app_records_keep(old);
    end if;
  elsif not private.app_records_exists(new.collection, new.id)
        and not coalesce(new.deleted, false)
        and not private.app_records_may(new.collection, null, new.data) then
    -- A new record this login may not create: stored as deleted, so it never counts
    new.deleted := true;
    new.data := '{}'::jsonb;
  end if;
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  new.base_updated_at := null;
  return new;
end $$;

-- Attendance: a supervisor writes his DPR crew's marks at submit — never for dates long gone
-- (the app allows today / yesterday; a week leaves room for a DPR the SIC sent back)
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (
    private.has_any_role('super_admin', 'owner', 'hr', 'admin', 'sic')
    or (private.has_any_role('supervisor') and date >= (now() at time zone 'Asia/Kolkata')::date - 7)
  );
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (
    private.has_any_role('super_admin', 'owner', 'hr', 'admin', 'sic')
    or (private.has_any_role('supervisor') and date >= (now() at time zone 'Asia/Kolkata')::date - 7)
  )
  with check (
    private.has_any_role('super_admin', 'owner', 'hr', 'admin', 'sic')
    or (private.has_any_role('supervisor') and date >= (now() at time zone 'Asia/Kolkata')::date - 7)
  );
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated
  using (
    private.has_any_role('super_admin', 'owner', 'hr', 'admin', 'sic')
    or (private.has_any_role('supervisor') and date >= (now() at time zone 'Asia/Kolkata')::date - 7)
  );
