# Bug list: testing with real Excel data

Branch `fix/bugs-2026-10-13` (from `main` @ `b17caaf`). Nothing reaches `main` / production until "deploy".
Fixing starts once the app folder (`D:\sge-obms-yard-ledger`) is free; until then bugs are only recorded here.

Status: **open** (recorded) · **confirmed** (reproduced on the live site) · **fixed** (on this branch, checked on `npm run dev`) · **needs owner** (business-rule question) · **deployed**.
Screenshots, when saved as files, go in `docs/bugs/` as `B<nn>-<n>.png`. Never include Aadhaar, bank or wage details.

## Summary
| # | Reported | Role · site · page | Bug | Status |
|---|---|---|---|---|
| B01 | 2026-10-13 | Super Admin · all sites · Master Data → Sites | Can't type a comma (or a space after a word) in "Plants (comma)", so plants can't be added on Add site or Edit | confirmed |

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
- Fix: _pending (app folder busy)_

