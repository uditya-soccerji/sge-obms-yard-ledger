-- Staff EP number (owner, 2026-11-15): every login is a staff member, and their RIL gate-pass (EP)
-- number lets staff attendance be tracked the way labourers' is (ACPL / eSSL punches). Staff and
-- labourer profiles stay separate. Optional; one staff member per EP.
alter table public.staff add column if not exists ep_number text
  check (ep_number is null or ep_number ~ '^PP[0-9]{10}$');
create unique index if not exists staff_ep_number_key on public.staff (ep_number) where ep_number is not null;
