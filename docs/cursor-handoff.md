# Working on this repo with Cursor and Claude Code

## Set up Cursor (once)
1. Install Cursor (cursor.com) and open the folder **`D:\sge-obms-yard-ledger`** (File → Open Folder).
2. In a Cursor terminal: `npm install`, then `npm run dev` → http://localhost:43127.
3. Cursor picks up `AGENTS.md` and `.cursor/rules/*.mdc` automatically. Check in Cursor Settings → Rules that the three project rules are listed.
4. Pick a strong model in Cursor's chat (Agent mode) for multi-file changes.

## Using both tools safely
- One tool edits at a time. Before switching: commit (`git add -A && git commit -m "…"`) or stash.
- Each feature on its own branch: `git checkout -b feature/accounting`.
- Push to GitHub (`uditya-soccerji/sge-obms-yard-ledger`) so either tool — or another PC — can continue.
- After a change in either tool: `npx tsc --noEmit -p .`, `npx eslint src`, click through the flow.
- When a rule changes, update `docs/rules-decisions.md` so the other tool knows.

## First prompt to paste into Cursor
> Read AGENTS.md, docs/rules-decisions.md and docs/build-plan.md. Then run the app, sign in as Super Admin and open /work. Summarise in 10 lines what the Work module does and list anything in the code that contradicts the docs. Don't change code yet.

## Ready-made task prompts (one at a time)
1. **Navigation option B** (if the owner picks it):
   > Restructure navigation into four fixed top tabs for every role — Dashboard, Work, People, Money — following AGENTS.md conventions. Move existing screens under them (Work = current /work tabs; People = attendance, labourers, HR; Money = finance, JMS value, paint stock). Role decides what's visible inside each tab. Keep the Vendor Desk livery. No business-logic changes.
2. **Approved vs received check** (docs §18):
   > Add payment receipts to JMS: amount received, date, reason for any difference (deduction, recovery, short-paid, rate change). Show per JMS the gap in ₹ and % and days from SIC confirm to payment, and a dashboard card with totals and the list of short-paid / unpaid JMS. Calculations as pure functions in src/lib/work/logic.ts.
3. **Accounting / P&L** (docs §18):
   > Build the Accounting view in Finance: expenses tagged direct (job/plant) or fixed (site, month); labour cost = DPR crew per job per day × daily wage; fixed costs shared by labour-days; income = JMS amount when payment is received. Show profit per m², per m³, per labour-day, per supervisor, per job, per site, per month. Owner, Super Admin and Finance only.
4. **Test helpers**:
   > Add a "View as" role switcher for Owner/Super Admin, and a Test scenarios menu (month end, short payment, expired paint, overdrawn paint) that loads prepared states, plus reset.

## What's still waiting on the owner
- Navigation option A / B / C.
- ARC/WO rate list, gate code → plant list, labourer master, eSSL report with punch times.
- Go-ahead for the Supabase project and Vercel access (see build-plan.md).
