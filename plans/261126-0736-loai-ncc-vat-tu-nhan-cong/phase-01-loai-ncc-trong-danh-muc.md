---
title: "Phase 1: Loại NCC trong CSDL và danh mục"
status: todo
priority: P2
effort: "0.5d"
dependencies: []
---

# Phase 1: Loại NCC trong CSDL và danh mục

## Overview

Thêm cột `kind` (`vat_tu` | `nhan_cong`, mặc định `vat_tu`) vào `suppliers`, cho admin đặt và đổi loại ở form Thêm / Sửa và trên lưới Danh mục NCC. Mọi NCC hiện có thành "Vật tư", nên không màn hình nào đổi số sau phase này.

## Hiện trạng (đã kiểm tra 26/11)

- `prisma/schema.prisma:237` model `Supplier`: chưa có trường loại.
- `lib/master-data/supplier-service.ts`: `createSupplier` / `updateSupplier` parse bằng `supplierSchema`; `patchSupplier` có whitelist `["name","taxCode","phone","address"]` và `patchSupplierSchema` riêng. Tất cả gọi `requireActiveAdmin()`.
- `lib/master-data/suppliers/table-spec.ts`: 4 cột sửa được kiểu `text`. Cột `select` có mẫu ở `lib/master-data/projects/table-spec.ts:47` (`editKind: "select"`, `editOptions`).
- `components/master-data/supplier-form.tsx`: form dùng `zodResolver(supplierSchema)`.
- Audit tự động qua Prisma `$extends` (`lib/audit.ts`), không cần thêm gì.
- Migration mới nhất: `prisma/migrations/20261118120000_du_an_danh_muc_hop_dong`. `.gitattributes` bắt migration SQL giữ LF.

## Files

- Create: `prisma/migrations/20261126090000_supplier_kind/migration.sql`
- Create: `lib/master-data/supplier-kind.ts` (hằng số, nhãn, parse; dùng được ở client)
- Modify: `prisma/schema.prisma` (model `Supplier`)
- Modify: `lib/master-data/schemas.ts` (`supplierSchema`)
- Modify: `lib/master-data/supplier-service.ts` (whitelist + `patchSupplierSchema`)
- Modify: `lib/master-data/suppliers/table-spec.ts` (cột Loại)
- Modify: `components/master-data/supplier-form.tsx` (ô chọn Loại)
- Modify: `app/(app)/master-data/suppliers/suppliers-client.tsx` (truyền `kind` vào `defaultValues` của form Sửa)
- Modify: `lib/master-data/__tests__/patch-actions.test.ts` (whitelist mới)

## Implementation Steps

1. Migration SQL:
   ```sql
   ALTER TABLE "suppliers" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'vat_tu';
   ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_kind_check" CHECK ("kind" IN ('vat_tu', 'nhan_cong'));
   ```
   Thêm vào model: `kind String @default("vat_tu") // vat_tu | nhan_cong — CHECK suppliers_kind_check (raw SQL)`. Chạy `npx prisma generate`.
2. `lib/master-data/supplier-kind.ts`: `SUPPLIER_KINDS = ["vat_tu","nhan_cong"] as const`, `type SupplierKind`, `SUPPLIER_KIND_LABEL = { vat_tu: "Vật tư", nhan_cong: "Nhân công" }`, `SUPPLIER_KIND_OPTIONS` (dạng `{ id, name }` cho lưới), `parseSupplierKind(raw: unknown): SupplierKind | null` (giá trị lạ trả `null` = tất cả). Không import Prisma để client dùng được.
3. `supplierSchema`: thêm `kind: z.enum(SUPPLIER_KINDS).default("vat_tu")`. Quick-create (`lib/master-data/quick-create-actions.ts:85`) dùng chung schema nên NCC tạo nhanh mặc định là vật tư, không cần sửa.
4. `patchSupplier`: thêm `"kind"` vào whitelist và `kind: z.enum(SUPPLIER_KINDS).optional()` vào `patchSupplierSchema`.
5. Lưới: thêm cột `{ key: "kind", header: "Loại", kind: "text", editable: true, editKind: "select", editOptions: SUPPLIER_KIND_OPTIONS }`, hiển thị nhãn tiếng Việt thay vì mã. Kiểm tra bộ lọc cột của DataTable lọc được theo loại.
6. Form: ô chọn Loại (mặc định Vật tư) trong form Thêm và Sửa; form Sửa nhận `kind` hiện tại.
7. Mô tả trang `/master-data/suppliers` đang ghi "Danh sách nhà cung cấp vật tư xây dựng": đổi thành câu không giới hạn ở vật tư.

## Todo

- [x] Migration + schema Prisma + `prisma generate`
- [x] `supplier-kind.ts`
- [x] `supplierSchema` và `patchSupplier`
- [x] Cột Loại trên lưới và ô chọn trong form
- [x] Test whitelist và parse loại

## Success Criteria

- Admin đổi loại một NCC trên lưới hoặc qua form Sửa, tải lại trang vẫn giữ; audit log có dòng sửa.
- Gửi `kind` khác hai giá trị cho phép thì bị từ chối ở zod và ở CHECK của CSDL.
- NCC tạo nhanh từ màn khác có loại "Vật tư".
- `npx tsc --noEmit`, `npm run lint`, `npm test` xanh.

## Risks

- Migration chạy trên bảng 55 dòng, chỉ thêm cột có mặc định: không khóa lâu. Vẫn backup trước khi chạy trên bất kỳ CSDL nào.
