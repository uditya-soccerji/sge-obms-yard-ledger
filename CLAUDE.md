# CLAUDE.md

**Read `AGENTS.md` first** — it is the shared guide for every AI tool on this repo (Cursor uses it too).
Business rules: `docs/rules-decisions.md`. Plan: `docs/build-plan.md`.

Claude Code specifics:
- Dev server: `.claude/launch.json` in the Operations Hub folder has a `yard-ledger` entry (port 43127); otherwise `npm run dev`.
- Verify UI changes in the browser before saying they're done.
- Confirm with the owner before anything hard to reverse (creating the Supabase project, deploying, pushing to `main`).
