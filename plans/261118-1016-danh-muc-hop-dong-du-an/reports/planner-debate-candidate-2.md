---
title: "Danh mục hợp đồng dự án: ứng viên 2 (đúng số và đối chiếu trước)"
description: "Hợp đồng gắn đối tác có mã, màn chi tiết đọc sổ gốc, mọi tổng phải khớp queryDetailReport hoặc tổng nghiệm thu/dòng tiền."
status: pending
priority: P2
effort: 30h
branch: feat/du-an-danh-muc-hop-dong (mở từ origin/main sau khi PR #21 merge)
tags: [du-an, hop-dong, cong-no, reconciliation, attachments]
created: 2026-11-18
---

# Ứng viên 2: đúng số và đối chiếu trước

## 1. Kết luận ngắn

Mọi con số trên màn chi tiết hợp đồng đi qua một hàm thuần duy nhất trong `lib/du-an/contract-detail/`. Hàm này không tự phân loại giao dịch: câu SQL lấy từng dòng sổ dùng chính các fragment `increaseSql` / `decreaseSql` (`lib/ledger/transaction-classification.ts`, trên origin/main) để tính sẵn bốn cột `incTt, incHd, decTt, decHd` cho mỗi dòng. Số tổng hiển thị lấy từ `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:113`), còn tổng của danh sách chi tiết được so lại với số đó ngay khi dựng trang. Nếu lệch, màn hiện băng đỏ và ghi log. Như vậy tiêu chí 2 được bảo đảm bằng ba lớp: cùng fragment SQL, test tie-out trên DB test, và script quét toàn bộ 99 cặp NCC × công trình trên bản sao.

Toàn bộ phạm vi đã duyệt đều được giữ: thêm cột cho đối tác và giá trị TT, bảng scan, sổ hóa đơn xuất CĐT, màn danh mục và màn chi tiết, ACL, khai báo risk-manifest.

## 2. Sự thật đã kiểm thêm (ngày 2026-11-18, bản sao `ngoquyen-bansao-pg`, chỉ chạy SELECT)

| Sự thật | Hệ quả cho thiết kế |
|---|---|
| Có 47 dòng sổ (chưa xóa) mang phần lẻ đồng. Dòng số dư đầu kỳ không có phần lẻ. | Báo cáo làm tròn `toFixed(0)` theo từng dòng Chủ thể × NCC × công trình (`balance-report-service.ts:94-96`). Hàm tổng hợp phải cộng chính xác theo từng Chủ thể rồi mới làm tròn, không làm tròn từng dòng. |
| Có 4 dòng `lay_hang` mang `totalTt` âm (trả hàng). | `increaseSql` trả nguyên giá trị âm của `lay_hang`, nên dòng âm vẫn nằm trong danh sách lấy hàng. Không lọc `> 0`. |
| Hai dòng `thue_hd` có TT (1,38 triệu và 11,448 triệu) và HĐ = 0. | `thue_hd` làm tăng nợ TT nhưng không phải là hàng. Xem công thức G và U1 ở mục 4. |
| Chưa có dòng `dieu_chinh` nào. Không có dòng nào mà TT và HĐ trái dấu. | Fixture phải tự dựng `dieu_chinh` dương, âm và trái dấu giữa hai cột. |
| Có 12 dòng sổ đã xóa mềm. | Câu SQL lấy dòng phải lọc `deletedAt IS NULL`, giống báo cáo. |
| Có 99 cặp NCC × công trình: 77 cặp có giao dịch và 22 cặp chỉ có số dư đầu kỳ. | Phải có test cho hợp đồng mà cặp chỉ có số đầu kỳ, và cho cặp không có gì. |
| Trong mỗi cặp, mỗi `invoiceNo` chỉ xuất hiện một lần, và cả 53 dòng có số hóa đơn đều là `lay_hang`. | Gom theo số hóa đơn vẫn làm, để phòng sau này một hóa đơn trải nhiều phiếu. Hôm nay mỗi nhóm có một dòng. |
| Một cặp có tối đa 157 dòng, trung vị là 2. | Không cần phân trang. |
| `project_contracts` chưa có FK tới `projects`, và trên bản sao có 0 dòng. | Thêm cột mới kiểu nullable thì an toàn. Không thêm FK tới projects vì nằm ngoài phạm vi. |
| Import rollback hard-delete `project_contracts` theo `importRunId` (`lib/import/import-rollback.ts:136`). Lỗi FK 23503 được đổi thành `RollbackBlockedError` có thông báo tiếng Việt (`import-rollback.ts:27,213`). | Dùng FK `Restrict` từ bảng scan về hợp đồng, nhờ vậy rollback tự bị chặn khi hợp đồng import đã có scan. Không cần sửa `import-rollback.ts`. |
| Sổ nhân công có `projectId` nullable (`schema.prisma:942`). | Dòng nhân công không gắn công trình không thuộc hợp đồng nào. Màn chi tiết đếm số dòng này và hiện băng thông tin. |
| Tab Nghiệm thu cộng `amountCdtVnd` của mọi dòng chưa xóa (`nghiem-thu-client.tsx:137`). `getCashflowSummary` tách riêng `cdtToCty` và `ctyToCdt` (`lib/du-an/cashflow-service.ts:17-40`). | Đây là hai mốc đối chiếu cho hợp đồng CĐT. |
| `next.config.ts` đặt `serverActions.bodySizeLimit: "25mb"`. Tải scan theo mẫu task đi qua server action. | Một tệp đúng 25MB cộng phần đầu multipart sẽ vượt giới hạn. Xem rủi ro 4. |

## 3. Kiến trúc

### 3.1 Thay đổi schema (một migration `20261118120000_du_an_hop_dong_doi_tac`)

**`project_contracts` (mở rộng):**
- `partyKind TEXT NULL`, `supplierId INT NULL`, `contractorId INT NULL`, `valueTtVnd DECIMAL(18,2) NULL`.
- Giữ tên cột `valueVnd`, chỉ đổi nghĩa thành "Giá trị theo DT" bằng comment Prisma và nhãn UI. Lý do: adapter import ghi cột này bằng raw INSERT (`lib/import/adapters/du-an-xay-dung.adapter.ts:681-687`). Đổi tên cột sẽ làm vỡ import mà không đổi được số nào. Tiêu chí 8 vẫn đạt vì dữ liệu không phải di chuyển.
- FK: `supplierId → suppliers(id) ON DELETE RESTRICT`, `contractorId → contractors(id) ON DELETE RESTRICT`. Hai danh mục này chỉ xóa mềm, nên Restrict chỉ chặn trường hợp xóa cứng bất thường.
- CHECK, viết bằng raw SQL trong `migration.sql`:
  - `project_contracts_party_kind_check`: `"partyKind" IS NULL OR "partyKind" IN ('ncc','doi_thi_cong','cdt')`.
  - `project_contracts_party_binding_check`: `(kind NULL, cả hai khóa NULL) OR (ncc, supplierId NOT NULL, contractorId NULL) OR (doi_thi_cong, contractorId NOT NULL, supplierId NULL) OR (cdt, cả hai khóa NULL)`.
  - `project_contracts_party_doc_type_check`: `"partyKind" IS NULL OR "docType" = 'contract'`. Ràng buộc này bảo đảm giấy phép, bảo hiểm, biên bản nghiệm thu và loại khác không bao giờ có khối số (tiêu chí 7).
  - `project_contracts_value_tt_nonneg`: `"valueTtVnd" IS NULL OR "valueTtVnd" >= 0`.
- Index một phần: `("projectId","supplierId") WHERE "deletedAt" IS NULL AND "supplierId" IS NOT NULL`, và tương tự cho `contractorId`. Không đặt unique, vì người dùng cho phép nhiều hợp đồng trên một cặp (khi đó màn hiện băng gộp).
- Adapter import không ghi các cột mới, nên các cột đó nhận NULL và mọi CHECK đều qua.

**Bảng mới `project_contract_attachments`** (model `ProjectContractAttachment`, theo khuôn `TaskAttachment` ở `schema.prisma:1555`):
- Cột: `id SERIAL`, `contractId INT NOT NULL → project_contracts(id) ON DELETE RESTRICT`, `uploaderId TEXT NOT NULL → users(id)`, `filename TEXT`, `storedPath TEXT UNIQUE`, `mimeType TEXT`, `sizeBytes INT`, `createdAt TIMESTAMP(3) DEFAULT now()`.
- CHECK `mimeType IN ('application/pdf','image/jpeg','image/png')` và `sizeBytes BETWEEN 1 AND 26214400`.
- Index `(contractId, createdAt)`.
- Bảng này không có `importRunId` (scan không import được), nên không đăng ký vào `IMPORT_TAGGED_TABLES`.

**Bảng mới `project_cdt_invoices`** (model `ProjectCdtInvoice`, là sổ gốc mới cho hóa đơn xuất CĐT):
- Cột: `id`, `projectId INT NOT NULL → projects(id) ON DELETE RESTRICT`, `invoiceDate TIMESTAMP(3) NOT NULL` (lưu 00:00 UTC như ngày trên sổ), `invoiceNo TEXT NOT NULL`, `amountVnd DECIMAL(18,2) NOT NULL` (chưa VAT), `vatVnd DECIMAL(18,2) NOT NULL DEFAULT 0`, `acceptanceBatch TEXT NULL` (chữ khớp với `ProjectAcceptance.acceptanceBatch`, không đặt FK vì đợt nghiệm thu là chữ), `note`, `deletedAt`, `createdAt`, `updatedAt @updatedAt`.
- CHECK `amountVnd >= 0`, `vatVnd >= 0` và `length(btrim("invoiceNo")) > 0`.
- Unique một phần `(projectId, "invoiceNo") WHERE "deletedAt" IS NULL` để chống nhập trùng. Zod trim số hóa đơn trước khi lưu.
- Index `(projectId, invoiceDate)`.

Back-relation Prisma cần thêm: `Supplier.projectContracts`, `Contractor.projectContracts`, `Project.cdtInvoices`, `User.contractAttachments`, `ProjectContract.attachments`.

### 3.2 Nguồn số và công thức chính xác

Ký hiệu: hợp đồng `K` thuộc dự án `P`, đối tác `X` (supplier hoặc contractor). Dòng sổ là `R = ledger_transactions WHERE ledgerType = L AND partyId = X AND projectId = P AND deletedAt IS NULL`, không cắt ngày và cộng mọi Chủ thể (theo evidence packet: 77/77 cặp chỉ có một Chủ thể). Với mỗi dòng `r`, SQL tính sẵn `incTt = increaseSql("totalTt")`, `incHd = increaseSql("totalHd")`, `decTt = decreaseSql("totalTt")` và `decHd = decreaseSql("totalHd")`. Không có literal loại giao dịch nào được viết lại trong TS. Riêng nhãn loại dòng dùng `TRANSACTION_TYPE_LABELS`.

**NCC (`L = material`) và đội thi công (`L = labor`) dùng cùng công thức:**

| Đại lượng | Công thức | Mốc đối chiếu (Σ qua các Chủ thể, từ `queryDetailReport({ledgerType: L, projectIds: [P], showZero: true})` lọc `partyId = X`) |
|---|---|---|
| Đầu kỳ `O_tt`, `O_hd` | Σ `balanceTt` / `balanceHd` của `ledger_opening_balances` cho `(L, ·, X, P)` | `openingTt`, `openingHd` |
| Danh sách A "Lấy hàng" | các dòng có `incTt ≠ 0` (gồm `lay_hang`, kể cả dòng âm; `thue_hd`; `dieu_chinh` dương ở cột TT). Cột tiền là `incTt`; cột HĐ để tham khảo. | — |
| `ΣA` (Σ lấy hàng TT) | Σ `incTt` | `phatSinhTt` |
| `T` (trong đó thuế HĐ) | Σ `incTt` của các dòng `thue_hd` | hiện như một dòng phụ của A |
| Danh sách B "Lấy hóa đơn" | các dòng có `incHd ≠ 0`. Gom theo khóa `btrim(invoiceNo)` khi khóa khác rỗng; dòng không có số hóa đơn đứng riêng, nhãn "Chưa ghi số HĐ" kèm ngày và nội dung. Nhóm hiện số HĐ, ngày HĐ nhỏ nhất (lấy `invoiceDate`, nếu trống thì `date`), số dòng và Σ `incHd`. | — |
| `ΣB` (Σ hóa đơn) | Σ `incHd` (bằng Σ các nhóm) | `phatSinhHd` |
| Danh sách C "Chuyển tiền" | các dòng có `decTt ≠ 0` hoặc `decHd ≠ 0` (`thanh_toan`; `dieu_chinh` âm, nhãn "Điều chỉnh giảm"). Có hai cột TT và HĐ. | — |
| `ΣC_tt`, `ΣC_hd` | Σ `decTt`, Σ `decHd` | `daTraTt`, `daTraHd` |
| Còn phải trả theo thực tế `D_tt` | `O_tt + ΣA − ΣC_tt` | `cuoiKyTt` (tiêu chí 2) |
| Còn phải trả theo hóa đơn `D_hd` | `O_hd + ΣB − ΣC_hd` | `cuoiKyHd` |
| Hóa đơn còn phải lấy `G` | `(ΣA − T) − ΣB` | không có mốc; test thuần |

Một dòng `dieu_chinh` có TT và HĐ trái dấu sẽ xuất hiện ở A (phần TT) và ở C (phần HĐ). Cách chia này đúng như fragment SQL làm, nên tổng vẫn khớp.

Số đầu kỳ hiện thành dòng riêng "Số dư đầu kỳ (ngày `asOfDate`)" trong khối công nợ, và chỉ đi vào `D_tt` / `D_hd`. Số đầu kỳ là số dư ròng nên không tách được phần lấy hàng, hóa đơn hay đã trả. Vì vậy khi `O_tt ≠ 0` hoặc `O_hd ≠ 0`, các số G, U1, U2, U3 mang chú thích: "Chỉ tính giao dịch từ sau số dư đầu kỳ".

**CĐT (`partyKind = cdt`, khóa theo dự án):**

| Đại lượng | Công thức | Mốc đối chiếu |
|---|---|---|
| A' Nghiệm thu | `project_acceptances` có `projectId = P`, chưa xóa và `amountCdtVnd ≠ 0`; Σ `amountCdtVnd` | tổng "SL NT CĐT" của tab Nghiệm thu |
| B' Hóa đơn xuất | `project_cdt_invoices` chưa xóa; Σ (`amountVnd + vatVnd`) | Σ trên màn sổ hóa đơn CĐT |
| C' Đã nhận | `project_3way_cashflows` chưa xóa. `cdt_to_cty` mang dấu +, `cty_to_cdt` mang dấu −, các chiều khác bị bỏ qua. | `cdtToCty − ctyToCdt` của `getCashflowSummary` |
| Còn phải thu theo nghiệm thu | `A' − C'` | — |
| Còn phải thu theo hóa đơn | `B' − C'` | — |
| Hóa đơn còn phải xuất | `A' − B'` | — |

Chiều `cty_to_cdt` hiện trong danh sách C' như một dòng âm, nhãn "Cty → CĐT (hoàn trả)". CĐT không có số đầu kỳ.

**Khối "phần hợp đồng chưa thực hiện"** (chung cho mọi loại đối tác; `V_dt = valueVnd` và `V_tt = valueTtVnd`, cộng trên các hợp đồng cùng nhóm nếu bị gộp):
- U1 = `V_tt − (ΣA − T)`. Với CĐT là `V_tt − A'`.
- U2 = `V_dt − ΣB`. Với CĐT là `V_dt − B'`.
- U3 = `V_tt − ΣC_tt`. Với CĐT là `V_tt − C'`.
- Nếu giá trị cần dùng là NULL ở bất kỳ hợp đồng nào trong nhóm gộp, ô đó hiện "Chưa nhập giá trị (k/N hợp đồng có giá trị)" thay vì một số. Giá trị 0 vẫn tính là đã nhập. Kết quả âm (vượt) hiện đúng dấu, không tô màu cảnh báo, vì cảnh báo vượt giá trị là non-goal.

**Nhóm gộp (tiêu chí 5).** Nhóm gồm các hợp đồng chưa xóa của cùng dự án, cùng `partyKind`, và cùng `supplierId` hoặc `contractorId`. Với CĐT, nhóm là mọi hợp đồng CĐT của dự án. Khi N ≥ 2, màn hiện băng "Số liệu gộp chung N hợp đồng" kèm danh sách và tổng `V_dt`, `V_tt`. Hợp đồng đã hết hạn hoặc chấm dứt vẫn nằm trong nhóm.

**Băng báo về toàn vẹn dữ liệu:**
- cặp có từ 2 Chủ thể trở lên: hiện số cuối kỳ của từng Chủ thể;
- đối tác đã xóa mềm khỏi danh mục: hiện tên kèm "(đã xóa khỏi danh mục)", số vẫn đọc như báo cáo, vì báo cáo cũng không lọc đối tác đã xóa;
- dòng nhân công thiếu `projectId`: hiện số dòng;
- hợp đồng loại `contract` chưa gắn đối tác: hiện "Chưa gắn đối tác nên chưa có số liệu" và nút sửa.

**Không đọc:**
- sổ DT-HĐ-TT (`project_invoice_lines`, `project_actual_receipts`, `project_cash_payments`);
- `project_supplier_debt_snapshots` (tab Công nợ NCC);
- `project_3way_cashflows` chiều `cty_to_doi` cho đội, vì như thế sẽ đếm trùng với `thanh_toan` của sổ nhân công.

Mỗi khối trên màn ghi rõ nguồn.

### 3.3 Module tổng hợp

`lib/du-an/contract-detail/`. Các tệp thuần không import `@/lib/prisma` và chỉ làm việc với `Prisma.Decimal`:
- `types.ts`: `LedgerRowInput`, `CanonicalEntityTotals`, `ContractFigures`, `UnfulfilledCell = {kind:"amount", value} | {kind:"missing", have, total}`.
- `ledger-figures.ts`: `buildLedgerFigures(rows, openings, canonical)`. Hàm trả về danh sách A, B, C, các tổng, khối công nợ và `reconciliation: {ok, mismatches[]}`. Các tổng hiển thị là số canonical. Phép so khớp cộng chính xác các dòng theo từng `entityId`, làm tròn `toFixed(0)` theo từng Chủ thể giống báo cáo, rồi cộng lại và so bằng chuỗi.
- `invoice-grouping.ts`: `groupInvoiceRows(rows)`.
- `cdt-figures.ts`: `buildCdtFigures(acceptances, invoices, cashflows)`.
- `unfulfilled.ts`: `buildUnfulfilled(group, totals)`.
- `contract-group.ts`: `resolveGroup(contract, siblings)`.

Các tệp server (không có "use server", có `import "server-only"`):
- `ledger-source.ts`: một `$queryRaw` lấy dòng với 4 fragment, một truy vấn số đầu kỳ, gọi `queryDetailReport` và đếm dòng nhân công thiếu công trình.
- `cdt-source.ts`.
- `contract-detail-loader.ts`: `loadContractDetail(projectId, contractId)` và `loadContractListFigures(projectId)`. Hàm thứ hai chạy đúng 3 truy vấn cho mỗi dự án: báo cáo material, báo cáo labor và các tổng CĐT. Hàm nào cũng gọi `requireReleasedModuleRequest("du-an", {minLevel: "read", scope: project})` trước.

### 3.4 Route, action và ACL

| Thao tác | Nơi đặt | Quyền (`du-an`, scope project) |
|---|---|---|
| Danh mục (thêm cột đối tác, DT, TT, công nợ cặp) | `app/(app)/du-an/[id]/hop-dong/page.tsx` | read |
| Chi tiết | `app/(app)/du-an/[id]/hop-dong/[contractId]/page.tsx`. Tra hợp đồng theo `{id, projectId, deletedAt: null}`, không thấy thì `notFound()` để chống IDOR khác dự án. | read |
| Tạo / sửa / xóa mềm hợp đồng | `lib/du-an/contract-service.ts` (sửa) | create / edit / edit |
| Danh sách scan | `loadContractDetail` | read |
| Tải scan lên / xóa scan | `lib/du-an/contract-attachment-service.ts` ("use server", theo đúng khuôn các service du-an khác) | edit |
| Tải scan về hoặc xem | `app/api/du-an/hop-dong/[contractId]/tep/[fileId]/route.ts` (GET). `?download=1` thì trả `attachment`, mặc định trả `inline` cho PDF, PNG, JPG. | read |
| Sổ hóa đơn xuất CĐT | `app/(app)/du-an/[id]/hop-dong/hoa-don-cdt/page.tsx` cùng client, service `lib/du-an/cdt-invoice-service.ts` | read / create / edit / edit |

Sổ hóa đơn CĐT được đặt ở một route con trong tab Hợp đồng chứ không đặt trong màn chi tiết. Lý do là non-goal "màn hợp đồng chỉ đọc số, mọi chỉnh sửa làm ở sổ gốc". Sổ này theo dự án, không theo từng hợp đồng: nếu đặt trong màn chi tiết thì khi có hai hợp đồng CĐT, cùng một sổ sẽ hiện ở hai nơi. Danh mục có nút "Sổ hóa đơn xuất CĐT", và khối B' của hợp đồng CĐT có link sang sổ đó. Đoạn tĩnh `hoa-don-cdt` được ưu tiên hơn đoạn động `[contractId]`. Màn chi tiết vẫn kiểm `contractId` là số nguyên.

Thứ tự kiểm trong route tải:
1. parse hai id, sai thì trả 400;
2. kiểm session, thiếu thì 401;
3. `findFirst({id: fileId, contractId})` kèm `contract.projectId` và `contract.deletedAt`; không thấy hoặc hợp đồng đã xóa thì 404;
4. `requireReleasedModuleRequest` với `projectId` vừa tra được; không đủ quyền thì 403 qua `moduleRequestStatus`;
5. stream tệp với `Cache-Control: private, no-store`, `Content-Type` lấy từ whitelist và tên tệp theo RFC 5987, chép theo `app/api/tasks/[id]/attachments/[attId]/route.ts`.

Khi tải lên:
- kiểm kích thước ≤ 25MB và MIME nằm trong whitelist trước khi đọc buffer;
- `validateMagicBytes` (`lib/task/file-signature.ts`) chặn tệp giả MIME;
- `storedPath = du-an-hop-dong/{projectId}/{contractId}/{uuid}-{safeFilename}`;
- ghi tệp trước, sau đó tạo dòng; nếu tạo dòng lỗi thì xóa tệp.

Khi xóa: xóa dòng trước rồi mới xóa tệp, có try. Nếu xóa tệp lỗi thì chỉ còn một tệp mồ côi, không bao giờ để lại một dòng trỏ tới tệp đã mất. Client audit trong `lib/prisma.ts` tự ghi `audit_logs` cho thao tác tạo và xóa.

## 4. Các phase

Thứ tự: Phase 1 và 2 chạy song song. Phase 3 cần cả 1 và 2. Phase 4 chỉ cần 1, nên chạy song song với 3. Phase 5 cần 3, 4 và PR #21 đã merge. Phase 6 làm cuối. Mỗi tệp chỉ thuộc một phase.

### Phase 1: Schema, migration và rollback (5h)

**Mục tiêu:** có cột và bảng mới, các ràng buộc được chứng minh bằng test, có SQL rollback.

**Tệp:**
- sửa `prisma/schema.prisma`;
- tạo `prisma/migrations/20261118120000_du_an_hop_dong_doi_tac/migration.sql`;
- tạo `plans/261118-1016-danh-muc-hop-dong-du-an/rollback.sql`;
- tạo `test/integration/du-an-hop-dong-schema.integration.test.ts`.

**Các bước:**
1. Mở nhánh từ `origin/main` sau khi PR #21 đã merge; nếu chưa merge thì rebase lên.
2. Kiểm migration mới nhất trên main vẫn là `20261117160000_du_an_dt_hd_tt`, rồi đặt timestamp sau nó.
3. Viết model và back-relation, chạy `npx prisma migrate dev --create-only`, rồi thêm tay vào `migration.sql` các CHECK, index một phần và unique một phần.
4. Viết `rollback.sql`: `DROP TABLE project_cdt_invoices`, `DROP TABLE project_contract_attachments`, `ALTER TABLE project_contracts DROP CONSTRAINT …` (4 CHECK và 2 FK), `DROP INDEX` hai index một phần, `DROP COLUMN` 4 cột, `DELETE FROM _prisma_migrations WHERE migration_name = '20261118120000_du_an_hop_dong_doi_tac'`.

**Kiểm:**
- `npx prisma validate`;
- `pg_dump` bản sao, sau đó `prisma migrate deploy` lên bản sao;
- chạy `rollback.sql` trên bản sao, `migrate deploy` lại một lần nữa để chứng minh vòng đi về;
- integration test schema: mỗi CHECK có một case bị từ chối và một case được nhận; FK Restrict chặn xóa cứng hợp đồng đang có scan; unique số hóa đơn CĐT bỏ qua dòng đã xóa mềm; một INSERT theo đúng cột mà adapter import dùng vẫn qua.

### Phase 2: Hàm tổng hợp thuần và unit test (6h, làm trước tiên theo hướng của ứng viên này)

**Mục tiêu:** chốt công thức ở mục 3.2 bằng code thuần và test.

**Tệp tạo mới:**
- `lib/du-an/contract-detail/types.ts`, `ledger-figures.ts`, `invoice-grouping.ts`, `cdt-figures.ts`, `unfulfilled.ts`, `contract-group.ts`;
- `lib/du-an/contract-detail/__tests__/ledger-figures.test.ts`, `invoice-grouping.test.ts`, `cdt-figures.test.ts`, `unfulfilled.test.ts`, `contract-group.test.ts`.

**Các bước:**
1. Viết types, rồi viết test trước theo bảng U ở mục 6.
2. Cài đặt hàm, mỗi tệp dưới 200 dòng.
3. Chỉ dùng `Prisma.Decimal`. Không dùng `Number()` cho tiền. Kết quả đưa sang client dưới dạng chuỗi.

**Kiểm:** `pnpm vitest run --project unit lib/du-an/contract-detail` và `npx tsc --noEmit`.

### Phase 3: Nguồn dữ liệu, service, sổ hóa đơn CĐT và tie-out (7h)

**Mục tiêu:** có số thật, khớp báo cáo trên DB test và trên toàn bộ bản sao.

**Tệp:**
- tạo `lib/du-an/contract-detail/ledger-source.ts`, `cdt-source.ts`, `contract-detail-loader.ts`;
- tạo `lib/du-an/cdt-invoice-service.ts` (CRUD có ACL: zod, trim, chặn trùng số);
- sửa `lib/du-an/contract-service.ts` và `lib/du-an/schemas.ts`;
- tạo `test/integration/du-an-hop-dong-tie-out.integration.test.ts`, `test/integration/du-an-hop-dong-binding.integration.test.ts`;
- tạo `scripts/check-contract-detail-tie-out.ts` (chỉ đọc).

**Các bước:**
1. Trong `schemas.ts`:
   - `docType` mở thành `contract|license|insurance|acceptance|other`, để sửa được các dòng đã import;
   - thêm `partyKind`, `supplierId`, `contractorId`, `valueTtVnd ≥ 0`;
   - thêm `superRefine` theo đúng CHECK;
   - thêm `cdtInvoiceSchema`.
2. Trong `contract-service.ts`:
   - nếu `docType ≠ contract` thì ép mọi trường đối tác thành NULL;
   - khi gắn mới hoặc đổi đối tác thì đối tác phải còn hiệu lực (`deletedAt IS NULL`); giữ nguyên một đối tác đã xóa mềm vẫn được phép;
   - tự điền `partyName` từ tên đối tác, với CĐT thì lấy `Project.ownerInvestor`, nếu người dùng để trống;
   - `revalidatePath` cả đường danh mục lẫn đường chi tiết.
3. Viết `ledger-source.ts`: SQL lọc giống hệt báo cáo, gồm `ledgerType`, `partyId`, `projectId`, `deletedAt IS NULL` và không cắt ngày.
4. Viết `loadContractDetail`:
   - khi `reconciliation.ok = false`, gọi `console.error` kèm id hợp đồng và trả cờ để UI hiện băng đỏ;
   - đi thẳng các nhánh `partyKind` null, ncc, doi_thi_cong và cdt, có `assertNever` ở cuối.
5. Viết script tie-out:
   - với mọi `(partyId, projectId)` material trong `queryDetailReport({ledgerType: "material", showZero: true})`, chạy `ledger-source` cùng `buildLedgerFigures`, rồi so 8 số;
   - in bảng các cặp lệch và thoát mã 1 nếu có lệch;
   - chạy với `DATABASE_URL` của bản sao.

**Kiểm:**
- `pnpm test:integration -- du-an-hop-dong`;
- `npx tsx scripts/check-contract-detail-tie-out.ts`: phải in "99/99 cặp khớp" (77 cặp có giao dịch và 22 cặp chỉ có số đầu kỳ); kết quả lưu vào `reports/`.

### Phase 4: Bản scan (5h)

**Mục tiêu:** tải lên, xem, tải về và xóa scan đúng quyền.

**Tệp:**
- tạo `lib/du-an/contract-attachment-service.ts`;
- tạo `app/api/du-an/hop-dong/[contractId]/tep/[fileId]/route.ts`;
- sửa `test/risk-manifest.ts`;
- sửa `next.config.ts` (đổi `bodySizeLimit` thành `"26mb"`, kèm comment lý do);
- tạo `test/integration/du-an-hop-dong-attachments.integration.test.ts`.

**Các bước:**
1. Viết service `listContractAttachments`, `uploadContractAttachment(formData)`, `deleteContractAttachment(id)`. Service tra `projectId` từ hợp đồng trước rồi mới kiểm ACL; hợp đồng đã xóa thì báo "Không tìm thấy hợp đồng".
2. Viết thông báo tiếng Việt cho các trường hợp: sai loại ("Chỉ nhận PDF, JPG, PNG"), quá cỡ ("Tệp vượt 25MB (x MB)"), và nội dung không khớp định dạng.
3. Viết route GET theo thứ tự đã nêu ở mục 3.4.
4. Thêm bản ghi `api-du-an-contract-attachment` vào manifest: `kind: "api-route"`, operation `GET`, tier P0, `dataClassification: "confidential"`, `requiredTests: allow, deny, cross-scope, audit, recovery`, `recovery: standardRecovery`, chép theo `api-task-attachment` ở `test/risk-manifest.ts:63-73`.

**Kiểm:**
- `pnpm risk:verify`;
- integration test, xem mục 6 phần S;
- tải lên trên bản sao một PDF 24,9MB và một PDF 25,0MB.

### Phase 5: Giao diện (5h)

**Mục tiêu:** danh mục bấm được vào từng dòng, có màn chi tiết đủ năm phần và có màn sổ hóa đơn CĐT.

**Tệp:**
- sửa `app/(app)/du-an/[id]/hop-dong/page.tsx`, `hop-dong-client.tsx`, `hop-dong-form.tsx`;
- tạo `app/(app)/du-an/[id]/hop-dong/[contractId]/page.tsx`, `contract-info-section.tsx`, `contract-figures-section.tsx`, `contract-lists-section.tsx`, `contract-attachments-panel.tsx` (client);
- tạo `app/(app)/du-an/[id]/hop-dong/hoa-don-cdt/page.tsx`, `hoa-don-cdt-client.tsx`.

**Các bước:**
1. Danh mục:
   - thêm cột Đối tác (loại và tên có mã, hoặc "chưa gắn"), Giá trị theo DT, Giá trị theo TT, và "Công nợ cặp" (`D_tt`, với CĐT là A' − C');
   - nếu hợp đồng thuộc nhóm gộp thì gắn dấu "gộp N";
   - **không** đặt dòng tổng cho cột công nợ, vì nhiều hợp đồng cùng cặp sẽ bị cộng trùng; kiểm cấu hình footer của DataGrid [UNVERIFIED];
   - có cột hoặc nút "Chi tiết" mở `/du-an/[id]/hop-dong/[contractId]` [UNVERIFIED: DataGrid có hỗ trợ bấm vào dòng hay không, nếu không thì dùng một cột link].
2. Form hợp đồng:
   - chọn `partyKind`, rồi dùng picker NCC hoặc đội có tạo nhanh (`components/quick-create/` từ PR #21);
   - đổi nhãn `valueVnd` thành "Giá trị theo DT", thêm "Giá trị theo TT";
   - ẩn các trường đối tác và giá trị TT khi `docType ≠ contract`.
3. Màn chi tiết:
   - phần 1 là thông tin và scan;
   - phần 2 đến 5 chỉ hiện khi `partyKind ≠ null`;
   - mỗi khối có dòng "Nguồn: Sổ công nợ vật tư / nhân công / Nghiệm thu + Dòng tiền 3 bên + Sổ hóa đơn xuất CĐT";
   - hiện các băng báo đã liệt kê ở mục 3.2;
   - ẩn nút tải lên và nút xóa khi không có quyền edit.
4. Màn sổ hóa đơn CĐT: bảng kèm form thêm, sửa, xóa mềm, có dòng tổng.

**Kiểm:**
- `npx tsc --noEmit` và `pnpm lint`;
- bấm thử trên `localhost:3001` bằng tài khoản admin và một tài khoản chỉ có quyền read.

### Phase 6: Chạy thử trên bản sao, tài liệu, runbook (2h)

**Mục tiêu:** từng tiêu chí có bằng chứng.

**Tệp:**
- tạo `plans/261118-1016-danh-muc-hop-dong-du-an/reports/dry-run-*.md`;
- sửa `docs/user-guide/*.md` cho phần hợp đồng dự án [UNVERIFIED: tên tệp cụ thể].

**Các bước:**
1. Trên bản sao, tạo hợp đồng NCC cho dự án 1 và dự án 4, rồi chụp màn hình để đối chiếu với báo cáo công nợ lũy kế của cùng cặp.
2. Tạo hợp đồng đội và hợp đồng CĐT; nhập thử một giao dịch nhân công, một nghiệm thu, một dòng `cdt_to_cty`, một dòng `cty_to_cdt` và một hóa đơn CĐT.
3. Thử scan với hai vai: admin và người chỉ có quyền read.
4. Chạy lại script tie-out.
5. Viết runbook production: đếm số dòng, sao lưu DB và thư mục `UPLOAD_DIR`, chạy migrate, kiểm, và cách rollback.

**Kiểm:** toàn bộ cổng ở mục 7.

## 5. Phân rủi ro theo phase

| Phase | Khả năng × Tác động | Ghi chú |
|---|---|---|
| 1 | Thấp × Cao | Chỉ thêm cột và bảng, mọi cột mới nullable. Đã thử vòng rollback đi về. |
| 2 | Trung bình × Cao | Chọn sai nền (TT hay HĐ) cho một số. Đã chốt bằng test và câu hỏi mở. |
| 3 | Trung bình × Cao | Lệch so với báo cáo. Có ba lớp chặn: fragment, test, script. |
| 4 | Trung bình × Cao | Bảo mật tệp. Dùng manifest P0 với đủ 5 test. |
| 5 | Thấp × Trung bình | Phụ thuộc PR #21. |
| 6 | Thấp × Thấp | — |

## 6. Ma trận test (gắn với tiêu chí chấp nhận AC1 đến AC9)

**U: unit test thuần (Phase 2)**

| # | Fixture | Kỳ vọng | AC |
|---|---|---|---|
| U1 | đầu kỳ 1000/900; `lay_hang` 500/550 HĐ "HD1"; `lay_hang` 300/0; `lay_hang` 200/220 không có số HĐ; `lay_hang` −50/−50; `thue_hd` 30/0; `dieu_chinh` +40 TT / −20 HĐ; `dieu_chinh` −15/0; `thanh_toan` 600/650 | ΣA = 1020; T = 30; ΣB = 720; ΣC_tt = 615; ΣC_hd = 670; D_tt = 1405; D_hd = 950; G = 270. Dòng điều chỉnh trái dấu nằm ở cả A và C. | 2, 9 |
| U2 | hai dòng mang số HĐ " HD1" và "HD1" cộng một dòng không có số | 2 mục; Σ nhóm = ΣB | 2 |
| U3 | hai Chủ thể, mỗi bên 0,50 | so khớp theo từng Chủ thể ra 1 + 1 = 2, khớp canonical; nếu cộng gộp rồi mới làm tròn thì ra 1 và phải bị đánh lệch | 2 |
| U4 | canonical lệch dòng 1 đồng | `reconciliation.ok = false`, chỉ ra đúng trường lệch | 2 |
| U5 | `V_tt = null`, `V_dt = 0` | U1 và U3 ra "missing", U2 ra số | 4 |
| U6 | nhóm 3 hợp đồng, 1 hợp đồng thiếu `V_tt` | "missing 2/3"; `V_dt` là tổng của cả 3 | 4, 5 |
| U7 | `docType = license` | không có khối số | 7 |
| U8 | CĐT: nghiệm thu 100 và 0; `cdt_to_cty` 70 và 20; `cty_to_cdt` 10; `cty_to_doi` 999; hóa đơn 60+6 | A' = 100; C' = 80; B' = 66; còn phải thu theo nghiệm thu = 20, theo hóa đơn = −14; hóa đơn còn phải xuất = 34 | 3 |
| U9 | cặp chỉ có số đầu kỳ, hoặc không có gì | danh sách rỗng, tổng 0, cờ chú thích đầu kỳ bật hoặc tắt đúng | 2, 3 |

**I: integration test trên DB `_test` (Phase 1, 3, 4)**

| # | Nội dung | AC |
|---|---|---|
| I1 Tie-out vật tư | Seed như U1, thêm nhiễu: cùng NCC ở dự án khác, NCC khác cùng dự án, một dòng 9999 đã xóa mềm, các dòng có phần lẻ. Sau đó `loadContractDetail` phải ra 8 số bằng đúng Σ của `queryDetailReport({ledgerType: "material", projectIds: [P], showZero: true})` lọc `partyId`, và `reconciliation.ok`. | 2 |
| I2 Tie-out nhân công | Như I1 với `labor` và contractor, cộng một dòng có `projectId = null`: dòng này không được tính và phải có băng đếm 1 dòng. | 3 |
| I3 Tie-out CĐT | A' bằng Σ `listAcceptances`; C' bằng `getCashflowSummary().cdtToCty − ctyToCdt` (so sau `toFixed(0)`). | 3 |
| I4 Rỗng | Hợp đồng đội và hợp đồng CĐT khi chưa có dữ liệu: ba danh sách rỗng, tổng 0, không ném lỗi. | 3 |
| I5 Gắn đối tác | Lần lượt: gắn NCC đã xóa mềm thì bị từ chối; giữ NCC đã bị xóa sau khi gắn thì được; đổi `docType` sang `license` thì các trường đối tác bị xóa; `partyKind = ncc` mà không có `supplierId` thì bị zod từ chối và bị CHECK từ chối; 2 hợp đồng cùng cặp thì cả hai cùng nhận `group.size = 2`. | 5, 7 |
| I6 Chống IDOR | `loadContractDetail(P1, contractOfP2)` phải ra not found. | 1 |
| I7 Schema | Các CHECK, FK Restrict, unique hóa đơn CĐT, INSERT theo cột của import (Phase 1). | 8 |
| S1 Scan: allow | Người có quyền edit tải lên PDF, JPG, PNG; người có quyền read tải về được qua route (200, đúng header). | 6 |
| S2 Scan: deny | Người chỉ có quyền read gọi upload hoặc delete thì bị từ chối; tệp `.exe` đổi tên thành `.pdf` bị chặn do magic bytes; tệp 25MB + 1 byte bị từ chối kèm thông báo tiếng Việt. | 6 |
| S3 Scan: cross-scope | Người không có quyền vào dự án gọi route tải nhận 403; dùng `fileId` của hợp đồng khác với `contractId` trong URL nhận 404. | 6 |
| S4 Scan: audit | Thao tác upload và delete sinh dòng `audit_logs`. | 6 |
| S5 Scan: recovery | Hợp đồng đã xóa mềm thì route trả 404. Import rollback một run có hợp đồng đã mang scan thì bị `RollbackBlockedError`. Khi tạo dòng DB lỗi thì tệp vừa ghi bị xóa. | 6 |

**E: kiểm tay hoặc chạy script trên bản sao (Phase 6)**
- E1: script tie-out ra 99/99 cặp khớp (AC2).
- E2: dự án 1 và 4, màn hợp đồng so với tab Công nợ lũy kế, khớp từng đồng (AC2).
- E3: bấm dòng trong danh mục để mở chi tiết (AC1).
- E4: các dữ liệu nhập thử ở bước 2 của Phase 6 hiện đúng chỗ (AC3).
- E5: bộ cổng ở mục 7 xanh (AC9).

## 7. Cổng xanh

Chạy lần lượt: `npx prisma validate`, `npx tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm test:integration`, `pnpm risk:verify`, rồi `npx tsx scripts/check-contract-detail-tie-out.ts` trên bản sao.

## 8. Migration, rollback, sao lưu và an toàn production

**Tương thích ngược:**
- Migration chỉ thêm. Build cũ chạy được trên schema mới, vì Prisma client cũ bỏ qua cột lạ, và khi build cũ tạo hợp đồng thì các cột mới nhận NULL nên mọi CHECK đều qua.
- Do đó có thể rollback build mà không cần rollback DB.

**Rollback DB:**
- Chạy `rollback.sql`. Thao tác này mất các liên kết đối tác, giá trị TT, danh mục scan và sổ hóa đơn CĐT.
- Trước khi chạy, xuất dữ liệu bằng `COPY … TO` ra CSV cho 3 phần đó.
- Sau rollback, xóa thư mục `UPLOAD_DIR/du-an-hop-dong/`.

**Sao lưu:**
- Chạy `pg_dump -Fc` ngay trước khi migrate.
- Thư mục `UPLOAD_DIR` phải nằm trong phạm vi sao lưu của admin-pc [UNVERIFIED].

**Production (admin-pc):**
- Planner và người làm code không được đụng vào production.
- Trước khi deploy, chủ hệ thống chạy `SELECT count(*), count(*) FILTER (WHERE "docType" <> 'contract') FROM project_contracts` để ghi nhận hiện trạng. Kết quả không chặn việc deploy, vì không có dữ liệu nào phải chuyển.
- Thử toàn bộ quy trình trên bản sao (`ngoquyen-bansao-erp`, `localhost:3001`) trước.

**Thứ tự migration:** nếu có nhánh khác merge một migration với timestamp lớn hơn trước khi PR này merge, thì đổi tên thư mục migration trước khi merge.

## 9. Năm rủi ro lớn nhất

1. **Tổng hợp lệch báo cáo (Trung bình × Cao).** Ví dụ: ai đó sau này thêm một loại giao dịch, hoặc sửa bộ lọc báo cáo.
   - Phân loại đi qua chung fragment SQL.
   - Số tổng hiển thị là số canonical.
   - Lúc dựng trang có so khớp và băng đỏ.
   - Integration test I1, I2 và script quét toàn bộ.
2. **Chọn sai nền của số (Trung bình × Cao).** Các điểm cần chú ý: `thue_hd` không tính vào G và U1; U3 dùng nền TT; nền VAT của `amountCdtVnd`; số đầu kỳ chỉ đi vào công nợ.
   - Mỗi số có nhãn ghi rõ nền.
   - Công thức chỉ nằm ở `ledger-figures.ts` và `unfulfilled.ts`, mỗi thay đổi là một dòng có test.
   - Đưa vào câu hỏi mở để người dùng xác nhận trước Phase 2.
3. **Đếm trùng (Trung bình × Trung bình).**
   - Nhiều hợp đồng một cặp: dùng nhóm gộp và băng báo, và danh mục không có dòng tổng cho cột công nợ.
   - Đội: không đọc `cty_to_doi`.
   - CĐT: chỉ đọc hai chiều liên quan.
4. **Bảo mật và toàn vẹn của scan (Trung bình × Cao).** Các mối đe dọa: IDOR, giả MIME, hợp đồng đã xóa, tệp mồ côi, import rollback.
   - Tra `projectId` trước rồi mới kiểm ACL.
   - Kiểm magic bytes.
   - Thứ tự ghi và xóa đã nêu ở mục 3.4.
   - FK Restrict.
   - Manifest P0 với đủ 5 test.
   - Giới hạn 25MB sát với `bodySizeLimit`: nâng lên `26mb` [UNVERIFIED: phần đầu multipart có bị tính vào giới hạn hay không; Phase 4 thử thực tế bằng tệp 25,0MB].
5. **Phụ thuộc nhánh (Trung bình × Trung bình).** Picker tạo nhanh nằm ở PR #21, chưa có trên main.
   - Phase 1 đến 4 không cần picker, nên làm được ngay.
   - Phase 5 chặn cho tới khi #21 merge.
   - Nếu #21 trễ, form tạm dùng select thường lấy từ danh mục, rồi chuyển sang picker sau. Phạm vi không bị cắt.

**Các giả định chưa kiểm:**
- Footer và cách bấm vào dòng của `components/data-grid` [UNVERIFIED].
- Tên tệp user guide [UNVERIFIED].
- `bodySizeLimit` có tính cả phần đầu multipart hay không [UNVERIFIED].
- Phạm vi sao lưu `UPLOAD_DIR` trên admin-pc [UNVERIFIED].
- Số dòng `project_contracts` trên production [UNVERIFIED].
- Không đọc được `node_modules/next/dist/docs` vì hook chặn. Mẫu `params: Promise` đã được xác nhận qua route có sẵn `app/api/tasks/[id]/attachments/[attId]/route.ts:12` và trang `hop-dong/page.tsx`.

## 10. Câu hỏi còn mở

1. "Hóa đơn còn phải lấy" và U1 có nên **loại** `thue_hd` không? Ứng viên này loại, vì `thue_hd` là tiền thuế cho hóa đơn chứ không phải hàng. Còn phải trả theo thực tế thì vẫn tính `thue_hd` để khớp báo cáo.
2. U3 "giá trị hợp đồng − đã chuyển tiền" dùng nền nào: TT (`V_tt − ΣC_tt`, mặc định của ứng viên này) hay DT so với chuyển tiền HĐ (`V_dt − ΣC_hd`)? Sổ hiện có 162 dòng `thanh_toan` mà TT khác HĐ.
3. `amountCdtVnd` của nghiệm thu và giá trị hợp đồng đã gồm VAT chưa? Ứng viên này giả định đã gồm VAT, và so với hóa đơn CĐT tính cả VAT.
4. Hóa đơn xuất CĐT có cần cho phép số âm (hóa đơn điều chỉnh giảm) không? Ứng viên này chặn số âm bằng CHECK.
5. Khi cặp có số dư đầu kỳ, chỉ ghi chú (như ứng viên này đề xuất) có đủ không, hay người dùng muốn nhập thêm "lũy kế lấy hàng trước kỳ" trên hợp đồng? Nếu muốn nhập thêm thì đó là mở rộng phạm vi, cần người dùng duyệt.
