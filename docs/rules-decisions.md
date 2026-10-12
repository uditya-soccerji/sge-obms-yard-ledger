# Rules & formats — decisions (review started 2026-10-09)

Answers from the module-by-module review. Not built yet; implemented together at the end.

## 1. Labourers
- **EP number:** `PP` + 10 digits, e.g. `PP5920136007`. Auto-uppercase. Unique.
- **EP history:** keep it. A new EP archives the old one with dates; the current EP shows everywhere.
- **Gate pass:** not needed — remove the field.
- **Aadhaar:** required, 12 digits, unique, stored digits only. It is the permanent ID. Visible only to Owner / Super Admin / HR.
- **Daily wage:** a min–max range per trade, set in Master Data.
- **Required fields:** mobile (10 digits, starts 6–9), trade sub-category (when the trade has them), contractor, supervisor.
- **Delete:** Owner / Super Admin can delete; everyone else can only deactivate.

## 2. Users & logins
- **Username:** lowercase, 3–20 chars, a–z / 0–9 / dot, no spaces (e.g. `uditya`, `r.mehta`).
- **Password:** any characters, at least 6.
- **Roles:** exactly one role per login.
- **One device per login, never shared.** (Needs a shared server — see open point below.)
- **Second device:** the sign-in waits until Owner / Super Admin approves the new device.
- **Shared database:** decided — move from browser-only storage to a shared Supabase database after this review, so everyone sees the same data and the device rule can be enforced.
- **Sites:** Supervisor = one site, can cover several plants there. SIC = one or more sites. HR / Finance / Admin = all sites (one at a time). Only Owner / Super Admin get the All sites view.

## 3. Sites & plants
- **Site code:** no preference given → default: 2–6 capital letters, unique (e.g. `DTA`, `MARINE`).
- **Add / switch off a site:** Owner and Super Admin.
- **Switched-off site:** stays listed, greyed out, read-only — can be opened, no new entries.
- **Plants:** every site needs at least one plant; the same plant name may sit under two sites (e.g. ARMA under DTA and MTF); every DPR and request must pick a plant. Duplicate plant names within one site: not blocked (not chosen).

## 4. Attendance
- **Statuses:** Present, Half day, Absent, Leave, Weekly off, Overtime.
- **Back-dating:** today and yesterday only.
- **Shift:** 08:00–18:00. Out-time must be after in-time. Hours past the shift become overtime automatically.
- **Verification:** daily dumps from ACPL and eSSL (gate/biometric) are matched against the DPR attendance.
- **Two supervisors, same day:** allowed as a split day (times must not overlap).
- **Still open:** when OT starts counting, OT pay rate, half-day rule, ACPL/eSSL file format.

## 5. DPR
- **Deadline:** next day by 10:00.
- **Before submitting:** permit + TBT confirmed, every crew member's attendance marked, work quantity filled (m² / m³ above zero, or a reason for zero).
- **SIC review:** approve, or reject with a reason; a rejected DPR goes back to the supervisor to fix and resubmit.
- **After approval:** locked. Owner / Super Admin can unlock, with a logged reason.
- **Types:** Painting & blasting, Scaffolding, Safety, Store — plus new DPRs for HR, Admin and other logins (contents to define).
- **Painting line:** plant, location / bay, MPS scheme, job start date and end date all required (start/end are used to check the JMS). Max 2,000 m² per line. Warn when litres are far off the MPS norm for the area.
- **Scaffolding line:** erect, dismantle, standing, and lifting & shifting.
- **How many per day:** any number.
- **Job register:** new record — job no. (e.g. `J-DTA-0142`), plant, location, scope (m² / m³), MPS, start, end. Every DPR line picks a job; progress = sum of DPR lines vs scope; JMS is checked against the job.
- **Lifting & shifting:** counted in trips / loads.
- **HR DPR:** headcount & joinings, new hiring count, leave & absentees, EP renewals, grievances solved, issues raised.
- **Admin DPR:** vehicles & transport, site facilities, documents & permits, purchases / petty cash.
- **Admin = data operator:** Admin can enter DPRs manually on a supervisor's behalf, mark / verify attendance, and upload documents.
- **Double entry:** the supervisor files their DPR *and* Admin enters every DPR too; the two are checked against each other by end of day.

## 6. Paint stock
- **Stages:** keep all 8 — PR → PO → RIL receive → SGE receive → issued → consumed → reco → posted.
- **Supervisor stock:** paint is issued into the supervisor's name, at the start of the month, against their targets. Can't issue more than the store holds.
- **Consumption:** each submitted DPR deducts its paint litres from that supervisor's stock automatically.
- **Flags:** low stock and no stock are flagged to the supervisor.
- **Variance alert to Owner:** tolerance set per MPS scheme in Master Data.
- **Low stock (as understood):** when the supervisor's paint left is less than the job's remaining scope needs (remaining m² × MPS litres per m²). Then new stock is issued and a new job can start.
- **Overdraw:** a DPR may use more than the supervisor holds; the stock goes negative and is flagged.
- **Month end:** unused paint carries forward in the supervisor's name.
- **941 / 942 / 261 (decided 2026-10-12):** these are RIL's consumption steps. SGE follows the same three steps internally and tracks them itself: 941 = issue to the supervisor, 942 = month's consumption reconciled (litres from our DPRs), 261 = consumption posted. We don't generate RIL's numbers; when RIL gives them they are typed against our step **for reference only**. Consumption itself is always internal (from DPRs).

## 7. Equipment
- **Kinds:** blasting & painting kit (hopper, compressor, airless, dehumidifier), height safety (harness, lanyard, lifeline), scaffold material, vehicles & lifting, spare parts, vehicle service records.
- **Tag:** auto `TYPE-SITE-##` (e.g. `HOP-DTA-03`).
- **Expiry:** warn 15 days before. (Expired kit is not blocked — not chosen.)
- **Checklist:** ticked on the DPR every day the item is used.
- **Status:** supervisor flags a fault; the store manager repairs it and changes the status back.

## 8. Finance
- **Who adds entries:** Owner / Super Admin only (Finance, SIC, Admin, Store not chosen).
- **Approval:** none — entries post when saved.
- **Required:** date, time, amount, category (fixed list in Master Data), vendor (from vendor list), payment mode (cash / UPI / bank / credit), remark, bill / receipt photo.
- **Edits:** the person who entered it can edit the same day; after that only the Owner. All edits logged.

## 9. Requests (spares, equipment, material)
- **Who raises:** supervisors, safety supervisor, SIC / Admin, store keeper.
- **Flow:** Open → SIC approves → store fulfils → requester confirms received.
- **Time limit:** none; just show the age.
- **On fulfil:** issued from stock (deducts store stock), note / reason required when part-filled or cancelled, requester taps "received" to close.

## 10. JMS & billing
- **Upload:** Admin (data operator).
- **Check:** each JMS line maps to a job in the Job register; JMS qty is compared with the job's DPR total between its start and end dates.
- **Flag:** any difference between JMS and DPR.
- **Bill status comes from the JMS.** Each upload is read for its stage and updates the bill's status. Same JMS number uploaded again = not a new record, just a stage update.
- **Stages:** Prepared / Measured → Invoiced / Paid.
- **File:** Excel for the figures, PDF kept as proof.
- **A closed job *is* the JMS.** The supervisor starts a job, files DPRs with measurements against it, and closes it once blasting, 1st coat, 2nd coat and final coat are all submitted. The closed job = one joint measurement of every DPR from start to close. A JMS can hold many DPRs; there can be many JMS. Start / close job is the key.

- **Job stages:** each DPR line picks its stage — Blasting, 1st coat, 2nd coat, Final coat. A job can be closed only after all four are entered.
- **Closing:** supervisor closes, SIC confirms; on confirm it becomes a JMS.
- **Internal vs submitted JMS (decided 2026-10-12):** the SIC closes a cycle of work, and that becomes the **internal JMS**. The JMS we submit to RIL is **uploaded** separately and **compared** with the internal one (qty, amount, items, period, WO); differences are flagged. Neither overwrites the other. Every step (close, upload, link, status change, payment) is kept in the **audit log**.

## 11. Safety
- **Daily Safety DPR (RIL Exhibit-D):** signed by the Safety Supervisor and the SIC.
- **UA / UC observations:** owner + fix-by date required; open over 10 days flagged; HIGH-risk observations flagged to the supervisor and SIC to act on.

## 12. ACPL / eSSL attendance match
- **Match key:** EP number, then name as fallback.
- **Flags:** on DPR but not at the gate; at the gate but not on the DPR; ACPL and eSSL disagree with each other.
- **Who resolves:** Admin (data operator); SIC can override.
- **Pay:** the gate punch wins unless the SIC overrides with a reason.

## 13. Upload: ACPL monthly punch report (Crystal Report .xls)
Read from `CrystalReportViewer1 (7).xls` — Sep 2026, contractor SHREE GAYATRI ENTERPRISE, 1,688 people.

**File shape:** title rows (`For: MM/YYYY`, `Contractor Name`), then one row per person: 10 identity columns, 4 columns per day (Shift, Plant In, Plant Out, Status) × days in month, then 5 totals (Payable Days, Payable OT, Regular Manday Hours, Digital Payout Days, Digital Payout OT).

**Capture per person (mandatory):** EP NO (`PP`+10 digits — all 1,688 match), EP NAME, Trade Name, Skill, Card Category.
**Capture per person (keep, not mandatory):** Sector, Area of Movement, Plant Name, Department, EIC Name.
**Capture per day:** shift, plant-in gate code, plant-out gate code, status.
**Capture totals:** Payable Days (used to check our pay), others stored as-is.

**Codes:**
- Status: `P` present (1 day) · `A` absent · `-0.5` half hour short = 0.9375 day · `-1` one hour short = 0.875 day · `PD` paid · `LEFT` left the company (EP closed). Verified: 14 P + 9 × −0.5 = 22.44 payable, matches the file.
- Shift: `G` general · `A`/`B`/`C` rotating · `SD-D`/`SD-N` shutdown day/night · `D1` special day.
- Plant In/Out are **gate/plant codes** (60 codes, e.g. MTFMG, OMTF, KANCK, RDCPP) — **the file has no clock times**, and OT/hours totals are all 00:00. So in/out times and OT can't come from ACPL; they must come from eSSL or the DPR.

**Upload checks:**
- Month + contractor read from the title rows; re-uploading the same month replaces it (no duplicates).
- Reject the file if the column count doesn't match the month's days (10 + 4×days + 5).
- EP not in our labourer register → listed as "unknown EP" for Admin (name fallback match, then add or ignore).
- `LEFT` → mark the labourer inactive from that date (ask Admin to confirm).
- Our Payable Days (from statuses) must equal the file's Payable Days; mismatch flagged.
- **Punch but `A`** (both codes present, or in-only — 9,300+ day-cells in Sep): reason unknown → flagged for Admin to check, not auto-decided.
- Plant code must map to one of our site/plants (mapping table in Master Data, e.g. RDCPP → DTA/CPP); unmapped codes listed.

## 14. Upload: JMS detail book (Excel register)
Read from `JMS DETAIL BOOK 2026 TO 2027.xlsx`, sheet `Sheet1` — 1,030 JMS rows, ₹40.85 cr. Other sheets are pivots/summaries (not uploaded).

**Mandatory per JMS row:** JMS No. (7 digits, unique — 0 duplicates found), Period from, Period to (to ≥ from — 6 rows break this), WO No., Unit (site), Plant, Job description, Amount (> 0), JMS status.
**Captured when present:** SR no., Date, Inv No. (`SGE/YY-YY/n`), FO No. (9 digits), S/C (sub-contractor — link to contractor list; blank on 611 rows), Area, JMS posted date, mail inv. submit date, actual inv. submit date, payment received date, SBLC amount, A3 approval date, Scroll No. (11 digits).
**Ignore (always empty):** Bill, HR Compliance, period, 941/942/261 Y/N and dates.

**JMS status flow (from the file):** JMS SUBMITTED → QSD APR → A1 APR → A2 APR → A3 (date) → INVOICE UPLOADED → payment received. `A1 REJECT` is the reject branch. 8 rows have no status.
**Re-upload:** match on JMS No.; update status/dates only, never duplicate (as decided in §10).

**Upload checks / clean-up:**
- Unit must be one of our sites — the file also has SOLAR, SWRO, DTA-PCG, SEZ-PCG → add these as sites/sub-sites or map them.
- Plant names trimmed + matched to the site's plants (e.g. `HYDROGEN ` has a trailing space).
- Job description from a fixed list (file has case duplicates: "Scaffolding Job" / "SCAFFOLDING JOB", "Manual Cleaning…" twice).
- WO No. pattern: mostly `CCM/` + 9 digits, but also `J3M/`, `JS5/`, `970/`, `CCS/`, `1J/MJF/` and stray spaces → allow `PREFIX/digits`, trim spaces; WO must exist in a Work Order list.
- FO No.: 9 digits; 25 rows have `-` → treat as blank.
- Inv No. `SGE/YY-YY/n` (one typo `SGE/2-27/246` would be caught).
- INVOICE UPLOADED rows must have Inv No. + invoice date; payment date only 25 of 943 filled → payment tracking needs its own update.
- Amount vs Job register: JMS amount checked against the closed job (§10).

## 15. DTA job & paint documents (reviewed 2026-10-11)
Files: DTA JOB PLAN AUG-26, DTA JOB PLANNED VS ACTUAL AUG-26, 2741381 SGE DTA PAINTING COKER 002 AUG-2026 (.xlsx + signed .pdf), DTA MONTHLY PAINT RECO JULY 2026, DTA PAINT APR TO JUN-2026.

**A. Monthly job plan** (one per site per month, signed SGE + RIL): rows = Plant → MPS (or BLASTING) → job description → Plan m². DTA Aug-26: 12 plants, 27 lines.
**B. Planned vs actual** — same rows + Actual m² (3 decimals). Actual comes from JMS. Example: COKER MPS-1 plan 800, actual 781.765 = JMS 2741381 (681.765) + another 100.
**C. JMS pack (one job, one JMS)** — 5 parts, same numbers throughout:
1. *Abstract*: job name, FO no., ARC/WO no., plant + locations, JMS no., A1 name (RIL), work period, then per service item: item code, description, UOM, qty, rate, amount. (2741381: 3378150 MPS-1 handtool brush, 681.765 m² × ₹169.78 = ₹1,15,750.06.)
2. *RIL Job Measurement Sheet*: site, plant, area, WO; per service code — qty planned (700), qty executed, EIC approved qty, work permit nos. (several), PM work order no., date completed; EIC performance ticks (5 × Satisfactory / Not).
3. *Summary sheet*: qty per measurement page → total.
4. *Measurement pages* (SGE letterhead, one per location/permit): item (BOX BEAM 100×100, ISMB 350×140…), NOS × SIDE × LENGTH × CF = area; page total. Checked: 193.911 + 140.047 + 114.583 + 233.223 = 681.765.
5. *Paint reconciliation*: per paint/thinner: SAP mat code, description, maker, min DFT (ARC), actual DFT, coats, WO norm L/m², derived litres (= qty × norm), actual norm, actual litres, 941/942/261 reservation nos. Thinner norm = 10 % of paint.
The PDF is the signed scan of the same pack (11 pages) — keep as proof, read figures from Excel.
**D. Monthly paint reco (FIM)** — batch-wise stock per SAP code: opening, received, 941 reservation, batch no., 942/261 qty, 942 & 261 reservation nos., balance, closing, mfg date, expiry, maker; lists every JMS no. covered. July: 147 batch rows, 44 SAP codes, arithmetic correct on all rows; 13 batches already past expiry; "NEW - LOC" used where batch is unknown. Second sheet = reconciliation lines for all 40 JMS of the month (₹1.14 cr).
**E. Quarterly norms vs actual** — per MPS → SAP code: WO-norm litres, actual litres, excess, moving average price, recovery = excess × price × 1.20.

**Plan → DPR → JMS flow (confirmed 2026-10-11):**
- The supervisor gives a **plan** for the month (e.g. 800 m² on one plant + MPS + job type).
- Work is reported daily in **DPRs** against that plan line.
- A **JMS** is generated when a run of DPRs reaches the **final shade** (finish coat) on an area — the JMS is the compilation of those DPRs, and its qty is the finish-shade m².
- One plan line can produce several JMS: 800 m² plan → JMS-1 300 m² + JMS-2 400 m².
- **Actual = sum of the JMS** (finish-shade m²) on that plan line → 700 m². Plan vs actual = 800 vs 700 (87.5 %).
- Area that has blasting/primer/intermediate but no final shade yet is work in progress, not actual.
- **Tolerance:** actual up to **5 % over** plan or up to **2 % under** plan is OK. Outside that band → flagged (over-run, or short of plan).
- **Work order on top (confirmed):** a WO gives the total scope (e.g. 100,000 m²). Each month the plan spreads part of it over plants (e.g. 10 plants × 800 m² = 8,000 m²). JMS actuals are deducted from the WO balance. Unfinished plan area is **carried forward** (adjusted and continued) into the next month, not dropped.
  - Example: WO 100,000 → Aug plan 8,000 → Aug JMS 7,000 → WO balance 93,000; the 1,000 unfinished carries into Sep's plan alongside new lines.
- **Remaining work must always be visible** (crucial to track): per plan line show Plan, Actual (JMS), In progress (DPR area not yet at final shade, by stage), Remaining = Plan − Actual.

**Important for the app:**
- Service items master: code, description, UOM, rate, MPS, norm L/m² per paint — UOMs seen: M², M³, L/SQM, PLC (letters), L/SQ INCH (monogram).
- Job = plan line → measured pages → JMS; plan vs actual is automatic.
- Measurement entry with the NOS × SIDE × LENGTH × CF formula and a member list (ISMB/ISMC/ISA sizes, plates, beams).
- Permit nos. and PM work order no. per job/page.
- Paint batches with expiry; derived vs actual litres per JMS; 941/942/261 per line; quarterly recovery calc.

**Data issues spotted:** SAP 2002462129 is "TYPE 22" in one row and "TYPE 9" in another; Type 6 paint has 10+ SAP codes (shades); plant names with trailing spaces (FCCU, SULPHUR, UTILITY); "MANUAL CLENING" typos; letter-writing UOM written "L/SQM" and "L/SQM " ; in the PDF the JMS no. didn't scan cleanly (Excel copy is the reliable source).

## 16. Upload: eSSL monthly status report (.xls)
Read from `eSSL.xls` (Sep 2026, printed 10-Oct-2026). Two sheets = two eSSL "companies": Sheet1 `Default` (783 people), Sheet2 `SGE` (1,484 people); no person appears in both.

**File shape:** title rows (report name, period `Sep 01 2026 To Sep 30 2026`, company, printed on), then blocks per **Department** (= supervisor / sub-contractor: ABHAY PATIL, BISWAJIT, MINTU SINGH, SHIVNATH, SUVODEEP, PINTU JOSHI, SGE, Default). Each block: Sl, Emp. Code, Name, one column per day (`1 T`, `2 W`…; merged cells shift positions — read by header), then totals P, A, L, H, HP, WO, WOP.
**Status codes:** `P` present · `A` absent · `WO` weekly off · `WOP` worked on weekly off · `½P` half present · `WO½P` half on weekly off · `L` leave · `H` holiday · `HP` worked on holiday · blank.
**No clock times** in this report either → OT after 18:00 cannot be computed from it (see open points).

**Capture (mandatory):** period, company, department, Emp. Code, Name, daily status, totals.
**Upload checks:**
- Emp. Code should be the EP (`PP`+10). Seen: 1,892 OK; 109 are 10 digits without `PP` (auto-add `PP`); lowercase `pp` (auto-fix); 11-digit / 8-digit / 9-digit codes and names typed in the code column (`SUNIL KUMAR`, `BIJAY MAHATO`) → rejected to an "unmatched" list for Admin; 217 short numbers (`2`, `3`…) in the Default company → ask what these are.
- Our P total must equal the file's P column per person.
- Department must map to a supervisor / sub-contractor in our list.
- **ACPL vs eSSL overlap is small:** of 2,236 eSSL codes only 326 are in the Sep ACPL report (1,910 eSSL-only, 1,362 ACPL-only) → show both lists for Admin; don't auto-mark absent.

## 17. Build decisions (2026-10-11)
- **Work order:** track both m² (per service item) and ₹ cap value; balance in both. Warn Owner + SA at **80 %** and **95 %** used.
- **Expired paint:** warn **60 days** before expiry; keep showing on the dashboard until consumed; **pie chart** of stock by expiry status.
- **Paint recovery (excess × price × 1.2):** not needed now.
- **Measurements:** supervisor enters members (NOS × SIDE × LENGTH × CF) in the DPR daily; the JMS adds them up.
- **JMS pack:** not generated by the app — upload only (Excel for figures, PDF as proof).
- **Reconciliation actuals:** litres = sum of the job's DPR paint use; actual DFT typed by the supervisor at final shade.
- **Rates:** from the ARC/WO rate list (to be shared) — service code, UOM, rate, validity.
- **OT:** starts after 18:00, minimum 1 h, counted in half-hour steps. OT rate: no preference → default daily wage ÷ 8 × OT hours (editable later).
- **Short hours:** ACPL style — paid share = hours worked ÷ 8 (−0.5 h = 0.9375, −1 h = 0.875).
- **Database:** new Supabase project (Mumbai), separate from the Operations Hub.
- **Hosting:** Vercel, Shree Gayatri Ent team.
- **Release 1 scope:** all four areas — logins/sites/labourers, DPR + WO/plan/JMS tracking, attendance + ACPL/eSSL upload, paint stock + JMS book upload.
- **Fresh start (decided 2026-10-12):** the merged app starts empty from **October 2026**. Old DPRs, JMS, paint and finance entries are not carried over. Once the system works as expected, past data is uploaded, and a change in past P&L from that is accepted.
- **Use:** online only. First used on the office laptop; phones later. DPR is entered only in the app; an Excel DPR can be uploaded to cross-check. Labels in English + Gujarati + Hindi.

## 18. Accounting / P&L in Finance (decided 2026-10-11)
Management accounting (costing + P&L), not statutory books — Tally stays for GST/filing.
- **Income:** from JMS (qty × WO rate), counted **when payment is received** (cash basis). JMS confirmed but unpaid shown separately as "earned, not yet received". Needs a payment-received date on every JMS (today only 25 of 943 rows in the JMS book have one).
- **Direct labour:** attendance × daily wage (+ OT), charged per job per day from the **DPR crew list**; a split day splits the cost.
- **Direct job costs:** expense entries tagged to a job / plant (abrasive, thinner bought by SGE, job-specific hire).
- **Overheads / fixed costs** (salaries, compressor / bus / car rent, diesel, machinery, PPE): monthly per site, shared over jobs **by labour-days**.
- **Results:** profit or loss per m² (by MPS / service item), per m³ (scaffolding), per labour-day, per supervisor, per job, per site, per month; All-sites total.
- **Access:** Owner, Super Admin, Finance (Finance can now enter expenses — updates §8, which had Owner/SA only).
- **Approved vs received check:** for every JMS compare the value when SIC confirmed it (qty × rate) with what actually reached the bank — amount difference (₹ and %) with a reason (deduction, recovery, short-paid, rate change), and days from SIC approval to payment. Dashboard shows total approved, received, gap, average days to payment, and the JMS with a difference or still unpaid.

## 19. Notifications, approvals and activity log (decided 2026-10-12)
- **Channel:** in-app bell + "Waiting for me" list first. WhatsApp / email / SMS later, after the shared database.
- **Who is told:** the approver (e.g. SIC for a closed job); the **submitter** when their item is approved or sent back; **Owner** gets everything, with problems (send-backs, short payments, overdrawn paint, edits after approval) marked and a "Problems only" filter; **Super Admin** gets everything.
- **Activity log:** Owner and Super Admin see every change — who, role, when, what, on which record.
- **Timing:** approvals (and their outcomes) are instant; everything else goes into a daily summary.
- **Escalation:** an approval waiting more than **24 hours** is escalated to Owner and Super Admin.
- Every record keeps its trail: submitted by / when, approved or sent back by / when.

## Still open
- **OT source:** neither ACPL nor eSSL monthly reports carry in/out times. Need an eSSL report with punch times (e.g. "Daily Attendance / In-Out" export) or in/out typed on the DPR.
- **eSSL:** what are the two companies (Default vs SGE) and the 217 short codes (`2`, `3`…)?
- Files still to share: ARC/WO rate list, gate code → plant list, labourer master list.
- New units in the JMS book (SOLAR, SWRO, DTA-PCG, SEZ-PCG): own sites or mapped?
- Contents of DPRs for "other logins" beyond HR and Admin.

## 5b. Double-entry mismatch (DPR)
- Admin's version wins. The supervisor is notified of each difference; differences feed the monthly review, and progress is calculated from Admin's figures.
