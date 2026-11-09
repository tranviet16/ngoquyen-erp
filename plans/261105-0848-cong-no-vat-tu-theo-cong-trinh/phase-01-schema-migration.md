---
phase: 1
title: "Schema và migration"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Schema và migration

<!-- Updated: Red Team 2026-11-06 — bỏ CHECK NOT VALID, chế độ marker cũ, CHECK đợt thanh toán và index sổ cái; migration kiểm ngay, chỉ sửa tiến -->

## Goal

Thêm cột, index và ràng buộc cho phạm vi cặp (NCC × công trình) và cho bước review của import. Migration chỉ chạy sau khi dữ liệu cũ đã được dọn và bù công trình (phase 8, bước dọn **trước** migrate); dữ liệu còn sai thì migration dừng ngay.

## Files to Create / Modify

- Modify `prisma/schema.prisma`:
  - `SupplierReconciliation`: thêm `projectId Int` (NOT NULL) và relation tới `Project` (`onDelete: Restrict`); thay `@@index([supplierId, periodFrom])` bằng `@@index([supplierId, projectId, periodFrom])`; cập nhật comment unique một phần.
  - `Project`: thêm quan hệ ngược `supplierReconciliations SupplierReconciliation[]`.
  - `SupplierDeliveryDaily`: thêm `@@index([projectId, date])`.
  - `ImportRun`: thêm `sourceFile Bytes?`, `reviewJson Json?`, `reviewVersion Int @default(0)`, `rolledBackAt DateTime?` (`committedAt` đã có); trạng thái thêm giá trị `rolled_back` (cột kiểu chuỗi, cập nhật comment).
- Create `prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review/migration.sql`.
- Create `test/integration/vat-tu-schema-constraints.integration.test.ts`.

## Nội dung migration

```sql
-- Dừng sớm nếu còn dữ liệu chưa dọn (runbook phase 8 bước 6 phải chạy trước).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "supplier_reconciliations") THEN
    RAISE EXCEPTION 'Còn kỳ đối chiếu cũ (không có công trình). Chạy scripts/vat-tu-cutover-cleanup.sql trước khi migrate.';
  END IF;
END $$;

ALTER TABLE "supplier_reconciliations" ADD COLUMN "projectId" INTEGER NOT NULL
  REFERENCES "projects"("id") ON DELETE RESTRICT;
DROP INDEX "supplier_recon_period_unique";
CREATE UNIQUE INDEX "supplier_recon_pair_period_unique"
  ON "supplier_reconciliations"("supplierId", "projectId", "periodFrom", "periodTo")
  WHERE "deletedAt" IS NULL;
-- thay index (supplierId, periodFrom) bằng (supplierId, projectId, periodFrom)
-- index (projectId, date) cho supplier_delivery_daily

-- Bắt buộc công trình; kiểm toàn bộ dòng hiện có ngay lúc migrate (kể cả dòng đã xóa mềm).
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_material_project_required"
  CHECK ("ledgerType" <> 'material' OR "projectId" IS NOT NULL);
ALTER TABLE "ledger_opening_balances" ADD CONSTRAINT "ledger_opening_material_project_required"
  CHECK ("ledgerType" <> 'material' OR "projectId" IS NOT NULL);
ALTER TABLE "supplier_delivery_daily" ADD CONSTRAINT "supplier_delivery_project_required"
  CHECK ("projectId" IS NOT NULL);

ALTER TABLE "import_runs"
  ADD COLUMN "sourceFile" BYTEA,
  ADD COLUMN "reviewJson" JSONB,
  ADD COLUMN "reviewVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rolledBackAt" TIMESTAMP(3);
```

- Lấy tên index cũ từ migration gốc trước khi drop:
  - `supplier_recon_period_unique`: `prisma/migrations/20260729162000_reconciliation_derived_snapshot/migration.sql:24-26`.
  - Index `(supplierId, periodFrom)`: `prisma/migrations/20260504160000_add_supplier_delivery/migration.sql:50`.
- Không có CHECK trên `payment_round_items`. Đợt thanh toán thật đã chạy từ 05/2026, nên dòng `vat_tu` cũ đã đóng giữ nguyên. Quy tắc "dòng `vat_tu` mới hoặc sửa phải có công trình" đặt ở service (phase 2). Dòng `vat_tu` còn mở phải được xử lý trước go-live (phase 8).
- Không thêm index sổ cái mới. Dữ liệu nhỏ, và index `(ledgerType, entityId, partyId, projectId, date)` đã có.

## Tasks & Steps

1. **Không** chạy `prisma migrate dev` trên container mà `erp-3001` đang dùng (`docker-compose.erp-3001.yml`). Tạo SQL bằng `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` rồi sửa tay, hoặc chỉ chạy `migrate dev` trên DB test riêng.
2. Chạy `npx prisma generate`, rồi `npx prisma migrate deploy` trên DB test (Docker, `fsync` tắt theo `docs/code-standards.md`).
3. Chạy `npx tsc --noEmit`. `SupplierReconciliation.projectId` thành bắt buộc nên `tsc` sẽ chỉ ra nơi tạo kỳ; phase 2 sửa các nơi đó.

## Tests

`test/integration/vat-tu-schema-constraints.integration.test.ts`:
- Insert thiếu `projectId` bị từ chối (mã 23514 hoặc 23502) cho: sổ vật tư, số dư vật tư, phiếu ngày, kỳ đối chiếu.
- Sổ nhân công thiếu `projectId` vẫn insert được.
- Hai kỳ cùng biên ở hai công trình được phép; trùng biên trong cùng cặp vi phạm `supplier_recon_pair_period_unique`.
- Migration dừng với thông báo rõ khi `supplier_reconciliations` còn dòng: test dựng DB tạm, chèn một kỳ, rồi chạy SQL.

## Ownership & Rollback

- Chỉ phase này sửa `prisma/schema.prisma` và tạo migration.
- **Chỉ sửa tiến.** Sau khi migrate, code cũ tạo kỳ hoặc phiếu thiếu công trình sẽ lỗi. Muốn quay lại thì phải khôi phục bản sao lưu DB **cùng** build cũ (phase 8, "Rollback vận hành"). Không có kiểu revert chỉ code.

## Verification

- `npx prisma migrate deploy` (DB test)
- `npx vitest run --project integration test/integration/vat-tu-schema-constraints.integration.test.ts`
- `npx tsc --noEmit` (lỗi còn lại phải nằm trong danh sách nơi gọi của phase 2)
