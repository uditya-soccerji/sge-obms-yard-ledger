# SGE OBMS — Yard Ledger (v8 desk)

Operations & Business Management System for **Shree Gayatri Enterprise** (RIL Jamnagar multi-site).

Yard Ledger visual language (forest command bar, brass, linen) with a three-item desk: **Home · Operations · Master Data**.

Local demo, username/password, ACL, localStorage mock. No real backend.

## Run locally

```bash
npm install
npm run dev
```

App: [http://127.0.0.1:43127](http://127.0.0.1:43127)

Demo Super Admin: `uditya` / `password`

## Desk (v8)

- **Home** — this role’s KPIs and queues
- **Operations** — inner pills for *this role only*; only the active panel mounts
- **Master Data** — Owner / Super Admin, desktop spreadsheet (hidden on phone)

## Master Data v1 sheets

Sites, Users/seats, Labourers, Contractors, Trades, DPR types, Activity templates, Units, Materials (paint + SAP), Store books (941/942/261), FIM stages, Rate book, Safety form codes, Shift types, Attendance statuses.

Deactivate, don’t delete. Site rows first, company-wide fills the rest. Roles stay in code.

Storage key: `sge-obms-ops-v9-sites` — **Reset seed data** after pull.

## Sites (v9)

- Every site (DTA, MTF, Marine, PCG, Jetty, Gagva) has its own demo crew, attendance, DPRs, paint stock, kit, money and requests — see `src/lib/seed-sites.ts`.
- Screens read `useStore().state`, which is cut to the active site (`src/lib/site-scope.ts`). Master Data reads `fullState`.
- Owner / Super Admin get **All sites** in the site picker: totals across every site plus a site-by-site table on the dashboard. New entries made in All sites go to the **New →** site in the header (Finance also asks per entry).
- Look: Vendor Desk livery — ink header, amber/ink hazard stripe, concrete page, Barlow Semi Condensed + Inter.

## Demo logins

| Username | Password | Roles |
|----------|----------|-------|
| `uditya` | `password` | Super Admin |
| `owner` | `owner123` | Owner |
| `sic` | `sic123` | SIC |
| `admin` | `admin123` | Admin |
| `hr` | `hr123` | HR |
| `finance` | `finance123` | Finance |
| `paint` | `paint123` | Painting supervisor |
| `scaffold` | `scaffold123` | Scaffolding supervisor |
| `safety` | `safety123` | Safety supervisor |
| `store` | `store123` | Store Keeper |
| `labourer` | `labour123` | Labourer |
