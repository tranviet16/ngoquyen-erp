---
phase: 1
title: "Schema, migration, rollback, hạ tầng lưu tệp"
status: completed
priority: P1
effort: "7h"
dependencies: []
---

# Phase 1: Schema, migration, rollback, hạ tầng lưu tệp

## Goal
- Thêm cột và bảng mới bằng một migration chỉ thêm (additive), kèm SQL rollback đã thử chạy và integration test chứng minh mọi ràng buộc.
- Hoàn tác import không được âm thầm xóa phần người dùng đã sửa trên hợp đồng.
- Container có thư mục lưu tệp bền và ghi được.

## Chuẩn bị nhánh và bản sao
- **Mở nhánh.** Mở `feat/du-an-danh-muc-hop-dong` từ `origin/main` **sau khi PR #21 (base là PR #12) đã merge**. Nếu chưa merge, mở từ `feat/master-data-quick-create` rồi rebase lên `origin/main`, và báo người dùng trước.
- **Mốc migration.** Migration mới nhất trên main là `20261117160000_du_an_dt_hd_tt`; migration của phase này phải có timestamp lớn hơn.
- **Bản sao lệch main.** `_prisma_migrations` của bản sao `ngoquyen-bansao-pg` có thêm `20261111100000_price_quote_source_delivery` của PR #14, migration này chưa có trên main. Vì vậy `prisma migrate status` sẽ báo lệch. Đây là trạng thái đã biết; dùng `migrate deploy`, không `migrate reset`.

## Files to Create / Modify
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261118120000_du_an_danh_muc_hop_dong/migration.sql`
- Create: `plans/261118-1016-danh-muc-hop-dong-du-an/rollback-danh-muc-hop-dong.sql`
- Modify: `lib/import/rollback-guards.ts` (guard hợp đồng)
- Modify: `docker/docker-compose.prod.yml`, `docker/docker-compose.erp-3001.yml` (volume uploads)
- Create: `test/integration/du-an-hop-dong-schema.integration.test.ts`

## Data model

**`ProjectContract` (`project_contracts`), mở rộng:**
- Thêm cột:
  - `partyKind String?`: `ncc | doi_thi_cong | cdt`;
  - `supplierId Int?`: FK tới `suppliers(id)`, `onDelete: Restrict`;
  - `contractorId Int?`: FK tới `contractors(id)`, `onDelete: Restrict`;
  - `valueTtVnd Decimal(18,2)?`.
- Giữ nguyên tên `valueVnd`, thêm comment Prisma `// Giá trị theo DT (dự toán) ghi trên hợp đồng`.
- `updatedAt` vẫn là `@default(now())` không có `@updatedAt`. Service tự gán `updatedAt: new Date()` mỗi lần sửa, và guard rollback dựa vào giá trị này.
- CHECK viết bằng raw SQL:
  - `project_contracts_party_kind_check`: `"partyKind" IS NULL OR "partyKind" IN ('ncc','doi_thi_cong','cdt')`.
  - `project_contracts_party_binding_check`, nhận đúng bốn tổ hợp:
    - `(partyKind NULL, supplierId NULL, contractorId NULL)`;
    - `(ncc, supplierId NOT NULL, contractorId NULL)`;
    - `(doi_thi_cong, contractorId NOT NULL, supplierId NULL)`;
    - `(cdt, supplierId NULL, contractorId NULL)`.
  - `project_contracts_party_doc_type_check`: `"partyKind" IS NULL OR "docType" = 'contract'`.
  - `project_contracts_value_tt_nonneg`: `"valueTtVnd" IS NULL OR "valueTtVnd" >= 0`.
- Index một phần (không unique):
  - `("projectId","supplierId") WHERE "deletedAt" IS NULL AND "supplierId" IS NOT NULL`;
  - `("projectId","contractorId") WHERE "deletedAt" IS NULL AND "contractorId" IS NOT NULL`.

**`ProjectContractAttachment` (`project_contract_attachments`), bảng mới:**
- Cột: `id`, `contractId` (FK tới `project_contracts`, `onDelete: Restrict`), `uploaderId` (FK tới `users`), `filename`, `storedPath` (unique), `mimeType`, `sizeBytes`, `deletedAt?`, `createdAt @default(now())`.
- CHECK:
  - `mimeType IN ('application/pdf','image/jpeg','image/png')`;
  - `sizeBytes BETWEEN 1 AND 26214400`.
- Index: `(contractId, createdAt)`. Không có `importRunId`.

**`ProjectCdtInvoice` (`project_cdt_invoices`), bảng mới, là sổ gốc hóa đơn xuất cho CĐT:**
- Cột:
  - `id`;
  - `projectId` (FK tới `projects`, `onDelete: Restrict`);
  - `invoiceDate DateTime` (00:00 UTC);
  - `invoiceSymbol String?`: ký hiệu hóa đơn, ví dụ `1C26TAA`;
  - `invoiceNo String`;
  - `amountVnd Decimal(18,2)`: chưa VAT, **cho phép âm** (hóa đơn điều chỉnh giảm);
  - `vatVnd Decimal(18,2) @default(0)`: cho phép âm;
  - `acceptanceBatch String?`, `note String?`, `deletedAt`, `createdAt`, `updatedAt @default(now()) @updatedAt`.
- CHECK:
  - `length(btrim("invoiceNo")) > 0`;
  - `"amountVnd" <> 0`.
- Unique một phần: `(projectId, "invoiceSymbol", "invoiceNo") NULLS NOT DISTINCT WHERE "deletedAt" IS NULL` (PostgreSQL 16).
- Index: `(projectId, invoiceDate)`.

**Back-relation:** `Supplier.projectContracts`, `Contractor.projectContracts`, `Project.cdtInvoices`, `User.contractAttachments`, `ProjectContract.attachments` / `supplier` / `contractor`.

## Guard hoàn tác import (`lib/import/rollback-guards.ts`)
Thêm vào `assertRollbackAllowed` một loại hit cho hợp đồng. Chặn rollback của run, kèm danh sách tên hợp đồng, khi có hợp đồng thuộc run mà:
- có `partyKind`, `supplierId`, `contractorId` hoặc `valueTtVnd` khác NULL; **hoặc**
- có bất kỳ dòng `project_contract_attachments` nào, **kể cả đã xóa mềm**.

Câu báo nêu rõ lý do và cách gỡ: "Hợp đồng «X» đã được gắn đối tác hoặc có bản scan. Gỡ đối tác và nhờ admin xóa vĩnh viễn bản scan (ở màn chi tiết hợp đồng) trước khi hoàn tác." Action "Xóa vĩnh viễn" của admin làm ở Phase 5.

## Hạ tầng lưu tệp
`lib/storage` ghi vào `process.env.UPLOAD_DIR ?? "./uploads"`. Container chạy uid 1001 (`nextjs`), `/app` thuộc root, và hiện chưa có volume. Cần làm:
- Trong `docker/docker-compose.prod.yml` và `docker/docker-compose.erp-3001.yml`, service app thêm:
  - `volumes: - <đường dẫn host>/uploads:/data/uploads`;
  - `environment: UPLOAD_DIR=/data/uploads`.

  Đường dẫn host đặt cạnh thư mục dữ liệu Postgres hiện có trên ổ `D:/docker-data/...`. Mỗi môi trường một thư mục riêng; bản sao không dùng chung thư mục với production.
- Trên bản sao: tạo thư mục host, cấp quyền ghi cho uid 1001, rồi recreate container 3001 với mount mới. Kiểm bằng `docker exec ngoquyen-bansao-erp sh -c 'touch /data/uploads/.ghi-thu && rm /data/uploads/.ghi-thu'`.
- Production chỉ ghi vào runbook ở Phase 6, người làm phase này không chạy.

## Tasks & Steps
1. Trên bản sao:
   - đếm `project_contracts`;
   - **INSERT một dòng hợp đồng giả lập theo đúng bộ cột của adapter import** (`lib/import/adapters/du-an-xay-dung.adapter.ts`, đoạn `INSERT INTO project_contracts`), có `valueVnd` và `status='pending'`. Dòng này là bằng chứng cho AC8;
   - `pg_dump -Fc` ra `bansao-truoc-danh-muc-hop-dong-20261118.dump`.
2. Viết model. Tạo SQL bằng `pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` (theo tiền lệ của plan 261105). Không dùng `migrate dev`, vì lệnh này cần shadow DB, đã nhiều lần hỏng trong repo. Sau đó thêm tay CHECK, index một phần và unique một phần.
3. Viết `rollback-danh-muc-hop-dong.sql`:
   - `DROP TABLE` hai bảng mới;
   - `DROP CONSTRAINT` 4 CHECK và 2 FK, `DROP INDEX` 2 index một phần, `DROP COLUMN` 4 cột;
   - `DELETE FROM _prisma_migrations WHERE migration_name = '20261118120000_du_an_danh_muc_hop_dong'`.

   Đầu tệp ghi chú: trước khi chạy phải `COPY … TO` CSV ba phần sẽ mất (liên kết đối tác cùng giá trị TT, danh mục scan, sổ hóa đơn CĐT).
4. Thêm guard rollback. Làm hạ tầng lưu tệp trên bản sao.
5. Thử vòng đi về trên bản sao: `prisma migrate deploy`, rồi chạy rollback, rồi `migrate deploy` lần nữa.

## Verification
- `pnpm prisma validate` và `pnpm exec tsc --noEmit`.
- `du-an-hop-dong-schema.integration.test.ts`:
  - mỗi CHECK có một case bị từ chối và một case được nhận;
  - FK Restrict chặn xóa cứng hợp đồng đang có scan;
  - unique hóa đơn CĐT: cùng số nhưng khác ký hiệu thì được; cùng số và cùng ký hiệu NULL thì bị chặn; dòng đã xóa mềm được bỏ qua;
  - hóa đơn âm được nhận, hóa đơn 0 bị chặn;
  - INSERT theo bộ cột của adapter vẫn qua, và `valueVnd` không đổi;
  - guard rollback chặn khi hợp đồng có đối tác, và khi có scan đã xóa mềm.
- Vòng migrate, rollback, migrate trên bản sao chạy không lỗi. Ghi được tệp vào `/data/uploads` trong container 3001.

## Risks
- Nhánh khác có thể merge một migration có timestamp lớn hơn trước PR này. Khi đó đổi tên thư mục migration trước khi merge.
- Build cũ chạy trên schema mới an toàn cho đọc, tạo mới và sửa hợp đồng chưa gắn đối tác. **Ngoại lệ:** build cũ đổi `docType` của một hợp đồng đã gắn đối tác sang loại khác sẽ vi phạm `party_doc_type_check`, và người dùng chỉ thấy lỗi chung. Nếu phải rollback build, báo người dùng tránh thao tác này cho tới khi rollback DB hoặc deploy lại.
