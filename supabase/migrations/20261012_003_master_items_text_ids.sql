-- master_items ids become text so rows keep the app's stable ids (con-sge, dt-paint, mat-1 ...)
-- that labourers and other records reference. New rows use client-generated ids.
alter table public.master_items alter column id drop default;
alter table public.master_items alter column id type text using id::text;
-- (seed rows were renamed to their app ids when this was applied)
