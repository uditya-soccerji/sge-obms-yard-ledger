# Bug list: testing with real Excel data

Branch `fix/bugs-2026-10-13` (from `main` @ `b17caaf`). Nothing reaches `main` / production until "deploy".
Fixing starts once the app folder (`D:\sge-obms-yard-ledger`) is free; until then bugs are only recorded here.

Status: **open** (recorded) · **confirmed** (reproduced on the live site) · **fixed** (on this branch, checked on `npm run dev`) · **needs owner** (business-rule question) · **deployed**.
Screenshots, when saved as files, go in `docs/bugs/` as `B<nn>-<n>.png`. Never include Aadhaar, bank or wage details.

## Summary
| # | Reported | Role · site · page | Bug | Status |
|---|---|---|---|---|
| B01 | 2026-10-13 | Super Admin · all sites · Master Data → Sites | Can't type a comma (or a space after a word) in "Plants (comma)", so plants can't be added on Add site or Edit | confirmed |
| B02 | 2026-10-13 | Super Admin · MTF · Master Data → Sites | Feature: plants need locations under them, and each plant/location needs an RP (MTF runs RP2 and RP5) | open (ready to build) |
| B03 | 2026-10-13 | Supervisor (Prasan Da, viewed as) · MTF · DPR → New | New supervisor's DPR shows an empty Labour attendance, and there's no way to give them labourers | needs owner |

## Details
<!-- One section per bug:
### B01: <one line>
- Reported: <date> · Role: <login / view as> · Site: <site> · Page: <page / tab>
- Steps: <what was done>
- Excel: <file · sheet · row, or the pasted values>
- Expected: <value / behaviour from Excel or rules-decisions.md §>
- Actual: <what the app showed>
- Screenshot: <docs/bugs/B01-1.png, or a description of the one sent in chat>
- Notes: <live-site check, suspected cause, files>
- Fix: <filled when fixed>
-->

### B01: Plants field swallows commas, so plants can't be added
- Reported: 2026-10-13 · Role: Super Admin · Site: All sites (JETTY entry) · Page: Master Data → Sites → Add site / Edit
- Steps: Edit DTA (or Add site), click in **Plants (comma)**, type `, RTF` key by key.
- Excel: DTA plants from the Aug-26 job plan (AROMATIC, CES, COKER, CRUDE, FCCU, HYDROGEN, HYDROTREATER, PP, PRU & HPIB, RTF, SULPHUR, UTILITY & ETP).
- Expected: field shows `CPP, CPP-flare, ARMA, RTF`; Save stores 4 plants.
- Actual: the comma and the space vanish as they're typed, giving `CPP, CPP-flare, ARMARTF` (user's screenshot: a new site's field shows `RRTF`). Names with spaces such as `PRU & HPIB` or `UTILITY & ETP` can't be typed at all.
- Screenshot: user's, localhost Master Data → Sites, DTA edit form open, Plants field reads `RRTF`.
- Confirmed on the live site 2026-10-13 (typed key by key, then Cancel; nothing saved). Pasting the whole list in one go does work, because it arrives as a single change.
- Cause: `SiteForm` in `src/components/master/master-desk.tsx` keeps plants only as an array. Every keystroke splits on `,`, trims and drops empty parts, then rejoins, so a just-typed comma or trailing space is deleted at once.
- Fix plan: keep the raw text in local state while typing; split, trim, drop empties and de-duplicate (ignoring case) only on **Save**.
- Related, fix together:
  - (a) **Save** does nothing, with no message, when Code is empty.
  - (b) `remoteSaveSite` (`src/lib/supabase/remote.ts`) only logs a failed Supabase save to the console. The screen shows the change, but it's gone after a reload. Show the error instead.
  - (c) Work plan lines upper-case plant names while Master Data keeps `CPP-flare` mixed case. Match plants ignoring case (merge plan, "Before PR 2").
- Data done 2026-10-13 (user's request): the 12 DTA plants were added to live Master Data by pasting the full list (the workaround), keeping CPP, CPP-flare and ARMA. Checked in Supabase: `sites` DTA now has 15 plants (updated 21:38 UTC). Then, at the user's request, CPP and CPP-flare were removed: DTA now has 13 plants (ARMA + the 12), updated 21:41 UTC. The same list is in `src/lib/seed.ts` for local runs without Supabase. `STORAGE_KEY` was deliberately not bumped, since that would wipe testers' browser data; on production, sites come from Supabase at sign-in.
- Fix: _pending (app folder busy)_

### B02: Plant → location level, with RP on each (feature)
- Reported: 2026-10-13 · Role: Super Admin · Site: MTF · Page: Master Data → Sites
- Ask: "give option to add RP to plant and location". MTF runs both RP2 and RP5, so the site-level RP list (`rp_tags`) isn't enough.
- Data from the user's sheet (plant → location):

| Plant | Location |
|---|---|
| MTF | LFP to Saipem |
| MTF | Saipem to DTA product (CT vicinity) |
| MTF | Crude ISBL |
| MTF | Haul road |
| MTF | Culvert-2 |
| RRTF | North culvert |
| RRTF | RRTF ISBL/OSBL CORRIDOR |
| RRTF | LPG RAIL GANTRY |
| RRTF | LPG RACK |
| RRTF | RIL-1 |
| RRTF | RIL-2 |
| RRTF | South culvert |
| RRTF | Street-3 end culvert |

- Done now (live, 2026-10-13): plant **RRTF** added to MTF, so MTF plants = MTF, ARMA, RRTF (checked in Supabase, updated 21:44 UTC). Same in `src/lib/seed.ts`. Locations are **not** stored yet, because there's nowhere to keep them.
- Today: `sites.plants` is `text[]` (names only); `sites.rp_tags` is per site. Work jobs keep `location` as free text.
- Plan (needs owner OK + a migration, applied to live only after confirming):
  1. Migration `supabase/migrations/<date>_site_plants_locations.sql`: a `site_plants` table (site_id, name, rp, active) and a `plant_locations` table (plant_id, name, rp, active), with RLS like `sites`. Keep `sites.plants` filled for one release so nothing breaks.
  2. Master Data → Sites: per site, a plant table (name, RP from the site's RP list) with locations under each (name, RP; default = the plant's RP).
  3. Work jobs and DPR lines pick plant → location from Master Data (fits merge plan PR 2 "one plant list per site").
- Answers (2026-10-13): MTF is a **site**, not a plant. RRTF and ARMA are **plants**. The LPG/RIL cell is **five separate locations**. ARMA stays under **both** DTA and MTF (each site has its own ARMA plant, which §3 allows).
- Answer (2026-10-13): **MTF is both the site and a plant** in it. Plant MTF has the 5 "MTF" locations; plant RRTF has 8. The live MTF plant list (MTF, ARMA, RRTF) is correct as it stands. ARMA has no locations listed yet.
- RPs (2026-10-13): **MTF – RP5, RRTF – RP5, ARMA – RP2** (ARMA is RP2 at both MTF and DTA). Every location takes its plant's RP; none differ. DTA's other plants take the site's RP2 by default.
- Status: all questions answered. Ready to build when the app folder is free. The migration needs a confirm before it's applied to the live database.
- Fix: _pending (app folder busy; needs answers)_

### B03: New supervisor has no labourers to mark, and nobody can assign any
- Reported: 2026-10-13 · Role: Super Admin viewing as supervisor Prasan Da (@pda) · Site: MTF · Page: DPR → New (painting/blasting, plant RRTF)
- Expected (user): a supervisor sees the labourers assigned to them; or, if Owner / Super Admin gives them the right, picks labourers from the list themselves; otherwise the SIC assigns labourers to the supervisor, who then marks their attendance.
- Actual: the **Labour attendance** panel is empty, with no message and no way to add anyone.
- Backend findings (code on `main`):
  1. The DPR crew is "active labourers whose `supervisorId` = the DPR submitter" (`src/components/dpr/dpr-form.tsx`, `crew`). A new supervisor has none, so the list is empty.
  2. **No screen can set a labourer's supervisor.** Master Data → Labourers has no Supervisor column, and HR / labourer pages don't set it either. Worse, **Add labourer defaults the supervisor to `state.staff[0]`** (the Super Admin staff record), so new labourers land on nobody's crew.
  3. **SIC has no labourer rights at all** (`ROLE_MATRIX.sic` in `src/lib/permissions.ts`). Only Owner / Super Admin (Master Data) and HR (`labourer: view/create/update`) can edit labourers.
  4. Per-user rights already exist in the data (`UserAccount.permissionOverrides`, read by `effectivePermission`), but **no screen sets them**. Every login is created with `[]`.
  5. **Labourers are stored only in each browser** (not in Supabase yet, AGENTS.md §2). An assignment made on the office laptop won't appear on the supervisor's phone. For assignments to work across devices, labourers must move to the shared database.
  6. The DPR form shows no message when the crew is empty.
- Rule check: §1 makes "supervisor" a required labourer field; §4 allows a split day across two supervisors. The "self-pick if allowed, else SIC assigns" rule isn't written yet. **Owner to confirm** (questions in chat), then add it to `docs/rules-decisions.md` §1/§4.
- Fix plan:
  - (a) A **Crew** screen: SIC (own sites), Owner and Super Admin pick a supervisor and tick labourers from that site's list. A supervisor with the right uses the same screen for their own crew only.
  - (b) A new right `labourer: assign`, given to SIC by default and switchable per supervisor by Owner / Super Admin (a small "Rights" toggle in Users / seats).
  - (c) A Supervisor column in Master Data → Labourers; new labourers start with **no** supervisor instead of `staff[0]`.
  - (d) In the DPR form, an empty-crew message ("No labourers assigned to you — ask your SIC"), plus "Add from site list" for supervisors who have the right.
  - (e) Move labourers + assignments to Supabase (migration + RLS: SIC for their sites, supervisor for own crew when allowed). That's the step that makes it work across devices; confirm before applying to live.
- Fix: _pending (app folder busy; needs owner answers)_

