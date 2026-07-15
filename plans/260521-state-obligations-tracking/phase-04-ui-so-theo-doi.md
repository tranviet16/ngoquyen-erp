---
phase: 4
title: "UI Sổ theo dõi phát sinh"
status: completed
priority: P2
effort: "3h"
dependencies: [2]
completed: 2026-05-21
---

# Phase 4: UI Sổ theo dõi phát sinh

## Overview
Trang `/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi` — lưới phát sinh: nghĩa vụ, ngày, loại (phải trả/đã nộp), số tiền, TK tiền, chứng từ. Hỗ trợ dán hàng loạt.

## Requirements
- Functional: xem / thêm / sửa / xóa dòng phát sinh; chọn nghĩa vụ qua FK dropdown; `kind` = phải trả|đã nộp; dán hàng loạt nhiều dòng; với `da_nop` chọn `cashAccountId`.
- Non-functional: DataGrid + ResourceSpec, dán hàng loạt qua `bulkCreateObligationTxns`, `dynamic = "force-dynamic"`.

## Architecture
Pattern giống Phase 3 + `journal-grid-client.tsx` (đã có dán hàng loạt). Page load song song: `listObligationTxns()`, `listObligationTypes()` (FK options), `listCashAccounts()` (TK tiền options).

Cột lưới: `typeId` (select FK → tên nghĩa vụ), `date` (date), `kind` (select: Phải trả|Đã nộp), `amount` (number, `formatVND`), `cashAccountId` (select, chỉ bật khi kind=da_nop), `refNo` (text), `description` (text), `note` (text).

## Related Code Files
- Create: `app/(app)/tai-chinh/nghia-vu-nha-nuoc/so-theo-doi/page.tsx`
- Create: `components/tai-chinh/obligation-txn-grid-client.tsx`
- Create: `lib/tai-chinh/state-obligations/txn-table-spec.ts`
- Read for context: `app/(app)/tai-chinh/nhat-ky/page.tsx`, `components/tai-chinh/journal-grid-client.tsx` (có sẵn logic dán), `lib/tai-chinh/cash-account-service.ts`.

## Implementation Steps
1. Viết `txn-table-spec.ts` — cột + cell, FK select cho `typeId`/`cashAccountId`, validation (amount > 0, da_nop nên có cashAccountId).
2. Viết `obligation-txn-grid-client.tsx` — `"use client"`, `<DataGrid>`, wire create/update/delete + dán hàng loạt → `bulkCreateObligationTxns`.
3. Viết `page.tsx` — load 3 nguồn song song (`Promise.all`), `serializeDecimals`.
4. Thêm ghi chú UI: "Khoản đã nộp sẽ tự sinh bút toán chi — không nhập lại ở Nhật ký giao dịch" (chống đếm trùng dòng tiền).
5. Kiểm tra trình duyệt: thêm `phai_tra`, thêm `da_nop` (verify bút toán xuất hiện ở Nhật ký), dán 5 dòng, sửa, xóa.
6. `npx tsc --noEmit` → exit 0.

## Success Criteria
- [x] Thêm/sửa/xóa dòng phát sinh hoạt động trên interface.
- [x] Dán hàng loạt nhiều dòng OK.
- [x] `da_nop` sinh bút toán chi (xác nhận ở trang Nhật ký).
- [x] Ghi chú chống đếm trùng hiển thị.

## Risk Assessment
- Dán hàng loạt với `da_nop` → nhiều bút toán sinh cùng lúc: `bulkCreateObligationTxns` phải bọc `$transaction`, rollback toàn bộ nếu 1 dòng lỗi.
- `cashAccountId` thiếu ở `da_nop`: validate ở service; UI nên cảnh báo nhưng không chặn cứng (bút toán vẫn tạo với fromAccount null — chấp nhận, sửa sau).
