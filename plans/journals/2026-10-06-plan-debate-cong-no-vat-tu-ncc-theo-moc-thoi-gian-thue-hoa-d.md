---
title: "Plan debate: cong no vat tu NCC theo moc thoi gian, thue hoa don, ky chot linh hoat"
date: 2026-10-06
summary: "Brainstorm -> 3 planner candidates -> synthesis -> 4-persona red-team -> validation; plan 261006-0307 ready to cook (7 phases, 37h)"
---

# Plan debate: cong no vat tu NCC theo moc thoi gian, thue hoa don, ky chot linh hoat

## What happened
- Brainstorm against 3 Excel samples (Be tong Hai Phong, Gach Nam Huong, May xuc Loc Tai) showed the July 2026 plan already covers daily slips, dated price quotes, period close and derived reconciliation. Real gaps: NCC x Chu the lifetime matrix (sheet "Cong No"), arbitrary time windows, fixed 27->26 period vs sample periods, invoice-tax line, quote diff/edit, supplier-scoped payment entry.
- User decisions: flexible period bounds; new `thue_hd` transaction type (TT only); Excel export of the matrix; ISO weeks; normalize ledger dates with DB backup; export open to `cong-no-vt` readers.
- Debate mode: 3 independent planners (minimal / invariants / user-workflow). Synthesis kept: shared SQL classification fragments, `queryWindowByParty` + wrapper, reuse of `components/ledger/debt-matrix.tsx`, aoa-built Excel template, reuse of `createMaterialTransaction` for the payment tab, pure `period-bounds` helper.
- Red-team (4 lenses, 37 raw findings -> 22 after dedupe, 19 accepted): ledger `date` is not uniformly UTC midnight (`lib/payment/payment-service.ts:591` writes `new Date()`, `lib/import/adapters/excel-utils.ts:15` writes local midnight) so last-day rows escape windows and the signed-period lock; exported server action `patchMaterialTransaction(id, patch, client, authorized)` lets a client skip the permission check (`lib/cong-no-vt/material-ledger-service.ts:67-75`); `assertPeriodOpen` is check-then-write outside transactions on every write path except close/sign/unsign; the "contiguous to last signed period" rule would block closing k+1 while k awaits signature; sign never checks all slips in the period were posted.

## Decision
- Added phase 1 "ledger date normalization": business-day Asia/Bangkok at UTC 00:00, fix write sources, data migration after backup, exclusive upper bound in all window queries.
- Phase 2 removes the `authorized` parameter, blocks manual edits of auto-generated rows, locks opening balances once a supplier has a signed period, keeps the labor module untouched.
- Phase 5 takes one advisory lock per supplier inside the transaction for every material write; contiguity is against the latest marker (signed or not); sign verifies slip completeness.
- Rejected: locking the Excel importer (admin history tool, backlog), forbidding admin `dieu_chinh` in signed periods (by design).

## Next steps
- `/ak:cook plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/plan.md` starting with phase 1; back up the DB before the date migration.
- Backlog: importer raw SQL bypasses period lock; entity column order in the matrix if leadership wants the sheet order.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
