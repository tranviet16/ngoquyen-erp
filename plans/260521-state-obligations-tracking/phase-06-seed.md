---
phase: 6
title: "Seed dữ liệu"
status: completed
priority: P3
effort: "1h"
dependencies: [1]
completed: 2026-05-21
---

# Phase 6: Seed dữ liệu

## Overview
Seed 8 nghĩa vụ chuẩn VN vào `StateObligationType`. Idempotent — chạy lại không tạo trùng.

## Requirements
- Functional: 8 mục Thuế + Bảo hiểm với mã TK kế toán.
- Non-functional: idempotent (`upsert` theo `name` unique); `openingBalance=0`, `openingDate` = ngày seed (user chỉnh sau ở UI danh mục).

## Architecture
Theo pattern `prisma/seed-master.ts`. Thêm hàm `seedStateObligations()` — gọi từ `prisma/seed.ts` hoặc chạy độc lập.

Danh sách seed:
| name | code | category | sortOrder |
|------|------|----------|-----------|
| Thuế GTGT | 3331 | thue | 1 |
| Thuế TNDN | 3334 | thue | 2 |
| Thuế TNCN | 3335 | thue | 3 |
| Thuế Môn bài | 3338 | thue | 4 |
| BHXH | 3383 | bao_hiem | 5 |
| BHYT | 3384 | bao_hiem | 6 |
| BHTN | 3386 | bao_hiem | 7 |
| KPCĐ | 3382 | bao_hiem | 8 |

## Related Code Files
- Create: `prisma/seed-state-obligations.ts` (hoặc thêm hàm vào `seed-master.ts` nếu phù hợp).
- Modify: `prisma/seed.ts` — gọi `seedStateObligations()` nếu seed.ts là entrypoint tổng.
- Read for context: `prisma/seed-master.ts`, `prisma/seed.ts`.

## Implementation Steps
1. Viết mảng 8 mục như bảng trên.
2. `prisma.stateObligationType.upsert({ where: { name }, create: {...}, update: { code, category, sortOrder } })` cho từng mục — `update` không đụng `openingBalance`/`openingDate` (giữ giá trị user đã chỉnh).
3. Wire vào `seed.ts`.
4. Chạy seed, verify 8 dòng; chạy lại verify vẫn 8 dòng.

## Success Criteria
- [x] 8 nghĩa vụ chuẩn VN tồn tại sau seed.
- [x] Chạy seed lần 2 không tạo trùng, không reset `openingBalance`.

## Risk Assessment
- `update` clause không được ghi đè `openingBalance`/`openingDate` — nếu vô tình đưa vào sẽ xóa số liệu user nhập.
