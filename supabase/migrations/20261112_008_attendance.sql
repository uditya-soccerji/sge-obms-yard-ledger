-- Attendance in the shared database (owner, 2026-11-12). Until now it lived in each
-- browser, so HR, the SIC and the Owner each saw a different register, and a browser
-- filled up after about two months of DTA attendance.
-- One row per labourer per day. Ids stay the app's own text ids (att-…), so DPR marks,
-- ACPL matches and HR corrections keep pointing at them.
-- No unique (labourer_id, date) constraint on purpose: the app already keeps one mark
-- per day, and a race between two browsers must not stop every later save.

create table public.attendance (
  id text primary key,
  date date not null,
  labourer_id text not null references public.labourers(id) on delete cascade,
  status text not null check (status in ('present','absent','half','leave','weekly_off','overtime')),
  in_time text check (in_time is null or in_time ~ '^[0-9]{1,2}:[0-9]{2}$'),
  out_time text check (out_time is null or out_time ~ '^[0-9]{1,2}:[0-9]{2}$'),
  marked_by text not null default '',
  site_id text not null references public.sites(id),
  note text,
  source_dpr_id text,
  reconciled boolean,
  corrected_from text check (corrected_from is null or corrected_from in ('present','absent','half','leave','weekly_off','overtime')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attendance_date_idx on public.attendance (date);
create index attendance_labourer_date_idx on public.attendance (labourer_id, date);
create index attendance_site_date_idx on public.attendance (site_id, date);
create index attendance_updated_idx on public.attendance (updated_at);

create trigger attendance_touch before update on public.attendance for each row execute function private.touch_updated_at();

alter table public.attendance enable row level security;

-- Read: every staff role (dashboards, pay, DPR crews); a labourer login sees only its own days
create policy attendance_read on public.attendance for select to authenticated
  using (
    private.has_any_role('super_admin','owner','sic','hr','admin','finance','supervisor','store','safety')
    or labourer_id = private.my_labourer_id()
  );
-- Write: HR marks and corrects; a submitted DPR (supervisor) and its SIC review write the crew's
-- marks (docs §23); Admin resolves ACPL; Owner / SA upload Excel
create policy attendance_insert on public.attendance for insert to authenticated
  with check (private.has_any_role('super_admin','owner','hr','admin','sic','supervisor'));
create policy attendance_update on public.attendance for update to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin','sic','supervisor'))
  with check (private.has_any_role('super_admin','owner','hr','admin','sic','supervisor'));
-- Delete: an unlocked DPR takes its marks back, so the same roles
create policy attendance_delete on public.attendance for delete to authenticated
  using (private.has_any_role('super_admin','owner','hr','admin','sic','supervisor'));
