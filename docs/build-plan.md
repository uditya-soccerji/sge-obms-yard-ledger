# Yard Ledger — build & deploy plan (Release 1)

Prepared 2026-10-11 from `docs/rules-decisions.md` (§1–§17). Nothing below is built yet.

## Where it runs
| Piece | Choice |
|---|---|
| App | Next.js 15 (this repo), GitHub `uditya-soccerji/sge-obms-yard-ledger` |
| Database + logins | **New** Supabase project, region ap-south-1 (Mumbai). Not the Operations Hub's project. |
| Hosting | Vercel, team **Shree Gayatri Ent**, project `sge-obms-yard-ledger` (the Hub's two projects untouched) |
| Users | Office laptop first, online only; phones later. English + ગુજરાતી + हिन्दी labels. |

## Data model (Supabase tables)
Every table has `site_id` (except company-wide masters) and row-level security by role + site.

**Masters:** `sites` (code, enabled, read-only when off) · `plants` (site, name; same name allowed in two sites) · `gate_codes` (ACPL plant code → site/plant) · `trades` (wage min/max, sub-categories) · `contractors` (SGE + sub-contractors, = JMS "S/C" and eSSL "Department") · `service_items` (code, description, UOM, MPS, paint norms) · `work_orders` (WO/ARC no., FO no., validity, ₹ cap, scope per service item, rates) · `paints` (SAP code, type, maker, shade) · `equipment_types`.
**People:** `profiles` (one role, username, sites/plants) · `devices` (approved device per login; new device → Owner/SA approval) · `labourers` (Aadhaar 12, mobile, trade, contractor, supervisor, wage) · `labourer_ep_history` (PP+10, current flag, dates).
**Work:** `plans` (month, site, plant, MPS, job type, plan m²; carry-forward link) · `jobs` (plan line, location, start, close, status) · `dprs` (type, date, submitter, entered_by, status, SIC review, lock) · `dpr_lines` (job, stage blasting/1st/2nd/final, m², litres, DFT) · `dpr_measurements` (member, NOS, SIDE, LENGTH, CF → area) · `dpr_crew` (labourer, status, in/out, split-day) · `dpr_admin_copy` + `dpr_differences` (double entry).
**JMS & billing:** `jms` (internal: job, qty, rate, amount, period, WO, SIC confirm, payment) · `jms_submissions` (RIL JMS no. unique, site, plant, WO, period, status flow, invoice no.; link to `jms`) · `jms_submission_items` · `jms_files` (Excel + PDF) · `jms_status_log`.
**Attendance:** `attendance` (labourer, date, status, hours short, OT hours) · `uploads` (ACPL / eSSL / JMS book / DPR Excel: file, period, who, result) · `acpl_days`, `essl_days` (raw rows) · `attendance_flags` (DPR-only, gate-only, ACPL≠eSSL, punch-but-absent, unknown EP) .
**Stock & kit:** `paint_batches` (SAP, batch, qty, mfg, expiry, lifecycle PR / PO / RIL store / SGE store) · `paint_steps` (941 issue / 942 reco / 261 post: supervisor, paint, month, litres; RIL ref + RIL litres) — consumption is derived from DPR lines · `equipment` (tag TYPE-SITE-##, expiry, status) · `requests` (open → SIC approve → store fulfil → received).
**Money & audit:** `expenses` (direct / fixed, §8 fields, bill, edits log, void; Owner / SA / Finance) · `audit_log` (trigger-written, read-only).

## Release 1 — build order
Each step ends with it running on a Vercel preview and checked in the browser.

1. **Foundation** — Supabase project, schema + RLS migrations (files in `supabase/migrations/`), Supabase Auth, replace the browser-only store with Supabase reads/writes, keep the current screens working. Device approval.
2. **Master Data** — sites/plants, gate-code map, trades with wage ranges, contractors, service items, work orders (m² + ₹, 80 %/95 % warnings), labourers with Aadhaar/EP/mobile rules and EP history. Labourer import from Excel.
3. **DPR + jobs** — plan upload/entry per month with carry-forward; job start/close (all four stages, SIC confirms); DPR with measurements, crew, paint litres, DFT; double entry by Admin with difference report; SIC approve/reject; lock + Owner/SA unlock; deadline next day 10:00; Excel DPR upload to cross-check.
4. **Plan vs actual + remaining** — per plan line: plan, actual (JMS), in progress by stage, remaining; −2 %/+5 % band flags; WO balance.
5. **JMS** — upload JMS pack (Excel figures + PDF), JMS detail-book upload with status updates by JMS no., checks from §14.
6. **Attendance** — ACPL and eSSL uploads (§13, §16), matching by EP then name, flags for Admin with SIC override, pay days ACPL-style, OT after 18:00 (min 1 h, half-hour steps) once a time source exists.
7. **Paint stock** — monthly issue to supervisors, DPR deduction (negative allowed + flagged), low stock vs remaining scope, expiry 60-day warning, dashboard pie chart, FIM reco upload.
8. **Languages + polish** — Gujarati/Hindi labels, Owner/SA All-sites dashboard on live data.

## Deploy checklist
- [ ] **You:** confirm creating the new Supabase project (free tier; a paid plan only if needed later — I'll show the cost before creating).
- [ ] **You:** Vercel can't see `uditya-soccerji`'s repos from the Shree Gayatri Ent team (earlier 403). Either import the repo once at vercel.com/new under that team, or add `uditya-soccerji`'s GitHub to the team's Git connection.
- [ ] **You:** GitHub sign-in on this PC the first time I push (git opens a window).
- [ ] Me: commit current work on a `release-1` branch, open a draft PR; `main` stays as the demo until Release 1 is ready.
- [ ] Me: Vercel env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (service-role key only in server functions, never in the browser bundle).
- [ ] Me: every schema/policy change as a migration file in the repo, applied only after you confirm.
- [ ] Me: seed real masters from your files (sites, plants, service items, WO, labourers) once shared.

## Files still needed from you
ARC/WO rate list · gate code → plant list · labourer master list · an eSSL report **with punch times** (for OT).
