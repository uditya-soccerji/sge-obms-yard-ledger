-- Staff: a save can't blank the EP number, supervisor type or employment once they're set
-- (owner, 2026-11-18). A browser left open on an older version kept writing its stale copy back
-- and wiped the staff EPs twice. To clear one of these on purpose, do it in the database.
create or replace function private.staff_keep_filled() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ep_number is null and old.ep_number is not null then new.ep_number := old.ep_number; end if;
  if new.supervisor_type is null and old.supervisor_type is not null then new.supervisor_type := old.supervisor_type; end if;
  if new.engagement is null and old.engagement is not null then new.engagement := old.engagement; end if;
  return new;
end $$;
create trigger staff_keep_filled before update on public.staff
  for each row execute function private.staff_keep_filled();
