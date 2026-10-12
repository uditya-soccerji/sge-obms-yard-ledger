# Merge plan: one data model per business object (X1)

Written 2026-10-12 against `main` @ `fbab583`. **Plan only. No code has changed yet.**
Rules referenced: `docs/rules-decisions.md` §5 DPR, §6 Paint stock, §8 Finance, §10 JMS & billing,
§18 Accounting / P&L (and §19 notifications where it applies).

## 0. The problem in one paragraph
The app keeps two stores that never talk to each other:
- **Main store** `src/lib/store.tsx` (`useStore`, key `STORAGE_KEY = "sge-obms-ops-v9-sites"` in `src/lib/seed.ts`): the older screens (DPR desk, SIC approvals, JMS upload, paint board, finance ledger).
- **Work store** `src/lib/work/store.tsx` (`useWork`, key `WORK_STORAGE_KEY = "sge-work-v4"` in `src/lib/work/seed.ts`): the plan → job → DPR → JMS flow, payments and P&L.

So a supervisor's DPR on `/dpr` never moves a job forward. A JMS uploaded on `/jms` never appears in Payments or P&L. Paint on the store board is never deducted by DPR litres. Money typed into Finance never reaches P&L. Per AGENTS.md §1 the **Work model is the target**. Each pair below moves into it, and then the legacy copy is deleted.

Good news that keeps this small: **the IDs are already shared.** Sites (`site-dta`…), staff (`st-sup1`, `st-sic`…) and labourers (`lb-…`) mean the same thing in both stores, so migrated records need no ID remapping.

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
| `legacyLines?: { plant, bay, activity, areaM2, mps?, litres? }[]` | old painting lines with no job; read-only, not counted (see migration) |

Changes to the existing Work `DprEntry`:
- add `reportId: string`. `addDpr` attaches the line to the day's draft report and creates one if none exists.
- keep `crew?: string[]` as "who worked on *this job*". New check: every id in it must be in the report's `crew` with a working status.
- `enteredBy` and `supervisorId` move up to the report. The entry keeps them for one release as copies so `labourByJob` / `paintUsed` don't change.

New Work actions in `src/lib/work/store.tsx`: `saveReport`, `submitReport`, `reviewReport(approve | send_back, note)`, `unlockReport(reason)`. Gate rules go in pure `canSubmitReport(report, entries)` in `logic.ts`. New `EventKind`s in `events.ts`: `dpr_submitted`, `dpr_approved`, `dpr_sent_back` (instant, §19), `dpr_unlocked` (problem).

Approval writes attendance. `reviewReport` calls a new main-store action `applyDprAttendance(reportId, date, siteId, crew)`, which reuses `attendanceFromApprovedDpr`. This is the same thing `reviewDpr` does today, so attendance stays in the main store (HR/ACPL own it).

### Data migration
- **Work data (key `sge-work-v4`).** Each existing entry gets a report, grouped by supervisor + date + the job's plant. Seeded history is DTA Aug–Sep, so these reports are `approved` with `review.by = "migration"`. `permitOk`/`tbtDone` are `true` and the crew is the union of the entries' `crew`.
- **Legacy `dprDocuments`.** Each document becomes one `DprReport`. Status map: `draft→draft`, `submitted→submitted`, `sic_approved→approved`, `sic_rejected→sent_back`, `locked→approved`. `labourMarks` becomes `crew`, `sicNote/By/At` becomes `review`, and `scaffoldWork`, `safetyBody` and `storeBody` copy straight across. `telegramDraftLines` are appended to `note`.
  - **Painting lines** (`paintWork`) have an area but no members or job. If exactly one open Work job matches site + plant + date, the line becomes an entry with a single member `{ name: "From old DPR", nos 1, side 1, length area, cf 1 }`. Otherwise it goes into `legacyLines`, shown as "Needs a job" for Admin with a **Link to job** button. Guessing a job would corrupt JMS quantities.
- **Thin `state.dprs`** (paint-gist lines and Telegram notes): `permitOk/tbtDone` copy onto the matching report when one exists. Otherwise drop them: they only fed the owner's paint gist, which Work's `supervisorPaint` replaces.
- See §5 for the storage-key mechanics.

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
**Work `Jms`.** It already holds the business rule "a closed job *is* the JMS" (§10), feeds plan-vs-actual and the WO balance, and is what P&L counts. The legacy package's useful parts are the **upload**, the **DPR comparison** and the **ratings**. They become an upload path into `Jms` plus pure functions.

### Fields to add to `Jms`
| Field | Why / rule |
|---|---|
| `source: "job" \| "upload"` | JMS from SIC confirm vs uploaded by Admin (§10, §14) |
| `jobId?`, `planLineId?` → **optional** | uploaded / historic JMS may not have a job yet. Shown in "Not linked to a job" for Admin (§10 each JMS maps to a job). `lineStatus` already sums by `planLineId`, so unlinked JMS simply don't count toward actual. |
| `siteId`, `plant?` | needed once `jobId` can be empty |
| `items?: { serviceCode?, description, qty, uom: "M2" \| "M3", rate, amount }[]` | JMS abstract has several service items (§15 C1); the single `serviceCode/qty/rate` stay as the first/primary item |
| `rilQty?` | RIL-certified qty from the uploaded Excel. Pure `jmsDifference(jms, work)` compares it with the job's DPR total between `periodFrom` and `periodTo` and flags any gap (§10). |
| `confirmedOn?` → **optional** | unset = not SIC-confirmed yet (uploaded and not reviewed). Payments still require it (§18). |
| `sicNote?` | SIC reject reason |
| `upload?: { by, at, excelName?, pdfName? }` | Excel for figures, PDF as proof (§10, §17). File names only until Supabase Storage. |
| `statusLog: { status, at, by }[]` | re-upload of the same JMS no. = status update, never a new record (§10, §14) |
| `invoiceNo?`, `foNo?`, `scrollNo?`, `label?` | §14 captured fields |
| `JmsStatus` += `"A1 REJECT"` | §14 reject branch |

New actions: `uploadJms(rows)` matches on `jmsNo` and either updates the status or creates `source: "upload"`. Also `linkJmsToJob(jmsId, jobId)` and `reviewUploadedJms(approve | reject, note)`.
**Ratings** stop being stored. `supervisorRatings(work, month)` in `logic.ts` derives them from `jmsDifference`, sent-back reports, equipment faults on reports, and open ACPL flags passed in. The old automatic incentive write into `wageLedger` (`computeRatings`) becomes an explicit Owner button, **Post incentive**, which calls the existing main-store `addWageEntry`.
**Finance alerts** for JMS (`jms_uploaded`, `jms_approved`, `payment_due`) are replaced by Work events `jms_uploaded`, `jms_status`, `jms_unpaid` (§19; unpaid > N days escalates like the 24 h rule).

### Data migration
- Each legacy `JmsPackage` becomes one `Jms` with `source: "upload"`, `jobId` unset, `items` from `lines` (`activity` and `plant` go into `description`), `amount = expectedIncome`, `label`, `siteId`.
  - Status: `sic_approved` → `confirmedOn = uploadedAt` date, status `JMS SUBMITTED`. `uploaded`/`sic_review`/`draft` → unconfirmed. `sic_rejected` → unconfirmed with `sicNote`.
  - `paymentReceived` → `payment = { receivedOn: paymentReceivedAt, amount: expectedIncome, note: paymentNote }`, status `PAID`.
  - `jmsNo`: legacy packages have none, so use `LEGACY-<id>` and mark them for Admin to correct.
  - The old line matching (`matchedDprId`, `matchRatio`) is dropped. `jmsDifference` recomputes once linked.
- `workRatings` dropped (derived now). Each package's `jms_*` `financeAlerts` are dropped; unacknowledged `payment_due` alerts are re-created as `jms_unpaid` events.
- `billing` snapshots (owner page, site comparison) are dropped. `paymentSummary` replaces them.

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
**Work `PaintBatch`.** It already does what §6 asks: issue to a supervisor, deduct DPR litres automatically, allow and flag overdraw, flag low stock against remaining scope, carry forward, and warn on expiry (§17). The legacy board contributes the **8 lifecycle stages and RIL movement numbers**, which become fields on the batch.

### Fields to add to `PaintBatch`
| Field | Why / rule |
|---|---|
| `lifecycle: "pr" \| "po" \| "ril_receive" \| "sge_receive" \| "reco" \| "posted"` | §6 all 8 stages. **`issued` and `consumed` are derived, not stored**: issued = `supervisorId` set; consumed = `batchBalances` ≤ 0. One source of truth. |
| `mps?` (e.g. `"MPS-1"`) | legacy `mpsScheme`; variance tolerance per MPS (§6) |
| `movement941?`, `movement942?`, `movement261?` | §6, §15 D. Edit rules reuse `canEditMovement941/942261`. |
| `rilPostedL?` | RIL posted litres for the reco variance (SGE used is **derived** from DPR litres, not typed) |
| `mfg?`, `expiry?` → **optional** | legacy lines and FIM "NEW - LOC" rows have no dates; `expiryState` returns `"unknown"`, shown as its own pie slice |
| `prNo?`, `poNo?`, `updatedAt` | board columns |

Rules that change in code: **store stock** = batches with no supervisor and `lifecycle === "sge_receive"`, and `issuePaint` only issues from those. Batches in `pr`/`po`/`ril_receive` are on order, not in stock.
New actions: `receivePaint` (add batch; also used by Telegram `stock_receipt`), `advancePaintLifecycle`, `updatePaintBatch` (941/942/261, `rilPostedL`). Every action logs a `paint_*` event.
Variance alert to Owner (§6): pure `paintVariance(w, tolerancePerMps)` = DPR-derived used vs `rilPostedL`. The tolerance comes from Master Data (`masterCatalog`) through `useStore`. This replaces the hand-seeded `predictions` cards.

### Data migration
Each `PaintStockLine` becomes one `PaintBatch`: `sap = sapCode`, `name = description`, `batch`, `qtyL = qtyLitres`, `siteId`, `mps = "MPS-" + mpsScheme`, `movement*`, `rilPostedL = rilPosted`, `updatedAt`.
- Stage `issued`/`consumed` with `issuedTo` → `supervisorId = issuedTo`, `issuedOn = updatedAt`, `lifecycle = "sge_receive"`.
- `reco`/`posted` → same lifecycle; `pr`…`sge_receive` copy across.
- `sgeUsed` is dropped. DPR litres recompute it, and the value can differ, so the first load logs a one-off `paint_migrated` event listing batches whose typed `sgeUsed` ≠ derived use, so nobody is surprised.
- The `predictions` array is dropped (now derived).

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
New `receipts: { id, date, siteId, amount, note, jmsIds: string[] }[]` in `WorkState` for money received that isn't matched to a JMS yet (see migration). Finance matches a receipt to JMS, which writes `Jms.payment`.

### Data migration
- Legacy **expense** entries become `Expense` with `kind: "fixed"` (site overhead for the entry's month, shared by labour-days, §18), `month = date.slice(0, 7)`, `note = description`, `enteredBy`. Unknown categories map to `"Other"`, and `paymentMode` is `"cash"` and flagged "check mode".
  - ⚠ This **changes P&L numbers**: these costs were never in P&L before. The Owner needs to know.
- Legacy **income** entries with category `"JMS payment"` are **dropped**. They duplicate the package payment carried in §2, and keeping both would count income twice.
- Other legacy **income** (e.g. `"RA bill"`) becomes `receipts`, shown in Finance as "Received, not matched to a JMS". P&L shows them on a separate line so cash totals don't silently drop.
- `financeAlerts` of kind `wage_anomaly` stay in the main store (payroll). JMS kinds are covered in §2.
- `billing` snapshots are dropped (§2).

---

## 5. Storage migration: how existing browser data moves
Today the Work store has **no migration at all**: `JSON.parse` straight into `WorkState`. The main store has `migrateState`, which merges onto the seed. Bumping keys alone would wipe everyone's test data, so we use **versioned migration functions** and bump keys only so an old copy is always left to migrate from.

1. **`src/lib/work/migrate.ts`** (new, pure). `WorkState` gets `schemaVersion: number`. `migrateWork(raw, legacy)` runs steps v4 → v5 → … in order. Each step is a pure `(WorkState, LegacySnapshot) => WorkState`.
2. **`src/lib/work/legacy.ts`** (new, pure). One converter per pair: `reportsFromDprDocuments`, `jmsFromPackages`, `batchesFromPaintStock`, `expensesFromFinance`. These same functions will feed the **Supabase import** later, so the effort is reused.
3. **Never read the legacy data through `StoreProvider`.** The two providers hydrate separately, and `StoreProvider` re-saves straight after loading. Instead:
   - every PR that removes an array from the main store bumps `STORAGE_KEY` (v9 → v10 → …),
   - `StoreProvider` loads the newest key that exists from a `LEGACY_STORAGE_KEYS` list (in `src/lib/seed.ts`) and its `migrateState` simply omits the moved arrays,
   - the **old key is left untouched**, and `WorkProvider` reads the moved arrays raw from it,
   - `WorkState.imported: { dpr?: true; jms?: true; paint?: true; money?: true }` records what has been pulled, so it happens exactly once even if someone reloads mid-way or skips versions.
4. **Fresh browsers / Reset.** `createWorkSeed()` = today's real DTA data **plus** the converters run over `createSeedState()` for the other five sites and for the safety/store/scaffold DPRs. Legacy DTA painting DPRs are skipped because Work already has the real DTA figures. This keeps the six-site demo populated. `Reset` in the header and `Reset work demo` both reset both stores.
5. Old keys are deleted only in the last PR, after one release in use.

| PR | Main `STORAGE_KEY` | Work `WORK_STORAGE_KEY` | `imported` flag set |
|---|---|---|---|
| 1 | v9 (unchanged) | `sge-work-v5` (adds `schemaVersion`, `imported`) | — |
| 2 | v9 | v6 (reports) | — (Work's own entries only) |
| 4 | **v10** (no `dprDocuments`, no thin `dprs`) | v7 | `dpr` |
| 6 | **v11** (no `jmsPackages`, `workRatings`, `billing`, JMS `financeAlerts`) | v8 | `jms` |
| 8 | **v12** (no `paintStock`, `predictions`) | v9 | `paint` |
| 9 | **v13** (no `finance`) | v10 | `money` |
| 10 | cleanup: drop old keys v9–v12 | — | — |

---

## 6. PR-by-PR order
Each PR is a draft PR off `main`, leaves every screen working, passes `npx tsc --noEmit -p .`, `npx eslint src` and `npm run build`, and is clicked through on `npm run dev` as **Owner, Supervisor, SIC, Finance** (logins in `README.md`). Rules not touched by a PR keep working as they do today.

### PR 1: Work storage migration framework (no visible change)
- Files: `src/lib/work/types.ts` (`schemaVersion`, `imported`), new `src/lib/work/migrate.ts`, `src/lib/work/store.tsx` (hydrate through `migrateWork`; also guards against a corrupt or old shape), `src/lib/work/seed.ts` (key → v5), `src/lib/seed.ts` (`LEGACY_STORAGE_KEYS`), `src/lib/store.tsx` (load newest key from the list).
- Rules: none changed. It protects §18 P&L history from being lost on later key bumps.
- Check: all four roles see exactly the same Work/Finance numbers as before the PR. An old `sge-work-v4` in the browser is carried forward, not reset.

### PR 2: DPR report header inside Work
- Files: `src/lib/work/types.ts` (`DprReport`, `DprEntry.reportId`), `src/lib/work/store.tsx` (`addDpr` attaches to the day's report; `saveReport`), `src/lib/work/logic.ts` (`reportOf`, `reportsForDay`), `src/lib/work/migrate.ts` (v5→v6 groups entries into approved reports), `src/lib/work/seed.ts`, `src/lib/work/scenarios.ts`, `src/components/work/work-jobs.tsx` (entries grouped under "Report · date · plant"), `src/app/(app)/work/page.tsx`.
- Rules: §5 *how many per day* (any number), *painting line* (plant, location, MPS, start/end, 2,000 m² max: existing checks keep running), *job register* (every line picks a job); §10 *job stages*.
- Check: **Supervisor** adds a DPR line on a job and sees it under today's report. **SIC/Owner** see job progress unchanged. **Finance** P&L labour unchanged.

### PR 3: Submit gates, SIC review and lock on Work reports
- Files: `src/lib/work/logic.ts` (`canSubmitReport`, `isLate`, `canConfirmJob` now also needs every report touching the job approved), `src/lib/work/store.tsx` (`submitReport`, `reviewReport`, `unlockReport`; `confirmJms` uses the new check), `src/lib/work/events.ts` (`dpr_submitted`, `dpr_approved`, `dpr_sent_back`, `dpr_unlocked`; add the first three to `INSTANT`), `src/lib/store.tsx` (`applyDprAttendance`), `src/lib/acpl.ts` (accept crew marks from a report), new `src/components/work/work-reports.tsx` (report card: permit nos, TBT, crew attendance, zero reason, submit, SIC approve/send back, Owner unlock), `src/app/(app)/work/page.tsx` (Reports tab), `src/components/work/notifications.tsx`.
- Rules: §5 *deadline* next day 10:00 (late flag); *before submitting* permit + TBT, every crew member marked, quantity > 0 or a reason; *SIC review* approve or reject with reason, resubmit; *after approval locked*, Owner/SA unlock with logged reason; §10 *closing*: SIC confirms only fully approved work; §18 *direct labour* from the DPR crew list (crew now has status and times); §19 instant approvals + 24 h escalation.
- ⚠ New interlock (confirm with Owner): a job can't become a JMS while one of its DPRs is still unapproved. It follows from §5 + §10 but isn't written down. If the Owner agrees, add it to `rules-decisions.md` §10 in this PR.
- Check: **Supervisor** can't submit without permit/TBT/crew marks; submits. **SIC** gets an instant notification, sends back with a reason, and the supervisor sees it and resubmits; SIC approves, and the HR attendance for that day appears. **Owner** unlocks with a reason and sees it in the activity log. **Finance** P&L labour for that day is still correct.

### PR 4: DPR desk writes to Work (legacy DPR becomes read-only adapter)
- Files: `src/app/(app)/dpr/page.tsx`, `src/app/(app)/dpr/new/page.tsx`, `src/app/(app)/dpr/[id]/page.tsx`, `src/components/dpr/dpr-form.tsx` (painting lines now pick a **job** and enter members, reusing the Work member editor; scaffold lines gain `liftingTrips`), `src/components/dpr/safety-dpr-form.tsx`, `src/app/(app)/approvals/sic/page.tsx` (queue = Work reports), `src/lib/work/legacy.ts` (`reportsFromDprDocuments`), `src/lib/work/migrate.ts` (v6→v7, `imported.dpr`), `src/lib/work/types.ts` (`scaffold`, `safetyBody`, `storeBody`, `equipment`, `requests`, `legacyLines`), `src/lib/safety-dpr.ts` (`migrateLegacySafetyBody` runs inside the converter), `src/lib/store.tsx` (remove `saveDpr`/`submitDpr`/`reviewDpr`; `submitReport` raises equipment requests through a new `raiseRequestsFromDpr`; `migrateState` drops `dprDocuments`/`dprs`), `src/lib/seed.ts` (key → v10), new `src/lib/work/legacy-view.ts` (`reportsAsDprDocuments(work)`: a **temporary** selector so screens not yet moved keep showing DPRs), plus the "Link to job" action for `legacyLines`.
- Rules: all of §5 now enforced on the only DPR form; §5 *types* (painting & blasting, scaffolding, safety, store); §5 *scaffolding line* incl. lifting & shifting in trips; §5 *Admin as data operator* (`enteredBy`); §10 *each DPR line picks its stage*.
- Check: **Supervisor** files a DPR on `/dpr/new`, and the job on `/work` moves forward (the twin systems now meet). **SIC** approves on `/approvals/sic`. **Owner** sees old DPRs migrated, with "Needs a job" lines listed. **Finance**: no change in P&L except labour from the new crew.

### PR 5: Move the remaining DPR readers; delete the legacy DPR model
- Files: `src/app/(app)/supervisor/page.tsx`, `src/app/(app)/sic/page.tsx`, `src/app/(app)/owner/page.tsx`, `src/components/owner/site-comparison.tsx`, `src/app/(app)/submissions/page.tsx`, `src/app/(app)/admin/page.tsx`, `src/app/(app)/safety/page.tsx`, `src/app/(app)/store/page.tsx` (store DPR list), `src/app/(app)/attendance/acpl/page.tsx`, `src/lib/acpl.ts` (`matchAcplAgainstApproved` reads approved Work reports), `src/app/(app)/hr/page.tsx` and `src/app/(app)/requests/page.tsx` (`sourceDprId` now holds a report id; link opens the Work report), `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`dpr_note` → note on today's draft report), `src/lib/site-scope.ts`, `src/lib/types.ts` (delete `DprDocument`, legacy `DprEntry`, `DprPaintWorkLine`, and `DprStatus` in favour of Work's), `src/lib/seed.ts`/`seed-sites.ts` (remove legacy DPR seed; the Work seed now carries it), delete `src/lib/work/legacy-view.ts`.
- Rules: §5 (one DPR everywhere); §4/§12 attendance and ACPL match keep reading approved DPR crews; §19 waiting lists.
- Check: **Owner** home pending counts = Work reports; site comparison per site. **SIC** home pending. **Supervisor** home "my DPRs". **Finance**: unaffected. Also open Safety, Store, HR, ACPL as **Super Admin** (View as) to confirm they still list DPR data.

### PR 6: JMS upload into Work; `/jms` on Work
- Files: `src/lib/work/types.ts` (`Jms` additions, optional `jobId`/`planLineId`/`confirmedOn`, `A1 REJECT`), `src/lib/work/logic.ts` (`jmsDifference`, `supervisorRatings`; make `lineStatus`, `woUsage`, `paymentRows`, `jobPnl` tolerate unlinked/unconfirmed JMS), `src/lib/work/store.tsx` (`uploadJms` with match-on-JMS-no, `linkJmsToJob`, `reviewUploadedJms`; `setJmsStatus` appends `statusLog`), `src/lib/work/events.ts` (`jms_uploaded`, `jms_status`, `jms_unpaid`), `src/lib/work/legacy.ts` (`jmsFromPackages`), `src/lib/work/migrate.ts` (v7→v8, `imported.jms`), `src/app/(app)/jms/page.tsx` (upload form, difference flags, "Not linked to a job", ratings from `supervisorRatings`, Owner "Post incentive"), `src/components/work/work-jms.tsx` (status log, upload info), `src/components/work/work-payments.tsx` (skip unconfirmed).
- Rules: §10 *upload by Admin*; *check vs job's DPR total between start and end*; *flag any difference*; *bill status comes from the JMS, same JMS no. = stage update*; *Excel figures, PDF proof*; *a closed job is the JMS*; §14 status flow + re-upload rule; §18 *approved vs received* (payments only on SIC-confirmed JMS).
- Check: **Supervisor**: closing a job still creates a JMS. **SIC** confirms and also reviews an uploaded JMS; the difference vs DPR is shown. **Owner** sees ratings and posts an incentive. **Finance** sees the uploaded JMS in Payments only after SIC confirmation.

### PR 7: JMS readers in Finance/Owner/SIC; delete `JmsPackage`
- Files: `src/app/(app)/finance/page.tsx` (payment = `recordPayment`; remove `markJmsPayment` and JMS finance alerts), `src/app/(app)/owner/page.tsx` (ratings, billed/received from Work; remove `billing`), `src/app/(app)/sic/page.tsx`, `src/app/(app)/submissions/page.tsx`, `src/app/(app)/admin/page.tsx`, `src/components/owner/site-comparison.tsx` (billed/received per site from `paymentRows`), `src/lib/store.tsx` (delete `uploadJmsPackage`, `matchJmsLines`, `reviewJmsPackage`, `computeRatings`, `markJmsPayment`; `migrateState` drops `jmsPackages`, `workRatings`, `billing`), `src/lib/types.ts` (delete `JmsPackage`, `JmsLine`, `WorkRating`, `BillingSnapshot`, JMS kinds of `FinanceAlert`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v11), `src/lib/seed-sites.ts`.
- Rules: §18 *income when payment is received*, *earned not yet received* shown separately, *approved vs received* dashboard; §10 *bill status comes from the JMS*.
- Check: **Finance** records a payment from Finance; it shows on the Owner `MoneyCard` and in P&L once, not twice. **Owner** dashboard billed/received per site matches Work Payments. **SIC** home shows JMS waiting. **Supervisor**: unaffected.

### PR 8: Paint board on `PaintBatch`; delete `paintStock`
- Files: `src/lib/work/types.ts` (`PaintBatch` additions, optional `mfg`/`expiry`), `src/lib/work/logic.ts` (`batchLifecycle(b, balances)` derives issued/consumed; `expiryState` → `"unknown"`; `paintVariance`; store stock = `sge_receive` only), `src/lib/work/store.tsx` (`receivePaint`, `advancePaintLifecycle`, `updatePaintBatch`; `issuePaint` from store stock only), `src/lib/work/events.ts` (`paint_received`, `paint_stage`, `paint_variance`), `src/lib/paint-lifecycle.ts` (stage order/labels reused; movement edit rules take a batch), `src/lib/work/legacy.ts` (`batchesFromPaintStock`), `src/lib/work/migrate.ts` (v8→v9, `imported.paint`), `src/app/(app)/store/page.tsx` (board reads Work batches), `src/app/(app)/supervisor/page.tsx` (my paint = `supervisorPaint`, with low/negative flags), `src/app/(app)/owner/page.tsx` (low stock / overdraw / expiry / variance from Work; remove `predictions`), `src/components/work/work-paint.tsx` (lifecycle column, "unknown expiry" slice), `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`stock_receipt` → `receivePaint`), `src/lib/store.tsx` (delete `advancePaintStage`, `updatePaintLine`, `migratePaintStock`; drop `paintStock`, `predictions`), `src/lib/types.ts` (delete `PaintStockLine`, `PredictionAlert`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v12), `src/lib/seed-sites.ts`, `src/lib/work/scenarios.ts`.
- Rules: §6 *all 8 stages*; *issued into the supervisor's name, can't issue more than the store holds*; *each DPR deducts its litres automatically*; *low / no stock flagged to the supervisor*; *variance alert to Owner, tolerance per MPS from Master Data*; *low stock = left < remaining m² × norm*; *overdraw allowed, negative + flagged*; *month end carries forward*; §17 expiry 60-day warning + pie.
- Check: **Supervisor** sees their paint balance drop after filing a DPR with litres, and a low-stock flag. **Store** (via Super Admin View as) advances a batch PR → PO → … → SGE receive and issues it. **Owner** gets a variance alert after entering RIL posted litres. **SIC/Finance**: the board is read-only for them, as today.

### PR 9: Finance entries become Work expenses; delete the legacy ledger
- Files: `src/lib/work/types.ts` (`Expense` additions, `receipts`), `src/lib/work/logic.ts` (`canEditExpense`, `jobPnl` adds the unmatched-receipts line, today's spend helper), `src/lib/work/store.tsx` (`addExpense` validates §8 fields; `editExpense` with edit log; `removeExpense` Owner-only; `addReceipt`, `matchReceipt`), `src/lib/work/legacy.ts` (`expensesFromFinance`), `src/lib/work/migrate.ts` (v9→v10, `imported.money`), `src/app/(app)/finance/page.tsx` (entry form → `addExpense` with all §8 fields; ledger list = expenses + JMS payments + receipts; wage ledger stays), `src/components/work/work-pnl.tsx` (same form component, edit/history), `src/app/(app)/owner/page.tsx`, `src/app/(app)/sic/page.tsx` ("Today expenses" from Work), `src/components/owner/site-comparison.tsx`, `src/app/(app)/telegram/page.tsx` + `applyTelegram` (`expense` → draft expense for Finance to complete), `src/lib/store.tsx` (delete `addFinance`; drop `finance`), `src/lib/types.ts` (delete `FinanceEntry`), `src/lib/site-scope.ts`, `src/lib/seed.ts` (key → v13), `src/lib/seed-sites.ts`, `src/lib/permissions.ts` (Finance can add expenses).
- Rules: §8 *who adds* (as updated by §18: Owner, SA, Finance), *no approval: posts on save*, *required fields*, *same-day edit by enterer, later Owner only, all edits logged*; §18 *direct job costs*, *overheads shared by labour-days*, *results per job/site/month*, *access*.
- ⚠ Update `docs/rules-decisions.md` §8 in this PR to say Finance can add (already stated in §18, but §8 still reads "Owner / Super Admin only").
- Check: **Finance** adds an expense with every required field, edits it the same day, and can't edit yesterday's. **Owner** edits yesterday's and sees the edit in the activity log; P&L moves by that amount. **SIC** home "Today expenses" matches. **Supervisor**: no finance access.

### PR 10: Cleanup and docs
- Delete old storage keys after migration (`LEGACY_STORAGE_KEYS` v9–v12), remove the `DprEntry` copies of `supervisorId`/`enteredBy` (read from the report), drop now-unused helpers in `src/lib/store.tsx`, `src/lib/types.ts`, `src/lib/seed.ts`, `src/lib/seed-sites.ts`.
- Docs: `AGENTS.md` §2 (remove "older screens … not yet joined") and §5 layout (new files); `docs/build-plan.md` data model aligned to the merged shapes (`dprs` + `dpr_lines` + `dpr_crew`, `jms` + `jms_status_log`, `paint_batches` with lifecycle, `finance_entries` → `expenses` + `receipts`) so the Supabase schema is written once, for one model.
- Check: all four roles, full flow: plan → job → DPR (`/dpr/new`) → SIC approve → close → JMS → payment → P&L.

---

## 7. Decisions this plan makes (and the ones for the Owner)
Made here, following the existing rules:
- Work is the surviving model for all four pairs (AGENTS.md §1).
- `issued` / `consumed` paint stages and "SGE used" litres are derived from DPRs, not typed (§6 *consumption is automatic*).
- Ratings are derived, not stored; posting an incentive to wages is an explicit Owner action.
- `wageLedger` stays as payroll and does not enter P&L (avoids double-counting labour, §18).
- Old painting lines with no job are kept read-only and not counted until Admin links them.

Need an Owner answer before the named PR merges:
1. **PR 3:** may SIC confirm a job → JMS while one of its DPRs is still unapproved? Plan says **no**.
2. **PR 9:** legacy "RA bill" income with no JMS: keep as "received, not matched" and show it in P&L on its own line (plan), or leave it out of P&L?
3. **PR 9:** old finance expenses enter P&L as site overheads. That changes past months' profit. OK?

## 8. Why this order
DPR comes first because JMS (qty from final-shade DPRs), paint (litres from DPRs) and P&L (labour from DPR crews) all depend on it. JMS comes before money because income is the JMS payment. Paint and money are independent of each other, so PRs 8 and 9 can swap. Every PR moves writers first, keeps readers working (adapter or migrated data), and deletes the legacy model only in the PR where its last reader leaves.
