# Obligation Period Matrix Planning Session

**Date**: 2026-05-27 (planning via `/ck:plan --fast`)
**Severity**: Medium
**Component**: Tài chính, State Obligations UX
**Status**: Plan complete, ready for `/ck:cook`

## What Happened

Ran `/ck:plan --fast` to design period-matrix UX layer for the State Obligations module (delivered 2026-05-21). Module already handles `phai_tra` (obligation) and `da_nop` (paid) entry via flat `/so-theo-doi` grid — this plan fills the UX gap. 3-phase output at `plans/260521-obligation-period-matrix/`:

1. **Service** (P1, 2h): `getObligationMatrix(period)` + `saveObligationMatrix(period, rows)` in `lib/tai-chinh/state-obligation-matrix.ts`
2. **UI** (P1, 2h): Matrix client component + restructure `/so-theo-doi` into 2 tabs (Nhập theo kỳ default, Sổ chi tiết existing grid)
3. **Tests** (P2, 1h): Unit tests for matrix service

## The Brutal Truth

This planning session almost designed a fill for a gap that doesn't exist. Initial brainstorm framed the problem as "how to track accruals in-period," but the shipped code ALREADY supports this via the flat grid. We caught the misframing only because we re-read the just-shipped code before answering. That's a discipline win, but it shouldn't be an afterthought.

The real UX problem is friction, not capability: accountants think in periods (tháng 5/2026, each obligation = X amount). The flat grid forces 8 obligations × 12 months = 96 row-by-row entry actions per year. Matrix collapses that to one cohesive view.

## Technical Details

### Design Decisions

**1. Canonical transaction pattern — 1 txn per `(typeId × period × kind)`**
- Date = ngày cuối kỳ (last day of period)
- Maps every matrix cell to exactly 1 row
- Reuses 100% of `bulkUpsertObligationTxns` + `*WithSync` helpers
- Zero new JE sync logic, zero schema migration needed
- KISS win: existing patterns scale.

**2. Multi-row guard: ≥2 txns same key → read-only + hint**
- Prevents silent data corruption: if sổ chi tiết has 2 `phai_tra` rows in same kỳ, matrix can't collapse them (would lose refNo, description)
- Cell shows sum but disabled, hint sends user to Sổ chi tiết tab
- Explicit, non-destructive.

**3. Tab restructure: Nhập theo kỳ + Sổ chi tiết**
- Default tab = matrix (accountants' mental model)
- Secondary tab = existing flat grid (power users, exceptions, audits)
- Navigation: matrix hint points to sổ chi tiết for multi-row cases

### Surprises

**Surprise 1: Misframed the gap.** Spent 10 minutes designing for accrual tracking before realizing it already works. The gap is UX friction, not missing functionality. Lesson: always verify the gap exists by reading recent shipped code first. Saves iterations down the line.

**Surprise 2: Canonical txn pattern eliminated 2 problems.** Thought we'd need new JE sync logic and schema migration. Using `(typeId × period × kind)` as canonical key reuses existing bulk-upsert and sync helpers entirely. No new code paths, no migration risk.

**Surprise 3: Stale standalone build bit us earlier today.** User ran `node .next/standalone/server.js` after code changes and didn't see the new module. Standalone is a frozen snapshot, NOT dev hot-reload. Needs explicit `npm run build` + restart. **Permanent note**: any time code doesn't appear in running server, check if `npm start` (standalone) is active instead of `npm run dev`. Will bite again.

## Lessons Learned

1. **Re-read just-shipped code before designing the fill.** Gap analysis is only valid if you've verified the gap exists in current code. Saved us from over-designing.

2. **Canonical keys matter more than you think.** When one entity (txn) drives multiple surfaces (matrix + grid + report), pick one key pattern and stick it. `(typeId × period × kind)` eliminated schema changes and new sync logic.

3. **Standalone builds cache old code.** `npm start` = standalone (production-like). `npm run dev` = hot-reload. Switching between them without explicit rebuild masks code changes. Document this in dev setup docs.

## Next Steps

1. **Execute plan**: `/ck:cook plans/260521-obligation-period-matrix/plan.md --auto`
2. **Post-delivery**: Verify matrix handles multi-row cases gracefully (cell disabled + hint)
3. **Future**: Add e2e test for matrix ↔ sổ chi tiết consistency (same lesson as state-obligations JE sync)

**Owns**: Implementation (cook), Testing (tester), Docs (none required)
**Timeline**: Start cook immediately
