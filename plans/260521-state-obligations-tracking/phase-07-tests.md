---
phase: 7
title: "Tests"
status: completed
priority: P2
effort: "3h"
dependencies: [2]
completed: 2026-05-21
---

# Phase 7: Tests

## Overview
Unit test `state-obligation-service.ts` — trọng tâm: công thức số dư, cắt kỳ Tháng/Quý/Năm, đồng bộ JournalEntry (rủi ro chính).

## Requirements
- Functional: test balance formula, period boundaries, JournalEntry sync trên DB thật.
- Non-functional: vitest 4.1.5, DB thật (KHÔNG mock — file e2e setup từ chối DATABASE_URL không phải `*_test`), dọn dữ liệu sau mỗi test.

## Architecture
Theo pattern `lib/ledger/__tests__/`. Test chạy trên DB test (`*_test` schema). Mỗi test tạo type + txns, assert, cleanup.

## Related Code Files
- Create: `lib/tai-chinh/__tests__/state-obligation-service.test.ts`
- Read for context: `lib/ledger/__tests__/` (pattern), `lib/task/__tests__/task-service.test.ts`.

## Implementation Steps
1. **Balance formula:** opening=100, +phai_tra 50, −da_nop 30 → còn phải nộp = 120. Đổi `asOf` cắt bớt txn.
2. **Period split:** txns rải nhiều tháng → `getObligationReport` từng kỳ; assert `opening + increase − decrease = closing` mọi kỳ; assert đầu kỳ N = cuối kỳ N−1.
3. **Quý/Năm:** txns 12 tháng → quý gộp 3 tháng, năm gộp 12; assert tổng.
4. **JournalEntry sync — create:** tạo `da_nop` → đúng 1 `JournalEntry` (`entryType="chi"`, `refModule="state_obligation"`, `refId=txn.id`, `amountVnd` khớp).
5. **JournalEntry sync — update:** sửa `amount` của `da_nop` → bút toán cập nhật theo; đổi `kind` da_nop→phai_tra → bút toán soft-deleted.
6. **JournalEntry sync — delete:** xóa `da_nop` → cả txn + bút toán soft-deleted.
7. **phai_tra không sinh bút toán:** tạo `phai_tra` → 0 `JournalEntry`.
8. **Bulk:** `bulkCreateObligationTxns` với 1 dòng lỗi → rollback toàn bộ (transaction).
9. **Soft-delete:** dòng `deletedAt != null` bị loại khỏi balance + report.
10. Chạy `vitest run lib/tai-chinh/__tests__/state-obligation-service.test.ts` → xanh.

## Success Criteria
- [ ] Tất cả test xanh.
- [ ] Phủ: balance formula, period split (Tháng/Quý/Năm), JournalEntry sync (create/update/delete/kind-change), bulk rollback, soft-delete.
- [ ] `npx tsc --noEmit` + lint + `vitest` toàn bộ xanh.

## Risk Assessment
- Test JournalEntry sync chia sẻ bảng `journal_entries` với module Nhật ký — cleanup phải lọc đúng `refModule="state_obligation"` để không xóa nhầm.
- Timezone ở period boundary test — dùng ngày cố định UTC, tránh `new Date()` local.
