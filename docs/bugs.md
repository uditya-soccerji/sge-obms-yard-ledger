# Bug list: testing with real Excel data

**Now on branch `fix/bugs-2026-10-14`, made from the latest `main` @ `7cfbdde`** (after the merge plan, PRs #12–#20).
The first round of fixes was built on the old `main` (branch `fix/bugs-2026-10-13`, kept for reference, never merged) and is being **ported** here one by one.
Port status: B01 ✅ already on `main` · B02 ✅ ported · B03 ✅ ported · B04 ⏳ · B05 ⏳ · B06 ⏳ (top up `main`'s request flow) · B07 ⏳ · B08 ⏳ (add Admin + draft saves) · B09 ✅ ported (+ RIL export, EIC) · B10 ✅ ported.

Status: **open** (recorded) · **confirmed** (reproduced on the live site) · **fixed** (on this branch, checked on `npm run dev`) · **needs owner** (business-rule question) · **deployed**.
Screenshots, when saved as files, go in `docs/bugs/` as `B<nn>-<n>.png`. Never include Aadhaar, bank or wage details.

## Summary
| # | Reported | Role · site · page | Bug | Status |
|---|---|---|---|---|
| B01 | 2026-10-13 | Super Admin · all sites · Master Data → Sites | Can't type a comma (or a space after a word) in "Plants (comma)", so plants can't be added on Add site or Edit | fixed |
| B02 | 2026-10-13 | Super Admin · MTF · Master Data → Sites | Feature: plants need locations under them, and each plant/location needs an RP (MTF runs RP2 and RP5) | fixed (migration to apply at deploy) |
| B03 | 2026-10-13 | Supervisor (Prasan Da, viewed as) · MTF · DPR → New | New supervisor's DPR shows an empty Labour attendance, and there's no way to give them labourers | fixed (shared database still to do) |
| B04 | 2026-10-13 | Admin · DPR approvals | Admin approves DPR work quantities on SIC's behalf; both logged | fixed |
| B05 | 2026-10-13 | Supervisor · DPR → Equipment assigned | Equipment needs a detailed per-supervisor "setup" list (kinds, expiry, FEFO/FIFO), with expiry added by the supervisor | fixed |
| B06 | 2026-10-13 | Store / Central store · dashboard | Equipment status changes reach SIC + site store + central store; requests board with urgent first and status buttons | fixed |
| B07 | 2026-10-13 | Supervisor (Prasan Da) · MTF · DPR → Painting/blasting work | Line needs plant, location, activity, area m², MPS, paint type and litres per paint type | fixed |
| B08 | 2026-10-13 | Supervisor · DPR → Save / Submit | Save and Submit should notify SIC and Admin | fixed |
| B09 | 2026-10-13 | Super Admin · DTA · Master Data → Labourers | Feature: bulk labourer upload (CSV from Excel) with skill level and duplicate checks | fixed |
| B10 | 2026-10-13 | Super Admin · Master Data → Labourers | Name and EP boxes squeezed to ~22 px (Supervisor column from B03 overflowed the row) | fixed |

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
- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - `SiteForm` keeps the plants as typed text; `parsePlants()` (new, `src/lib/site-scope.ts`) splits on Save: trims, collapses spaces, drops blanks, keeps duplicates (ignoring case) once. A live "N plants" counter shows under the field.
  - (a) `checkSiteCode()` (new): code required, 2–6 capital letters, unique (§3). Messages: "Site code is required", "…must be 2–6 capital letters", "Site code DTA is already used".
  - (b) `remoteSaveSite` returns the Supabase error; `upsertSite` is now async, saves to Supabase **first** and only then updates the screen, so a refused save shows "Not saved: …" instead of looking saved. Deactivate / Activate uses the same path.
  - (c) is left for B02 / merge plan PR 2 (plant matching ignoring case).
- Verified on `npm run dev` (Super Admin, local data only, no Supabase): typed `, RT, X` one character at a time into DTA and got commas and spaces kept, counter 15; typed into MTF and got "MTF, ARMA, RRTF, NEW · 4 plants" (screenshot), then Cancel left it unchanged. Saving messy text `ARMA,  AROMATIC ,coker, COKER, PRU   &  HPIB, , ` gave "Saved DTA · 4 plants" = ARMA, AROMATIC, coker, PRU & HPIB, after which DTA's 13 plants were restored. Empty / bad / duplicate code messages shown. No console errors. `tsc` + `eslint src` clean; `npm run build` runs at deploy (it can't run beside the dev server).

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
- Fix (2026-10-13, branch `fix/bugs-2026-10-13`). Built smaller than the plan above: no new tables, one JSON column on the site row, so it saves with the site under the existing `sites_write` policy.
  - Data: `Site.plantDetails: { name, rp?, locations: { name, rp? }[] }[]` (`src/lib/types.ts`). A plant with no entry has no locations and takes the site's RP when the site runs one RP. A location with no RP takes its plant's.
  - Pure helpers in `src/lib/site-scope.ts`: `sitePlantDetails`, `plantRp`, `locationRp`, `buildPlantDetails` (trim, drop blank/duplicate locations, drop renamed/removed plants), `checkPlantRps` (every RP must be one the site runs), `parseRpTags`.
  - Master Data → Sites → Edit: new **RPs run at this site** field, and under the plants a **Plants · RP · locations** editor. Each plant gets an RP picker (default "Site RP"); **Add location** rows each have name, RP ("Same as plant" or an override) and Remove. The table column now reads e.g. `MTF (RP5 · 5 loc), ARMA (RP2), RRTF (RP5 · 8 loc)`. Cell spacing fixed (codes / RP ran into the next column).
  - Supabase: migration `supabase/migrations/20261013_001_site_plant_details.sql` adds `sites.plant_details jsonb not null default '[]'` (must be an array). `remote.ts` loads and saves it.
  - Seed (`src/lib/seed.ts`): MTF = MTF RP5 (5 locations), ARMA RP2, RRTF RP5 (8 locations); DTA's ARMA RP2.
  - Not in B02: Work jobs / DPR lines picking plant → location from this list. That's B07 (painting line) and merge plan PR 2.
- Verified on `npm run dev` as Super Admin (local data only): entered MTF's RPs and all 13 locations through the editor → "Saved MTF · 3 plants · 13 locations". After a page reload: RRTF RP5, RRTF location 6 "RIL-2", MTF location 2 "Saipem to DTA product (CT vicinity)" all kept. A location RP override saved and reloaded, then was removed again. Site RPs set to only RP5 → refused: "ARMA: RP2 isn't one of this site's RPs (RP5)". DTA's plants show RP2 from the site. No console errors; `tsc` + `eslint src` clean.
- **Before deploy:** apply the migration to the live Supabase project (`sge-obms`) **first**. Every site save now writes `plant_details`, so without the column all site saves would fail with "Not saved: …". Then enter MTF's RPs and locations on the live site (same steps as above).

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
- Owner answers (2026-10-13), now `docs/rules-decisions.md` §20:
  1. **Standing crew** per site. The SIC can change it. Every change is logged, and Owner + Super Admin are notified of major changes (a labourer moved off a crew).
  2. A supervisor **picking** labourers needs SIC approval. **Attendance** for their crew is submitted directly, and the SIC only gets a notification.
  3. A labourer on **another crew** needs SIC approval, and that supervisor is notified. If they **release** the labourer, the transfer can go ahead.
- Build adds to the fix plan: `CrewRequest` (requester, labourer, from-supervisor, status: requested / released / approved / rejected); events `crew_changed` (problem flag for moves off a crew → Owner/SA), `crew_requested` (to SIC + current supervisor, instant), `crew_released`, `crew_approved` / `crew_rejected` (to requester), `attendance_submitted` (to SIC, daily summary).
- Answered (2026-10-13): attendance counts on submit (SIC notified). Work quantities are still approved, by the SIC or by Admin on the SIC's behalf (see B04). So `attendanceFromApprovedDpr` moves from approval to submit.
- Fix (2026-10-13, branch `fix/bugs-2026-10-13`), parts (a)–(d) plus attendance on submit:
  - Rights: new module `crew` (`src/lib/types.ts`, `ROLE_MATRIX`). Owner / Super Admin `view, approve, update`; SIC `view, approve`; supervisor `view` only. The per-person **"Can pick own crew"** right is the override `crew:create`, switched in Master Data → Users / seats (a checkbox under each supervisor's role, Owner / SA only).
  - Rules in `src/lib/crew.ts` (pure): `canManageCrew`, `canPickOwnCrew`, `checkCrewRequest` (active, same site, not already on the crew, not already requested), `approveBlock` (a labourer still on another crew can't be approved until released).
  - Store (`src/lib/store.tsx`): `assignCrew`, `removeFromCrew`, `requestCrew`, `releaseCrew`, `decideCrew` (reject needs a reason); `AppState.crewRequests`. Every action writes an audit entry (module `crew`).
  - Notifications (`src/lib/work/events.ts`): `crew_changed` (problem when someone moves off a crew → Owner / SA), `crew_requested`, `crew_released`, `crew_decided` (instant). The SIC of the site and both supervisors involved are told. New `alsoStaffId` so a second supervisor hears; `notify()` on the Work API; bell links open Operations → Crews.
  - **Operations → Crews** (`src/components/crew/crew-desk.tsx`, `/crew`): SIC / Owner / SA pick a supervisor, see the crew, "Take off crew", add from **Unassigned** / **On other crews**, and Approve / Reject requests. A supervisor sees **My crew**, Releases labourers others ask for, and (with the right) requests labourers with a note for the SIC.
  - Master Data → Labourers: new **Supervisor** column (a change there goes through the same crew actions, logged + notified); **Add labourer** starts with no crew (was `staff[0]` = Super Admin).
  - DPR form: an empty crew shows "No labourers are on this supervisor's crew yet… Operations → Crews".
  - **Attendance now counts on submit** (`submitDpr` derives it; `reviewDpr` only reviews the work). A resubmit replaces that DPR's marks; another DPR's marks stay (split day, §4).
- Verified on `npm run dev` (local data, demo logins):
  - Super Admin ticked "Can pick own crew" for @paint → "@paint can now pick their own crew".
  - SIC → Crews (DTA): took Imran Shaikh off K. Solanki (3 → 2) and moved Ramesh Kumar from V. Chauhan (→ 3). SIC's bell showed both as **PROBLEM**.
  - @paint (V. Chauhan) saw "My crew 23", no take-off buttons; requested Imran Shaikh (note "Need for B-12 blasting") and Mahesh Rathod (M. Rathwa's crew).
  - @scaffold (M. Rathwa) got an instant "V. Chauhan asks for Mahesh Rathod… they must release first", saw only that request, had no pick box, and released him.
  - SIC: Reject without a reason was refused; approved both → V. Chauhan's crew 25 incl. both.
  - A new request for Anil Prajapati (still on M. Rathwa's crew, not released) showed Approve disabled with "Waiting for the current supervisor to release". Rejected with a reason.
  - Super Admin filed K. Solanki's DPR: the crew listed Ramesh Kumar (the SIC's move), and Submit recorded 3 attendance marks while the DPR stayed **submitted** (not approved); audit "attendance recorded".
  - Audit log listed all 9 crew actions in order. `tsc` + `eslint src` clean, no console errors.
- **Not done (e):** labourers and crews still live in each browser, not Supabase (AGENTS.md §2). On the live site, a crew change made on one device won't show on another until labourers move to the shared database. That's a backend step of its own (migration + RLS); confirm before it's applied.

### B04: Admin approves work quantities on the SIC's behalf
- Owner rule (2026-10-13, `rules-decisions.md` §5): Admin may approve a DPR's work quantities **on behalf of the SIC**. Both are logged: who approved, as whom ("Admin for SIC <name>").
- Today: Admin's rights have `dpr: view/create/update/upload/submit` with no `approve` (`ROLE_MATRIX.admin`, `src/lib/permissions.ts`). `reviewDpr` records only `sicReviewedBy`.
- Fix plan: give Admin `dpr: approve` and `approvals: view/approve` for their sites. The review record gets `approvedBy`, `approvedAs: "sic" | "admin_for_sic"` and `onBehalfOf` (the site's SIC). Audit/event text: "Approved by N. Sharma (Admin) on behalf of R. Mehta (SIC)". The SIC gets a notification that Admin approved.

- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - Rights: Admin gets `dpr: approve` and `approvals: view, approve`, plus an **Approvals** tab under Operations.
  - Record: `DprDocument.reviewedAs` (`sic` | `admin_for_sic` | `owner` | `super_admin`) and `reviewedOnBehalfOf` (the site's SIC, found by `siteSicId` in new `src/lib/dpr-review.ts`).
  - The audit entry, the inbox's "Recent decisions" and the DPR page all show e.g. **"Approved by N. Sharma (Admin) on behalf of R. Mehta (SIC)"** (`reviewLine`).
  - Notification `dpr_reviewed` (instant): the submitter (§19) and the SIC. A send-back is flagged as a problem.
  - Admin sees a banner "You are reviewing as Admin on behalf of the SIC…", and each DPR shows "for SIC <name>".
  - Approval texts updated: attendance is recorded at submit (B03); approval accepts the work quantities. The review time shows in Indian time.
- Verified on `npm run dev`:
  - As @admin: the Approvals tab, banner and "for SIC R. Mehta" appear. Approving K. Solanki's DPR with note "Checked against site log" gave "Approved — work quantities accepted on the SIC's behalf (the SIC is notified)". Stored: `reviewedAs: admin_for_sic`, `reviewedOnBehalfOf: st-sic`, audit "Approved by N. Sharma (Admin) on behalf of R. Mehta (SIC) · Checked against site log".
  - As @sic: the bell showed it instantly with that line; the DPR page's Review panel shows it with "13 Oct 2026, 4:46 am".
  - `tsc` + `eslint src` clean.

### B05: Supervisor equipment "setup", in detail
- Ask: under each supervisor, a **setup** listing every item assigned: Compressor, Hopper, Airless spray painting machine, Harness, PPE kit, IFR, Helmet, Gloves, Rope access. Each with expiry, opening in detail. List order can be **FEFO** (first expiry first out) or **FIFO** (first issued first out). The **supervisor can add the expiry** himself.
- Screenshot (Prasan Da, MTF, DPR → New): "Equipment assigned" shows a flat tick list of the site's items (AIR-MTF-01 airless, COM-MTF-02 compressor, HAR-MTF-03 harness) with status and expiry. Nothing is per supervisor, there's no detail view, and expiry can't be edited.
- Today: `EquipmentItem` (`src/lib/types.ts`) knows only 4 kinds (hopper, compressor, airless, harness), one optional `expiryDate`, status ok/due/fault and `assignedTo`. The DPR lists every item on the site (`dpr-form.tsx`: `state.equipment.filter(e => e.siteId === value.siteId)`).
- Fix plan: kinds list in Master Data (the 9 above, extendable). Item fields: tag (§7 `TYPE-SITE-##`), kind, assigned supervisor, issued on, expiry, status, qty for consumables (gloves, PPE kits), and a history of status/expiry changes. Setup view per supervisor with a FEFO/FIFO toggle and expiry badges (§7: warn 15 days before). The DPR lists only the supervisor's own setup. The supervisor can set or adjust an expiry; that's logged and the store is notified (B06).
- Answers (2026-10-13): **IFR** is a protective **body suit**, about **₹5,000** each, so it's tracked per item, with its value. **Gloves and PPE kits** are counted **separately**: each is its own line with its own quantity (and expiry), not one tag per pair.
- Added to the fix plan: an optional **unit value (₹)** per kind (IFR ₹5,000) so the setup shows what a supervisor holds in rupees. Kinds are either **tagged** (one record each: compressor, hopper, airless, harness, IFR, helmet, rope access) or **counted** (quantity + expiry per batch: gloves, PPE kits).

- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - Kinds (`src/lib/equipment.ts`, `EQUIPMENT_KINDS`): Compressor, Hopper, Airless spray painting machine, Harness, PPE kit (counted), IFR body suit (tagged, ₹5,000), Helmet, Gloves (counted), Rope access kit. Kept as a code list for now, not yet a Master Data sheet.
  - `EquipmentItem` gains `supervisorId` (whose setup), `qty` (counted kinds), `issuedOn` (FIFO) and `history` (who / when / what). Pure helpers: `setupOf`, `sortSetup` (FEFO / FIFO), `equipExpiryState` (15-day warning, §7), `setupValue`, `nextTag` (TYPE-SITE-##), `checkExpiry`.
  - Rights: new `equipment` module. SIC, Store, Owner, SA `view / create / update`; supervisor `view / update` (own setup, expiry only).
  - Store actions: `issueEquipment` (tagged → one tag each, counted → one batch with qty), `assignEquipment` (site item into / out of a setup), `setEquipmentExpiry` (own item for a supervisor). Each writes item history and the audit log.
  - **Operations → Equipment** (`/equipment`, `src/components/equipment/setup-desk.tsx`). SIC / Store / Owner / SA pick a supervisor, issue items (next tag shown) and add site items to the setup. A supervisor sees **My setup**. Both get the FEFO / FIFO toggle, expiry badges (EXPIRED / soon), "value held", and a click-to-open detail with expiry edit and full history.
  - Bell `equipment_changed` → SIC and Store of the site. A Store login on all sites = the central store (B06), so it already hears every site. An expiry already past is a problem (instant); other changes go to the daily summary.
  - DPR (painting / scaffolding): Equipment assigned lists the submitter's own setup; with no setup yet, the site's unassigned kit. Store / safety DPRs keep the site list. Readable kind labels on the DPR and Store page.
  - Seed: DTA's hopper, compressor and airless go to V. Chauhan, its harnesses to K. Solanki; other sites alternate between their two supervisors (fresh browsers only).
- Verified on `npm run dev`:
  - As @store (DTA): 5 site items listed as not in any setup. Added HOP-DTA-03 and CMP-DTA-01 to V. Chauhan's setup; issued IFR × 2 (exp 2027-03-31) → "IFR-DTA-01, IFR-DTA-02"; gloves × 20 (exp 2026-10-20) → one batch GLV-DTA-01. Qty 0 refused. Setup: 5 items, "2 expiring / expired", "Value held ₹10,000", FEFO order CMP (EXPIRED) → GLV (soon) → HOP → IFR, IFR. Hint shows the real next tag (CMP-DTA-02).
  - As @paint (V. Chauhan): **My setup** with no Issue box / no Return to store. Set CMP-DTA-01 expiry → "Expiry 2026-10-08 → 2027-04-08". History shows that and "A. Joshi · site store → V. Chauhan". New DPR's Equipment assigned = exactly his 5 items ("IFR-DTA-01 · IFR (body suit)", "GLV-DTA-01 · Gloves × 20").
  - As @sic: the daily summary shows "5 Equipment changed".
  - `tsc` + `eslint src` clean.
- Not done: equipment, like labourers, is still saved per browser (not Supabase).

### B06: Equipment status → SIC + site store + central store; store requests board
- Ask: any change in equipment status is shown to the **SIC**, the **Store manager of that site** and a **Central store manager** who sees all sites. Requests for **issue or exchange** appear on the store dashboard, **urgent first**, with buttons/filters: **SIC approval pending, fulfilled, not fulfilled, rejected**.
- Today: there's one `store` role (site-scoped) and no central store. `EquipmentRequestStatus` is open / fulfilling / fulfilled / cancelled, with no SIC-approval or reject step, although §9 says "Open → SIC approves → store fulfils → requester confirms". Requests have `kind` spare/equipment/material/other, with no "exchange".
- Fix plan: request statuses `sic_pending → approved → fulfilled | not_fulfilled | rejected` (reason required for reject / not fulfilled, §9), kind + `issue | exchange`. A store dashboard board sorted urgent-first with those filters. Events `equipment_status` (to SIC + site store + central store) and `request_*` (to requester, SIC, store).
- Answer (2026-10-13): the **Central store manager is a Store login with access to all sites** (one site at a time, like HR / Finance, §2). No new role. Notifications go to every Store login whose sites include the item's site, so the central one hears about all sites.

- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - Statuses (`EquipmentRequestStatus`): `sic_pending → approved → fulfilled | not_fulfilled`, or `rejected`; then `received`. Old `open / fulfilling / cancelled` are mapped on load (`migrateRequestStatus`), and the seeds are updated. Requests also carry `action: issue | exchange` + `exchangeItemId` (the setup item handed back), `sicBy / sicAt / sicNote`, `receivedAt`.
  - Rules in `src/lib/requests.ts` (pure): `REQUEST_STEPS` (from-status, to-status, note required for reject / not fulfilled, §9), `stepBlock`, `sortBoard` (urgent first, then oldest), `filterBoard`, `BOARD_FILTERS`.
  - Rights: SIC `requests: view, approve` (approve / reject); Store `requests: view, update` (fulfil / not fulfilled, **no longer** SIC-approve); the requester confirms **Received**.
  - Store action `stepEquipmentRequest(id, action, note)` replaces the old free-form `updateEquipmentRequest`; each step writes the audit log. DPR-raised requests start at "SIC approval pending".
  - **Requests board** (`src/components/requests/requests-board.tsx`): urgent first (urgent open rows highlighted), filter buttons with counts (All open, SIC approval pending, To fulfil, Fulfilled, Not fulfilled, Rejected), and only the buttons the viewer may use. It's the top panel of the **Store dashboard** ("Requests to handle") and of Operations → Requests. A new **Requests** tab for SIC and Owner.
  - Request form: Issue / Exchange; for an exchange, pick the item from your setup (B05). Plant from the site's Master Data plants (no more hard-coded CPP; falls back to the site's plants when a login's assigned plants no longer exist).
  - Bell: `request_raised` (SIC + store; urgent = problem) and `request_step` (requester + SIC + store; reject / not fulfilled = problem), all instant. The central store is a Store login on all sites, so it sees every site.
- Verified on `npm run dev` (local data):
  - As @paint (V. Chauhan): plant list = DTA's Master Data plants. Sent an **urgent exchange** (handing back CMP-DTA-01) and a spray-tips request → both "SIC approval pending". His board shows them (own requests show even outside his plant scope).
  - As @sic: Requests tab, no request form; approved the exchange → "Approved — to fulfil"; Reject without a reason → "Give a reason to reject"; with a reason → rejected, `sicNote` kept.
  - As @store: the Store page opens with "Requests to handle", urgent first. No buttons on SIC-pending items (the store can't SIC-approve). Marked the exchange **Fulfilled**; the Rejected filter shows "Rejected: Tips already in store bin B4".
  - As @paint: **Received** → status received. The bell showed every step (raised, approved, rejected = PROBLEM, fulfilled, received). Audit lists create → approve → reject → fulfil → received.
  - `tsc` + `eslint src` clean; no console errors.
- Not done: requests, like equipment, are still saved per browser (not Supabase).

### B07: Painting/blasting line fields
- Ask: each painting & blasting work line has **Plant name, Location, Activity, Area m², MPS, Paint type, and litres consumed per paint type**.
- Screenshot (Prasan Da, MTF, DPR → New → Painting / blasting work): the line has Bay / location (free text), Activity (Painting), Area m² (0), MPS (a plain number, "2") and one **Paint litres** box. There's **no plant on the line** (one plant for the whole DPR at the top), **no paint type**, and only one litres figure.
- Today: the old DPR line (`DprPaintWorkLine`) has plant, bay, activity, areaM2, mpsScheme (number) and a single `paintLitres`. The Work `DprEntry` has one `paintSap` + `litres`, so only one paint per line.
- Fix plan: line = plant (Master Data, B02) → location (B02) → activity → area m² (from members, max 2,000 per §5) → MPS (picked from the MPS list, not typed) → **paints: [{ paint type / SAP, litres }]** (one or more, "Add paint"). Paint stock deduction (§6) then runs per paint type, and litres far off the MPS norm are flagged (§5). Fold into merge plan PR 2 / PR 4.

- Note: on `main` the line already had its own Plant picker. The screenshot came from the older branch the other chat had open.
- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - New pure helpers `src/lib/dpr-paint.ts`: `mpsOptions` (schemes with norms + the work order's service-item MPS, so MPS-6 / MPS-23 are there), `paintChoicesFor(mps)` (the MPS system's paints from `PAINT_COATS`, plus Thinner, with SAP codes), `lineLitres`, `normLitres` (brush norm per coat × area + 10 % thinner), `normWarning` (more than 50 % off the norm, a warning only, §5).
  - `DprPaintWorkLine.paints: { type, sap?, litres }[]`; `paintLitres` is kept equal to their sum, because other screens still read it.
  - DPR form, painting line: Plant → **Location** (suggests the plant's Master Data locations from B02, or type a new spot) → Activity → Area m² → **MPS picked from a list** → **Total paint** with the norm beside it. A painting line gets a **Paint used** box: **Add paint** rows of paint type (suggested from that MPS) + litres, with Remove. New lines copy the previous line's plant and MPS.
  - Submit checks (`src/lib/dpr-validate.ts`): location required; painting needs an MPS; area > 0 needs at least one paint with litres; each paint row needs a type and litres > 0; no paint type twice.
  - Blasting lines don't ask for paint.
- Verified on `npm run dev` as Super Admin, new painting DPR on MTF (V. Chauhan): plants MTF / ARMA / RRTF; MPS list MPS-1…29 incl. 6 and 23; RRTF location suggestions = its 8 locations; MPS-2 paint suggestions = Type 4, Type 5, Type 6, Thinner. A 100 m² line with 30 + 40 + 15 L showed "85 L · norm ~83.9 L"; 220 L showed "⚠ 220 L is 162% above the MPS-2 norm (~83.9 L for 100 m²)". Submit listed "the same paint type is entered twice" and, for an empty 2nd line, plant / location / paint messages. Nothing was saved (checks stop Submit first). No console errors; `tsc` + `eslint src` clean.
- Not done here: deducting litres from the supervisor's paint stock per type (§6). That's merge plan PR 8 (paint on `PaintBatch`).

### B08: Save and Submit notify SIC and Admin
- Ask: when a supervisor **saves** or **submits** a DPR, the **SIC and Admin** are notified. (Screenshot buttons: "Save draft" and "Save & submit to SIC".)
- Today: the old DPR desk writes no notification events; Work events cover jobs, JMS and paint only.
- Fix plan: events `dpr_saved` and `dpr_submitted` for the site's SIC and Admin(s). Submit is instant (§19). Rename the button "Save & submit" (it goes to SIC and Admin).
- Answer (2026-10-13): a **draft save** goes into the **daily summary**; **submit** is instant.
- Fix (2026-10-13, branch `fix/bugs-2026-10-13`):
  - New bell events `dpr_submitted` (instant) and `dpr_saved` (daily summary), built by `dprSaveEvent` in `src/lib/dpr-review.ts`. Who sees them (`isFor`, `src/lib/work/events.ts`): the site's SIC and Admin, plus the submitter; Owner / SA see everything as before.
  - Raised from New DPR (Save draft / Save & submit) and the DPR page (Save draft / Submit). Clicking the notification opens that DPR.
  - Buttons renamed "Save & submit" / "Submit" (it now goes to SIC and Admin); the submit message says "the SIC and Admin are notified".
- Verified on `npm run dev`: as Super Admin, saved a draft DPR for K. Solanki (DTA · CRUDE) → event "DPR 2026-10-13 · CRUDE saved as draft"; marked his 3 crew and submitted from the DPR page → "DPR submitted — the SIC and Admin are notified", event "… submitted — review", status submitted. As @admin the bell showed the submit under **instant** and "1 DPR draft saved" in the **daily summary**. `tsc` + `eslint src` clean.

### B09: Bulk labourer upload (CSV) with skill level and duplicate checks
- Reported: 2026-10-13 · Role: Super Admin · Site: DTA · Page: Master Data → Labourers. The owner added a labourer by hand (fine) and wants to add many at once.
- Ask: an Excel upload for many labourers; add a **Skill level**; check duplicates on **EP number (old and new)** and on **Name + Trade + Skill level**. CSV is fine.
- Fix (branch `fix/bugs-2026-10-13`):
  - `Labourer.skill` (Highly skilled / Skilled / Semi-skilled / Unskilled) and `Labourer.epHistory` ([{ ep, until }]). Changing an EP archives the old one with the date (§1); the EP box now saves on Enter / leaving it, so a half-typed EP never lands in history. EP is stored upper-case with no spaces. Old EPs show on hover and are searchable.
  - New **Skill** column in the register.
  - **Upload CSV** (`src/components/master/labour-import.tsx`, rules in `src/lib/labour-import.ts`): Download template → choose file (Excel → Save As → CSV) → preview with every row checked → **Add N labourers** adds only the good rows (+ ticked possible duplicates) to the active site, in one go, with one audit entry.
  - Checks: Name, EP (PP + 10 digits), Trade (Master Data), Skill, Contractor (Master Data) required; Supervisor optional (must be a supervisor on that site → sets the standing crew, §20); Daily wage optional (₹ and commas allowed).
  - Duplicates: EP already used as a **current or old EP** → refused ("already belongs to Ramesh Kumar (old EP until …)"); same EP twice in the file → refused; **same Name + Trade + Skill** as someone registered (or an earlier line) → "possible duplicate", added only if ticked. The store re-checks EPs before adding.
- Verified on `npm run dev` (Super Admin, DTA, local data):
  - Set Ramesh Kumar skill Skilled and EP PP5920188421 → PP5920188499: history = [PP5920188421 until 2026-10-13], hover shows it.
  - Uploaded a 10-row test file → 2 ready, 1 possible duplicate, 7 errors. Each check fired: current EP, old EP (`pp 5920188421` matched after tidying), bad EP format, unknown trade, missing skill, unknown contractor + supervisor, EP twice in file. "Ramesh  Kumar / painter / skilled" flagged as a possible duplicate; `"Patel, Test"` and `"1,000"` read correctly.
  - Ticked the possible duplicate → "Add 3 labourers" → "Added 3 labourers to DTA". Records have skill, trade, supervisor (V. Chauhan / none / K. Solanki), wage 1000; audit "import · 3 labourers from labour-test.csv".
  - `tsc` + `eslint src` clean.
- Not done: true .xlsx reading (CSV from Excel instead, no new library). Labourers still live per browser (not Supabase).

### B10: Labourer register columns squeezed
- Reported: 2026-10-13 (owner's screenshot): rows started at the Trade box; Name and EP were too narrow to read.
- Cause: the dropdowns (Trade / Contractor / Supervisor) took their full text width, and grid children couldn't shrink, squeezing Name and EP to ~22 px.
- Fix: fixed minimum column widths, children allowed to shrink, and the register scrolls sideways on narrow screens (min width 1,000 px). Verified: Name 160 px, EP 144 px.

### B09 / B10 on the new `main` (2026-10-14)
- Ported onto `main`'s labourer register, which already has its own add form, `checkLabourer` (`lib/labourers.ts`) and `normalizeEp` (`lib/ep.ts`). The upload reuses those rules.
- New labourer fields: `skill`, `epHistory` (old EP archived with its date when it changes; `checkLabourer` also refuses an old EP), and, from the owner on 2026-10-14, **`eic`** (RIL Engineer-in-Charge, a reference contact shown as fixed text on the profile), **`rilStatus`** (Workman Status) and **`rilArea`** (Area Of Movement).
- The upload (`lib/labour-import.ts`, `components/master/labour-import.tsx`) reads our template **and RIL's "Employee Details" export as it is** (Full Name, Worker ID, Trade, CATEGORY, Select EIC, Workman Status, Area Of Movement). Owner's choices, 2026-10-14:
  - site from the area: Refining / OM&SH DTA → DTA, PCG and SEZ → PCG, Solar / NEI / Polysilicon / Glass → **SOLAR** (new site), otherwise the screen's site;
  - "(Do Not Use)_X" trades filed under X; missing trades can be added to Master Data in the same step;
  - "#N/A" category → skill blank (flagged);
  - Terminated → inactive, Expired / Hibernated → active but shown in red;
  - no contractor → Shree Gayatri Enterprise (own);
  - no Aadhaar / supervisor / wage in the file → imported as **incomplete** (`checkLabourer(..., { allowIncomplete })`), with a count badge in the register ("still to fill: supervisor, wage, Aadhaar, skill").
- Register (B10): fixed minimum column widths, sideways scroll, new Skill and "RIL pass · EIC" columns (hover = status, area, EIC). Search also finds skill, EIC, status and old EPs. Profile page shows RIL pass, EIC and skill.
- **Owner's file imported into the local test app** (`App Dump/employees_list.xlsx` → `employees_list.csv`, same columns; served once to the page, never put in the repo):
  - 1,825 rows → **1,781 added** (DTA 1,354 · PCG 215 · SOLAR 212) + **40 new trades**; 1 Terminated added as inactive; EIC on all 1,781.
  - Skill: semi-skilled 805, unskilled 437, skilled 319, highly skilled 4, blank 216.
  - Skipped: **5** with a bad or missing EP (2 garbled, 3 blank).
  - Held back: **39** possible duplicates (same name, trade and skill as another row, each with its own Worker ID).
  - Owner, 2026-10-14: they are different workers (own RIL pass, mostly different EIC). **34 added** (26 groups with different EICs) → 1,815 in the local app. **5 held** where both rows share an EIC (Mukesh Mahato PP5920139371, Akash Das PP5920058891, Sumit Mahato PP5920150839, Niraj Kumar PP5920136768, Pradip Mahato PP5920130714) until the site confirms. Nakum Haresh (SOLAR, same EIC) was already added twice in the first run: his skill is blank, and the duplicate check does not match blank skills.
  - The register runs smoothly at 1,404 rows on DTA; no console errors. `tsc` + `eslint src` clean.
- Note: the SOLAR site was added in the local app only. On the live site it's added in Master Data → Sites at deploy time (a live database write).

### B03 on the new `main` (2026-10-14)
- Crews ported: `lib/crew.ts`, Operations → **Crews** (SIC / Owner / SA) and **My crew** (supervisor), crew requests with SIC approval, release by the current supervisor, "Can pick own crew" right on the Users table. Rules in `rules-decisions.md` §23 (renumbered: `main` already has §20–§22).
- Master Data → Labourers: changing a supervisor is now a crew change (logged, notified).
- Attendance now counts when the DPR is **submitted** (Work store `submitReport` → `applyDprAttendance`); the SIC review covers the work quantities only.
- DPR shows a message when the supervisor has no crew yet; trade shows its name, not its id.
- Checked locally: SIC assigned 2 labourers (crew 24 → 26); the supervisor's DPR lists the imported labourers; a submitted DPR recorded attendance for 3 (audit "attendance recorded at submit for 3"). `tsc` + `eslint src` clean.

