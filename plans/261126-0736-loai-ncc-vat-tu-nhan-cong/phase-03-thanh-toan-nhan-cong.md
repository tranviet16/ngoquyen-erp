---
title: "Phase 3: Thanh toán dòng nhân công"
status: todo
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 3: Thanh toán dòng nhân công

## Overview

Đề nghị thanh toán dòng loại `nhan_cong` gợi ý NCC loại nhân công, tự điền công nợ từ sổ vật tư (nơi công nợ NCC nằm theo quyết định "giữ sổ"), và khi đóng đợt thì ghi trừ công nợ vào sổ vật tư như dòng `vat_tu`. Đồng thời sửa lỗi tự điền đang tra sổ `labor` bằng id NCC.

## Hiện trạng (đã kiểm tra 26/11)

- **Lỗi tự điền:** `lib/payment/payment-service.ts:29-32` map `nhan_cong → "labor"`, rồi `:238-246` gọi `getOutstandingDebt` / `getCumulativePaid` với `partyId: supplierId`. Sổ `labor` đánh số theo id tổ đội (`Contractor`), nên NCC #n đọc công nợ của tổ đội #n.
- **Gợi ý NCC:** client `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:99-103` map `nhan_cong → "labor"`; API `app/api/thanh-toan/cascade-suppliers/route.ts:84-88` trả rỗng cho `labor`. Dòng nhân công hiện chỉ chọn được NCC khi bật "bỏ qua lọc".
- **Đóng đợt:** `lib/payment/payment-ledger-sync.ts:29` chỉ lấy dòng `category: "vat_tu"`; dòng `nhan_cong` không ghi sổ, nên trả tiền xong công nợ không giảm.
- **Quy tắc công trình:** dòng `vat_tu` bắt buộc công trình và Chủ thể theo công trình ở server (`payment-service.ts:193-217`, `:301-303`, `:527`) và client. Client có hai component (dòng đang sửa và dòng thêm mới) với 16 chỗ so `"vat_tu"` về công trình / Chủ thể: `round-detail-client.tsx:100`, `:435`, `:496`, `:513`, `:593`, `:598`, `:693-694`, `:711`, `:983`, `:997`, `:1022`, `:1085-1088`, `:1099`. Hai `<option value="vat_tu">` (`:677`, `:1073`) chỉ là nhãn, giữ nguyên.
- Bản dev: `payment_round_items` 0 dòng; module `thanh-toan.*` ở trạng thái `development`.

## Quyết định đã chốt (validate 26/11)

<!-- Updated: Validation Session 1 - hai quyết định thanh toán được người dùng chốt -->
- **Đóng đợt ghi sổ cho dòng nhân công:** có. Dòng nhân công cũng bắt buộc công trình, Chủ thể theo công trình, và chịu khóa kỳ như dòng vật tư.
- **Lọc NCC theo loại ở cả hai chiều:** có. Dòng `vat_tu` chỉ gợi ý NCC loại vật tư, dòng `nhan_cong` chỉ gợi ý NCC loại nhân công; "bỏ qua lọc" vẫn chọn được mọi NCC.

## Files

- Modify: `lib/payment/payment-service.ts` (map loại → sổ; quy tắc công trình dùng chung cho hai loại)
- Modify: `lib/payment/payment-ledger-sync.ts` (lấy cả dòng `nhan_cong`)
- Modify: `app/api/thanh-toan/cascade-suppliers/route.ts` (tham số `supplierKind`)
- Modify: `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`
- Modify: `lib/import/adapters/vat-tu-chuyen-doi/review-db-facts.ts`
- Tests: `lib/payment/__tests__/` (tự điền, đóng đợt, quy tắc công trình) và test route cascade nếu có

## Implementation Steps

1. Trong `payment-service.ts`, thêm `postsToMaterialLedger(category)` = `vat_tu` hoặc `nhan_cong`. Đổi `CATEGORY_LEDGER_TYPE.nhan_cong` thành `"material"`, ghi chú lý do (công nợ NCC luôn ở sổ vật tư; sổ `labor` thuộc tổ đội).
2. Thay các kiểm tra `category === "vat_tu"` về công trình / Chủ thể / dòng cũ thiếu công trình (`:202`, `:217`, `:303`, `:527`) bằng `postsToMaterialLedger`. Giữ nguyên câu báo lỗi nhưng đổi "Dòng vật tư" thành "Dòng vật tư / nhân công" ở nơi áp cho cả hai.
3. `payment-ledger-sync.ts:29`: `category: { in: ["vat_tu", "nhan_cong"] }`; sửa chú thích đầu file. Ghi sổ vẫn là `ledgerType: "material"`, `thanh_toan`, cùng khóa NCC và `assertPeriodOpen`.
4. API cascade: nhận `supplierKind` (`vat_tu` | `nhan_cong`, tùy chọn). Với `ledgerType=material`, thêm `AND (${kind}::text IS NULL OR s."kind" = ${kind})`. Giữ nhánh `labor` trả rỗng cho người gọi cũ.
5. Client: `categoryToLedgerType` trả `"material"` cho cả `vat_tu` và `nhan_cong`, gửi `supplierKind` theo category. Mọi chỗ so `"vat_tu"` về công trình / Chủ thể liệt kê ở trên (cả hai component) đổi sang cùng predicate với server; đặt predicate trong một file không phụ thuộc Prisma để client import được, ví dụ cạnh `PaymentCategory`. Đổi `vatTuScopeError` thành tên trung tính và câu "Dòng vật tư bắt buộc chọn công trình" cho đúng cả hai loại.
6. Danh sách cascade công trình (`fetchCascadeProjects`) cho dòng nhân công dùng `ledgerType=material`.
7. `lib/import/adapters/vat-tu-chuyen-doi/review-db-facts.ts:88` đếm dòng đợt đang mở có `category: "vat_tu"` của NCC sắp import; dòng `nhan_cong` giờ cũng ghi sổ vật tư nên đổi sang cùng predicate. Các nơi chỉ liệt kê đủ bốn loại (`app/(app)/thanh-toan/tong-hop/tong-hop-client.tsx:21`, `app/api/thanh-toan/tong-hop/export/route.ts:13`) giữ nguyên.

## Todo

- [x] Map loại → sổ + predicate dùng chung
- [x] Quy tắc công trình cho dòng nhân công (server + client)
- [x] Đóng đợt ghi sổ dòng nhân công
- [x] Cascade NCC theo loại
- [x] Test

## Success Criteria

- Test: dòng `nhan_cong` cho NCC #n tự điền công nợ bằng công nợ sổ vật tư của NCC #n, không đọc sổ `labor`.
- Test: đóng đợt có dòng `nhan_cong` đã duyệt tạo đúng một dòng `thanh_toan` trong sổ vật tư; đóng lại không tạo thêm (idempotent theo `paymentRoundItemId`).
- Test: dòng `nhan_cong` thiếu công trình bị chặn duyệt / đóng với thông báo rõ.
- Dòng `vat_tu` hoạt động như cũ (test hiện có vẫn xanh, không sửa kỳ vọng).
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:integration` xanh.

## Risks

- Production có thể đã có dòng `nhan_cong` thiếu công trình (bản dev không có dòng nào). Trước khi triển khai, đếm chỉ-đọc trên production; nếu có, các dòng đó bị chặn đóng cho tới khi gán công trình, giống dòng `vat_tu` cũ.
