# AGENTS.md — SGE OBMS Yard Ledger

Shared instructions for **every** AI coding tool on this repo (Cursor, Claude Code, others).
Cursor reads this file and `.cursor/rules/`; Claude Code reads `CLAUDE.md`, which points here.
**Keep this file the single source of truth** — update it in the same change when you change how things work.

## 1. What this is
Operations & Business Management System for **Shree Gayatri Enterprise** (SGE), an industrial
painting / blasting / scaffolding contractor working for Reliance (RIL) at Jamnagar across six
sites: DTA, MTF, MARINE, PCG, JETTY, GAGVA.

Core business flow (the heart of the app):

```
Work Order (scope m² + ₹ cap)
  └─ Monthly Plan line (site · plant · service item/MPS · plan m², carried m²)
       └─ Job (location, required stages)
            └─ DPR entries (stage · measured members · paint litres · DFT)
                 └─ job closed by supervisor → SIC confirms → JMS (qty = final-shade m² × WO rate)
Actual = Σ JMS on the plan line · Remaining = Plan − Actual · unfinished work carries forward
```

## 2. Status (2026-10-11)
- **Backend started (Supabase project `sge-obms`, Mumbai).** Live in Supabase: logins (username + password; hidden email `<username>@obms.internal`), `profiles` (roles, sites), `sites`, `master_items` (Master Data catalog) and `audit_log`, all with RLS. Owner/Super Admin user management goes through the `admin-users` edge function (`supabase/functions/admin-users`). **Everything else** (Work module, DPRs, labourers, attendance, finance…) is still browser `localStorage`. Without the env vars the app falls back to the old local mock login.
- Demo logins are in `README.md` (e.g. `uditya` / `password` = Super Admin). They are demo seed values, not secrets.
- The **Work** module (`/work`) implements the flow above with real DTA Aug-2026 figures, plus **Payments** (SIC-approved vs received per JMS), **P&L** (cash basis; labour from DPR crews, fixed costs shared by labour-days) and **Test tools** (View as, scenarios, reset — Owner/Super Admin), a header **notification bell** ("Waiting for me", instant approvals/problems, daily summary, 24 h escalation) and an **Activity log** tab (Owner/Super Admin). Every Work action writes an event via `log()` in `work/store.tsx`; who sees it is decided in `work/events.ts` (`isFor`). The Owner home and Finance show the same "Approved vs received" card.
- Older demo screens (Operations, DPR desk, attendance, finance) use a separate store and are not yet joined to the Work module.
- Decided next (not built): Supabase backend (new project, Mumbai), Vercel (team "Shree Gayatri Ent"), ACPL/eSSL/JMS-book uploads, Gujarati + Hindi labels, a simplified navigation (options A/B/C — **owner hasn't picked yet**, B "four fixed tabs" recommended).
- Full business rules: **`docs/rules-decisions.md`** (§1–§18). Build order + data model: **`docs/build-plan.md`**. Read the relevant section before changing behaviour.

## 3. Stack
- Next.js **15.5** (App Router, Turbopack dev) · React **19.1** · TypeScript (strict)
- Tailwind CSS **v4** (`@import "tailwindcss"` in `src/app/globals.css`) + shadcn/ui on Radix (`src/components/ui/*`) · lucide-react icons
- Fonts via `next/font`: Barlow Semi Condensed (headings, numbers), Inter (body), JetBrains Mono (codes)
- Supabase (`@supabase/supabase-js`; client in `src/lib/supabase/`) for logins + users + master data; rest is still React context + `localStorage`

## 4. Run / check
```bash
npm install
npm run dev        # http://localhost:43127
npx tsc --noEmit -p .
npx eslint src
npm run build
```
Windows note: Node is at `C:\Program Files\nodejs`. If `npm` isn't found in a shell, add it to `PATH`.
After pulling changes that touch seed data, click **Reset** (header, Owner / Super Admin only; it asks first and resets both the main and the Work data) — old browser data is kept otherwise. Storage keys: main `sge-obms-ops-v12`, Work `sge-work-v7`.

## 5. Layout
```
src/
  app/
    page.tsx                 login
    layout.tsx               fonts + StoreProvider
    globals.css              design tokens (Vendor Desk livery)
    (app)/layout.tsx         WorkProvider + AppShell (all signed-in pages)
    (app)/work/page.tsx      Work module (tabs: plan, jobs, jms, wo, paint)
    (app)/owner|sic|hr|…     older role screens
  components/
    shell/app-shell.tsx      header, site picker (incl. "All sites"), nav
    work/*                   Work module screens
    owner/site-comparison.tsx All-sites table on the owner dashboard
    shared/ui-bits.tsx       KpiTile, Panel, StatusPill, SectionHeader, EmptyState, formatINR
    shared/require-module.tsx route guard: every signed-in page is wrapped in guarded("<module>", Page)
    ui/*                     shadcn primitives — don't restyle, compose
  lib/
    store.tsx                main app store (users, sites, labourers, finance, legacy DPR…)
    seed.ts, seed-sites.ts   main demo data (six sites)
    site-scope.ts            ALL_SITES, scopeState(), entrySiteId()
    desk.ts, roles.ts, permissions.ts  nav + role access (store actions check can(s, module, action) too)
    dpr-validate.ts          DPR submit checks (permit, TBT, crew marked, qty or reason), used by form + store
    ep.ts                    EP numbers: PP + 10 digits, normalizeEp(), name fallback
    acpl.ts                  ACPL parse + DPR vs gate match
    work/types.ts            Work data model
    work/logic.ts            ALL Work calculations (pure functions)
    work/seed.ts             Work demo data from real DTA documents
    work/store.tsx           WorkProvider: actions + localStorage (key sge-work-v5); checks workRights() itself
    work/permissions.ts      workRights(role): who may plan / enter / confirm / issue paint / see money
    work/scenarios.ts        test scenarios (pure WorkState transforms)
docs/
  rules-decisions.md         agreed business rules (owner's answers)
  build-plan.md              Release-1 plan, data model, deploy checklist
```

## 6. Conventions (follow these)
**Business logic**
- Put calculations in pure functions in `src/lib/work/logic.ts` (or a sibling `lib/*` file), never inline in components. Components only display.
- Rule constants live in one place: `OVER_TOLERANCE` (5 %), `UNDER_TOLERANCE` (2 %), `WO_WARN` (80 %, 95 %), `EXPIRY_WARN_DAYS` (60). Change the constant, not the screens.
- Measured area = `NOS × SIDE × LENGTH × CF`, rounded to 3 decimals (`round3`). m² always shows up to 3 decimals.
- Money: INR, `formatINR()` (en-IN grouping, ₹). Amounts rounded to paise.

**Sites & roles**
- Roles: `super_admin, owner, sic, hr, admin, finance, supervisor, store, safety, labourer` (`src/lib/types.ts`). One role per login is the agreed target.
- Screens read `useStore().state`, already filtered to the active site by `scopeState()`. Use `fullState` only for admin views (Master Data).
- `currentSiteId === "all"` (ALL_SITES) is Owner / Super Admin only. New records in All sites go to `entrySiteId(state)`.
- Work module: filter by site with `useWorkScope().inSite(siteId)` / `lineIds`.
- Each site has its own plan month: `currentMonthOf(work, siteId)` / `isMonthClosed(...)` (`useWorkScope().monthOf`). Never assume one global month.
- Areas, litres and crew go through `effectiveEntries()`: when Admin re-enters a DPR day, Admin's entry counts and the supervisor's is kept only for comparison (docs §5b).
- New page? Wrap its default export in `guarded("<module>", Page)`. New store action? Check `can(s, module, action)` (main store) or `workRights()` (Work store).
- Every login is linked to a staff record (`staffId`) or a labourer (`labourerId`); `checkSeat` enforces it.

**UI (Vendor Desk livery — keep it)**
- Colours only via CSS variables in `globals.css`: `--sge-night` (ink header #14181d), `--sge-brass` (amber #e8851e, fills only), `--sge-brass-ink` (#9a5a06, amber **text** — amber text on white fails contrast), `--sge-linen` (page #e9ecef), `--sge-paper` (cards), `--sge-ok / warn / crit` (+ `-wash`). No new hex values in components.
- Headings: `font-heading` (Barlow, uppercase). Numbers: `tabular-nums`. Codes: `font-mono`.
- Reuse `Panel`, `KpiTile`, `StatusPill`, `SectionHeader`, `EmptyState`. Tables: plain `<table>` with the `thCls` / `tdCls` helpers in `components/work/common.tsx`.
- Header has a 6 px amber/ink hazard stripe (`.ledger-rule`). Desktop first (office laptop), must still work at phone width.
- Copy: short, sentence case in body text, verb-first buttons ("Close job", "Confirm → JMS").

**Code**
- TypeScript strict; no `any`. Keep `npx tsc --noEmit` and `npx eslint src` clean.
- Match surrounding style; comment the *why*, not the *what*.
- Changing seed data or a stored shape? Bump the storage key (`STORAGE_KEY` in `lib/seed.ts`, `WORK_STORAGE_KEY` in `lib/work/seed.ts`) or add a migration.

## 7. Domain glossary
| Term | Meaning |
|---|---|
| WO / ARC | RIL work order / rate contract, e.g. `CCM/260069431`, FO `280152290` |
| Service item | RIL service code + rate, e.g. `3378150` MPS-1 handtool brush ₹169.78/m² |
| MPS | Paint system (MPS-1, -3, -4, -13…) — sets paints and litres/m² norms |
| DPR | Daily Progress Report from the supervisor |
| Stage | prep (blasting / surface prep) → 1st coat → 2nd coat → final shade |
| JMS | Joint Measurement Sheet — RIL-certified quantity; created when a job reaches final shade; status JMS SUBMITTED → QSD → A1 → A2 → A3 → INVOICE UPLOADED → PAID |
| SIC | Site InCharge — approves DPRs, confirms JMS |
| EP no. | RIL gate pass, format `PP` + 10 digits (e.g. `PP5920136007`) |
| ACPL / eSSL | Gate / biometric attendance exports (monthly) |
| FIM / 941·942·261 | Free-issue paint from RIL and its SAP movement / reservation numbers |
| DFT | Dry film thickness (µm), entered at final shade |
| Carry forward | Unfinished plan m² + open jobs move to next month when a month is closed |

## 8. Guardrails
- Don't commit secrets. When Supabase arrives: only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the browser (see `.env.example`); service-role key only server-side. Every schema/RLS change = a migration file in `supabase/migrations/`.
- Real people's data (Aadhaar, bank, wages) must never go in seed files or the repo.
- Don't touch the separate **Operations Hub** project or its Supabase (`smmqycmbrpqthvnhrwzv`) from here.
- Work on a branch; open a draft PR; keep `main` deployable.
- **Two tools, one repo:** don't let Cursor and Claude Code edit the same files at the same time. Commit (or stash) before switching tools; pull before starting.

## 9. Definition of done
1. Types + lint clean, `npm run build` passes.
2. Run the app and click through the changed flow as the relevant role(s) (Super Admin sees all; test a Supervisor and SIC too).
3. If a business rule changed, update `docs/rules-decisions.md`; if structure changed, update this file.
4. Describe what you verified in the PR / commit message.
