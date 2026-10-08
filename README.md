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

Storage key: `sge-obms-ops-v8-desk` — **Reset seed data** after pull.

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
