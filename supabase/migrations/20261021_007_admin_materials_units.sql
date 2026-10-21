-- Round 2 (docs §27, 2026-10-21): the Admin manages Materials and Units in Master Data.
-- Owner / Super Admin keep every sheet (master_write); this adds only those two sheets for the Admin.
drop policy if exists master_admin_write on public.master_items;
create policy master_admin_write on public.master_items for all to authenticated
  using (private.has_any_role('admin') and sheet in ('materials', 'units'))
  with check (private.has_any_role('admin') and sheet in ('materials', 'units'));
