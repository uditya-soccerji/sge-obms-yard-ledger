-- B02: per-plant RP and locations on each site.
-- Shape: [{ "name": "RRTF", "rp": "RP5", "locations": [{ "name": "North culvert", "rp"?: "RP5" }] }]
-- A plant with no entry has no locations and takes the site's RP when the site has one.
-- Kept on the site row so it saves with the site and is covered by the existing
-- sites_read / sites_write policies (Owner / Super Admin write, active users read).
-- Apply BEFORE deploying the app change: the app writes this column on every site save.
alter table public.sites
  add column if not exists plant_details jsonb not null default '[]'::jsonb;

alter table public.sites
  drop constraint if exists sites_plant_details_is_array;
alter table public.sites
  add constraint sites_plant_details_is_array check (jsonb_typeof(plant_details) = 'array');
