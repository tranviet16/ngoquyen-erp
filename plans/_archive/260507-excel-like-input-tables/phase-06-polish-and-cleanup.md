---
phase: 6
title: "Polish and Cleanup"
status: pending
priority: P3
effort: "1d"
dependencies: [2, 3, 4, 5]
---

# Phase 6: Polish and Cleanup

## Overview

Phân quyền cell-level theo role, xóa dep AG Grid, dynamic import per-page, E2E test paste range thật, update docs.

## Requirements

**Functional:**
- Cell readonly theo role: admin full, kế toán per-column theo permission matrix hiện có
- Bundle landing không bị Glide ảnh hưởng (verify)

**Non-functional:**
- Xóa hoàn toàn `ag-grid-react`, `ag-grid-community` khỏi `package.json`
- Update `docs/codebase-summary.md` ghi nhận `<DataGrid>` pattern
- Update `docs/code-standards.md` thêm rule "bảng nhập liệu dùng `<DataGrid>`, bảng báo cáo dùng HTML table"

## Architecture

Không đổi kiến trúc, chỉ tinh chỉnh.

## Related Code Files

**Modify:**
- `package.json` — xóa `ag-grid-react`, `ag-grid-community`
- `app/(app)/cong-no-vt/nhap-lieu/page.tsx` + 3 page khác — verify `dynamic(() => import(...), { ssr: false })`
- `docs/codebase-summary.md`
- `docs/code-standards.md`

**Verify deleted (từ Phase 2-5):**
- `components/ledger/transaction-grid.tsx`
- `components/ledger/opening-balance-client.tsx`
- AG Grid imports trong `journal-grid-client.tsx`

**Create:**
- `components/data-grid/__tests__/data-grid.test.tsx` — smoke test edit/paste/add/delete
- `e2e/data-grid-paste-range.spec.ts` (Playwright nếu có) — paste range từ clipboard simulation

## Implementation Steps

1. **Permission cell-level:**
   - Đọc role matrix hiện tại (likely `lib/auth/...`)
   - Trong mỗi page, truyền `role` xuống `<DataGrid>`
   - Trong column def: `readonly: (row, role) => role === "ke-toan" && col === "amountVnd"` (ví dụ)
   - Server action **luôn** check role lần nữa (defense-in-depth)
2. **Dynamic import audit:**
   - Grep `import.*data-grid` — verify mọi page đều dùng `dynamic(..., { ssr: false })`
   - `next build` → kiểm `.next/analyze` (nếu có bundle analyzer) cho size landing page
3. **Xóa AG Grid:**
   - `npm uninstall ag-grid-react ag-grid-community`
   - Grep "ag-grid" toàn project, fail nếu còn match
4. **Test:**
   - Smoke test `<DataGrid>` (Vitest hoặc Jest tùy setup project)
   - E2E nếu Playwright có sẵn: scenario paste 10×3 từ clipboard
5. **Docs:**
   - `docs/codebase-summary.md`: thêm section "Data Grid Pattern" link tới `components/data-grid/`
   - `docs/code-standards.md`: rule mới
6. **Final verification:**
   - Run all tests
   - `next build` pass
   - Manual smoke trên dev: 1 thao tác mỗi grid

## Success Criteria

- [ ] `npm ls ag-grid-react` → not found
- [ ] `grep -r "ag-grid" app components lib` → 0 matches
- [ ] Bundle landing không tăng vs baseline trước Phase 1
- [ ] Tests pass: smoke test cho `<DataGrid>`
- [ ] Permission test: kế toán không edit được cell admin-only
- [ ] Docs updated, link đầy đủ
- [ ] Manual smoke OK trên cả 5 module (cong-no-vt/nc nhap-lieu + so-du, sl-dt 4 page, tai-chinh nhat-ky)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Xóa AG Grid sớm khi Phase 5 chưa merge | Chỉ start Phase 6 khi 2-5 đều done (dependency enforced) |
| Permission matrix không nhất quán giữa client UI và server action | Server action là source of truth; client UI mismatch → toast "không có quyền" rõ ràng |
| Bundle analyzer không cài | Cài `@next/bundle-analyzer` tạm, đo, gỡ ngay |
| Test setup chưa có Vitest/Jest | Skip unit test, dùng manual smoke + e2e nếu có Playwright |

## Dependencies

Blocked by Phase 2, 3, 4, 5.
