---
phase: 6
title: "Báo giá, gợi ý đơn giá, tab Thanh toán"
status: completed
priority: P2
effort: "5h"
dependencies: [2]
---

# Phase 6: Báo giá (giá trước, chênh lệch, sửa), gợi ý đơn giá khi tạo phiếu, tab Thanh toán

## Goal

Cán bộ vật tư thấy giá trước và chênh lệch khi cập nhật báo giá, sửa được dòng, và được gợi ý đơn giá theo báo giá hiệu lực khi tạo phiếu ngày. Kế toán ghi chuyển khoản và thuế hoá đơn ngay trong không gian NCC qua đúng một cổng ghi sổ cái.

## Context

- `updatePriceQuote` đã có (`price-quote-service.ts:40`), UI chưa có nút sửa. `resolveQuotePrice` chọn mức mới nhất ≤ ngày, tie id lớn hơn.
- `delivery-form.tsx` chưa có trường `unitPrice`; form "Sửa đầy đủ" trong `delivery-grid.tsx` (defaultValues 170–181) thiếu `unitPrice`.
- Ghi sổ qua `createMaterialTransaction` / `patchMaterialTransaction(id, patch)` / `softDeleteMaterialTransaction` (guard `cong-no-vt`; phase 2 đã bỏ `authorized`, chặn dòng tự sinh, ràng buộc `thue_hd` cần `invoiceNo`, `amountHd` mặc định 0).
- Layout NCC (`[supplierId]/layout.tsx`) chưa có `userId`; gate tab phải kiểm cả rollout module (`lib/acl/released-module-request` hoặc helper tương đương) chứ không chỉ `canAccessEntitlement`.
- "Nợ hiện tại" dùng `supplierBalanceAsOf` (export ở phase 2), không gọi `getMaterialCurrentBalance` theo từng công trình.

## Files to Create / Modify (sở hữu riêng của phase 6)

- Modify `lib/vat-tu-ncc/quote-resolver.ts`: `annotateQuoteHistory(quotes)` (sắp `(itemId, effectiveFrom, id)`, gắn `prevPrice`, `diff`, `trend: "moi" | "tang" | "giam" | "giu_nguyen"`); test mở rộng `lib/vat-tu-ncc/__tests__/quote-resolver.test.ts`.
- Modify `lib/vat-tu-ncc/price-quote-service.ts`: `createPriceQuote`/`updatePriceQuote` revalidate thêm `/vat-tu-ncc/{id}/ngay`.
- Modify `app/(app)/vat-tu-ncc/[supplierId]/bao-gia/bao-gia-client.tsx`: cột Vật tư, Hiệu lực từ, Giá trước, Đơn giá, Chênh lệch (±, màu), Nhận xét (badge), Ghi chú, Thao tác (Sửa/Xoá), sortable; Sửa đổ dòng vào form (`editingId`, Lưu/Huỷ) gọi `updatePriceQuote`; chọn vật tư hiện "Giá hiện hành: X từ dd/mm".
- Modify `app/(app)/vat-tu-ncc/[supplierId]/ngay/page.tsx`: nạp `listPriceQuotes(id)`, truyền `quotes` xuống `DeliveryGrid` → `DeliveryForm`.
- Modify `components/vat-tu-ncc/delivery-form.tsx`: trường "Đơn giá" (tuỳ chọn); prop `mode: "create" | "edit"`; chỉ ở `create`, khi `itemId`/`date` đổi và field chưa dirty thì điền `resolveQuotePrice(quotes, itemId, date)`; hint "Gợi ý: 1.850 (báo giá từ 24/04)" + nút "Dùng" khi đã dirty hoặc ở `edit`; không fallback giá phiếu cũ.
- Modify `components/vat-tu-ncc/delivery-grid.tsx`: truyền `quotes`, `mode`; thêm `unitPrice` vào `defaultValues` form sửa.
- Modify `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`: lấy `userId` qua `requireModuleAccess("vat-tu-ncc", {minLevel: "read", scope: "module"})`; tab `{ href: "/thanh-toan", label: "Thanh toán" }` hiện khi module `cong-no-vt` đã released và người dùng có `cong-no-vt` read (dùng cùng helper mà `requireReleasedModuleRequest` dựa vào, không ném lỗi).
- Create `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx` (server: `requireModuleAccess("cong-no-vt", read)`; quyền create/edit `cong-no-vt`; `listMaterialTransactions({partyId, transactionTypes: ["thanh_toan","thue_hd"], pageSize: 500})`; Chủ thể, công trình NCC từng giao; **một** truy vấn kỳ đã ký của NCC rồi tính cờ `locked` trong bộ nhớ; `fromRound` = `paymentRoundItemId != null`; "Nợ hiện tại" = `supplierBalanceAsOf(supplierId, today)`) và `thanh-toan-client.tsx` (thẻ Nợ hiện tại; form: Loại Chuyển khoản/Thuế HĐ, Ngày ghi sổ, Chủ thể, Công trình tuỳ chọn, Số tiền TT, Số tiền HĐ mặc định 0, Số HĐ + Ngày HĐ hiện và bắt buộc với Thuế HĐ, Nội dung tự sinh "Thuế HĐ: {số} ngày {dd/mm/yyyy}" hoặc "CK ngày {dd/mm/yyyy}"; bảng sortable Ngày, Loại, Chủ thể, Công trình, TT, HĐ, Số HĐ, Ngày HĐ, Nội dung, Nguồn, khoá; Sửa/Xoá chỉ cho dòng nhập tay chưa khoá; dùng `transactionSchema` của `lib/cong-no-vt/schemas.ts` phía client qua zodResolver, không schema riêng).
- Create `test/integration/vat-tu-ncc-thanh-toan.integration.test.ts`.

Không chung file với phase 3, 4, 5.

## Tasks & Steps

1. `annotateQuoteHistory` + test: Nam Hương 1.900 (26/3) → 1.850 (24/4): "moi" rồi "giam" −50; Lộc Tài "Ca" 2.600.000 → 3.300.000 ("tang" +700.000) → 3.000.000 ("giam" −300.000); cùng giá "giu_nguyen"; vật tư khác độc lập; cùng `effectiveFrom` thì id lớn hơn là mức sau.
2. Bảng báo giá mới + sửa dòng; revalidate.
3. Gợi ý giá ở form tạo phiếu; fix `defaultValues` form sửa; test component nếu repo có pattern test UI (nếu không, kiểm tay).
4. Layout gate tab; page + client tab Thanh toán.
5. Integration `vat-tu-ncc-thanh-toan` (fixture Nam Hương kỳ 28/4→26/5, mock guard như pilot): `createMaterialTransaction` `thanh_toan` 100.000.000 ngày 20/5 → `computeReconciliation(28/4→26/5).totalPaid` 100.000.000, closing 255.005.120; `thue_hd` 11.448.000 ngày 26/5 với `invoiceNo` → closing 266.453.120, `taxRows[0].invoiceNo` đúng; `thue_hd` thiếu `invoiceNo` bị từ chối; sau ký, tạo/sửa/xoá trong kỳ bị từ chối; sửa dòng có `paymentRoundItemId` bị từ chối; `listMaterialTransactions({transactionTypes})` chỉ trả 2 loại; `supplierBalanceAsOf` = 266.453.120.

## Todo

- [x] `annotateQuoteHistory` + unit test
- [x] Bảng báo giá: giá trước, chênh, nhãn, sửa dòng
- [x] Gợi ý đơn giá khi tạo phiếu; fix form sửa
- [x] Gate tab trong layout; page + client Thanh toán
- [x] Integration thanh toán / thuế HĐ

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
pnpm build
```

Thủ công: thêm báo giá mới cho vật tư có mức cũ thấy nhãn; tạo phiếu ngày thấy đơn giá tự điền, sửa phiếu không bị ghi đè; ghi thuế HĐ ở tab Thanh toán rồi mở đối chiếu thấy khối "D. Thuế hoá đơn"; tài khoản chỉ có `vat-tu-ncc` không thấy tab.

## Risks

- Kế toán chưa được cấp `cong-no-vt` → không thấy tab. Giảm thiểu: docs hướng dẫn admin cấp quyền.
- Gợi ý giá dùng quotes tải sẵn, không thấy mức vừa thêm ở tab khác. Giảm thiểu: revalidate `/ngay` khi đổi báo giá; chốt kỳ vẫn áp giá lại từ server.
