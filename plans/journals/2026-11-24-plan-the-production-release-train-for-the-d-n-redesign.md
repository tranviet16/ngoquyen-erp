---
title: Plan the production release train for the Dự án redesign
date: 2026-11-24
summary: "Production runs an 08/10 build, so the redesign ships with the công nợ vật tư go-live and DT-HĐ-TT release 1 in one release"
---

# Plan the production release train for the Dự án redesign

## What happened

The user asked to plan the production deploy of the Dự án redesign. The redesign cannot ship alone, because production is far behind `main`.

- **How production's version was found.** There is no shell access to admin-pc, so it was read over Tailscale HTTP.
  - `/api/health` is ok; the 20/11 uptime reset was only a restart.
  - The production stylesheet holds every Tailwind class introduced up to 08/10 (control ranges 3/3 and 214/226). It holds none of the classes from #9 (công nợ vật tư), #20 (DT-HĐ-TT release 1) or the redesign.
  - So production runs a build from about `df1e1e7`, and the công nợ vật tư go-live never ran there.
- **What the go-live needs that `main` lacks:**
  - the locked-period admin override, from open PR #13;
  - the step 12a script, which only exists uncommitted in the #18 worktree on VIETPC. It holds real amounts and tax codes, so it stays out of git.
- **PR #22's script no longer fits.** It insists on exactly one pending migration, but the release now carries four.

## Decisions

The user chose:
- one deploy at go-live step 7;
- every open PR in the release, #24 included;
- the DT-HĐ-TT data load in the same window.

Plan: `plans/261124-0448-production-release-train/` (5 phases):
1. assemble the release commit;
2. rehearse on a fresh production dump;
3. go-live window;
4. DT-HĐ-TT data;
5. verification and watch.

## Next steps

Phase 1: review and land the open PRs in dependency order, commit the 12a script, adjust PR #22, and record the release SHA.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
