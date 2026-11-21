-- Staff plants and sub-con owners (owner, 2026-11-21)
-- A person's usual plants (several, can change) so plant pickers narrow to the right supervisors;
-- sub-con owners (Suvodeep, Sunil Sinha, Shivnath) are kept off supervisor pick lists.
alter table public.staff add column if not exists plants text[] not null default '{}';
alter table public.staff add column if not exists subcon_owner boolean not null default false;
