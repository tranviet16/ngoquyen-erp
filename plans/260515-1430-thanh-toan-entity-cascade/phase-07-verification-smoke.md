# Phase 07 — Verification + manual smoke

---
status: completed
priority: P3
effort: 0.5h
actualEffort: 0.5h
blockedBy: [phase-01, phase-02, phase-03, phase-04, phase-05, phase-06]
---

## Context Links
- All prior phases P1..P6
- Test pattern: existing `prisma/seed-test-users.ts`

## Overview
- Priority: P3
- Status: completed
- Effort: 0.5h
- Blocked by: P1..P6

## Description
Cross-cutting verification: tsc, build, lint, end-to-end manual smoke covering create round → add item via cascade → approve → tong-hop → export.

## Requirements

**Compile-time**
- `pnpm prisma generate` clean
- `pnpm tsc --noEmit` zero errors
- `pnpm next build` succeeds (Turbopack)

**Runtime smoke (manual)**
1. Open `/thanh-toan/ke-hoach` → list renders.
2. Tạo đợt mới (tháng hiện tại).
3. Vào round detail → empty rows.
4. Click "Thêm dòng":
   - Chọn category=Vật tư.
   - Chọn Chủ thể (e.g. Entity X) — projects dropdown populates.
   - Chọn Công trình — suppliers dropdown populates (must show only suppliers with material ledger rows for Entity X + project).
   - Chọn NCC.
   - Nhập Số đề nghị.
   - Click Thêm.
5. Row appears with **congNo auto-filled correctly** (compare manually to `SELECT ... FROM ledger_transactions WHERE entityId=X AND partyId=NCC AND projectId=Y AND ledgerType='material'`).
6. Đổi Chủ thể row đó → projects + supplier reset; congNo unchanged (snapshot frozen) until "Cập nhật số dư".
7. Submit + approve.
8. Open `/thanh-toan/tong-hop?month=YYYY-MM`:
   - Table renders 4 categories × N entities.
   - Supplier row shows non-zero cells for the (cat, entity) we created.
9. Click Export Excel → file downloads, opens in Excel, merges correct, no warning dialog.
10. Cross-entity bleed test (validates P2 bug fix):
    - Create 2 ledger material rows: same supplier, same project, DIFFERENT entities, different totalTt.
    - Create payment item with entity A → congNo should match entity A's outstanding only (not sum of both).

**Regression**
- `/cong-no-vt` cascade still works (unaffected, but verify).
- Other payment workflows: refresh-balance button on row works; bulk approve works.

## Implementation Steps
1. `pnpm prisma generate && pnpm tsc --noEmit && pnpm next build`
2. Execute runtime smoke per Requirements.
3. Document any deviations in `reports/p07-smoke-{date}.md`.

## Todo List
- [x] tsc clean
- [x] build clean
- [x] Runtime smoke 1-9
- [x] Cross-entity bleed test (item 10)
- [x] Regression check cong-no-vt

## Success Criteria
- All compile checks PASS.
- All 10 smoke items PASS.
- No console errors during smoke.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Build fails on Turbopack-specific issue | Low | Med | AGENTS.md flagged Next 16.2.4 — read `node_modules/next/dist/docs/` if surfaces |
| Manual smoke skipped due to time pressure | Med | High | Item 10 (cross-entity bleed) is non-negotiable — that's the actual bug fix proof |

## Rollback (whole feature)
Reverse order: P7 → P6 → P5 → P4 → P3 → P2 → P1.
- P6: revert tong-hop files
- P5: revert round-detail + page.tsx
- P4: usually empty diff
- P3: delete cascade-suppliers route
- P2: revert payment-service.ts
- P1: `prisma migrate resolve --rolled-back {migration}` + manual ALTER restoring projectScope (data lost — already wiped)

## Next
- Update `docs/project-changelog.md` with the refactor entry.
- Update `docs/development-roadmap.md` if payment phase marked complete.
- Archive plan after merge.
