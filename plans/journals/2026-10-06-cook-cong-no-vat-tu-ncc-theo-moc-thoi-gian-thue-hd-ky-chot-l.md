---
title: "Cook: cong no vat tu NCC theo moc thoi gian, thue HD, ky chot linh hoat"
date: 2026-10-06
summary: "7 phases implemented via Opus/Sonnet/Haiku orchestration; unit 893, tsc, lint, build green; integration + date migration pending (Docker down)"
---

# Cook: cong no vat tu NCC theo moc thoi gian, thue HD, ky chot linh hoat

## What happened
- Implemented plan 261006-0307 in one session. Sonnet built phases 1-4 and 6 plus the review fixes, Opus built phase 5 (per-supplier advisory lock and flexible period bounds) and did the review, and Haiku wrote the docs.
- Environment: Docker/Postgres would not start, so no integration tests or migrations ran. `node_modules` was missing vitest and had a stale Prisma client; `npm ci` from package-lock fixed it (the pnpm Volta shim is broken).
- Post-implementation review found the same client-controllable `authorized` flag in the labor ledger actions. It also found that re-closing could rewrite a ledger event inside a signed period through an edited daily slip, plus inclusive end bounds, unordered supplier locks, and missing transaction timeouts. All are fixed.

## Decision
- Editing a closed slip soft-deletes its ledger event only when date, project, item, qty or price changes, so the period must be re-closed. Edits to note or staff fields leave the event alone.
- Signing order and backdated writes before a signed period are left for a product decision. The two delivery importers that bypass the lock go to the backlog.

## Next steps
- Start Docker, back up the DB, apply migration 20261006110000, run scripts/audit-ledger-dates.ts, run the integration suite, then the pilot runbook.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
