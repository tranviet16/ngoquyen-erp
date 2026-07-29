# Phase 01 — Nền tảng dữ liệu (Project.entityId + giá phiếu + link ledger)

## Context links
- Brainstorm final §"Các pha triển khai" #1
- Scout §2.1 "vat-tu-ncc coverage" (cột `unitPrice/totalAmount` có sẵn nhưng bị bỏ qua)
- `prisma/schema.prisma:265-285` (Project), `521-546` (SupplierDeliveryDaily), `637-673` (LedgerTransaction)

## Overview
Mở đường ống dữ liệu để pha 2-4 nối được: (a) Project có Chủ thể để phiếu suy Entity; (b) phiếu ngày ghi được đơn giá + thành tiền; (c) LedgerTransaction có FK ngược về phiếu gốc để đảm bảo idempotency + audit.

## Key Insights
- Cột `unitPrice` (Decimal 18,2 nullable) và `totalAmount` (Decimal 18,2 nullable) đã tồn tại ở `supplier_delivery_daily` — chỉ Zod schema (`lib/vat-tu-ncc/schemas.ts:3-14`) và service (`lib/vat-tu-ncc/delivery-service.ts:37-57`) bỏ qua. Không cần ALTER TABLE cho phiếu.
- `Project` (`schema.prisma:265`) hiện KHÔNG có `entityId`. Excel không tách entity theo công trình — cùng công trình có thể phục vụ nhiều Chủ thể trên lý thuyết, nhưng brainstorm chốt: 1 Project ↔ 1 Entity, cột NULL cho bản ghi legacy.
- `LedgerTransaction.deliveryId` mới: cho phép hủy/gỡ event khi phiếu bị xóa mềm hoặc kỳ mở lại. Kèm `qty` và `unitPriceSnapshot` để đối chiếu in ra dòng chi tiết mà không cần re-join `supplier_delivery_daily`.

## Requirements
1. Thêm `Project.entityId Int? @relation` (nullable để không phá dữ liệu cũ; backfill riêng — không bắt buộc trong phase này).
2. Zod `deliverySchema` chấp nhận `unitPrice?: number`, `totalAmount?: number`; service ghi vào DB.
3. Thêm cột `LedgerTransaction.deliveryId Int? UNIQUE @index` FK → `supplier_delivery_daily.id ON DELETE SET NULL`.
4. Thêm cột `LedgerTransaction.qty Decimal?(18,4)` và `unitPriceSnapshot Decimal?(18,2)` — nullable, chỉ set cho event sinh từ phiếu.
5. Cột grid phiếu ngày (`components/vat-tu-ncc/delivery-grid.tsx`) hiển thị 2 cột giá; kế toán nhập được (không bắt buộc lúc tạo — sẽ bắt buộc lúc chốt kỳ).
6. Không cần backfill Project.entityId trong phase này (Phase 2 sẽ chặn chốt kỳ nếu Project thiếu Entity).

## Architecture
```
Project ─(entityId FK, optional)─→ Entity
SupplierDeliveryDaily.unitPrice/totalAmount  ← Zod schema mở
LedgerTransaction ─(deliveryId FK unique)─→ SupplierDeliveryDaily
LedgerTransaction.qty, unitPriceSnapshot   ← chỉ cho event sinh từ phiếu
```

Tính idempotency: khi chốt kỳ (Phase 2), upsert theo `deliveryId` — 1 phiếu = 0 hoặc 1 row `lay_hang`. Không có cột trùng lặp; xoá phiếu → xoá event hoặc soft-delete tuỳ status.

## Related code files
- `prisma/schema.prisma` (Project ~265, SupplierDeliveryDaily ~521, LedgerTransaction ~637)
- `lib/vat-tu-ncc/schemas.ts` (deliverySchema)
- `lib/vat-tu-ncc/delivery-service.ts` (createDelivery / updateDelivery)
- `components/vat-tu-ncc/delivery-grid.tsx` (grid columns)
- `lib/ledger/ledger-types.ts` (bổ sung field vào input type — kiểm tra khi implement)

## Implementation Steps
1. Migration `add_project_entity_and_delivery_pricing`:
   - `ALTER TABLE projects ADD COLUMN "entityId" INTEGER REFERENCES entities(id)`; index `projects_entityid_idx`.
   - `ALTER TABLE ledger_transactions ADD COLUMN "deliveryId" INTEGER REFERENCES supplier_delivery_daily(id) ON DELETE SET NULL`, ADD `qty DECIMAL(18,4)`, ADD `unitPriceSnapshot DECIMAL(18,2)`; partial UNIQUE index `ledger_tx_delivery_id_unique WHERE "deliveryId" IS NOT NULL`.
2. Cập nhật `schema.prisma` — thêm quan hệ Project↔Entity, LedgerTransaction↔SupplierDeliveryDaily. Chạy `prisma generate`.
3. Mở `deliverySchema` thêm `unitPrice: z.number().nonnegative().optional()` và `totalAmount: z.number().nonnegative().optional()`. Nếu client gửi `qty` + `unitPrice` mà không có `totalAmount` → service tính = `qty * unitPrice`.
4. `createDelivery` + `updateDelivery`: ghi 2 cột mới (Prisma.Decimal). Không sinh ledger event ở đây — Phase 2 làm.
5. Grid phiếu ngày: thêm 2 cột hiển thị + inline edit. Format tiền VN, cho phép trống.
6. TypeScript check: các call site `deliverySchema.parse` không bị vỡ (mới trường optional).
7. Không cần chỉnh `LedgerService.create` để chấp nhận `deliveryId/qty/unitPriceSnapshot` ở phase này — Phase 2 sẽ thêm `createDeliveryEvent` helper riêng.

## Todo list
- [ ] Viết migration SQL + chạy `prisma migrate dev`
- [ ] Cập nhật `schema.prisma` (Project, LedgerTransaction) + `prisma generate`
- [ ] Mở `deliverySchema` (unitPrice, totalAmount optional)
- [ ] Cập nhật `createDelivery`/`updateDelivery` để ghi giá
- [ ] Thêm 2 cột giá vào `delivery-grid.tsx`
- [ ] Unit test: `deliverySchema` chấp nhận có/không giá; service auto tính totalAmount
- [ ] Integration test: tạo phiếu có giá → đọc lại đúng số

## Success Criteria
- Migration deploy pass; `SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='entityId'` trả 1 row.
- Grid phiếu ngày cho nhập giá + thành tiền, lưu và đọc lại đúng.
- `LedgerTransaction` có 3 cột mới nullable (Prisma introspection xác nhận); phiếu cũ không bị ảnh hưởng.
- `tsc --noEmit` sạch; `npm run test` không hồi quy.

## Risk Assessment
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Cột `unitPrice/totalAmount` đã có nhưng có dữ liệu rác cũ | Thấp | Không migrate dữ liệu; chỉ mở ghi/đọc |
| FK `Project.entityId` để null → Phase 2 phải chặn | Trung bình | Phase 2 chặn ở bước "generate lay_hang" (không chặn ở grid) |
| `deliveryId UNIQUE` xung đột với event legacy chưa link | Thấp | Partial index `WHERE "deliveryId" IS NOT NULL` |

## Security Considerations
- ACL không thay đổi — vẫn `requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create"/"edit" })`.
- Không có endpoint mới lộ ra, chỉ mở rộng payload zod đã có.

## Next steps
Phase 2 (Chốt kỳ 27→26) dùng cột mới để sinh `lay_hang` event idempotent theo `deliveryId`.
