# Phase 02 — Chốt kỳ 27→26 & sinh sự kiện lay_hang

## Context links
- Brainstorm §Quyết định #2, #4
- Scout §1.3, §1.5 (flow), §3 gap #1, #2, #4
- Phase 01 (dependency): `Project.entityId`, `unitPrice/totalAmount`, `LedgerTransaction.deliveryId`

## Overview
Màn "Chốt kỳ" mới cho từng NCC: nhập tháng đích → hệ thống tính khoảng `[27 tháng trước, 26 tháng đích]`, liệt kê mọi phiếu trong kỳ, gợi ý đơn giá theo lần nhập gần nhất mỗi (NCC, item), kế toán chỉnh sửa bulk → nhấn "Chốt kỳ" → sinh/đồng bộ `lay_hang` event trong ledger theo `deliveryId`. Kỳ đã chốt (`SupplierReconciliation` tồn tại chưa ký) vẫn cho re-generate; kỳ đã ký khóa (Phase 4 enforce).

## Key Insights
- Kỳ = `[year-1|year, month-1, 27] .. [year, month, 26]` inclusive. Ví dụ tháng 6/2026 → `2026-05-27` .. `2026-06-26`.
- Bảng `SupplierReconciliation` (đã có `periodFrom/periodTo`) chưa dùng đúng nghĩa — tận dụng luôn để lưu snapshot kỳ chốt; opening sẽ tính động (Phase 4).
- Idempotency = key theo `deliveryId`. Chạy chốt lần 2 chỉ cập nhật giá/tổng của event đã có, không tạo mới.
- VAT = 0: `amountTt = qty * unitPrice`, `vatPctTt = 0`, `totalTt = amountTt`, HĐ mặc định 0.
- Entity suy từ `Project.entityId` — phiếu thiếu `projectId` hoặc `Project.entityId` NULL → báo lỗi kèm danh sách phiếu vi phạm (không tự đoán).

## Requirements
1. Server action `previewPeriodClose(supplierId, year, month)` → trả về:
   - `{ periodFrom, periodTo }`
   - Danh sách phiếu trong kỳ với `{ id, date, projectId, projectCode, entityId, entityName, itemId, itemName, qty, unit, currentUnitPrice, suggestedUnitPrice }`
   - Vi phạm: phiếu thiếu project, project thiếu entity, kỳ đã ký (block).
2. Server action `commitPeriodClose(supplierId, year, month, prices: Array<{ deliveryId, unitPrice }>)` → transaction:
   - Cập nhật `unitPrice/totalAmount` phiếu (nếu client gửi mới).
   - Upsert `LedgerTransaction` theo `deliveryId`: `ledgerType='material'`, `transactionType='lay_hang'`, `date=delivery.date`, `entityId=project.entityId`, `partyId=supplierId`, `projectId=delivery.projectId`, `itemId=delivery.itemId`, `amountTt=qty*price`, `vatPctTt=0`, computed vatTt/totalTt via LedgerService formula, `deliveryId=delivery.id`, `qty`, `unitPriceSnapshot=price`, `status='approved'`.
   - Upsert `SupplierReconciliation(supplierId, periodFrom, periodTo)` — dùng làm marker "kỳ đã chốt"; không lưu 3 số tổng (sẽ tính dẫn xuất ở Phase 4).
3. Route mới `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/page.tsx`:
   - Form chọn tháng đích → preview table (grid inline giá) → nút "Chốt kỳ".
   - Hiển thị vi phạm chặn commit.
4. Gợi ý giá = `unitPrice` của lần nhập gần nhất trước `periodFrom` cùng `(supplierId, itemId)`; nếu không có, trống.
5. ACL: sử dụng lại module key `vat-tu-ncc`; `previewPeriodClose` cần `read`, `commitPeriodClose` cần `edit`. Không tạo module key mới (KISS — thao tác chốt kỳ vẫn thuộc luồng vật tư NCC).
6. Sidebar không cần đổi (route lồng dưới `[supplierId]` — đã có tabs). Thêm tab "Chốt kỳ" vào `layout.tsx`.

## Architecture
```
UI [supplierId]/chot-ky
   ├── select year/month
   ├── previewPeriodClose  → server action
   │      └── list deliveries [period] + suggestions + violations
   ├── edit prices inline
   └── commitPeriodClose   → server action
          ├── update deliveries.unitPrice/totalAmount
          ├── upsert LedgerTransaction WHERE deliveryId=?
          └── upsert SupplierReconciliation (periodFrom, periodTo) [marker]
```

Signed period check: nếu `SupplierReconciliation.signedBySupplier=true` với period bao trùm delivery.date → throw "Kỳ đã ký, không sửa được. Ghi dieu_chinh kỳ sau." (Phase 4 hoàn thiện enforce ở nhiều điểm.)

## Related code files
- `lib/vat-tu-ncc/delivery-service.ts` (mở rộng: query phiếu theo period)
- `lib/vat-tu-ncc/reconciliation-service.ts` (dùng lại upsert marker; loại bỏ trường tổng nếu Phase 4 quyết)
- `lib/ledger/ledger-service.ts` (thêm helper `createOrUpdateFromDelivery(input)` — không thay đổi `create/update` cũ để tránh vỡ callers)
- `lib/vat-tu-ncc/period-close-service.ts` (MỚI — chứa `previewPeriodClose`, `commitPeriodClose`)
- `app/(app)/vat-tu-ncc/[supplierId]/chot-ky/page.tsx` (MỚI) + `chot-ky-client.tsx`
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx` (thêm tab "Chốt kỳ")

## Implementation Steps
1. Tạo helper `periodRange(year, month) → { from, to }` (utility date, tính 27 tháng trước → 26 tháng này). Đơn vị test riêng.
2. Viết `period-close-service.ts` với 2 action, dùng lại `LedgerService`.
3. Thêm `LedgerService.upsertFromDelivery(deliveryId, {...})` — tra `ledger_transactions WHERE deliveryId=?`, nếu có → update, không có → create; giữ tính toán vat/total qua `computeTotals` cũ.
4. Suggest price query: `SELECT "unitPrice" FROM supplier_delivery_daily WHERE "supplierId"=? AND "itemId"=? AND "unitPrice" IS NOT NULL AND date < $periodFrom AND "deletedAt" IS NULL ORDER BY date DESC LIMIT 1`.
5. Vi phạm resolver: JOIN `projects` để lấy `entityId`; phiếu có `projectId IS NULL` HOẶC `project.entityId IS NULL` → danh sách chặn.
6. Route + client component: reuse Grid pattern (xem `components/vat-tu-ncc/delivery-grid.tsx` cho phong cách inline edit). Nút "Chốt kỳ" disabled khi có vi phạm.
7. Cập nhật `[supplierId]/layout.tsx`: thêm `{ href: "/chot-ky", label: "Chốt kỳ" }` vào TABS.
8. ACL: giữ nguyên `vat-tu-ncc` module — không cần thêm vào `MODULE_KEYS`. Guard trong `page.tsx` = `requireModuleAccess("vat-tu-ncc", { minLevel: "read", scope: "module" })`.

## Todo list
- [ ] `periodRange` util + unit test biên (kỳ 5/2026, 12/2026 sang 1/2027)
- [ ] `period-close-service.ts` với previewPeriodClose / commitPeriodClose
- [ ] `LedgerService.upsertFromDelivery`
- [ ] Route + client `chot-ky`
- [ ] Thêm tab layout
- [ ] Integration test: seed 3 phiếu Nam Hương → commit → 3 event `lay_hang` khớp amount; commit lần 2 (đổi giá) → 3 event vẫn duy nhất, amount cập nhật
- [ ] Test vi phạm: phiếu thiếu project → throw kèm list; project thiếu entity → throw kèm list
- [ ] Test signed period: `signedBySupplier=true` → commit reject

## Success Criteria
- Chọn NCC + tháng → thấy đúng phiếu trong `[27..26]` (test 3 tháng liên tiếp, không đếm trùng ngày biên).
- Sau commit: `SELECT COUNT(*) FROM ledger_transactions WHERE "deliveryId" IN (…)` = số phiếu; totals đúng `qty*price`.
- Commit idempotent: chạy 2 lần cùng payload → cùng số row, cùng số tiền.
- Vi phạm project/entity chặn commit và không ghi partial.

## Risk Assessment
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Người dùng bấm "Chốt kỳ" 2 lần đồng thời → race | Trung bình | `prisma.$transaction` + `pg_advisory_xact_lock(hashtext("close:"||supplierId||period))` (mẫu như `payment-service.ts:169`) |
| Xoá phiếu sau khi đã chốt → event ledger mồ côi | Trung bình | FK `ON DELETE SET NULL` giữ event; soft-delete phiếu → thêm task cleanup event `WHERE deliveryId IS NULL` hoặc mark event `deletedAt` (chọn: chặn xóa phiếu nếu kỳ đã ký; cho phép nếu chưa ký, và cleanup event trong service `softDeleteDelivery`) |
| Đổi `Project.entityId` giữa 2 lần chốt → entity sai lệch | Cao | Snapshot `entityId` vào `LedgerTransaction.entityId` lúc create; Phase 4 dùng cột này để in đối chiếu (không re-join) |

## Security Considerations
- `commitPeriodClose` yêu cầu `edit` — chỉ kế toán được cấp quyền `vat-tu-ncc.edit`.
- Không expose raw SQL cho client; date range tính server-side để tránh injection kỳ giả.

## Next steps
Phase 3 (Payment single source) chạy song song về data (không đụng cùng file). Phase 4 dùng marker `SupplierReconciliation` + `LedgerTransaction.deliveryId/entityId` để dựng snapshot đối chiếu.
