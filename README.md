# SGE OBMS — Yard Ledger (v7)

Operations & Business Management System for **Shree Gayatri Enterprise** (RIL Jamnagar multi-site).

This is a **new visual version** of Phase-1 OBMS: same product, data model, ACL, and flows — restyled as a dusk **Yard Ledger** (forest command bar, brass stamps, linen paper desk). Local demo with username/password auth, rights matrix, audit log, and localStorage mock store. No real backend.

## Run locally

```bash
npm install
npm run dev
```

App: [http://127.0.0.1:43127](http://127.0.0.1:43127)

## What stayed the same

- Roles, ACL v3, Super Admin View as / Impersonate
- DPR by role (paint / scaffold / safety F/HSE/008 / store)
- Paint FIM 8-stage lifecycle (941 issue, 942/261 posted, dual books)
- Six sites, trade catalogue, versioned PO rate book
- Calculators, JMS, ACPL, finance, telegram drafts

## What changed (v7)

- **Top command bar** instead of a left sidebar
- **Forest + brass + linen** palette (not the v6 cool-gray Hub / orange accent)
- **Fraunces + Outfit + JetBrains Mono** instead of Archivo + IBM Plex
- Split-panel login (night brand rail + paper form)
- Ledger cards (left brass rule, stamp-like status pills)
- Storage key: `sge-obms-ops-v7-ledger` (Reset seed data if you had v6)

## Sites

| Code | Name | RP tags |
|------|------|---------|
| DTA | DTA | RP2 |
| MTF | MTF | RP2, RP5 |
| MARINE | Marine | RP5 |
| PCG | PCG | — |
| JETTY | Jetty | RP5 |
| GAGVA | Gagva | — |

Owner / Super Admin / SIC (and Admin/Finance) get a **site switcher** in the command bar.

## Demo logins (ACL v3)

| Username | Password | Roles |
|----------|----------|-------|
| `uditya` | `password` | Super Admin |
| `owner` | `owner123` | Owner |
| `sic` | `sic123` | SIC |
| `admin` | `admin123` | Admin |
| `hr` | `hr123` | HR |
| `finance` | `finance123` | Finance |
| `paint` | `paint123` | Painting supervisor (plant CPP) |
| `scaffold` | `scaffold123` | Scaffolding supervisor (plant CPP) |
| `safety` | `safety123` | Safety supervisor |
| `store` | `store123` | Store Keeper |
| `labourer` | `labour123` | Labourer (own profile only) |

## Paint FIM lifecycle (8 stages)

PR → PO → RIL Store → SGE Store → Issued to Supervisor (**941** issue movement) → Consumed via DPR → Reco → Posted **942/261** (consumption receipt after reco).

## Founder click-path

1. **uditya** → Users → **View as** `store` → Store paint board (8 columns) → edit 941 / advance → Exit
2. **store** → advance a reco line to Posted → enter 942 + 261 → dual books
3. **paint** → New DPR defaults to Painting & Blasting (type locked)
4. **scaffold** → New DPR defaults to Scaffolding only
5. **safety** → Safety DPR only — no paint body
6. **owner** → Paint variance shows 942/261 refs
