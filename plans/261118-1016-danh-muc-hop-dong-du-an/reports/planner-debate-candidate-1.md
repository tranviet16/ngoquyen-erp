# Candidate plan #1 — Danh mục hợp đồng dự án (lăng kính: dùng lại tối đa, ít thay đổi nhất)

Ngày: 2026-11-18. Đầu vào: `plans/reports/brainstorm-261118-0910-danh-muc-hop-dong-du-an.md` và `reports/debate-evidence-packet.md`. Mọi trích dẫn `file:line` dưới đây là của `origin/main` (685610e), trừ khi ghi khác.

## 1. Kết quả và cách đạt được (tóm tắt)

Toàn bộ phạm vi đã chốt được giao bằng **1 migration, 2 bảng mới, 4 cột mới trên `project_contracts`, 1 route API, 3 tệp service mới, 2 tệp lõi tính toán**. Không đổi tên cột nào, không sửa import adapter, không tạo tab mới.

Ba quyết định giữ thay đổi nhỏ:

1. **Tổng lấy từ `queryDetailReport`, danh sách lấy từ một truy vấn dòng dùng chung fragment.** Đầu kỳ, phát sinh, đã trả, cuối kỳ của cặp đối tác × công trình đến thẳng từ `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:106`). Danh sách chi tiết là một `SELECT` dòng `ledger_transactions` gắn `increaseSql`/`decreaseSql` (`lib/ledger/transaction-classification.ts:75,96`) cho từng dòng. Hàm thuần cộng danh sách rồi so với số của báo cáo theo từng Chủ thể. Vì hai bên dùng cùng fragment trên cùng tập dòng, tổng khớp từng đồng theo cấu trúc. Nếu lệch (chỉ xảy ra khi ai đó sửa một bên), màn hiện băng cảnh báo thay vì im lặng sai.
2. **Giữ tên cột `valueVnd`**, chỉ đổi nhãn thành "Giá trị theo DT" và ghi chú trong schema. Lý do: import adapter ghi `"valueVnd"` bằng raw INSERT (`lib/import/adapters/du-an-xay-dung.adapter.ts:682`). Đổi tên thì phải sửa adapter, rollback và mọi chỗ đọc, mà không thêm giá trị nghiệp vụ.
3. **Sổ hóa đơn xuất CĐT đặt ngay trong màn chi tiết hợp đồng CĐT.** Đây là nơi duy nhất dùng sổ này (theo gợi ý của evidence packet), nên không phải sửa nav ở `app/(app)/du-an/[id]/layout.tsx:9,17`.

Thứ tự phụ thuộc: P1 → (P2 ∥ P3 ∥ P4) → P5 → P6. Tổng công ước tính 22h.

## 2. Kiến trúc

### 2.1 Schema (một migration `prisma/migrations/20261118120000_du_an_contract_catalog/migration.sql`)

**`project_contracts` thêm 4 cột nullable** (model ở `prisma/schema.prisma:504`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `partyKind` | `TEXT NULL` | `ncc` \| `doi_thi_cong` \| `cdt` \| NULL |
| `supplierId` | `INTEGER NULL` | FK `suppliers(id)` `ON DELETE RESTRICT`, index |
| `contractorId` | `INTEGER NULL` | FK `contractors(id)` `ON DELETE RESTRICT`, index |
| `valueTtVnd` | `DECIMAL(18,2) NULL` | giá trị theo TT. `valueVnd` giữ nguyên và mang nghĩa giá trị theo DT |

Hai CHECK viết tay trong `migration.sql`:

```sql
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_party_key_check" CHECK (
     ("partyKind" IS NULL          AND "supplierId" IS NULL     AND "contractorId" IS NULL)
  OR ("partyKind" = 'ncc'          AND "supplierId" IS NOT NULL AND "contractorId" IS NULL)
  OR ("partyKind" = 'doi_thi_cong' AND "contractorId" IS NOT NULL AND "supplierId" IS NULL)
  OR ("partyKind" = 'cdt'          AND "supplierId" IS NULL     AND "contractorId" IS NULL));
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_party_doc_type_check"
  CHECK ("partyKind" IS NULL OR "docType" = 'contract');
```

Không có `entityId`. Evidence packet đã kiểm: cả 77 cặp NCC × công trình chỉ có 1 Chủ thể. Hợp đồng cộng mọi Chủ thể của cặp; nếu cặp có từ 2 Chủ thể, màn chi tiết hiện băng báo.

Hợp đồng `docType = contract` mà `partyKind` NULL (ví dụ hợp đồng nhập từ file cũ) được coi là "chưa gắn đối tác". Màn chi tiết hiện thông tin, scan và lời nhắc "Gắn đối tác để xem số liệu".

**Bảng mới `project_contract_attachments`** (theo khuôn `TaskAttachment`, `prisma/schema.prisma:1555`):

- Các cột: `id SERIAL`, `contractId INT NOT NULL`, `uploaderId TEXT NOT NULL` (FK user), `filename TEXT`, `storedPath TEXT`, `mimeType TEXT`, `sizeBytes INT`, `createdAt`.
- FK `contractId → project_contracts` dùng **`ON DELETE RESTRICT`**, không dùng Cascade như TaskAttachment. Hợp đồng chỉ bị xóa cứng khi hoàn tác import (`lib/import/import-rollback.ts:136`). Lỗi FK 23503 khi đó đã được đổi thành `RollbackBlockedError` kèm câu tiếng Việt (`lib/import/import-rollback.ts:27,213`), nên bản scan không bị xóa âm thầm.
- `@@index([contractId, createdAt])`.
- CHECK `"mimeType" IN ('application/pdf','image/jpeg','image/png') AND "sizeBytes" BETWEEN 1 AND 26214400`. Đây là lớp phòng thủ thứ hai, sau kiểm tra ở service.
- Không có `deletedAt`: xóa scan là xóa cứng dòng và tệp, giống `deleteAttachment` (`lib/task/attachment-service.ts:142-153`).

**Bảng mới `project_cdt_invoices`** (sổ hóa đơn xuất cho CĐT), theo quy ước của DT-HĐ-TT:

- Các cột: `id`, `projectId INT NOT NULL` (FK `projects` `RESTRICT`), `invoiceDate TIMESTAMP(3) NOT NULL`, `invoiceNo TEXT NOT NULL`, `amountVnd DECIMAL(18,2) NOT NULL` (chưa VAT), `vatVnd DECIMAL(18,2) NOT NULL DEFAULT 0`, `acceptanceBatch TEXT NULL`, `note`, `deletedAt`, `createdAt`, `updatedAt @updatedAt`.
- `acceptanceBatch` là chữ tự do, khớp kiểu chữ của `ProjectAcceptance.acceptanceBatch`; không làm FK.
- `@@index([projectId])`.
- Không có `importRunId`, vì sổ này không có đường import, nên cũng không phải đăng ký `IMPORT_TAGGED_TABLES`.
- Không đặt unique cho số hóa đơn, vì hai ký hiệu mẫu có thể trùng số.

Back-relation Prisma cần thêm ở `Supplier`, `Contractor`, `User`, `Project`.

### 2.2 Luồng dữ liệu của màn chi tiết

```
page.tsx (requireModuleAccess du-an read, phạm vi project)
  → getContractDetail(projectId, contractId)        [lib/du-an/contract-service.ts, "use server", guard read]
      → prisma.projectContract (+ attachments, supplier/contractor name) — 404 nếu deletedAt hoặc khác projectId
      → nhóm hợp đồng cùng đối tác (đếm, Σ valueVnd, Σ valueTtVnd)
      → loadLedgerSource | loadCdtSource              [lib/du-an/contract-detail/load-sources.ts, KHÔNG "use server"]
      → buildContractDetail(input)                     [lib/du-an/contract-detail/aggregate.ts, thuần]
  → props đã serialize (chuỗi Decimal) → client components
```

**Adapter sổ công nợ (NCC = `material`, đội thi công = `labor`):** một hàm `loadLedgerSource(ledgerType, partyId, projectId)` dùng cho cả hai loại (DRY). Hàm chạy song song hai truy vấn:

1. `queryDetailReport({ ledgerType, projectIds: [projectId], showZero: true })` rồi lọc `partyId`. Kết quả cho mỗi Chủ thể: `openingTt/Hd`, `phatSinhTt/Hd`, `daTraTt/Hd`, `cuoiKyTt/Hd` (`balance-report-service.ts:24-41`). Gọi không có `from`/`to` nên đầu kỳ chính là số dư ban đầu, giống báo cáo lũy kế mặc định.
2. Truy vấn dòng:
   ```sql
   SELECT id, date, "transactionType", "entityId", "invoiceNo", "invoiceDate", content, qty,
          "deliveryId", "paymentRoundItemId",
          ${increaseSql("totalTt")} AS inc_tt, ${increaseSql("totalHd")} AS inc_hd,
          ${decreaseSql("totalTt")} AS dec_tt, ${decreaseSql("totalHd")} AS dec_hd
   FROM ledger_transactions
   WHERE "ledgerType" = ${ledgerType} AND "partyId" = ${partyId}
     AND "projectId" = ${projectId} AND "deletedAt" IS NULL
   ORDER BY date, id
   ```
   Tập dòng này trùng với CTE `tx` của báo cáo khi không có cửa sổ ngày (`balance-report-service.ts:144-157`).

**Cách dựng ba danh sách cho NCC và đội thi công** (trong `aggregate.ts`):

- **Lấy hàng** (với đội: "Khối lượng / phát sinh"): các dòng `inc_tt ≠ 0`, tức `lay_hang`, `thue_hd` (Σ TT 12,8 triệu) và `dieu_chinh` dương. Nhãn loại dùng `TRANSACTION_TYPE_LABELS` (`transaction-classification.ts:17`). Nếu `openingTt ≠ 0`, dòng đầu tiên là "Số dư đầu kỳ (chuyển sang)".
- **Lấy hóa đơn:** các dòng `inc_hd ≠ 0`.
  - Dòng có `invoiceNo` thì gộp theo số hóa đơn đã chuẩn hóa (trim, gộp khoảng trắng, viết hoa). Mỗi nhóm hiện 1 dòng: ngày = `invoiceDate`, nếu không có thì ngày nhỏ nhất của nhóm; kèm số dòng gốc.
  - Dòng không có `invoiceNo` (62/115 dòng trên bản sao) hiện riêng từng dòng, nhãn "Chưa ghi số HĐ" và nội dung `content`.
  - Nếu `openingHd ≠ 0` thì có dòng đầu kỳ HĐ ở trên cùng.
  - Cách này không bỏ sót đồng nào và không bịa số hóa đơn.
- **Chuyển tiền:** các dòng `dec_tt ≠ 0` hoặc `dec_hd ≠ 0`, tức `thanh_toan` và `dieu_chinh` âm. Danh sách có **hai cột TT và HĐ**, vì `thanh_toan` mang hai số khác nhau ở 162 dòng. Nhãn nguồn là "Đợt thanh toán" khi có `paymentRoundItemId`, "Điều chỉnh giảm" khi là `dieu_chinh`.

**Số dư đầu kỳ và `dieu_chinh` khớp với báo cáo như sau:**

- Σ lấy hàng TT = `openingTt + phatSinhTt`; dòng tổng ghi rõ "gồm đầu kỳ A + phát sinh B".
- Σ hóa đơn = `openingHd + phatSinhHd`.
- Σ chuyển tiền TT/HĐ = `daTraTt` / `daTraHd`.
- Còn phải trả theo thực tế = Σ lấy hàng TT − Σ chuyển tiền TT = `cuoiKyTt` (AC2).
- Còn phải trả theo hóa đơn = Σ hóa đơn − Σ chuyển tiền HĐ = `cuoiKyHd`.
- Hóa đơn còn phải lấy = Σ lấy hàng TT − Σ hóa đơn.
- Đối chiếu (`reconciled`): với **từng Chủ thể**, `toFixed(0)` của Σ danh sách phải bằng chuỗi của báo cáo. So theo Chủ thể vì báo cáo làm tròn theo từng dòng Chủ thể (`balance-report-service.ts:88-90`).

Đặt đầu kỳ vào danh sách giữ được nguyên văn ba công thức người dùng đưa ra mà vẫn khớp số dư cuối. Khi đầu kỳ ≠ 0, khối "chưa thực hiện" có chú thích: lũy kế gồm số dư đầu kỳ, mà số này là phần còn nợ trước khi dùng phần mềm, không phải toàn bộ giá trị đã giao.

**Adapter CĐT** (`loadCdtSource(projectId)`), không có đầu kỳ:

- **Lấy hàng = nghiệm thu:** `project_acceptances` có `deletedAt IS NULL` và `amountCdtVnd ≠ 0`. Ngày lấy `acceptedAt`; nếu không có thì hiện "chưa có ngày nghiệm thu" và xếp cuối. Nhãn là `acceptanceBatch` và `checkItem`.
- **Lấy hóa đơn:** `project_cdt_invoices` chưa xóa; số dùng trong công thức là `amountVnd + vatVnd` (đã gồm VAT, cùng quy ước `totalTt`/`totalHd` của sổ công nợ).
- **Chuyển tiền:** `project_3way_cashflows` chưa xóa, lấy `flowDirection = 'cdt_to_cty'` (mọi `category`, kể cả tạm ứng) với dấu **+**, và `flowDirection = 'cty_to_cdt'` với dấu **−**, nhãn "Hoàn trả CĐT". Như vậy danh sách cho ra số tiền thực nhận ròng từ CĐT. Các chiều `cty_to_doi`, `doi_to_cty`, `doi_refund` không đọc. Phía đội thi công chỉ đọc sổ nhân công, không đọc `cty_to_doi`, để tránh đếm trùng.
- TT và HĐ của chuyển tiền là cùng một số.
- UI đổi nhãn theo chiều nghiệp vụ: "Còn phải thu theo thực tế / theo hóa đơn", "Hóa đơn còn phải xuất".

**Khối phần hợp đồng chưa thực hiện** (dùng giá trị của cả nhóm khi có từ 2 hợp đồng):

- Dòng 1: giá trị TT − Σ lấy hàng TT.
- Dòng 2: giá trị − Σ hóa đơn, hiện hai cột "theo DT" và "theo TT".
- Dòng 3: giá trị − Σ chuyển tiền TT, hiện hai cột "theo DT" và "theo TT".
- Cột thiếu giá trị (NULL ở bất kỳ hợp đồng nào trong nhóm) ghi "Chưa nhập giá trị" thay cho số (AC4). Số âm hợp lệ (vượt hợp đồng) hiện bình thường, không cảnh báo, vì cảnh báo vượt giá trị là non-goal.

**Băng báo** (AC5):

- "Gộp chung N hợp đồng với đối tác này trên công trình", kèm Σ giá trị DT/TT của nhóm.
- "Cặp này có giao dịch dưới N Chủ thể; số đã cộng chung".
- "Tổng danh sách lệch báo cáo công nợ", khi `reconciled = false`.

**Cột công nợ ở danh mục:** `listContracts` gọi tối đa hai lần `queryDetailReport` cho cả công trình (material, labor) và một truy vấn Σ của CĐT. Mỗi hợp đồng gắn đối tác nhận `Σ cuoiKyTt` của cặp mình (với CĐT là còn phải thu). Hợp đồng không gắn đối tác hiện "—". Số truy vấn cố định, không có N+1.

### 2.3 Route, action và ACL

| Thao tác | Nơi | Mức quyền (`du-an`, phạm vi project) |
|---|---|---|
| Xem danh mục | `hop-dong/page.tsx` (sẵn có) + `listContracts` | read |
| Xem chi tiết | `hop-dong/[contractId]/page.tsx` + `getContractDetail` | read |
| Danh sách đội thi công cho picker | `listContractorOptions` (mới, trong `contract-service.ts`) | read |
| Danh sách NCC cho picker | dùng lại `listSupplierOptions` (`lib/du-an/dt-hd-tt/invoice-service.ts:103`) | read |
| Thêm hợp đồng | `createContract` | create |
| Sửa / xóa mềm hợp đồng | `updateContract`, `softDeleteContract` | edit |
| Tải scan lên / xóa scan | `lib/du-an/contract-attachment-service.ts` | edit |
| Xem / tải scan | `GET app/api/du-an/[id]/hop-dong/[contractId]/tep/[attId]/route.ts` | read |
| Thêm hóa đơn CĐT | `lib/du-an/cdt-invoice-service.ts` `createCdtInvoice` | create |
| Sửa / xóa hóa đơn CĐT | `updateCdtInvoice`, `softDeleteCdtInvoice` | edit |

Quy tắc chung:

- Mọi action ghi mới trả `ActionResult` qua `runEntryAction` (`lib/du-an/dt-hd-tt/entry-action-result.ts:22`), không ném lỗi. Lý do: bản production chỉ gửi `digest` của lỗi ném, nên câu từ chối tiếng Việt của AC6 sẽ mất nếu ném.
- Mỗi hàm export async trong tệp "use server" dưới `lib/du-an/` phải gọi trực tiếp `await requireReleasedModuleRequest("du-an", …)`. Test `module-release-entrypoints.test.ts:134-161` kiểm điều này theo từng hàm.
- **Không lộ dòng của công trình khác:** mọi action theo id đọc dòng trước với `where: { id, projectId, contract.deletedAt: null }`. Nếu không thấy thì trả `rowGone(...)` (`entry-action-result.ts:33`).

**Route tải scan, chống IDOR:**

- `projectId` lấy từ URL. Lần gọi guard **duy nhất** là `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`, đặt **trước** mọi truy vấn. Test entrypoints đòi số guard bằng số hàm export (`module-release-entrypoints.test.ts:122`).
- Sau đó tìm `projectContractAttachment` với điều kiện đồng thời `id = attId`, `contractId`, `contract.projectId = projectId`, `contract.deletedAt = null`. Không thấy thì trả 404.
  - Người dùng có quyền ở dự án A mà đưa id scan của dự án B vào URL của A thì nhận 404.
  - Đưa URL của B thì nhận 403.
  - Người chưa đăng nhập không thể dò xem id nào tồn tại.
- Gọi `store.exists` (`lib/storage/local-disk.ts:67`) trước `getStream`; mất tệp trên đĩa thì trả 404, không làm stream lỗi giữa chừng.
- Header theo route task (`app/api/tasks/[id]/attachments/[attId]/route.ts`): `Content-Disposition: inline` kèm `filename*` RFC 5987, `Cache-Control: private, no-store`. Phần ánh xạ lỗi dùng `moduleRequestStatus`.

**Đường tải lên:**

- Server action `uploadContractAttachment(formData)`. `bodySizeLimit` đã là `25mb` (`next.config.ts`, `experimental.serverActions`).
- Các bước kiểm tra: kích thước ≤ `MAX_ATTACHMENT_BYTES`, dùng lại hằng `lib/task/attachment-service.ts:12`; MIME thuộc `pdf/jpeg/png`; `validateMagicBytes` (`lib/task/file-signature.ts`).
- Đường lưu là `contract-attachments/{projectId}/{contractId}/{uuid}-{safeFilename}` qua `store.putFile` (`lib/storage/index.ts`). Nếu tạo dòng DB lỗi thì xóa tệp vừa ghi, giống `attachment-service.ts:134-138`.

## 3. Các phase

### Phase 1 — Nhánh, schema, migration, zod, sửa service hợp đồng (3h)

**Mục tiêu:** cột, bảng và CHECK có trong DB; service hợp đồng ghi được đối tác có mã mà không làm mất dữ liệu khi sửa trên lưới.

**Tiền đề nhánh:** PR #21 (picker tạo nhanh) có base là `fix/master-data-project-edit` (PR #12), và cả hai **chưa** vào `origin/main` (đã kiểm: a6fef44, 5c0dae8, 908b68c đều không phải tổ tiên của `origin/main`).
- Nếu cả hai đã merge: tạo `feat/du-an-danh-muc-hop-dong` từ `origin/main`.
- Nếu chưa: tạo nhánh từ `feat/master-data-quick-create`, rồi `git rebase origin/main` (nhánh này chưa có DT-HĐ-TT), và ghi trong PR rằng PR phụ thuộc #12 và #21.

**Tệp:**

- Sửa `prisma/schema.prisma`: `ProjectContract` thêm 4 trường, các relation và back-relation; thêm 2 model mới; comment `valueVnd // giá trị theo DT`.
- Tạo `prisma/migrations/20261118120000_du_an_contract_catalog/migration.sql`: sinh bằng `prisma migrate dev --create-only`, rồi nối tay các CHECK.
- Tạo `plans/261118-1016-danh-muc-hop-dong-du-an/rollback-down.sql`: xem mục 5.
- Sửa `lib/du-an/schemas.ts:84`:
  - `docType` thành enum đủ 5 loại `contract|license|insurance|acceptance|other`. Hiện lưới ép kiểu `docType` (`hop-dong-client.tsx:156`), nên sửa một hợp đồng `insurance` đã import sẽ bị zod từ chối.
  - Thêm `partyKind`, `supplierId`, `contractorId`, `valueTtVnd`, kèm `superRefine` bằng câu tiếng Việt, cùng quy tắc với CHECK.
  - Thêm `cdtInvoiceSchema`.
- Sửa `lib/du-an/contract-service.ts`:
  - create/update ghi các trường mới.
  - **Khi update, các trường mới mang giá trị `undefined` thì giữ nguyên.** Bộ ba đối tác chỉ được ghi khi input có khóa `partyKind`.
  - Kiểm lại phía server rằng NCC/đội tồn tại và `deletedAt IS NULL`.
  - Ghi `updatedAt: new Date()`, vì model không có `@updatedAt`.
  - Thêm `listContractorOptions(projectId)` với guard read.

**Bước:** chạy `pnpm prisma validate`, rồi `prisma migrate dev --create-only`, nối CHECK, `prisma migrate dev` trên DB trống, `prisma generate`.

**Kiểm:**
- `pnpm tsc --noEmit`.
- `pnpm vitest run lib/du-an` (test zod: NCC thiếu `supplierId` bị từ chối, `license` mang `partyKind` bị từ chối).
- Thêm vào `test/integration/vat-tu-schema-constraints.integration.test.ts`, hoặc một tệp mới `test/integration/du-an-contract-schema.integration.test.ts`: chèn thô vi phạm CHECK phải lỗi 23514.

**Phụ thuộc:** không có.

### Phase 2 — Lõi tính toán và dữ liệu cho màn chi tiết / danh mục (5h)

**Mục tiêu:** `getContractDetail` và cột công nợ trong `listContracts` trả số khớp `queryDetailReport`.

**Tệp:**

- Tạo `lib/du-an/contract-detail/aggregate.ts`: thuần, không prisma, không "use server", dùng `Prisma.Decimal`. Gồm các kiểu `ContractDetailInput/Output`, hàm `buildContractDetail`, `groupInvoiceRows` và `reconcileByEntity`.
- Tạo `lib/du-an/contract-detail/load-sources.ts`: không "use server". Gồm `loadLedgerSource`, `loadCdtSource`, `loadDebtByContract(projectId, contracts)` (cho danh mục) và `loadContractGroup`.
- Sửa `lib/du-an/contract-service.ts`:
  - thêm `getContractDetail(projectId, contractId)` với guard read;
  - `listContracts` trả thêm `partyDisplayName` và `remainingDebt`.
- Tạo `lib/du-an/contract-detail/__tests__/aggregate.test.ts`.
- Tạo `test/integration/du-an-contract-detail.integration.test.ts`.

**Fixture của test thuần:**
- `lay_hang`: một dòng có `invoiceNo`, hai dòng cùng `invoiceNo`, một dòng thiếu `invoiceNo`;
- `thue_hd` có TT ≠ 0, HĐ = 0;
- `thanh_toan` có TT ≠ HĐ;
- `dieu_chinh` +5 và −3 (cả TT và HĐ);
- một `dieu_chinh` có TT dương, HĐ âm;
- đầu kỳ âm và dương;
- hai Chủ thể;
- nhóm 2 hợp đồng, có và không có giá trị NULL.

**Kiểm (test thuần):** ba công thức công nợ, nhóm hóa đơn, `reconciled`, nhánh "Chưa nhập giá trị", CĐT có `cty_to_cdt` âm.

**Kiểm (integration, DB Postgres thật theo harness hiện có):**
- seed sổ vật tư cho một cặp;
- Σ danh sách = các trường của `queryDetailReport`; còn phải trả TT/HĐ = `cuoiKyTt`/`cuoiKyHd`;
- sổ nhân công rỗng cho ra 0, chèn một dòng nhân công thì số hiện đúng;
- CĐT rỗng cho ra 0, chèn một nghiệm thu, một `cdt_to_cty`, một `cty_to_cdt`, một hóa đơn CĐT thì số hiện đúng;
- hợp đồng của dự án khác hoặc đã xóa mềm thì không đọc được.

**Phụ thuộc:** P1.

### Phase 3 — Sổ hóa đơn xuất CĐT (service) (2h)

**Mục tiêu:** ghi, sửa, xóa mềm hóa đơn CĐT, có ACL và audit.

**Tệp:**
- Tạo `lib/du-an/cdt-invoice-service.ts` ("use server"): `createCdtInvoice`, `updateCdtInvoice`, `softDeleteCdtInvoice`. Cả ba dùng `runEntryAction`, guard create/edit, tìm dòng theo `{ id, projectId, deletedAt: null }`, và `revalidatePath('/du-an/{id}/hop-dong', 'layout')`.
- Tạo `test/integration/du-an-cdt-invoice.integration.test.ts`.

**Kiểm:**
- Người có quyền read khi ghi nhận `ok:false` kèm câu tiếng Việt.
- Người có quyền create thêm được nhưng không sửa được.
- Sửa id của dự án khác trả `rowGone`.
- Ghi tạo dòng `audit_logs`, vì model được audit mặc định: `SKIP_AUDIT` chỉ chứa model auth (`lib/prisma.ts:37`).

**Phụ thuộc:** P1. Chạy song song được với P2 và P4; không chung tệp.

### Phase 4 — Bản scan: service, route tải, risk manifest (4h)

**Mục tiêu:** tải lên, xem/tải về, xóa scan, có ACL và chống IDOR; `risk:verify` xanh.

**Tệp:**
- Tạo `lib/du-an/contract-attachment-service.ts` ("use server"): `uploadContractAttachment(formData)` và `deleteContractAttachment(projectId, attachmentId)`. Cả hai dùng `runEntryAction` và guard edit; tệp không thể xóa thì bỏ qua lỗi, giống mẫu task.
- Tạo `app/api/du-an/[id]/hop-dong/[contractId]/tep/[attId]/route.ts` (chỉ GET, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `params` là Promise như route task).
- Sửa `test/risk-manifest.ts`: thêm bản ghi `api-project-contract-attachment`, `operation: "GET"`, `tier: "P0"`, `dataClassification: "confidential"`, authorization `"released du-an module, read access scoped to the requested project; attachment must belong to a live contract of that project"`, `requiredTests` đủ 5 loại.
- Sửa `test/unit/module-release-entrypoints.test.ts`: thêm route vào `API_MODULES` với `"du-an"`.
- Sửa `test/unit/module-release-api-contract.test.ts`: khi guard bị từ chối thì trả 503 và không gọi prisma.
- Tạo `test/integration/du-an-contract-attachment.integration.test.ts`.

**Kiểm (integration):**

| Loại | Ca kiểm |
|---|---|
| allow | read → 200, đúng `Content-Type` |
| deny | không có quyền dự án → 403; chưa đăng nhập → 401 |
| cross-scope | id scan của B qua URL của A → 404; `contractId` không khớp → 404 |
| — | hợp đồng xóa mềm → 404 |
| upload | read upload → `ok:false`; `.exe`/sai magic → `ok:false` "Loại tệp không được phép"; 25MB + 1 byte → `ok:false` |
| audit | upload tạo `audit_logs` |
| recovery | mất tệp trên đĩa → 404; xóa scan xóa cả dòng lẫn tệp; hoàn tác import của hợp đồng có scan → `RollbackBlockedError` |

Chạy thêm `pnpm risk:verify`.

**Phụ thuộc:** P1.

### Phase 5 — UI: danh mục, form, màn chi tiết, sổ hóa đơn CĐT (6h)

**Mục tiêu:** AC1, AC4–AC7 thấy được trên giao diện.

**Tệp:**

- Sửa `app/(app)/du-an/[id]/hop-dong/page.tsx`: tải thêm danh sách NCC/đội thi công cho picker.
- Sửa `app/(app)/du-an/[id]/hop-dong/hop-dong-client.tsx`:
  - thêm cột Đối tác (tên có mã ưu tiên, nếu không thì `partyName`), Giá trị theo DT, Giá trị theo TT, Công nợ còn lại;
  - tên tài liệu là link `/du-an/{id}/hop-dong/{contractId}`;
  - **`patchContract` (dòng 151-180) mang theo `partyKind`, `supplierId`, `contractorId`, `valueTtVnd` của dòng hiện tại.**
- Sửa `app/(app)/du-an/[id]/hop-dong/hop-dong-form.tsx`:
  - select loại đối tác, chỉ hiện khi `docType = contract`;
  - picker NCC/đội dùng `useOptionsWithCreated`, `QuickCreateOption`, `useQuickCreatePick` (`components/master-data/quick-create/quick-create-provider.tsx` trên nhánh #21);
  - nhãn "Giá trị theo DT", ô "Giá trị theo TT";
  - đủ 5 loại tài liệu.
- Tạo `app/(app)/du-an/[id]/hop-dong/[contractId]/page.tsx` (server, `requireModuleAccess("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`, `notFound()` khi không có).
- Tạo `.../[contractId]/contract-detail-client.tsx`: thông tin, nút sửa (dùng lại `ContractForm`), băng báo.
- Tạo `.../[contractId]/contract-attachments.tsx`: danh sách, tải lên, xóa.
- Tạo `.../[contractId]/contract-ledger-lists.tsx`: ba danh sách, dòng tổng, nhãn nguồn ("Sổ công nợ vật tư", "Sổ công nợ nhân công", "Nghiệm thu / Dòng tiền 3 bên / Sổ hóa đơn xuất CĐT").
- Tạo `.../[contractId]/contract-summary-blocks.tsx`: khối công nợ và khối chưa thực hiện.
- Tạo `.../[contractId]/cdt-invoice-editor.tsx`: bảng hóa đơn CĐT, thêm/sửa/xóa theo `canCreate`/`canEdit`.
- Sửa `test/unit/module-release-entrypoints.test.ts`:
  - thêm trang mới vào `PROJECT_PAGE_FILES` (dòng 39-58);
  - thêm khẳng định `load-sources.ts` và `aggregate.ts` không phải "use server".

**Quy tắc hiển thị:**
- `partyKind` NULL hoặc `docType ≠ contract` thì chỉ hiện thông tin và scan (AC7).
- Không gọi `getContractDetail` phần số cho các hợp đồng này; service trả `figures: null`.

**Kiểm:** `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`.

**Phụ thuộc:** P2, P3, P4.

### Phase 6 — Kiểm trên bản sao, tài liệu, chuẩn bị go-live (2h)

**Mục tiêu:** đối chiếu thật trên `localhost:3001`; sẵn sàng phát hành, chưa đụng production.

**Bước:**
1. `pg_dump` container `ngoquyen-bansao-pg` ra `backups/` (không commit), rồi `prisma migrate deploy` lên bản sao.
2. Tạo hợp đồng NCC cho một cặp của dự án 1 và một cặp của dự án 4. So Σ lấy hàng TT, Σ hóa đơn, Σ chuyển tiền, còn phải trả với `/cong-no-vt` báo cáo lũy kế (lọc cùng công trình) và ghi số vào `reports/`.
3. Kiểm thử AC3 và AC6 bằng tay theo vai read, edit và không quyền.
4. Diễn tập rollback (mục 5) trên một bản sao thứ hai hoặc ngay bản sao sau khi dump, rồi khôi phục.
5. Cập nhật tài liệu người dùng của module Dự án, nếu có (`docs/user-guide/`).

**Kiểm:**
- `pnpm risk:verify && pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm test:integration`;
- kết quả đính vào `reports/`.

**Phụ thuộc:** P5.

## 4. Ma trận kiểm thử theo acceptance criteria

| AC | Unit (thuần) | Integration (DB thật) | Thủ công trên bản sao |
|---|---|---|---|
| 1 Mở chi tiết | — | `getContractDetail` đúng / 404 khi khác dự án | Bấm dòng mở `/hop-dong/[contractId]` |
| 2 Khớp từng đồng | 3 công thức, `reconcileByEntity`, đầu kỳ, `dieu_chinh` ±, `thue_hd` | Σ = `queryDetailReport`; còn phải trả = `cuoiKyTt` | Dự án 1 và 4 so với báo cáo lũy kế |
| 3 Đội / CĐT rỗng rồi có số | CĐT: `cty_to_cdt` trừ | Rỗng = 0; chèn 4 loại thì số hiện đúng | Nhập thử mỗi loại một dòng |
| 4 Phần chưa thực hiện | NULL thì "Chưa nhập giá trị"; giá trị nhóm | — | Hợp đồng không giá trị |
| 5 Gộp nhiều hợp đồng | groupCount ≥ 2, Σ giá trị | `loadContractGroup` bỏ hợp đồng xóa mềm | Tạo 2 hợp đồng cùng NCC |
| 6 Scan | — | allow/deny/cross-scope/xóa mềm/sai loại/quá cỡ/audit/recovery | Vai read không thấy nút tải lên |
| 7 Hợp đồng không kinh tế | `figures: null` | CHECK `party_doc_type` | Giấy phép chỉ có thông tin + scan |
| 8 `valueVnd` là DT, rollback | zod | CHECK 23514; dữ liệu cũ giữ nguyên | Diễn tập `rollback-down.sql` |
| 9 Cổng CI | `pnpm test` | `pnpm test:integration` | `risk:verify`, `tsc`, `lint` |

Phần sửa lưới hợp đồng có thêm một unit test riêng, vì đây là lỗi dễ tái phát nhất: patch chỉ đổi `docName` vẫn gửi đủ bộ ba đối tác. Service cũng phải giữ nguyên bộ ba khi input thiếu khóa `partyKind`.

## 5. Migration, rollback, sao lưu, an toàn production

**Migration chỉ thêm:** 4 cột nullable, 2 bảng, 2 FK `RESTRICT`, 3 CHECK. Không có `UPDATE` dữ liệu. Dữ liệu `valueVnd` đứng nguyên chỗ và hiện ở ô "Giá trị theo DT" (AC8). CHECK mới đúng với mọi dòng cũ vì cả 3 cột đối tác đều NULL. Trên bảng nhỏ, migration chạy dưới một giây.

**`rollback-down.sql`** (để trong thư mục plan, không đặt trong thư mục migration để Prisma không đọc nhầm):

```sql
BEGIN;
DROP TABLE IF EXISTS "project_cdt_invoices";
DROP TABLE IF EXISTS "project_contract_attachments";
ALTER TABLE "project_contracts"
  DROP CONSTRAINT IF EXISTS "project_contracts_party_key_check",
  DROP CONSTRAINT IF EXISTS "project_contracts_party_doc_type_check",
  DROP CONSTRAINT IF EXISTS "project_contracts_supplierId_fkey",
  DROP CONSTRAINT IF EXISTS "project_contracts_contractorId_fkey",
  DROP COLUMN IF EXISTS "partyKind", DROP COLUMN IF EXISTS "supplierId",
  DROP COLUMN IF EXISTS "contractorId", DROP COLUMN IF EXISTS "valueTtVnd";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261118120000_du_an_contract_catalog';
COMMIT;
```

Sau đó revert build về commit trước. Rollback làm mất liên kết đối tác, giá trị TT, danh sách scan và hóa đơn CĐT, vì vậy phải `pg_dump` ngay trước khi rollback. Tệp scan nằm lại trong `UPLOAD_DIR/contract-attachments/` và có thể khôi phục.

**Rollback theo phase:**
- P2 và P5 chỉ là code: revert commit.
- P3 và P4 tạo dữ liệu mới: revert code, dữ liệu nằm im vô hại cho tới khi chạy `rollback-down.sql`.
- P1 là schema, dùng SQL ở trên.

**Production (admin-pc): không đụng trong đợt này.** Thứ tự go-live được ghi riêng trong runbook:
1. đếm `SELECT count(*), count("valueVnd") FROM project_contracts WHERE "deletedAt" IS NULL`;
2. xác nhận với người dùng rằng các giá trị đó là DT;
3. `pg_dump`;
4. `migrate deploy`;
5. kiểm dự án 1.

Không commit `Quản Lý Công Nợ/`, `.claude/agent-memory/`, `backups/`.

## 6. Năm rủi ro hàng đầu

| # | Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|---|
| 1 | Sửa trên lưới xóa mất liên kết đối tác, vì `patchContract` dựng lại toàn bộ input (`hop-dong-client.tsx:151-180`) và service hiện ghi `?? null` | Cao × Cao | Service: trường mới `undefined` thì giữ nguyên, bộ ba chỉ ghi khi có khóa `partyKind`. Client mang theo giá trị hiện tại. Unit test cho cả hai phía. |
| 2 | Tổng không khớp báo cáo công nợ, do ai đó sau này sửa fragment hoặc lọc của một bên | TB × Cao | Cả hai bên dùng chung `increaseSql`/`decreaseSql`, tổng lấy từ chính `queryDetailReport`. Có cờ `reconciled` trên màn và integration test so trực tiếp. |
| 3 | IDOR trên scan | TB × Cao | Guard project từ URL đặt trước mọi truy vấn, tìm theo điều kiện kép (scan × hợp đồng × dự án × chưa xóa). Có test cross-scope, bản ghi P0 trong manifest và CHECK MIME/kích thước ở DB. |
| 4 | Hoàn tác import một sổ có hợp đồng đã gắn scan, hoặc đã sửa liên kết | Thấp × TB | FK `RESTRICT` dẫn tới `RollbackBlockedError` sẵn có. Có thông điệp tiếng Việt và integration test. Liên kết đối tác do người dùng sửa sẽ mất khi hoàn tác: ghi vào hướng dẫn. |
| 5 | Phụ thuộc PR #12 và #21 chưa merge | Cao × TB | Nhánh dựng trên #21 rebase lên `origin/main`. PR ghi rõ phụ thuộc. Nếu #21 bị đổi API picker thì chỉ `hop-dong-form.tsx` phải sửa. |

Rủi ro phụ:

- **Lỗi ném từ server action bị che ở production:** đã xử lý bằng `runEntryAction`.
- **Danh sách dài:** một cặp có thể có vài trăm dòng, vì toàn sổ là 832 dòng `lay_hang` trên 11 dự án. Không phân trang, nhưng bảng có thanh cuộn và dòng tổng cố định.
- **Màn hợp đồng dùng quyền `du-an` để xem số công nợ NCC của chính công trình đó**, không đòi quyền `cong-no-vt`. Brainstorm đã chốt rằng ai đọc được dự án thì xem được, và tab `cong-no` của dự án đã hiện công nợ NCC theo cách tương tự (`lib/du-an/supplier-debt-service.ts`).

## 7. Giả định chưa kiểm

- [UNVERIFIED] Tab "Hợp đồng" trong `app/(app)/du-an/[id]/layout.tsx` vẫn sáng khi ở route con `/hop-dong/[contractId]`. Nếu nav so khớp đúng tuyệt đối thì phải sửa một dòng ở layout.
- [UNVERIFIED] `ProjectAcceptance.amountCdtVnd` là số đã gồm VAT, cùng cơ sở với tổng hóa đơn (chưa VAT + VAT).
- [UNVERIFIED] Không đọc được `node_modules/next/dist/docs/` (hook chặn). Quy ước `params: Promise<…>` cho route và page lấy từ code đang chạy: `app/api/tasks/[id]/attachments/[attId]/route.ts` và `hop-dong/page.tsx`. Người làm P4 và P5 phải đọc tài liệu route handler và dynamic segment trước khi code.
- [UNVERIFIED] Nhóm hóa đơn chỉ theo số hóa đơn, không theo ngày hóa đơn. Hai hóa đơn khác ký hiệu nhưng cùng số trong một cặp sẽ bị gộp; trên bản sao chưa đếm.
- Đã kiểm: `bodySizeLimit: "25mb"` có sẵn, `store.exists` có sẵn, `validateMagicBytes` hỗ trợ pdf/png/jpeg, và lỗi 23503 khi hoàn tác import đã được đổi thành `RollbackBlockedError`.

## 8. Câu hỏi còn mở

1. Ở khối "phần hợp đồng chưa thực hiện", hai dòng "giá trị hợp đồng − hóa đơn" và "giá trị hợp đồng − đã chuyển tiền" so với giá trị DT hay TT? Bản này hiện cả hai cột. Nếu người dùng chọn một thì bỏ cột kia.
2. "Đã chuyển tiền" trong khối chưa thực hiện của NCC lấy cột TT của `thanh_toan`. Ở 162 dòng TT ≠ HĐ, cột nào là tiền thật đã chi? Bản này giả định là TT.
3. Giá trị nghiệm thu với CĐT (`amountCdtVnd`) đã gồm VAT chưa? Câu trả lời quyết định "Hóa đơn còn phải xuất" so với tổng hay với phần chưa VAT của hóa đơn CĐT.
4. Đặt sổ hóa đơn CĐT trong màn hợp đồng CĐT nghĩa là dự án phải có ít nhất một hợp đồng CĐT mới nhập được hóa đơn. Người dùng có chấp nhận ràng buộc này không, hay cần thêm một lối vào ở tab Nghiệm thu?
5. Người có quyền create nhưng không có edit thì có được tải scan lên ngay lúc tạo hợp đồng không? Brainstorm nói tải lên cần edit; bản này giữ edit.
