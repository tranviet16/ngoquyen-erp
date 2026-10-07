---
phase: 5
title: "Biên kỳ chốt linh hoạt và khoá theo NCC"
status: completed
priority: P1
effort: "7h"
dependencies: [2]
---

# Phase 5: Biên kỳ chốt linh hoạt và khoá theo NCC cho mọi đường ghi

## Goal

Kế toán chốt kỳ và tạo kỳ đối chiếu với `[from, to]` tuỳ chọn, mặc định 27→26, kỳ đầu từ phiếu sớm nhất chưa chốt sau mốc số dư ban đầu; kỳ liền kề marker gần nhất; kỳ đã ký bất biến; ký kiểm tra đủ phiếu; mọi ghi liên quan một NCC được tuần tự hoá bằng một khoá advisory trong transaction.

## Context

- `periodRange` cố định 27→26; `previewPeriodClose(supplierId, year, month)` (`period-close-service.ts:104`), `commitPeriodClose(supplierId, year, month, prices)` (175); `createReconciliation` (`reconciliation-service.ts:22`) chỉ chặn trùng khít.
- Khoá advisory `vat-tu-close:{supplierId}:{from}` ở 3 chỗ (`period-close-service.ts:191`, `reconciliation-derive-service.ts:309, 349`); mọi đường ghi khác (`delivery-service.ts` create/update/softDelete, `LedgerService.create/update/softDelete`, `payment-ledger-sync.ts`, số dư ban đầu) gọi `assertPeriodOpen` ngoài transaction và ngoài khoá → ký đua với ghi.
- `signReconciliation` không kiểm tra phiếu trong kỳ chưa có event.
- Phiếu lịch sử import không có event (`gach-nam-huong.adapter.ts:223`, `quang-minh.adapter.ts:221`) đã nằm trong số dư ban đầu.
- Mẫu Excel: Nam Hương 01/4→27/4, 28/4→26/5, "26/5→26/6" (chồng 1 ngày, chuẩn hoá thành 27/5); Bê tông HP 29/3→26/4; Lộc Tài 01/5→26/5.
- Caller chữ ký cũ: `chot-ky-client.tsx` và `test/integration/vat-tu-ncc-pilot.integration.test.ts` (grep `previewPeriodClose|commitPeriodClose` để lấy đủ call site; không ghi số cứng).

## Quy tắc biên kỳ (`validatePeriodBounds`)

1. `from ≤ to`.
2. Không chồng lấn kỳ đã ký.
3. Liền kề: nếu NCC có marker (ký hoặc chưa ký, trừ `selfId`), `from` = `max(periodTo của mọi marker) + 1 ngày`, **hoặc** `[from, to]` trùng khít một marker chưa ký (chốt lại idempotent). Kỳ chưa ký vẫn chốt lại được; kỳ k+1 chốt được khi k chưa ký.
4. `from` ≥ `max(asOfDate số dư ban đầu của NCC) + 1 ngày` (phiếu trước mốc này thuộc số dư ban đầu).

`suggestNextPeriod({latestMarkerTo, openingAsOf, earliestOpenDeliveryDate})`: `from` = max(ngày sau marker gần nhất, ngày sau `openingAsOf`, phiếu sớm nhất chưa có event sau hai mốc đó); `to` = ngày 26 đầu tiên ≥ `from`.

Ký (`signReconciliation`): trong transaction và dưới khoá NCC, kiểm lại `validatePeriodBounds`, và từ chối nếu tồn tại phiếu `supplier_delivery_daily` trong `[from, to]` chưa có `ledger_transactions.deliveryId` (kể cả phiếu thiếu công trình).

## Khoá theo NCC

- `lib/vat-tu-ncc/period-lock.ts` thêm `withSupplierLock(supplierId, tx, fn)` lấy `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || supplierId))` và `assertPeriodOpen(supplierId, date, tx)` chạy **trong cùng transaction** sau khi có khoá.
- Áp cho: `commitPeriodClose`, `signReconciliation`, `unsignReconciliation`, `createReconciliation`/`updateReconciliation`, `delivery-service` create/update/softDelete, `LedgerService.create/update/softDelete` khi `ledgerType = "material"` (bọc `prisma.$transaction` nếu caller chưa truyền client), `setOpeningBalance`/`deleteOpeningBalance` material, `syncClosedRoundToLedger` (đã trong transaction đóng đợt: lấy khoá theo từng `supplierId` trước khi ghi).

## Files to Create / Modify (sở hữu riêng của phase 5)

- Create `lib/vat-tu-ncc/period-bounds.ts` (thuần), `lib/vat-tu-ncc/__tests__/period-bounds.test.ts`, `test/integration/vat-tu-ncc-chot-ky-linh-hoat.integration.test.ts`.
- Modify `lib/vat-tu-ncc/period-lock.ts` (khoá + assert trong tx), `lib/vat-tu-ncc/period-close-service.ts` (chữ ký `{from, to}`; `previewPeriodClose(supplierId, range?)` trả `suggestedRange`, `latestMarker`, `boundsError`; commit kiểm biên + lock), `lib/vat-tu-ncc/reconciliation-service.ts`, `lib/vat-tu-ncc/reconciliation-derive-service.ts` (sign/unsign: khoá NCC, kiểm biên, kiểm đủ phiếu), `lib/vat-tu-ncc/delivery-service.ts`, `lib/ledger/ledger-service.ts` (bọc khoá cho material; phase 2 đã sửa file này xong trước), `lib/payment/payment-ledger-sync.ts` (phase 1 đã sửa xong trước), `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/chot-ky-client.tsx` + `chot-ky/page.tsx`, `components/vat-tu-ncc/reconciliation-form.tsx`, `test/integration/vat-tu-ncc-pilot.integration.test.ts` (mọi call site), `test/integration/payment-service.integration.test.ts` (nếu kỳ vọng khoá đổi).

Không chung file với phase 3, 4, 6 (phase 6 không chạm `period-close-service.ts`, `ledger-service.ts`, `period-lock.ts`).

## Tasks & Steps

1. `period-bounds.ts` + unit test: kỳ đầu 01/4→27/4 (opening asOf 31/3) hợp lệ; opening asOf 27/4 thì `from` tối thiểu 28/4; sau marker 01/4→27/4 chưa ký, kỳ 28/4→26/5 hợp lệ và 01/4→27/4 chốt lại hợp lệ; sau ký 28/4→26/5, kỳ 26/5→26/6 lỗi chồng lấn (nhãn Excel), 28/5→26/6 lỗi "phải bắt đầu 27/05/2026"; `from > to` lỗi; chồng lệch marker chưa ký lỗi; `nextDay26(28/4)` = 26/5, `nextDay26(27/5)` = 26/6; `suggestNextPeriod` với phiếu sớm nhất 29/3 và opening asOf 28/3 → 29/3→26/4.
2. `withSupplierLock` + `assertPeriodOpen` trong tx; áp cho mọi đường ghi liệt kê; chạy integration hiện có.
3. Chữ ký mới `preview/commit`; gợi ý kỳ trong preview; kiểm biên trong tx.
4. `createReconciliation`/`updateReconciliation`/`sign`/`unsign` dùng helper; ký kiểm đủ phiếu.
5. UI: hai `DateInput` điền sẵn từ `suggestedRange`; dòng "Marker gần nhất: dd/mm – dd/mm (đã ký/chưa ký)"; nút "Kỳ 27→26 tiếp theo"; khoá nút khi `boundsError`; form kỳ đối chiếu hiện lỗi.
6. Cập nhật pilot test (chữ ký mới) và integration `chot-ky-linh-hoat` (fixture Nam Hương: ob 189.805.120 asOf 31/3; 8 phiếu × 8.000 trong 01/4–27/4, 6 @1.900 + 2 @1.850): chốt 01/4→27/4 → closedCount 8, totalAmountTt 120.800.000, closing 310.605.120; **chưa ký** vẫn chốt được 28/4→26/5 với 3 phiếu @1.850 + `thanh_toan` 100.000.000 → closing 255.005.120; ký kỳ 1 rồi kỳ 2; chốt 26/5→26/6 bị từ chối; `createReconciliation` 26/5→26/6 bị từ chối; chốt 27/5→26/6 (05/6 @1.850, 2 × 25/6 5.400 @1.450) → closing 285.465.120; ký kỳ 27/5→26/6 khi còn một phiếu 20/6 chưa chốt → bị từ chối, chốt lại rồi ký được; hai `commitPeriodClose` song song biên khác nhau (`Promise.allSettled`) chỉ một thành công; `createMaterialTransaction` `thue_hd` ngày 10/5 chạy song song với `signReconciliation` kỳ 28/4→26/5 → hoặc ghi xong trước và nằm trong snapshot, hoặc bị từ chối sau khi ký (không có trạng thái thứ ba).

## Todo

- [x] `period-bounds.ts` + unit test
- [x] `withSupplierLock`, assert trong tx, áp mọi đường ghi
- [x] Chữ ký mới, gợi ý kỳ trong preview, kiểm biên
- [x] Kỳ đối chiếu thủ công, ký/gỡ ký dùng helper, ký kiểm đủ phiếu
- [x] UI chốt kỳ + form
- [x] Pilot test cập nhật + integration kỳ linh hoạt và đua (đã viết, chưa chạy — DB test không khả dụng)

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
```

## Risks

- Khoá theo NCC làm ghi tuần tự, chậm hơn một chút khi nhiều người cùng thao tác một NCC. Giảm thiểu: `xact_lock`, giao dịch ngắn.
- Bọc transaction trong `LedgerService` thay đổi hành vi caller đang truyền client riêng. Giảm thiểu: chỉ bọc khi client là `prisma` gốc; grep caller.
- Dữ liệu lịch sử nhãn chồng 1 ngày. Giảm thiểu: thông báo nêu ngày đúng; docs.
