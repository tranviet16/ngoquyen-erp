# Debate evidence packet: Danh mục hợp đồng dự án

Mọi planner dùng chung tệp này. Yêu cầu và các quyết định nghiệp vụ đã chốt nằm trong `plans/reports/brainstorm-261118-0910-danh-muc-hop-dong-du-an.md`; phải đọc tệp đó trước. Tệp này chỉ bổ sung sự thật đã kiểm sau khi brainstorm xong.

## Hai câu hỏi mở của brainstorm đã có lời giải

1. **Chủ thể.** Trên bản sao, cả 77 cặp NCC × công trình của sổ vật tư đều có đúng 1 Chủ thể. Vì vậy hợp đồng cộng mọi Chủ thể của cặp, không cần trường `entityId`. Nếu sau này một cặp có hai Chủ thể trở lên, màn chi tiết hiện băng báo.
2. **Nơi đặt sổ hóa đơn xuất CĐT.** Planner chọn rồi ghi lý do. Gợi ý: đặt ngay trong màn chi tiết hợp đồng CĐT, vì đó là nơi duy nhất cần dùng sổ này.

## Sự thật về code và dữ liệu (đã kiểm ngày 2026-11-18)

### Nhánh

- Nhánh hiện tại `feat/master-data-quick-create` có PR #21 đang mở. PR này chứa picker tạo nhanh danh mục (NCC, đội thi công…).
- `origin/main` có DT-HĐ-TT (PR #20) và migration mới nhất `20261117160000_du_an_dt_hd_tt`.
- Đề xuất: plan phụ thuộc PR #21. Mở nhánh mới từ `origin/main` sau khi #21 đã merge; nếu chưa merge thì rebase lên.

### Model `ProjectContract` (`prisma/schema.prisma` khoảng dòng 504 trên main)

- Các trường: `id, projectId, docName, docType, partyName?, valueVnd Decimal(18,2)?, signedDate?, expiryDate?, status (active|expired|terminated), storage?, note?, deletedAt, createdAt, updatedAt @default(now())` (không có `@updatedAt`), `importRunId → ImportRun SetNull`.
- Bản sao có 0 dòng; chưa đếm trên production.
- Service `lib/du-an/contract-service.ts` (70 dòng, "use server"): `listContracts`, `createContract`, `updateContract`, `softDeleteContract`. ACL qua `requireReleasedModuleRequest("du-an", { minLevel, scope: { kind: "project", projectId } })`.
- Zod `contractSchema` ở `lib/du-an/schemas.ts:84`: `docType` là enum `contract|license`.
- Import `lib/import/adapters/du-an-xay-dung.adapter.ts:256-680` ghi thêm `insurance|acceptance|other` vào `project_contracts` (raw INSERT). Import rollback xóa theo `importRunId` (`lib/import/import-rollback.ts:63,124`).
- UI ở `app/(app)/du-an/[id]/hop-dong/`:
  - `page.tsx` là server component, `params` là Promise; dùng `canAccessEntitlement` để lấy cờ `canCreate`/`canEdit`;
  - `hop-dong-client.tsx` và `hop-dong-form.tsx`;
  - cảnh báo hết hạn dùng `settings.contractWarningDays`.
- Tab nằm trong `app/(app)/du-an/[id]/layout.tsx` (nav `/hop-dong`, `/nghiem-thu`, `/dong-tien-3-ben`).

### Sổ công nợ: nguồn của NCC (material) và đội thi công (labor)

- Bảng `ledger_transactions`:
  - khóa theo `ledgerType`, `entityId`, `partyId` (supplierId hoặc contractorId), `projectId`;
  - chứa `totalTt` / `totalHd` (cùng phần chưa VAT và VAT), `invoiceNo?`, `invoiceDate?`, `content?`, `qty?`, `itemId?`;
  - liên kết nguồn: `deliveryId` (phiếu `supplier_delivery_daily`) và `paymentRoundItemId` (đợt thanh toán).
- Quy tắc phân loại dùng chung ở `lib/ledger/transaction-classification.ts`:
  - `lay_hang`, `thue_hd` tăng nợ;
  - `thanh_toan` giảm nợ;
  - `dieu_chinh` dương thì tăng, âm thì giảm;
  - các fragment SQL `increaseSql` / `decreaseSql` / `signedSql`. **Phải dùng các fragment này, không tự viết lại literal loại giao dịch.**
- Số dư đầu kỳ ở `ledger_opening_balances`: `(ledgerType, entityId, partyId, projectId, balanceTt, balanceHd, asOfDate)`.
- Báo cáo lũy kế ở `lib/cong-no-vt/balance-report-service.ts`: `queryDetailReport({ ledgerType, projectIds, entityIds, from, to, showZero })` trả đầu kỳ / phát sinh / đã trả / cuối kỳ cho cả TT và HĐ theo Chủ thể × NCC × công trình. Bên nhân công gọi nó qua `lib/cong-no-nc/balance-report-service.ts:getLaborDetailReport`.
  - Đây là nguồn chuẩn để đối chiếu: tổng trên màn hợp đồng phải khớp số của hàm này.
- `lib/vat-tu-ncc/supplier-balance.ts`: `pairBalanceAsOf` chỉ tính TT. Tệp này cố ý không phải "use server".
- Hình dạng dữ liệu trên bản sao:

  | Loại giao dịch | Σ TT | Σ HĐ |
  |---|---|---|
  | `lay_hang` | 56,03 tỷ | 58,93 tỷ |
  | `thanh_toan` | 54,22 tỷ | 60,70 tỷ |
  | `thue_hd` | 12,8 triệu | 0 |

  - Dòng `thanh_toan` có cả TT và HĐ, và hai số khác nhau ở 162 dòng.
  - Chỉ 115 dòng `lay_hang` có `totalHd ≠ 0`; 53 dòng trong số đó có `invoiceNo`. Các dòng còn lại mang `totalHd` lớn mà không có số hóa đơn, nên phải chốt cách gom danh sách "lấy hóa đơn".
  - Sổ vật tư có dữ liệu ở 11 dự án. Sổ nhân công 0 dòng; bảng `contractors` 0 dòng.

### Nguồn của CĐT (dự án)

- `ProjectAcceptance` (`project_acceptances`): `amountCdtVnd`, `acceptedAt`, `acceptanceBatch`, `checkItem`, `categoryId`. Service `lib/du-an/acceptance-service.ts`, tab `/nghiem-thu`. Hiện 0 dòng.
- `Project3WayCashflow` (`project_3way_cashflows`): `flowDirection` (`cdt_to_cty|cty_to_doi|doi_to_cty|cty_to_cdt|doi_refund`), `category`, `payerName`, `payeeName`, `amountVnd`, `date`, `refDoc`. Service `lib/du-an/cashflow-service.ts`, tab `/dong-tien-3-ben`. Hiện 0 dòng.
  - Khi tính "chuyển tiền" cho hợp đồng CĐT: `cdt_to_cty` cộng vào; `cty_to_cdt` (hoàn trả) cần được xử lý rõ.
- Chưa có sổ nào ghi hóa đơn xuất cho CĐT. Đây là phần **mới, đã được người dùng duyệt**.
- CĐT không có danh mục riêng; `Project.ownerInvestor` là chữ.

### Lưu tệp

- `lib/storage/index.ts`: `store` (`LocalDiskStore`, `UPLOAD_DIR` mặc định `./uploads`) và `safeFilename`.
- Mẫu để làm theo: `lib/task/attachment-service.ts` (`MAX_ATTACHMENT_BYTES = 25MB`, `uploadAttachment(taskId, file)`), model `TaskAttachment` (`storedPath`, `mimeType`, `sizeBytes`, `uploaderId`), route `app/api/tasks/[id]/attachments/[attId]/route.ts` (GET tải, DELETE).

### Cổng CI: `risk:verify` (`scripts/verify-risk-manifest.ts`)

- Mọi `app/api/**/route.ts` phải có bản ghi `kind: "api-route"` trong `test/risk-manifest.ts`.
- Mọi tệp **dưới `app/`** có "use server" và đã được git theo dõi phải có bản ghi trong `test/risk-manifest-server-actions.ts`. Tệp "use server" trong `lib/` không bị quét.
- P0 bắt buộc khai `requiredTests` `allow, deny, cross-scope, audit, recovery`.
- Mẫu bản ghi gần nhất: `api-task-attachment` (tier P0, `dataClassification: "confidential"`).

### Quy ước schema và migration (theo plan DT-HĐ-TT, `plans/261117-1453-.../phase-02`)

- Model mới có `projectId`, `note String?`, `deletedAt`, `createdAt @default(now())`, `updatedAt @default(now()) @updatedAt`, `importRunId Int?` (`SetNull`) khi có thể import, và `@@index([projectId])`.
- Unique một phần viết bằng raw SQL `WHERE "deletedAt" IS NULL`. FK tới bảng cha theo dự án dùng `onDelete: Restrict`. CHECK constraint viết bằng raw SQL trong `migration.sql`.
- Migration là thư mục `prisma/migrations/<ts>_<slug>/migration.sql`. Sao lưu DB trước khi migrate. Không đụng production (admin-pc); thử trên bản sao `localhost:3001` (container `ngoquyen-bansao-pg`, `ngoquyen-bansao-erp`).
- Nếu model mới có `importRunId`, phải đăng ký vào `lib/import/import-run-store.ts` (`IMPORT_TAGGED_TABLES`).

### Stack

- Next.js 16 App Router (`params` là Promise; đọc `node_modules/next/dist/docs/` trước khi viết code), Prisma 7 với client audit mở rộng trong `lib/prisma.ts`, PostgreSQL 16, vitest, pnpm.
- Integration test nằm ở `test/integration/*.integration.test.ts`.
- Trả lời người dùng bằng tiếng Việt; comment code bằng tiếng Việt như repo đang làm.
