# Bug list: testing with real Excel data

Branch `fix/bugs-2026-10-13` (from `main` @ `b17caaf`). Nothing reaches `main` / production until "deploy".
Fixing starts once the app folder (`D:\sge-obms-yard-ledger`) is free; until then bugs are only recorded here.

Status: **open** (recorded) · **confirmed** (reproduced on the live site) · **fixed** (on this branch, checked on `npm run dev`) · **needs owner** (business-rule question) · **deployed**.
Screenshots, when saved as files, go in `docs/bugs/` as `B<nn>-<n>.png`. Never include Aadhaar, bank or wage details.

## Summary
| # | Reported | Role · site · page | Bug | Status |
|---|---|---|---|---|
| B01 | 2026-10-13 | Super Admin · all sites · Master Data → Sites | Can't type a comma (or a space after a word) in "Plants (comma)", so plants can't be added on Add site or Edit | fixed |
| B02 | 2026-10-13 | Super Admin · MTF · Master Data → Sites | Feature: plants need locations under them, and each plant/location needs an RP (MTF runs RP2 and RP5) | open (ready to build) |
| B03 | 2026-10-13 | Supervisor (Prasan Da, viewed as) · MTF · DPR → New | New supervisor's DPR shows an empty Labour attendance, and there's no way to give them labourers | open (rules agreed, §20) |
| B04 | 2026-10-13 | Admin · DPR approvals | Admin approves DPR work quantities on SIC's behalf; both logged | open (rule agreed) |
| B05 | 2026-10-13 | Supervisor · DPR → Equipment assigned | Equipment needs a detailed per-supervisor "setup" list (kinds, expiry, FEFO/FIFO), with expiry added by the supervisor | open (ready to build) |
| B06 | 2026-10-13 | Store / Central store · dashboard | Equipment status changes reach SIC + site store + central store; requests board with urgent first and status buttons | open (ready to build) |
| B07 | 2026-10-13 | Supervisor (Prasan Da) · MTF · DPR → Painting/blasting work | Line needs plant, location, activity, area m², MPS, paint type and litres per paint type | open |
| B08 | 2026-10-13 | Supervisor · DPR → Save / Submit | Save and Submit should notify SIC and Admin | open (ready to build) |

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
- Owner answers (2026-10-13), now `docs/rules-decisions.md` §20:
  1. **Standing crew** per site. The SIC can change it. Every change is logged, and Owner + Super Admin are notified of major changes (a labourer moved off a crew).
  2. A supervisor **picking** labourers needs SIC approval. **Attendance** for their crew is submitted directly, and the SIC only gets a notification.
  3. A labourer on **another crew** needs SIC approval, and that supervisor is notified. If they **release** the labourer, the transfer can go ahead.
- Build adds to the fix plan: `CrewRequest` (requester, labourer, from-supervisor, status: requested / released / approved / rejected); events `crew_changed` (problem flag for moves off a crew → Owner/SA), `crew_requested` (to SIC + current supervisor, instant), `crew_released`, `crew_approved` / `crew_rejected` (to requester), `attendance_submitted` (to SIC, daily summary).
- Answered (2026-10-13): attendance counts on submit (SIC notified). Work quantities are still approved, by the SIC or by Admin on the SIC's behalf (see B04). So `attendanceFromApprovedDpr` moves from approval to submit.
- Fix: _pending (app folder busy)_

### B04: Admin approves work quantities on the SIC's behalf
- Owner rule (2026-10-13, `rules-decisions.md` §5): Admin may approve a DPR's work quantities **on behalf of the SIC**. Both are logged: who approved, as whom ("Admin for SIC <name>").
- Today: Admin's rights have `dpr: view/create/update/upload/submit` with no `approve` (`ROLE_MATRIX.admin`, `src/lib/permissions.ts`). `reviewDpr` records only `sicReviewedBy`.
- Fix plan: give Admin `dpr: approve` and `approvals: view/approve` for their sites. The review record gets `approvedBy`, `approvedAs: "sic" | "admin_for_sic"` and `onBehalfOf` (the site's SIC). Audit/event text: "Approved by N. Sharma (Admin) on behalf of R. Mehta (SIC)". The SIC gets a notification that Admin approved.

### B05: Supervisor equipment "setup", in detail
- Ask: under each supervisor, a **setup** listing every item assigned: Compressor, Hopper, Airless spray painting machine, Harness, PPE kit, IFR, Helmet, Gloves, Rope access. Each with expiry, opening in detail. List order can be **FEFO** (first expiry first out) or **FIFO** (first issued first out). The **supervisor can add the expiry** himself.
- Screenshot (Prasan Da, MTF, DPR → New): "Equipment assigned" shows a flat tick list of the site's items (AIR-MTF-01 airless, COM-MTF-02 compressor, HAR-MTF-03 harness) with status and expiry. Nothing is per supervisor, there's no detail view, and expiry can't be edited.
- Today: `EquipmentItem` (`src/lib/types.ts`) knows only 4 kinds (hopper, compressor, airless, harness), one optional `expiryDate`, status ok/due/fault and `assignedTo`. The DPR lists every item on the site (`dpr-form.tsx`: `state.equipment.filter(e => e.siteId === value.siteId)`).
- Fix plan: kinds list in Master Data (the 9 above, extendable). Item fields: tag (§7 `TYPE-SITE-##`), kind, assigned supervisor, issued on, expiry, status, qty for consumables (gloves, PPE kits), and a history of status/expiry changes. Setup view per supervisor with a FEFO/FIFO toggle and expiry badges (§7: warn 15 days before). The DPR lists only the supervisor's own setup. The supervisor can set or adjust an expiry; that's logged and the store is notified (B06).
- Answers (2026-10-13): **IFR** is a protective **body suit**, about **₹5,000** each, so it's tracked per item, with its value. **Gloves and PPE kits** are counted **separately**: each is its own line with its own quantity (and expiry), not one tag per pair.
- Added to the fix plan: an optional **unit value (₹)** per kind (IFR ₹5,000) so the setup shows what a supervisor holds in rupees. Kinds are either **tagged** (one record each: compressor, hopper, airless, harness, IFR, helmet, rope access) or **counted** (quantity + expiry per batch: gloves, PPE kits).

### B06: Equipment status → SIC + site store + central store; store requests board
- Ask: any change in equipment status is shown to the **SIC**, the **Store manager of that site** and a **Central store manager** who sees all sites. Requests for **issue or exchange** appear on the store dashboard, **urgent first**, with buttons/filters: **SIC approval pending, fulfilled, not fulfilled, rejected**.
- Today: there's one `store` role (site-scoped) and no central store. `EquipmentRequestStatus` is open / fulfilling / fulfilled / cancelled, with no SIC-approval or reject step, although §9 says "Open → SIC approves → store fulfils → requester confirms". Requests have `kind` spare/equipment/material/other, with no "exchange".
- Fix plan: request statuses `sic_pending → approved → fulfilled | not_fulfilled | rejected` (reason required for reject / not fulfilled, §9), kind + `issue | exchange`. A store dashboard board sorted urgent-first with those filters. Events `equipment_status` (to SIC + site store + central store) and `request_*` (to requester, SIC, store).
- Answer (2026-10-13): the **Central store manager is a Store login with access to all sites** (one site at a time, like HR / Finance, §2). No new role. Notifications go to every Store login whose sites include the item's site, so the central one hears about all sites.

### B07: Painting/blasting line fields
- Ask: each painting & blasting work line has **Plant name, Location, Activity, Area m², MPS, Paint type, and litres consumed per paint type**.
- Screenshot (Prasan Da, MTF, DPR → New → Painting / blasting work): the line has Bay / location (free text), Activity (Painting), Area m² (0), MPS (a plain number, "2") and one **Paint litres** box. There's **no plant on the line** (one plant for the whole DPR at the top), **no paint type**, and only one litres figure.
- Today: the old DPR line (`DprPaintWorkLine`) has plant, bay, activity, areaM2, mpsScheme (number) and a single `paintLitres`. The Work `DprEntry` has one `paintSap` + `litres`, so only one paint per line.
- Fix plan: line = plant (Master Data, B02) → location (B02) → activity → area m² (from members, max 2,000 per §5) → MPS (picked from the MPS list, not typed) → **paints: [{ paint type / SAP, litres }]** (one or more, "Add paint"). Paint stock deduction (§6) then runs per paint type, and litres far off the MPS norm are flagged (§5). Fold into merge plan PR 2 / PR 4.

### B08: Save and Submit notify SIC and Admin
- Ask: when a supervisor **saves** or **submits** a DPR, the **SIC and Admin** are notified. (Screenshot buttons: "Save draft" and "Save & submit to SIC".)
- Today: the old DPR desk writes no notification events; Work events cover jobs, JMS and paint only.
- Fix plan: events `dpr_saved` and `dpr_submitted` for the site's SIC and Admin(s). Submit is instant (§19). Rename the button "Save & submit" (it goes to SIC and Admin).
- Answer (2026-10-13): a **draft save** goes into the **daily summary**; **submit** is instant.

