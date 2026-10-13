# Merge plan: one data model per business object (X1)

Written 2026-10-12 against `main` @ `fbab583`; revised the same day with the Owner's answers (below).
Amended 2026-10-13 with the review notes P1–P6 and the fixes already merged (GitHub PRs #6–#13).
**None of the ten steps is built yet**, but several of their prerequisites now are (see "Already built" below).
Plan steps are called **Step 1 … Step 11** so they don't clash with GitHub PR numbers. When a step is opened on GitHub, title it **"Merge step N: …"** and write the GitHub number next to the step here.
Rules referenced: `docs/rules-decisions.md` §5 DPR, §6 Paint stock, §8 Finance, §10 JMS & billing,
§17 Build decisions, §18 Accounting / P&L (and §19 notifications where it applies).

## Owner decisions (2026-10-12) that shape this plan
1. **Fresh start from October 2026.** No old data is carried into the merged model. The old DPRs, JMS packages, paint board and finance entries are left aside. Once the system works the way the Owner expects, past data is uploaded through the upload paths (JMS book, etc.), and if that changes P&L, that's fine.
2. **SIC closes a cycle of work → that becomes the internal JMS.** We also upload the JMS we submit to RIL. The two are **compared**, not merged, and every step keeps an **audit log**.
3. **Paint 941 / 942 / 261 are RIL's consumption steps.** SGE follows the same steps internally and tracks them, but doesn't generate those numbers. RIL's numbers are typed in **for reference** when RIL gives them. Consumption itself is internal (from our DPRs).

These are also recorded in `docs/rules-decisions.md` (§6, §10, §17).

## Already built by the bug-fix PRs (2026-10-12 / 13)
| Done | Where | Used by |
|---|---|---|
| One shared `today()` (Asia/Kolkata, demo override from Test tools) in `src/lib/today.ts`, used by Work **and** the main-store screens (X4) | #8, #9 | Step 1 no longer needs its own `workToday` (P3) |
| Double entry: `effectiveEntries` / `entryDiffs` in `src/lib/work/logic.ts` (Admin wins, §5b) and the `dpr_mismatch` event | #6, #8 | Step 2 lifts the rule to reports (P1) |
| Per-site plan months (`siteMonths`, `currentMonthOf`, `isMonthClosed`) | #6 | Step 1 fresh start sets October per site |
| JMS status changes logged (`jms_status`, `statusLog`), payments cleared with a reason (`payment_cleared`), voided costs (`expense_voided`) | #8 | Steps 6, 9 |
| Store Keeper opens Work → Paint stock and issues paint (`canIssuePaint`, `workTabsFor`); accounts with no plants cover every plant on their sites (D2, W35) | #6, #9 | Step 8 prerequisites (P4) |
| DPR submit checks (`src/lib/dpr-validate.ts`), scaffold lifting trips, Owner/SA unlock with reason, plants from the site's list | #9 | Steps 3, 4 reuse them |
| Cost entries with the §8 fields (time, vendor, payment mode, bill, voiding) on Work `Expense`; ledger entries need them too | #8, #12 | Step 9 |
| Paint variance with a per-paint tolerance from Master Data (`src/lib/paint-variance.ts`); 941 / supervisor required before issue on the legacy board | #12 | Step 8 reuses `paintVariance` |
| Request flow raise → SIC approve → store fulfil / part-fill → requester confirms | #12 | Step 4 (`raiseRequestsFromDpr`) |
| One plant list per site: DTA's 12 plants in the local seed, `isSitePlant` in `src/lib/sites.ts`, Work plan picks plants from Master Data only | #13 | the "Before Step 2" code part is done; the live Supabase `sites` row is still the Owner's data step |
| Audit: `write_audit()` security-definer migration written (not yet applied) | #13 | Step 11 |

Storage keys today: main `sge-obms-ops-v12`, Work `sge-work-v7`. The key table in §5 counts on from these.

## 0. The problem in one paragraph
The app keeps two stores that never talk to each other:
- **Main store** `src/lib/store.tsx` (`useStore`, key `STORAGE_KEY = "sge-obms-ops-v9-sites"` in `src/lib/seed.ts`): the older screens (DPR desk, SIC approvals, JMS upload, paint board, finance ledger).
- **Work store** `src/lib/work/store.tsx` (`useWork`, key `WORK_STORAGE_KEY = "sge-work-v4"` in `src/lib/work/seed.ts`): the plan → job → DPR → JMS flow, payments and P&L.

So a supervisor's DPR on `/dpr` never moves a job forward. A JMS uploaded on `/jms` never appears in Payments or P&L. Paint on the store board is never deducted by DPR litres. Money typed into Finance never reaches P&L. Per AGENTS.md §1 the **Work model is the target**. Each pair below moves into it, and then the legacy copy is deleted.

The IDs are already shared: sites (`site-dta`…), staff (`st-sup1`, `st-sic`…) and labourers (`lb-…`) mean the same thing in both stores. So the screens can switch stores without any ID mapping, and a later upload of past data can use the same IDs.

---

## 1. Daily reports: `DprDocument` (main) vs `DprEntry` (Work)

### Who reads / writes today
| File | Model | Reads | Writes |
|---|---|---|---|
| `src/app/(app)/dpr/page.tsx` | DprDocument | list, filters by type/status | — |
| `src/app/(app)/dpr/new/page.tsx` | DprDocument | — | `saveDpr`, `submitDpr` |
| `src/app/(app)/dpr/[id]/page.tsx` | DprDocument | one doc | `saveDpr`, `submitDpr`, `reviewDpr` |
| `src/components/dpr/dpr-form.tsx` | DprDocument | form body (labour, equipment, requests, paint/scaffold lines) | via props |
| `src/components/dpr/safety-dpr-form.tsx` | DprDocument.safetyBody | safety body | via props |
| `src/app/(app)/approvals/sic/page.tsx` | DprDocument | submitted queue | `reviewDpr` |
| `src/app/(app)/sic/page.tsx` | DprDocument | pending count | — |
| `src/app/(app)/supervisor/page.tsx` | DprDocument | my DPRs | — |
| `src/app/(app)/owner/page.tsx` | DprDocument + thin `state.dprs` | pending counts, paint gist | — |
| `src/components/owner/site-comparison.tsx` | DprDocument + thin `dprs` | pending per site | — |
| `src/app/(app)/submissions/page.tsx` | DprDocument | submission tracker | — |
| `src/app/(app)/admin/page.tsx` | DprDocument | counts | — |
| `src/app/(app)/safety/page.tsx` | DprDocument (safety) | safety DPRs | — |
| `src/app/(app)/store/page.tsx` | DprDocument (store) | store DPRs | — |
| `src/app/(app)/attendance/acpl/page.tsx` + `src/lib/acpl.ts` (`matchAcplAgainstApproved`, `attendanceFromApprovedDpr`) | DprDocument.labourMarks | approved crew | attendance (on approve, in `reviewDpr`) |
| `src/app/(app)/hr/page.tsx` | AttendanceRecord.`sourceDprId` | DPR-derived attendance | — |
| `src/app/(app)/requests/page.tsx` | EquipmentRequest.`sourceDprId` | requests raised from DPRs | (created in `submitDpr`) |
| `src/app/(app)/telegram/page.tsx` → `applyTelegram` | thin `DprEntry` (`state.dprs`) | — | adds thin DPR line |
| `src/lib/site-scope.ts` (`scopeState`) | both | site filter | — |
| `src/lib/seed.ts`, `src/lib/seed-sites.ts` | both | seed | — |
| `src/lib/safety-dpr.ts` (`migrateLegacySafetyBody`) | safetyBody | load-time fix | — |
| `src/components/work/work-jobs.tsx` | Work `DprEntry` | job progress | `addDpr`, `requestClose`, `confirmJms`, `rejectClose` |
| `src/components/work/work-pnl.tsx`, `src/lib/work/logic.ts` (`labourByJob`, `jobStageAreas`, `paintUsed`…) | Work `DprEntry` | area, litres, crew | — |
| `src/components/work/notifications.tsx` | Work `DprEntry` | waiting list | — |
| `src/lib/work/scenarios.ts`, `src/lib/work/seed.ts` | Work `DprEntry` | test/seed | — |

### What survives
**Work.** Today Work `DprEntry` is one measured line against one job. It has no header for the day, so it can't carry attendance, permit/TBT, SIC review or locking. The fix is to add a **report header** to Work and make each `DprEntry` a line under it. `DprEntry` itself keeps its shape, so jobs, JMS, paint and P&L logic keep working.

### Fields to add (in `src/lib/work/types.ts`)
New `DprReport` (one per submitter · site · plant · date · type; any number per day, §5):
| Field | Why / rule |
|---|---|
| `id, date, siteId, plant` | every DPR picks a plant (§3, §5) |
| `type: "painting_blasting" \| "scaffolding" \| "safety" \| "store"` (HR/Admin later) | §5 types |
| `submitterId`, `enteredBy: "supervisor" \| "admin"` | Admin as data operator, double entry (§5, §5b) |
| `status: "draft" \| "submitted" \| "approved" \| "sent_back"` | §5 SIC review |
| `submittedAt?` | deadline next day 10:00 → pure `isLate(report)` in `logic.ts` (§5) |
| `permitNos: string[]`, `permitOk: boolean`, `tbtDone: boolean` | §5 before submitting; §15 permit nos per job |
| `crew: { labourerId, status, inTime?, outTime?, note? }[]` (was `labourMarks`) | §5 every crew member marked; §4 statuses/times; §18 labour cost |
| `zeroReason?` | §5 quantity > 0 or a reason |
| `review?: { by, at, note }` | §5 approve, or reject with reason; §19 trail |
| `unlocks: { by, at, reason }[]`, `unlocked: boolean` | §5 locked after approval; Owner/SA unlock with logged reason |
| `equipment: { equipmentId, status, expiryDate?, note? }[]` | §7 daily checklist on the DPR |
| `requests: { id, kind, description, qty?, urgent? }[]` | §9 (still spawns equipment requests on submit) |
| `scaffold: { id, location, erectM3, dismantleM3, standingM3, liftingTrips, jobId? }[]` | §5 scaffolding line, lifting in trips |
| `safetyBody?`, `storeBody?` | moved as-is from `DprSafetyBody` / `DprStoreBody` |
| `nextDayPlan`, `note` | carried over |

**Double entry (§5, §5b) — which report counts.** For the same submitter, site, plant, date and job / stage, the report entered by **Admin (data operator)** wins. The supervisor's own report is kept for comparison but is left out of areas, litres, crew cost and JMS qty. The rule lives in pure functions in `src/lib/work/logic.ts`:
- `effectiveReports(reports, entries)` → the entries that count. It replaces today's entry-level `effectiveEntries` and is what `jobStageAreas`, `jobJmsQty`, `lineStatus`, `paintUsed` and `labourByJob` read.
- `reportDiffs(reports, entries)` → supervisor-vs-Admin differences (m², litres, crew), replacing `entryDiffs`.
Step 3 sends a `dpr_mismatch` event to the supervisor when Admin's report differs (the event exists already) and shows a **Differences** list in the monthly review.

Changes to the existing Work `DprEntry`:
- add `reportId: string`. `addDpr` attaches the line to the day's draft report and creates one if none exists.
- keep `crew?: string[]` as "who worked on *this job*". New check: every id in it must be in the report's `crew` with a working status.
- `enteredBy` and `supervisorId` move up to the report. The entry keeps them for one release as copies so `labourByJob` / `paintUsed` don't change.

New Work actions in `src/lib/work/store.tsx`: `saveReport`, `submitReport`, `reviewReport(approve | send_back, note)`, `unlockReport(reason)`. Gate rules go in pure `canSubmitReport(report, entries)` in `logic.ts`. New `EventKind`s in `events.ts`: `dpr_submitted`, `dpr_approved`, `dpr_sent_back` (instant, §19), `dpr_unlocked` (problem).

Approval writes attendance. `reviewReport` calls a new main-store action `applyDprAttendance(reportId, date, siteId, crew)`, which reuses `attendanceFromApprovedDpr`. This is the same thing `reviewDpr` does today, so attendance stays in the main store (HR/ACPL own it).

### Data (fresh start)
- **Legacy `dprDocuments` and thin `state.dprs` are not converted** (Owner decision 1). They disappear from the screens when each screen moves to Work.
- **Demo data:** the Work demo seed (DTA Aug–Sep) gets reports built around its entries (`approved`, `permitOk`/`tbtDone` true, crew = union of the entries' `crew`). It is only loaded from Test tools (see §5), never as the starting state.
- **Past DPRs later:** when the Owner is ready, past DPRs come in through the Excel-DPR upload (§17 "an Excel DPR can be uploaded to cross-check"). That upload is a separate task, not part of this plan.

---

## 2. JMS: `JmsPackage` (main) vs `Jms` (Work)

### Who reads / writes today
| File | Model | Reads | Writes |
|---|---|---|---|
| `src/app/(app)/jms/page.tsx` | JmsPackage, WorkRating | packages, lines, ratings | `uploadJmsPackage`, `matchJmsLines`, `reviewJmsPackage`, `computeRatings`, `markJmsPayment` |
| `src/app/(app)/finance/page.tsx` | JmsPackage, FinanceAlert | expected income, payment | `markJmsPayment`, alert ack/flag |
| `src/app/(app)/owner/page.tsx` | JmsPackage, WorkRating, FinanceAlert, `billing` | totals, ratings | — |
| `src/app/(app)/sic/page.tsx` | JmsPackage, FinanceAlert | pending review | — |
| `src/app/(app)/submissions/page.tsx`, `src/app/(app)/admin/page.tsx` | JmsPackage, FinanceAlert | counts | — |
| `src/components/owner/site-comparison.tsx` | `billing` | billed per site | — |
| `src/components/work/work-jms.tsx` | Jms | JMS register | `setJmsStatus` |
| `src/components/work/work-jobs.tsx` | Jms | job → JMS link | `confirmJms` |
| `src/components/work/work-payments.tsx`, `money-card.tsx` | Jms | approved vs received | `recordPayment` |
| `src/lib/work/logic.ts` (`lineStatus`, `woUsage`, `paymentRows`, `jobPnl`) | Jms | actual, WO balance, income | — |
| `src/lib/work/scenarios.ts`, `src/lib/work/seed.ts`, `src/lib/seed.ts`, `src/lib/seed-sites.ts`, `src/lib/site-scope.ts` | both | seed / scope | — |

### What survives
Owner decision 2 gives JMS **two records that are compared, never merged**:
- **Internal JMS = Work `Jms`** (survives as it is). It is created when the **SIC closes a cycle of work** (today: supervisor requests close → SIC confirms). Its qty is the final-shade m² from the cycle's DPRs and its value is qty × WO rate. It feeds plan-vs-actual, the WO balance, approved-vs-received and P&L (§10, §15, §18).
- **Submitted JMS = new `JmsSubmission`**: the JMS pack we submit to RIL, uploaded by Admin (Excel figures, PDF proof). It replaces the legacy `JmsPackage` upload. It carries RIL's JMS no. and RIL's status flow (§14).

Pure `compareJms(internal, submission)` in `logic.ts` flags any difference in qty, amount, service items, period or WO (§10 "flag any difference"). It also lists internal JMS with no submission yet, and submissions with no internal JMS. The legacy package's DPR line-matching and ratings become pure functions over these two records.

### Fields
`Jms` (internal) changes:
| Field | Why / rule |
|---|---|
| `submissionId?` | link to the matching `JmsSubmission`, set by Admin or auto-matched on site + plant + period + service item |
| `status` → **derived** from the linked submission (`jmsStatus(jms, submissions)`); `"JMS SUBMITTED"` while unlinked | §10 "bill status comes from the JMS upload"; one source for RIL's status |
| `review: { closedBy, closedAt, note? }` | SIC who closed the cycle (audit) |
| `confirmedOn`, `payment`, `qty`, `rate`, `amount` | unchanged. Payment stays here so §18 approved-vs-received and P&L don't move. |

New `JmsSubmission`:
| Field | Why / rule |
|---|---|
| `id, rilJmsNo` (7 digits, unique) | §14; re-upload of the same no. = update, never a new record |
| `siteId, plant, woNo, foNo?, periodFrom, periodTo` | §14 mandatory fields |
| `items: { serviceCode, description, qty, uom: "M2" \| "M3", rate, amount }[]`, `qty`, `amount` | JMS abstract (§15 C1) |
| `status` (RIL flow incl. `"A1 REJECT"`), `statusLog: { status, at, by }[]` | §14 status flow; every change kept |
| `invoiceNo?, scrollNo?, a3Date?` and the §14 dates | §14 captured fields |
| `files: { excelName?, pdfName? }`, `uploadedBy, uploadedAt` | §10 Excel figures + PDF proof (file names until Supabase Storage) |
| `jmsId?` | back-link to the internal JMS |

**Audit log (Owner decision 2).** Every JMS step writes a Work event with who, role, when and before → after: cycle closed, cycle sent back, internal JMS created, submission uploaded/re-uploaded, linked/unlinked, RIL status change, payment recorded/cleared, difference found. Today `setJmsStatus` writes no event; that is fixed. Events are append-only: no action edits or deletes one (only the Test-tools reset clears the demo).
**Until Work data is in Supabase these events live in each browser.** They can be lost on Reset or cleared storage and one browser never sees another's, so they are an activity log, **not yet an audit trail**. Step 11 makes them one.

New actions: `uploadSubmission(rows)` (match on `rilJmsNo`: update or create), `linkSubmission(jmsId, submissionId)` / `unlinkSubmission`. New events: `jms_submitted`, `jms_status`, `jms_linked`, `jms_difference` (problem), `jms_unpaid` (§19).
**Ratings** stop being stored. `supervisorRatings(work, month)` in `logic.ts` derives them from `compareJms`, sent-back cycles/reports, equipment faults on reports, and open ACPL flags passed in. The old automatic incentive write into `wageLedger` (`computeRatings`) becomes an explicit Owner button, **Post incentive**, which calls the existing main-store `addWageEntry`.
**Finance alerts** for JMS (`jms_uploaded`, `jms_approved`, `payment_due`) are replaced by the Work events above.

### Data (fresh start)
- Legacy `jmsPackages`, `workRatings`, the JMS `financeAlerts` and the `billing` snapshots are **not converted** (Owner decision 1). `paymentSummary` replaces `billing`.
- **Past JMS later:** the JMS detail book upload (§14, 1,030 rows) creates `JmsSubmission` rows with no internal JMS. `compareJms` simply shows them as "no internal JMS". That upload is a separate task.

---

## 3. Paint: `paintStock` lifecycle board (main) vs `PaintBatch` (Work)

### Who reads / writes today
| File | Model | Reads | Writes |
|---|---|---|---|
| `src/app/(app)/store/page.tsx` | PaintStockLine | 8-stage board, 941/942/261 | `advancePaintStage`, `updatePaintLine` |
| `src/app/(app)/supervisor/page.tsx` | PaintStockLine | "my paint" | — |
| `src/app/(app)/owner/page.tsx` | PaintStockLine (+ `predictions`) | stock gist, low-stock/variance cards | — |
| `src/app/(app)/telegram/page.tsx` → `applyTelegram` (`stock_receipt`) | PaintStockLine | — | adds a line |
| `src/lib/paint-lifecycle.ts` (`PAINT_STAGE_ORDER`, `canEditMovement941/942261`) | stage rules | — | — |
| `src/lib/store.tsx` (`migratePaintStock`) | load-time fix | — | — |
| `src/components/work/work-paint.tsx` | PaintBatch | store / supervisor stock, expiry pie | `issuePaint` |
| `src/lib/work/logic.ts` (`batchBalances`, `supervisorPaint`, `paintUsed`, `expiryState`) | PaintBatch + Work DPR litres | balances, low/negative flags | — |
| `src/lib/work/scenarios.ts` (`expired_paint`, `paint_overdraw`), `src/lib/work/seed.ts`, `src/lib/seed.ts`, `src/lib/seed-sites.ts`, `src/lib/site-scope.ts` | both | — | — |

### What survives
**Work `PaintBatch`.** It already does what §6 asks: issue to a supervisor, deduct DPR litres automatically, allow and flag overdraw, flag low stock against remaining scope, carry forward, and warn on expiry (§17). The legacy board contributes the **stages before stock arrives** and the **RIL consumption steps**.

**How 941 / 942 / 261 work (Owner decision 3).** They are RIL's consumption steps. SGE runs **the same three steps internally** and tracks them itself. We never generate RIL's numbers; when RIL gives one, it is typed against our step **for reference only**.
| Step | What it means internally | Our record | RIL reference |
|---|---|---|---|
| **941** | paint issued to a supervisor (reservation) | created automatically by `issuePaint`: batch, supervisor, litres, date, by | RIL's 941 no., typed when received |
| **942** | consumption reconciled for the month | created at month-end reco: litres = **our DPR-derived use** for that supervisor + paint, confirmed by Store/Admin | RIL's 942 no. (+ RIL's litres if they give them) |
| **261** | consumption posted / closed | created after 942: same litres, marks the month's consumption closed | RIL's 261 no. |

So the 8 board stages map like this: **PR → PO → RIL receive → SGE receive** are stored on the batch; **issued** = a 941 step exists; **consumed** = DPR litres against it (always derived, never typed); **reco** = 942 step done; **posted** = 261 step done.

### Fields
`PaintBatch` additions:
| Field | Why / rule |
|---|---|
| `lifecycle: "pr" \| "po" \| "ril_receive" \| "sge_receive"` | §6 stages before the paint is ours to issue. Later stages come from steps (below), not from this field. |
| `mps?` (e.g. `"MPS-1"`) | variance tolerance per MPS (§6) |
| `prNo?`, `poNo?`, `updatedAt` | board columns |
| `mfg?`, `expiry?` → **optional** | FIM "NEW - LOC" rows have no dates; `expiryState` returns `"unknown"`, shown as its own pie slice |

New `PaintStep` (in `WorkState.paintSteps`):
| Field | Why / rule |
|---|---|
| `id, step: "941" \| "942" \| "261"` | §6, §15 D |
| `batchId?`, `supervisorId`, `sap`, `month` | 941 is per issued batch; 942/261 per supervisor + paint + month (that's how the FIM reco is laid out, §15 D) |
| `litres` | **ours**: issued litres for 941, DPR-derived use for 942/261 |
| `date`, `by` | audit |
| `rilRef?`, `rilRefBy?`, `rilRefAt?` | RIL's number, reference only; empty until RIL gives it |
| `rilLitres?` | optional, only if RIL's figure differs. Feeds the variance alert. |

Rules that change in code: **store stock** = batches with no supervisor and `lifecycle === "sge_receive"`, and `issuePaint` only issues from those. Batches in `pr`/`po`/`ril_receive` are on order, not in stock. `canEditMovement941/942261` in `paint-lifecycle.ts` becomes "a RIL ref can be typed once our step exists".
New actions: `receivePaint` (add batch; also used by Telegram `stock_receipt`), `advancePaintLifecycle`, `recoMonth(supervisorId, sap, month)` (creates the 942 from DPR use), `postMonth` (261), `setRilRef(stepId, ref, litres?)`. Every action logs a `paint_*` event.
Lists that fall out of this: "steps waiting for RIL ref" (ours done, RIL number not in yet), and "reco not done" for a closed month.
Variance alert to Owner (§6): pure `paintVariance(w, tolerancePerMps)` compares our DPR-derived use with `rilLitres` where RIL gave one, and with the MPS norm (area × L/m²) otherwise. The tolerance comes from Master Data (`masterCatalog`) through `useStore`. This replaces the hand-seeded `predictions` cards.

### Data (fresh start)
Legacy `paintStock` and `predictions` are **not converted** (Owner decision 1). October stock is entered fresh: batches received into the store, then issued (941). Past FIM recos can be uploaded later (§15 D).

---

## 4. Money: finance ledger `FinanceEntry` (main) vs Work `Expense`

### Who reads / writes today
| File | Model | Reads | Writes |
|---|---|---|---|
| `src/app/(app)/finance/page.tsx` | FinanceEntry, WageLedger, FinanceAlert, JmsPackage | ledger, today's spend, alerts; shows `MoneyCard` | `addFinance`, `addWageEntry`, `markJmsPayment`, alert ack/flag |
| `src/app/(app)/owner/page.tsx` | FinanceEntry, FinanceAlert, `billing` | spend/income cards; shows `MoneyCard` | — |
| `src/app/(app)/sic/page.tsx` | FinanceEntry, FinanceAlert | "Today expenses" | — |
| `src/components/owner/site-comparison.tsx` | FinanceEntry, `billing` | per-site money | — |
| `src/app/(app)/telegram/page.tsx` → `applyTelegram` (`expense`) | FinanceEntry | — | adds an entry |
| `src/lib/store.tsx` (`markJmsPayment`) | FinanceEntry | — | auto "JMS payment" income |
| `src/components/work/work-pnl.tsx` | Expense | P&L, cost list | `addExpense`, `removeExpense` |
| `src/lib/work/logic.ts` (`jobPnl`, `rollUp`) | Expense + Jms.payment + DPR crew | P&L | — |
| `src/lib/work/seed.ts`, `src/lib/seed.ts`, `src/lib/seed-sites.ts`, `src/lib/site-scope.ts` | both | — | — |

### What survives
**Work `Expense`** for costs and **`Jms.payment`** for income. P&L already uses both, on a cash basis (§18). The legacy ledger's job (enter money, see today's spend) moves onto them. `wageLedger` (salary/advance/incentive payments) is **not** part of this pair. It is payroll, and P&L labour cost already comes from DPR crew × wage, so adding wage-ledger rows would double-count. It stays in the main store.

### Fields to add to `Expense`
| Field | Why / rule |
|---|---|
| `time` | §8 required |
| `vendorId?` (from `state.vendors`) | §8 vendor from list |
| `paymentMode: "cash" \| "upi" \| "bank" \| "credit"` | §8 |
| `billFile?` (name now; Supabase Storage later) | §8 bill/receipt photo |
| `category` → must be a Master Data finance category | §8 fixed list |
| `enteredBy`, `enteredAt` | §8 edit rule, §19 trail |
| `edits: { by, at, changes }[]` | §8 all edits logged |

Edit rule as a pure `canEditExpense(expense, viewer, today)`: the person who entered it can edit on the same day, and after that only the Owner. Add/edit access goes to Owner, Super Admin and Finance (§18, which updates §8). `removeExpense` becomes Owner-only and is logged.
Income stays JMS-only (§18): there is no free-form "income" entry any more.

### Data (fresh start)
- Legacy finance **expenses and income** (incl. `"RA bill"` and the auto `"JMS payment"` rows) are **not converted** (Owner decisions 1 and 3). Money is entered fresh from October 2026.
- **Past money later:** once the steps are clear, old expenses come in as `fixed` site overheads for their month, and old receipts against their JMS (via the JMS book). The Owner has accepted that this will change past P&L.
- `financeAlerts` of kind `wage_anomaly` stay in the main store (payroll). JMS kinds are covered in §2.

---

## 5. Storage: fresh start, no conversion of old data
Owner decision 1 removes the need to convert old browser data. That drops the legacy converters, the `imported` flags and the key-chaining from the first draft of this plan.

1. **Starting state = empty October 2026.** New `createEmptyWork(month)` in `src/lib/work/seed.ts` keeps the masters (service items, work orders) and nothing else: no plan lines, jobs, DPRs, JMS, paint or expenses. `currentMonth = "2026-10"`. This is what a new browser, and **Reset**, give you.
2. **Real dates.** Done already (#8, #9): every screen reads the shared `today()` from `src/lib/today.ts` (Asia/Kolkata; Test tools can set a demo date). In the fresh state actions stamp the real date; loading the demo sets the demo date to 2026-09-28.
3. **Demo data only on request.** The DTA Aug–Sep demo and the test scenarios load from **Test tools → Load demo** (Owner / Super Admin). It is never the starting state.
4. **Keys.** Each step that changes a stored Work shape bumps `WORK_STORAGE_KEY`. Each step that removes an array from the main store bumps `STORAGE_KEY`, and `migrateState` simply stops reading that array. Nothing is converted. Anything typed into a browser between steps is test data and starts again empty. That's acceptable under the fresh start, but **before Step 1 ships to production, check that nobody has typed real October data into the live app**; if they have, export it first.
5. **Masters are untouched.** Users, sites, staff, labourers, trades, rate book and Master Data live in the main store (and partly in Supabase already). Key bumps keep them through `migrateState`, as today.
6. **Past data later** comes through upload paths (Excel DPR, JMS book, FIM reco, expenses), once the Owner is happy with the steps. That is a separate task. The shared IDs mean those uploads land in the same model.

| Step | Main `STORAGE_KEY` | Work `WORK_STORAGE_KEY` |
|---|---|---|
| today | `sge-obms-ops-v12` | `sge-work-v7` |
| 1 | v12 (unchanged) | `sge-work-v8` (fresh start) |
| 2 | v12 | v9 (reports) |
| 4 | **v13** (no `dprDocuments`, no thin `dprs`) | v10 |
| 6 | v13 | v11 (`JmsSubmission`) |
| 7 | **v14** (no `jmsPackages`, `workRatings`, `billing`, JMS `financeAlerts`) | v11 |
| 8 | **v15** (no `paintStock`, `predictions`) | v12 (`PaintStep`) |
| 9 | **v16** (no `finance`) | v13 |
| 10 | cleanup: remove old keys left in browsers | — |

---

## 6. Step-by-step order
Each step is one GitHub PR off `main` (title **"Merge step N: …"**), leaves every screen working, passes `npx tsc --noEmit -p .`, `npx eslint src` and `npm run build`, and is clicked through on `npm run dev` as **Owner, Supervisor, SIC, Finance** (logins in `README.md`). Rules not touched by a step keep working as they do today. Every new action writes a Work event (activity log, §19).

### Step 1: Fresh start from October 2026; demo behind Test tools
- Files: `src/lib/work/seed.ts` (`createEmptyWork`, key → v8), `src/lib/work/store.tsx` (empty default; `resetWork` → empty; `loadDemo` also sets the demo date), `src/lib/work/scenarios.ts` (scenarios start from the demo), `src/components/work/test-tools.tsx` (Load demo / Start fresh). Dates: the shared `today()` in `src/lib/today.ts` is already used by Work and by the Owner, SIC, HR, Supervisor and Finance homes, `site-comparison.tsx`, `dpr-form.tsx`, `src/lib/store.tsx` and `src/lib/safety-dpr.ts` (X4, done in #8 / #9) — Step 1 only checks nothing reintroduced a fixed date.
- Rules: §17 fresh start (Owner decision 1); §18 P&L starts from October.
- Check: **Owner** opens Work and sees October with empty plan/jobs/P&L, then adds a plan line. **Supervisor** starts a job on it. **SIC** and **Finance** see the same empty-then-new data. Owner → Test tools → Load demo brings back the Aug–Sep sample, and Start fresh empties it again. **Every home page shows the same date as Work** (Owner, SIC, HR, Supervisor, Finance).

### Before Step 2: one plant list per site (found on production, 2026-10-13)
Three lists of DTA plants disagree today:
| Where | DTA plants |
|---|---|
| Master Data → Sites (live in Supabase `sites.plants`; local seed in `src/lib/seed.ts`) | CPP, CPP-flare, ARMA |
| Work plan lines (`PlanLine.plant`, free text; `SUP_OF` in `src/lib/work/seed.ts`) | AROMATIC, CES, COKER, CRUDE, FCCU, HYDROGEN, HYDROTREATER, PP, PRU & HPIB, RTF, SULPHUR, UTILITY & ETP |
| Old DPR desk (`dprDocuments`) | CPP |

§3 says every DPR and request must pick a plant, and Master Data is the one list. Once Step 4 makes the DPR form pick plants from Master Data, no Work job would match. So:
1. **Data step, no code (Owner / Super Admin):** in Master Data → Sites → DTA → Edit, add DTA's real plants from the Aug-26 job plan (the 12 above, spelled exactly the same, trimmed, §15 "plant names trimmed + matched"). Do the same for the other five sites when their job plans are shared. The Owner decides whether CPP, CPP-flare and ARMA stay (ARMA is also under MTF, which §3 allows). This writes the live `sites` row in the Yard Ledger Supabase project, so **confirm with the Owner first**.
2. **Code — done in #13:** the Work plan form picks plants from the site's Master Data list (`isSitePlant` in `src/lib/sites.ts`) and the local seed has DTA's 12 plants. Still to do in Step 2: `addPlanLine` in the Work store rejects a plant not on the list (the store has no site list today, so pass it in). Originally planned: `addPlanLine` in `src/lib/work/store.tsx` rejects a plant that isn't on the site's list. A pure `isSitePlant(sites, siteId, plant)` goes in `src/lib/site-scope.ts`. The plant field in `src/components/work/work-plan.tsx` today suggests Master Data plants plus any plant already typed on a plan line (`knownPlants`) and accepts free text. It becomes a Master Data-only dropdown. `src/lib/seed.ts` gets the same DTA plants so a local (non-Supabase) run matches.

### Step 2: DPR report header inside Work
- Files: `src/lib/work/types.ts` (`DprReport`, `DprEntry.reportId`), `src/lib/work/store.tsx` (`addDpr` attaches to the day's report; `saveReport`; `addPlanLine` checks the plant against Master Data), `src/lib/work/logic.ts` (`reportOf`, `reportsForDay`), `src/lib/site-scope.ts` (`isSitePlant`), `src/lib/seed.ts` (DTA plants), `src/lib/work/seed.ts` (demo entries grouped into approved reports; key → v9), `src/lib/work/scenarios.ts`, `src/components/work/work-plan.tsx` (plant dropdown), `src/components/work/work-jobs.tsx` (entries grouped under "Report · date · plant"), `src/app/(app)/work/page.tsx`.
- Rules: §3 *every DPR and request must pick a plant* (from the site's Master Data list); §5 *how many per day* (any number), *painting line* (plant, location, MPS, start/end, 2,000 m² max: existing checks keep running), *job register* (every line picks a job); §10 *job stages*.
- Check: **Owner** adds a plan line and can only pick DTA plants from Master Data. **Supervisor** adds a DPR line on a job and sees it under today's report. **SIC/Owner** see job progress move. **Finance** P&L labour picks up the crew.

### Step 3: Submit gates, SIC review, lock; SIC closes the cycle
- Files: `src/lib/work/logic.ts` (`canSubmitReport`, `isLate`, `canCloseCycle`), `src/lib/work/store.tsx` (`submitReport`, `reviewReport`, `unlockReport`; `confirmJms` becomes **SIC closes the cycle** with an explicit review: the Close cycle screen lists every submitted DPR in the cycle with its key figures (crew present / total, m² by stage, litres) and the SIC approves each one, or uses **Approve all listed** after seeing the list; each approval is its own logged event), `src/lib/work/types.ts` (`Jms.review`), `src/lib/work/events.ts` (`dpr_submitted`, `dpr_approved`, `dpr_sent_back`, `dpr_unlocked`, `cycle_closed`; instant ones added to `INSTANT`), `src/lib/store.tsx` (`applyDprAttendance`), `src/lib/acpl.ts` (accept crew marks from a report), new `src/components/work/work-reports.tsx` (report card: permit nos, TBT, crew attendance, zero reason, submit, SIC approve/send back, Owner unlock), `src/components/work/work-jobs.tsx` ("Close cycle → JMS" for SIC), `src/app/(app)/work/page.tsx` (Reports tab), `src/components/work/notifications.tsx`.
- Rules: §5 *deadline* next day 10:00 (late flag); *before submitting* permit + TBT, every crew member marked, quantity > 0 or a reason; *SIC review* approve or reject with reason, resubmit; *after approval locked*, Owner/SA unlock with logged reason; §10 *closing* (Owner decision 2: SIC closes a cycle → internal JMS, with an audit trail); §18 *direct labour* from the DPR crew list (crew now has status and times); §19 instant approvals + 24 h escalation.
- How unapproved DPRs are handled: DPRs still in **draft** or **sent back** block the close. **Submitted** ones are never approved implicitly — the SIC reviews them on the Close cycle screen (approve each, or Approve all listed once shown). A DPR rejected there (reason required) blocks the close until it is resubmitted and approved (§5 SIC review). If the Owner prefers closing to approve them automatically, record that answer and date in §7.
- Double entry (P1): `effectiveReports` / `reportDiffs` replace the entry-level rule; a `dpr_mismatch` event goes to the supervisor and the monthly review lists the differences.
- Check: **Supervisor** can't submit without permit/TBT/crew marks; submits; requests close. **SIC** gets an instant notification, sends one DPR back with a reason, and the supervisor fixes and resubmits; SIC closes the cycle → internal JMS, and HR attendance for those days appears. **Owner** sees every step in the activity log and unlocks a DPR with a reason. **Finance** sees the JMS in Payments as approved, not yet received. **Supervisor and Admin both file the same day with different m²**: job progress uses Admin's figure and the supervisor gets a notification.

### Step 4: DPR desk writes to Work (temporary adapter for unmoved screens)
- Files: `src/app/(app)/dpr/page.tsx`, `src/app/(app)/dpr/new/page.tsx`, `src/app/(app)/dpr/[id]/page.tsx`, `src/components/dpr/dpr-form.tsx` (painting lines now pick a **job** and enter members, reusing the Work member editor; scaffold lines gain `liftingTrips`), `src/components/dpr/safety-dpr-form.tsx`, `src/app/(app)/approvals/sic/page.tsx` (queue = Work reports), `src/lib/work/types.ts` (`scaffold`, `safetyBody`, `storeBody`, `equipment`, `requests`; key → v10), `src/lib/safety-dpr.ts` (safety body helpers move with it), `src/lib/store.tsx` (remove `saveDpr`/`submitDpr`/`reviewDpr`; `submitReport` raises equipment requests through a new `raiseRequestsFromDpr`; `migrateState` drops `dprDocuments`/`dprs`), `src/lib/seed.ts` (key → v13), new `src/lib/work/legacy-view.ts` (`reportsAsDprDocuments(work)`: a **temporary** selector so screens not moved yet show the new Work reports).
- Rules: all of §5 now enforced on the only DPR form; §5 *types* (painting & blasting, scaffolding, safety, store); §5 *scaffolding line* incl. lifting & shifting in trips; §5 *Admin as data operator* (`enteredBy`); §10 *each DPR line picks its stage*.
- Check: **Supervisor** files a DPR on `/dpr/new`, and the job on `/work` moves forward (the twin systems now meet). **SIC** approves on `/approvals/sic`. **Owner** sees the same DPR on the Owner home and in Work. **Finance**: labour for that day appears in P&L.

### Step 5: Move the remaining DPR readers; delete the legacy DPR model
- Files: `src/app/(app)/supervisor/page.tsx`, `src/app/(app)/sic/page.tsx`, `src/app/(app)/owner/page.tsx`, `src/components/owner/site-comparison.tsx`, `src/app/(app)/submissions/page.tsx`, `src/app/(app)/admin/page.tsx`, `src/app/(app)/safety/page.tsx`, `src/app/(app)/store/page.tsx` (store DPR list), `src/app/(app)/attendance/acpl/page.tsx`, `src/lib/acpl.ts` (`matchAcplAgainstApproved` reads approved Work reports), `src/app/(app)/hr/page.tsx` and `src/app/(app)/requests/page.tsx` (`sourceDprId` now holds a report id; link opens the Work report), `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`dpr_note` → note on today's draft report), `src/lib/site-scope.ts`, `src/lib/types.ts` (delete `DprDocument`, legacy `DprEntry`, `DprPaintWorkLine`, and `DprStatus` in favour of Work's), `src/lib/seed.ts`/`seed-sites.ts` (remove legacy DPR seed), delete `src/lib/work/legacy-view.ts`.
- Rules: §5 (one DPR everywhere); §4/§12 attendance and ACPL match keep reading approved DPR crews; §19 waiting lists.
- Check: **Owner** home pending counts = Work reports; site comparison per site. **SIC** home pending. **Supervisor** home "my DPRs". **Finance**: unaffected. Also open Safety, Store, HR, ACPL as **Super Admin** (View as) to confirm they list the new DPRs.

### Step 6: Submitted-JMS upload and comparison with the internal JMS
- Files: `src/lib/work/types.ts` (`JmsSubmission`, `Jms.submissionId`; key → v11), `src/lib/work/logic.ts` (`compareJms`, `jmsStatus` derived from the submission, `supervisorRatings`), `src/lib/work/store.tsx` (`uploadSubmission` with match on RIL JMS no., `linkSubmission`/`unlinkSubmission`; `setJmsStatus` moves to the submission and writes an event), `src/lib/work/events.ts` (`jms_submitted`, `jms_status`, `jms_linked`, `jms_difference`, `jms_unpaid`), `src/app/(app)/jms/page.tsx` (upload Excel + PDF names, internal vs submitted side by side with differences, "no internal JMS" / "not submitted yet" lists, ratings from `supervisorRatings`, Owner "Post incentive"), `src/components/work/work-jms.tsx` (link + status from submission + audit trail per JMS), `src/components/work/work-activity.tsx` (JMS filter).
- Rules: §10 *upload by Admin*; *check vs the job's DPR total*; *flag any difference*; *bill status comes from the JMS upload; same JMS no. = stage update*; *Excel figures, PDF proof*; *a closed cycle is the JMS* (Owner decision 2); §14 status flow + re-upload rule; audit log on every step.
- Check: **Supervisor**: closing a cycle still creates the internal JMS. **SIC** sees internal vs submitted, with differences flagged. **Owner** sees the full trail for one JMS (closed by, uploaded by, linked, status changes) and posts an incentive. **Finance** sees the RIL status from the upload on the Payments row.

### Step 7: JMS readers in Finance/Owner/SIC; delete `JmsPackage`
- Files: `src/app/(app)/finance/page.tsx` (payment = `recordPayment`; remove `markJmsPayment` and JMS finance alerts), `src/app/(app)/owner/page.tsx` (ratings, billed/received from Work; remove `billing`), `src/app/(app)/sic/page.tsx`, `src/app/(app)/submissions/page.tsx`, `src/app/(app)/admin/page.tsx`, `src/components/owner/site-comparison.tsx` (billed/received per site from `paymentRows`), `src/lib/store.tsx` (delete `uploadJmsPackage`, `matchJmsLines`, `reviewJmsPackage`, `computeRatings`, `markJmsPayment`; `migrateState` drops `jmsPackages`, `workRatings`, `billing`), `src/lib/types.ts` (delete `JmsPackage`, `JmsLine`, `WorkRating`, `BillingSnapshot`, JMS kinds of `FinanceAlert`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v14), `src/lib/seed-sites.ts`.
- Rules: §18 *income when payment is received*, *earned not yet received* shown separately, *approved vs received* dashboard; §10 *bill status comes from the JMS*.
- Check: **Finance** records a payment from Finance; it shows on the Owner `MoneyCard` and in P&L once. **Owner** dashboard billed/received per site matches Work Payments. **SIC** home shows cycles waiting to close. **Supervisor**: unaffected.

### Step 8: Paint board on `PaintBatch` + internal 941/942/261 steps; delete `paintStock`
- Files: `src/lib/work/types.ts` (`PaintBatch` additions, `PaintStep`, optional `mfg`/`expiry`; key → v12), `src/lib/work/logic.ts` (`boardStage(batch, steps, balances)`, `stepsWaitingForRilRef`, `paintVariance`, `expiryState` → `"unknown"`, store stock = `sge_receive` only), `src/lib/work/store.tsx` (`receivePaint`, `advancePaintLifecycle`; `issuePaint` creates the 941 step and issues from store stock only; `recoMonth` (942 from DPR use), `postMonth` (261), `setRilRef`), `src/lib/work/events.ts` (`paint_received`, `paint_stage`, `paint_step`, `paint_variance`), `src/lib/paint-lifecycle.ts` (stage order/labels reused; "RIL ref allowed once our step exists"), `src/app/(app)/store/page.tsx` (board reads Work batches + steps; reco and post buttons; RIL ref fields), `src/app/(app)/supervisor/page.tsx` (my paint = `supervisorPaint`, with low/negative flags), `src/app/(app)/owner/page.tsx` (low stock / overdraw / expiry / variance / "waiting for RIL ref" from Work; remove `predictions`), `src/components/work/work-paint.tsx` (steps per supervisor + month, "unknown expiry" slice), `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`stock_receipt` → `receivePaint`), `src/lib/store.tsx` (delete `advancePaintStage`, `updatePaintLine`, `migratePaintStock`; drop `paintStock`, `predictions`), `src/lib/types.ts` (delete `PaintStockLine`, `PredictionAlert`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v15), `src/lib/seed-sites.ts`, `src/lib/work/scenarios.ts`. Store access (D2, W35 — done in #6 / #9; keep them working): `src/lib/permissions.ts` (`plantScopeFor`: no plants = all plants on the account's sites), `src/lib/desk.ts` (`canAccessWork` includes store), `src/lib/work/permissions.ts` (`workTabsFor`, `canIssuePaint`), `src/app/(app)/work/page.tsx`, `src/components/work/common.tsx`.
- Rules: §6 *all 8 stages*; 941/942/261 tracked internally with RIL numbers as reference (Owner decision 3); *issued into the supervisor's name, can't issue more than the store holds*; *each DPR deducts its litres automatically*; *low / no stock flagged to the supervisor*; *variance alert to Owner, tolerance per MPS from Master Data*; *low stock = left < remaining m² × norm*; *overdraw allowed, negative + flagged*; *month end carries forward*; §17 expiry 60-day warning + pie.
- Check: **Supervisor** sees the 941 issue in their name and the balance drop after a DPR with litres, plus a low-stock flag. **Store** (signed in directly as `store` / `store123` from README.md, not via View as) moves a batch PR → PO → RIL receive → SGE receive, issues it, runs the month reco (942 litres = DPR use), posts (261), then types RIL's numbers. **Owner** sees "waiting for RIL ref" and a variance alert. **SIC/Finance**: the board is read-only for them, as today.

### Step 9: Finance entries become Work expenses; delete the legacy ledger
- Files: `src/lib/work/types.ts` (`Expense` additions; key → v13), `src/lib/work/logic.ts` (`canEditExpense`, today's spend helper), `src/lib/work/store.tsx` (`addExpense` validates §8 fields; `editExpense` with edit log; `removeExpense` Owner-only and logged), `src/app/(app)/finance/page.tsx` (entry form → `addExpense` with all §8 fields; ledger list = expenses + JMS payments; wage ledger stays), `src/components/work/work-pnl.tsx` (same form component, edit/history), `src/app/(app)/owner/page.tsx`, `src/app/(app)/sic/page.tsx` ("Today expenses" from Work), `src/components/owner/site-comparison.tsx`, `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`expense` → draft expense for Finance to complete), `src/lib/store.tsx` (delete `addFinance`; drop `finance`), `src/lib/types.ts` (delete `FinanceEntry`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v16), `src/lib/seed-sites.ts`, `src/lib/permissions.ts` (Finance can add expenses), `docs/rules-decisions.md` §8 (Finance can add, matching §18).
- Rules: §8 *who adds* (as updated by §18: Owner, SA, Finance), *no approval: posts on save*, *required fields*, *same-day edit by enterer, later Owner only, all edits logged*; §18 *direct job costs*, *overheads shared by labour-days*, *results per job/site/month*, *access*.
- Check: **Finance** adds an expense with every required field, edits it the same day, and can't edit yesterday's. **Owner** edits yesterday's and sees the edit in the activity log; P&L moves by that amount. **SIC** home "Today expenses" matches. **Supervisor**: no finance access.

### Step 10: Cleanup and docs
- Remove old storage keys left in browsers, remove the `DprEntry` copies of `supervisorId`/`enteredBy` (read from the report), drop now-unused helpers in `src/lib/store.tsx`, `src/lib/types.ts`, `src/lib/seed.ts`, `src/lib/seed-sites.ts`.
- Docs: `AGENTS.md` §2 (remove "older screens … not yet joined") and §5 layout (new files); `docs/build-plan.md` data model aligned to the merged shapes (`dprs` + `dpr_lines` + `dpr_crew`, `jms` + `jms_submissions` + `jms_status_log`, `paint_batches` + `paint_steps`, `expenses`) so the Supabase schema is written once, for one model.
- Check: all four roles, full flow: plan → job → DPR (`/dpr/new`) → SIC approve → SIC closes cycle → internal JMS → upload submitted JMS → compare → payment → P&L.

### Step 11: A shared, tamper-proof audit log
- Apply migration `supabase/migrations/20261013_004_audit_integrity_usernames.sql` (written in #13, confirm with the Owner first): audit rows are inserted only through `public.write_audit()`, which takes the user, username and role from the caller's own profile, so nobody can log under another name (B1).
- Work events are written to `audit_log` through the same function as they happen (module `work`, action = event kind, detail = the event text), with `impersonated_by` set when Super Admin is viewing as someone (W32). Test tools stop clearing them: Reset clears the browser copy only.
- Actions that log only in the browser today, and the step that makes each one shared: attendance marks and corrections (Step 3, crew on the report), finance ledger entries (Step 9), labourer / trade / Master Data edits (this step — they already write main-store audit lines in #13), JMS status changes (Step 6), voided costs (Step 9).
- Check: **Owner** sees the same activity on two browsers; a Super Admin "view as" action shows the impersonator; Reset on one browser doesn't remove anything from the Owner's audit view.

---

## 7. Decisions
From the Owner (2026-10-12):
- Fresh start from October 2026; past data uploaded later, and a P&L change from that is fine.
- SIC closes a cycle → internal JMS, compared with the uploaded submitted JMS; audit log on every step.
- 941 / 942 / 261 are tracked internally as our own steps; RIL's numbers are reference only.

Made in this plan, following the existing rules:
- Work is the surviving model for all four pairs (AGENTS.md §1).
- Paint "issued" / "consumed" and litres used are derived from issues and DPRs, never typed (§6 *consumption is automatic*).
- Ratings are derived, not stored; posting an incentive to wages is an explicit Owner action.
- `wageLedger` stays as payroll and does not enter P&L (avoids double-counting labour, §18).
- When the SIC closes a cycle, draft or sent-back DPRs block it, and submitted ones are **reviewed on the close screen** (approve each or Approve all listed), never approved implicitly (review note P2, 2026-10-13).
- The Admin (data operator) report wins over the supervisor's for the same day, plant and job; differences are notified and listed (P1, §5b).

## 8. Why this order
DPR comes first because JMS (qty from final-shade DPRs), paint (litres from DPRs) and P&L (labour from DPR crews) all depend on it. JMS comes before money because income is the JMS payment. Paint and money are independent of each other, so Steps 8 and 9 can swap. Every step moves writers first, keeps readers working (temporary adapter), and deletes the legacy model only in the step where its last reader leaves.
