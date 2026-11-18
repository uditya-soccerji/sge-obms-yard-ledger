-- Staff monthly salary (owner, 2026-11-18): one row per staff member per month, from the monthly
-- staff salary sheet — days, OT, rate, earnings (basic, bonus, room rent, conveyance, statutory
-- bonus), deductions (PF, PT, ESIC, advance, other) and net paid, plus the day-by-day marks.
-- Only the Owner, Super Admin, HR and Finance can see or change it. Bank details and ESIC / UAN
-- numbers are not stored here.
create table public.staff_salary (
  id text primary key,                         -- '<staff id>:<YYYY-MM>[:<n>]'
  staff_id text not null references public.staff(id),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  ep_number text,
  name text not null,
  designation text,
  category text,                               -- skilled / semi skilled / unskilled
  sheet_site text,                             -- the site / plant written on the sheet (DTA ARC, RTF …)
  monthly_rate numeric,                        -- basic monthly salary
  present_days numeric,
  ot_hours numeric,
  per_day_rate numeric,
  per_ot_rate numeric,
  salary_amount numeric,
  ot_amount numeric,
  basic numeric,                               -- salary + OT earned this month
  bonus numeric,                               -- one-off bonus (e.g. Diwali)
  room_rent numeric,
  conveyance numeric,
  statutory_bonus numeric,
  gross numeric,
  pf numeric,
  pt numeric,
  esic numeric,
  advance numeric,
  other_deduction numeric,
  total_deductions numeric,
  net_paid numeric,
  remarks text,
  day_marks text[],                            -- 31 entries: P present, A absent, S weekly off, H holiday
  day_ot numeric[],
  source text,                                 -- file and tab it came from
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_salary_staff_idx on public.staff_salary (staff_id, month);
create trigger staff_salary_touch before update on public.staff_salary for each row execute function private.touch_updated_at();

alter table public.staff_salary enable row level security;
create policy staff_salary_read on public.staff_salary for select to authenticated
  using (private.has_any_role('owner', 'super_admin', 'hr', 'finance'));
create policy staff_salary_write on public.staff_salary for insert to authenticated
  with check (private.has_any_role('owner', 'super_admin', 'hr', 'finance'));
create policy staff_salary_update on public.staff_salary for update to authenticated
  using (private.has_any_role('owner', 'super_admin', 'hr', 'finance'))
  with check (private.has_any_role('owner', 'super_admin', 'hr', 'finance'));
