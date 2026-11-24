# Ứng viên plan #3: Danh mục hợp đồng dự án (góc nhìn người dùng và giao từng phần)

Ngày 2026-11-18. Đầu vào: `plans/reports/brainstorm-261118-0910-danh-muc-hop-dong-du-an.md` (quyết định đã chốt, không mở lại) và `reports/debate-evidence-packet.md`. Mọi trích dẫn `file:line` dưới đây đã kiểm lại trên nhánh hiện tại hoặc `origin/main` (ghi rõ khi là main).

## 1. Kết quả mong muốn

Kế toán mở tab "Hợp Đồng" của một công trình, thấy danh mục có cột đối tác (gắn mã), giá trị theo DT và TT, công nợ còn lại. Bấm tên một hợp đồng thì mở `/du-an/[id]/hop-dong/[contractId]`, xem thông tin, bản scan, ba danh sách đọc từ sổ gốc, khối công nợ và khối phần chưa thực hiện. Hợp đồng CĐT có thêm sổ hóa đơn xuất cho CĐT, nhập ngay trên màn đó. Mỗi phase kết thúc bằng một thứ người dùng tự kiểm được trên `localhost:3001`, và không tab cũ nào hỏng.

## 2. Kiến trúc

### 2.1 Schema: một migration `20261118120000_du_an_danh_muc_hop_dong`

Chỉ thêm cột và bảng, không đổi dữ liệu cũ. Gộp vào một migration để rollback và triển khai production chỉ một bước.

**`project_contracts` (model `ProjectContract`, main `prisma/schema.prisma:504`) thêm:**

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `partyKind` | `TEXT NULL` | `ncc`, `doi_thi_cong`, `cdt`; `NULL` = không tổng hợp số |
| `supplierId` | `INT NULL` FK `suppliers(id) ON DELETE RESTRICT` | |
| `contractorId` | `INT NULL` FK `contractors(id) ON DELETE RESTRICT` | |
| `valueTtVnd` | `DECIMAL(18,2) NULL` | Giá trị theo TT |

- **Không đổi tên `valueVnd`.** Cột này giữ tên, chỉ đổi nhãn thành "Giá trị theo DT". Lý do: import ghi raw INSERT có tên cột `"valueVnd"` (main `lib/import/adapters/du-an-xay-dung.adapter.ts:681-690`), và dashboard cùng seed hiệu năng cũng đọc model này. Đổi tên sẽ phải sửa ba chỗ mà người dùng không được gì. AC8 đạt ngay vì dữ liệu không di chuyển.
- CHECK `project_contracts_party_link_check`:
  `("partyKind" IS NULL AND "supplierId" IS NULL AND "contractorId" IS NULL) OR ("partyKind"='ncc' AND "supplierId" IS NOT NULL AND "contractorId" IS NULL) OR ("partyKind"='doi_thi_cong' AND "contractorId" IS NOT NULL AND "supplierId" IS NULL) OR ("partyKind"='cdt' AND "supplierId" IS NULL AND "contractorId" IS NULL)`.
- CHECK `project_contracts_party_doc_type_check`: `"partyKind" IS NULL OR "docType" = 'contract'`. Mọi dòng hiện có (kể cả `insurance|acceptance|other` do import ghi) có `partyKind` NULL nên qua được.
- Index `("projectId","supplierId")` và `("projectId","contractorId")`.
- **Không có `entityId`.** Số cộng mọi Chủ thể của cặp, vì cả 77 cặp trên bản sao đều chỉ có một Chủ thể (evidence packet). Nếu cặp có từ 2 Chủ thể trở lên thì màn hiện băng báo.
- `partyName` vẫn giữ. Khi lưu hợp đồng đã gắn mã, service ghi `partyName` = tên đối tác lúc lưu (NCC/đội lấy tên danh mục, CĐT lấy `Project.ownerInvestor`), để dashboard (main `lib/du-an/dashboard-service.ts:47-58` đọc `partyName`) vẫn hiện đúng. Các màn hợp đồng hiện tên sống từ quan hệ.

**Bảng mới `project_contract_attachments` (`ProjectContractAttachment`), theo khuôn `TaskAttachment` (main `schema.prisma:1555`):**
`id`, `contractId INT NOT NULL` FK `project_contracts ON DELETE RESTRICT`, `uploaderId TEXT NOT NULL` FK `users`, `filename`, `storedPath TEXT UNIQUE`, `mimeType` CHECK `IN ('application/pdf','image/jpeg','image/png')`, `sizeBytes INT` CHECK `> 0 AND <= 26214400`, `deletedAt`, `createdAt`, `updatedAt @updatedAt`, `@@index([contractId])`.
- Xóa scan là **xóa mềm**, tệp vẫn nằm trên đĩa. Như vậy scan khôi phục được (P0 yêu cầu test `recovery`).
- Dùng FK RESTRICT chứ không CASCADE. Hoàn tác import ở `lib/import/import-rollback.ts` xóa cứng `project_contracts` theo `importRunId` (main dòng 136). Có RESTRICT thì hoàn tác sẽ gặp lỗi 23503, và lỗi này đã được đổi thành `RollbackBlockedError` kèm câu tiếng Việt (main dòng 27, 213). Nếu dùng CASCADE, scan người dùng đã tải lên sẽ mất mà không ai biết.

**Bảng mới `project_owner_invoices` (`ProjectOwnerInvoice`): sổ hóa đơn xuất cho CĐT, gắn theo dự án:**
`id`, `projectId` FK `projects ON DELETE RESTRICT`, `invoiceDate TIMESTAMP NOT NULL`, `invoiceNo TEXT NOT NULL`, `amountExVatVnd DECIMAL(18,2) NOT NULL`, `vatVnd DECIMAL(18,2) NOT NULL DEFAULT 0`, `acceptanceBatch TEXT NULL` (đợt nghiệm thu, tùy chọn, gợi ý từ `ProjectAcceptance.acceptanceBatch`), `note`, `deletedAt`, `createdAt`, `updatedAt @updatedAt`, `@@index([projectId])`.
- Unique một phần `("projectId","invoiceNo") WHERE "deletedAt" IS NULL`. CHECK `"amountExVatVnd" + "vatVnd" <> 0`, cho phép số âm để ghi hóa đơn điều chỉnh giảm.
- Không có `importRunId`, vì sổ này chỉ nhập tay.

### 2.2 Luồng dữ liệu

```
page.tsx (RSC, guard du-an read theo projectId trên URL)
  └─ getContractDetail(projectId, contractId)            lib/du-an/contract-detail/contract-detail-service.ts
       ├─ hợp đồng: findFirst {id, projectId, deletedAt:null}  → không có thì notFound()
       ├─ nhóm gộp: các hợp đồng cùng projectId × partyKind × (supplierId|contractorId|cdt), chưa xóa
       ├─ nguồn theo partyKind:
       │    ncc / doi_thi_cong → ledger-party-source.ts
       │        (a) dòng chi tiết: ledger_transactions WHERE ledgerType, projectId, partyId, deletedAt IS NULL,
       │            cột inc_tt/inc_hd/dec_tt/dec_hd dựng bằng increaseSql/decreaseSql (transaction-classification.ts:73-104)
       │        (b) số chuẩn: queryDetailReport({ledgerType, projectIds:[pid], showZero:true}) lọc partyId,
       │            cộng mọi Chủ thể (balance-report-service.ts:108)
       │    cdt → owner-party-source.ts (project_acceptances.amountCdtVnd ≠ 0, project_owner_invoices,
       │          project_3way_cashflows có flowDirection cdt_to_cty | cty_to_cdt)
       └─ buildContractSummary(input) THUẦN → {lists, totals, debt, remaining, banners}  build-contract-summary.ts
```

- **Khối công nợ của NCC và đội lấy từ `queryDetailReport`.** Đây chính là hàm đứng sau màn "Công nợ lũy kế", nên số còn phải trả khớp đúng từng đồng theo định nghĩa (AC2).
- **Ba danh sách cộng từ dòng chi tiết bằng `Prisma.Decimal`**, không dùng `Number`. Hàm thuần so tổng của danh sách với `phatSinh`/`daTra` của báo cáo. Nếu lệch, màn hiện băng đỏ "Danh sách lệch tổng sổ công nợ (x đồng), báo kỹ thuật". Lỗi lệch vì vậy hiện ngay trên màn, không âm thầm sai.
- Không viết literal loại giao dịch nào, mọi phân loại đều dùng fragment có sẵn.

### 2.3 Quy tắc tổng hợp theo loại đối tác

**NCC (sổ vật tư, `ledgerType='material'`, `partyId=supplierId`), và đội (sổ nhân công, `ledgerType='labor'`, `partyId=contractorId`), cùng một adapter:**

| Danh sách | Dòng vào danh sách | Cột tiền |
|---|---|---|
| Lấy hàng (đội: "Khối lượng / phát sinh") | `inc_tt ≠ 0`: `lay_hang`, `thue_hd`, `dieu_chinh` dương | TT |
| Hóa đơn đã lấy | `inc_hd ≠ 0` | HĐ |
| Đã chuyển tiền | `dec_tt ≠ 0` hoặc `dec_hd ≠ 0`: `thanh_toan`, `dieu_chinh` âm (hiện trị tuyệt đối, ghi loại "Điều chỉnh giảm") | Trả thực tế (TT) và Trả theo HĐ |

**Cách dựng danh sách "Hóa đơn đã lấy"** (chỉ 53 trong 115 dòng có số hóa đơn):
- dòng có `invoiceNo` (đã trim) gộp theo số hóa đơn; ngày lấy `invoiceDate` sớm nhất, nếu không có thì lấy `date` sớm nhất; kèm số dòng đã gộp;
- dòng không có `invoiceNo` liệt kê riêng từng dòng, nhãn "(không ghi số HĐ)", có ngày và nội dung;
- dưới bảng ghi chú "N dòng có giá trị HĐ nhưng chưa ghi số hóa đơn". Kế toán nhờ đó biết chỗ cần bổ sung ở sổ gốc;
- tổng danh sách = Σ `inc_hd` = `phatSinhHd` của báo cáo.

**Khối công nợ của NCC và đội:**
- Số dư đầu kỳ là một dòng riêng, chỉ hiện khi khác 0, ghi rõ "Số dư ban đầu chuyển sang". Số này không nằm trong danh sách lấy hàng. Cách này giữ đúng quyết định ngày 10/11 của người dùng: lấy hàng và trả là phát sinh, còn nợ là nợ thật.
- Còn phải trả theo thực tế = đầu kỳ TT + Σ lấy hàng TT − Σ trả TT = `cuoiKyTt`.
- Còn phải trả theo hóa đơn = đầu kỳ HĐ + Σ hóa đơn − Σ trả HĐ = `cuoiKyHd`.
- Hóa đơn còn phải lấy = Σ lấy hàng TT − Σ hóa đơn. Phép này chỉ dùng phát sinh, không gồm đầu kỳ (xem câu hỏi Q1).
- Số âm hiện kèm chữ, không hiện dấu trừ trơn: "Trả thừa x", "Hóa đơn lấy vượt x".

**CĐT (`partyKind='cdt'`, không có khóa đối tác):**

| Danh sách | Nguồn |
|---|---|
| Giá trị nghiệm thu | `project_acceptances` có `amountCdtVnd ≠ 0`, chưa xóa. Cột: ngày nghiệm thu (`acceptedAt`, thiếu thì "chưa có ngày"), đợt, hạng mục, giá trị |
| Hóa đơn đã xuất cho CĐT | `project_owner_invoices`. Cột: ngày, số HĐ, chưa VAT, VAT, tổng, đợt. Tổng tính theo giá trị gồm VAT (Q2) |
| CĐT đã chuyển tiền | `cdt_to_cty` cộng; `cty_to_cdt` hiện cùng danh sách với nhãn "Công ty hoàn trả CĐT", **mang dấu âm**. Tổng là số thuần |

Khối công nợ của CĐT gồm: "CĐT còn phải trả theo thực tế" = nghiệm thu − đã chuyển thuần; "CĐT còn phải trả theo hóa đơn" = hóa đơn − đã chuyển thuần; "Hóa đơn còn phải xuất" = nghiệm thu − hóa đơn. Dòng `cty_to_doi`, `doi_to_cty`, `doi_refund` không đọc. Màn đội ghi chú: "Không cộng Dòng tiền 3 bên chiều Công ty → Đội để tránh đếm trùng với sổ công nợ nhân công."

**Khối phần hợp đồng chưa thực hiện** là bảng 3 dòng × 2 cột:
- dòng: lấy hàng/nghiệm thu, hóa đơn, chuyển tiền;
- cột: "So với giá trị DT" (`valueVnd`) và "So với giá trị TT" (`valueTtVnd`), mỗi ô = giá trị − lũy kế;
- bảng phủ cả cách hiểu "giá trị hợp đồng TT − lấy hàng" lẫn "giá trị hợp đồng − …", nên không cần đoán người dùng muốn số nào;
- giá trị chưa nhập thì cả cột ghi "Chưa nhập giá trị", không tính (AC4);
- kết quả âm ghi "Vượt x". Đây chỉ là cách hiển thị, không phải cảnh báo (cảnh báo thuộc non-goal);
- khi gộp nhóm, giá trị là tổng của nhóm; có hợp đồng trong nhóm chưa nhập thì ghi "k/N hợp đồng chưa nhập giá trị".

### 2.4 Route, action, ACL

| Thao tác | Nơi đặt | Quyền (`requireReleasedModuleRequest("du-an", { scope: { kind: "project", projectId } })`) |
|---|---|---|
| Xem danh mục, xem chi tiết | `page.tsx` (RSC, `requireModuleAccess` read) + `contract-detail-service.ts` (module server thường, không "use server") | `read` |
| Thêm hợp đồng | `lib/du-an/contract-service.ts` `createContract` | `create` |
| Sửa, xóa hợp đồng | `updateContract`, `softDeleteContract` (giữ `findUnique` + `existing.projectId !==`) | `edit` |
| Tải lên, xóa scan | `app/(app)/du-an/[id]/hop-dong/[contractId]/scan-actions.ts` ("use server") | `edit`, với `projectId` đọc từ DB của hợp đồng |
| Tải về, xem scan | `app/api/du-an/[id]/hop-dong/[contractId]/scan/[scanId]/route.ts` GET | `read`, rồi tra dòng với điều kiện `contract.projectId = id` và cả hai chưa xóa; không có thì trả 404 |
| Hóa đơn xuất CĐT: xem, thêm, sửa, xóa | `lib/du-an/owner-invoice-service.ts` ("use server") | `read` / `create` / `edit` / `edit` |
| Danh sách chọn đối tác | `listContractPartyOptions(projectId)` trong `contract-service.ts` | `read` |

- **Action ghi trả `ActionResult`, không ném lỗi.** Bản production chỉ gửi `digest` của lỗi ném ra (main `lib/du-an/dt-hd-tt/entry-action-result.ts:1-8`), nên các câu từ chối tiếng Việt của AC6 sẽ mất nếu ném. Dùng lại `runEntryAction` cho cả `createContract`/`updateContract`/`softDeleteContract` (hiện đang ném, `lib/du-an/contract-service.ts:16-69`).
- **Upload dùng server action, không dùng POST qua API.** Server action đã có sẵn kiểm origin của Next, còn repo không có helper chống CSRF cho route handler. Đây cũng là khuôn của task (`app/(app)/van-hanh/cong-viec/attachments-actions.ts:17`).
- Tải tệp: `Content-Disposition: attachment` mặc định; `?xem=1` thì `inline` để mở thẳng trên tab mới. Thêm các header `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, `Cache-Control: private, no-store`.
- Đường lưu: `contract-scans/{projectId}/{contractId}/{uuid}-{safeFilename}` qua `store.putFile`. Kiểm magic bytes bằng `validateMagicBytes` (`lib/task/file-signature.ts:35`). Nếu ghi DB lỗi thì xóa tệp đã ghi (theo `lib/task/attachment-service.ts:110-137`).
- **Cổng kiểm:** thêm `scan-actions.ts` vào `test/risk-manifest-server-actions.ts` (P0) và `ACTION_MODULES`; thêm route vào `test/risk-manifest.ts` (P0, `confidential`) và `API_MODULES`; thêm trang chi tiết vào `PROJECT_PAGE_FILES` (main `test/unit/module-release-entrypoints.test.ts:7-60`); thêm `owner-invoice-service.ts` vào `serviceFiles` (main `lib/du-an/__tests__/project-service-acl-contract.test.ts:5-23`). Mỗi hàm export trong `scan-actions.ts` gọi đúng một lần `await requireReleasedModuleRequest(`, vì test đếm số lần gọi bằng số hàm.

## 3. Đặc tả màn hình

### 3.1 Danh mục (`hop-dong-client.tsx`)

- **Đổi `DataGrid` thành bảng thường (`components/ui/table.tsx`).**
  - Vì sao: `DataGrid` không có sự kiện bấm dòng hay ô link (`components/data-grid/types.ts:24-61`), bấm ô là vào chế độ sửa. Hơn nữa `patchContract` gửi lại toàn bộ input (`hop-dong-client.tsx:150-186`), nên thêm trường mới vào đó dễ lặp lại lỗi "sửa làm mất trường" (commit a6fef44).
  - Hệ quả: việc sửa chuyển sang hộp thoại. Đây là một đổi trải nghiệm, ghi ở câu hỏi Q5.
- **Cột:**
  - Tên tài liệu: link sang chi tiết, cả dòng bấm được;
  - Loại: Hợp đồng, Giấy phép, Bảo hiểm, Biên bản nghiệm thu, Khác;
  - Đối tác: "NCC · tên", "Đội · tên", "CĐT · tên". Hợp đồng chưa gắn mã thì hiện `partyName` chữ xám, kèm nhãn "chưa gắn danh mục";
  - Giá trị theo DT, Giá trị theo TT;
  - Công nợ còn lại (TT): NCC/đội lấy `cuoiKyTt` của cặp, CĐT lấy "CĐT còn phải trả". Hợp đồng không phải kinh tế ghi "—";
  - Ngày ký, Hết hạn (giữ huy hiệu đỏ/vàng của `settings.contractWarningDays`), Trạng thái, Scan ("2 tệp");
  - Nút Sửa và Xóa, chỉ hiện khi có quyền `edit`. Xóa phải xác nhận.
- Cột công nợ được tính bằng một lần `queryDetailReport` cho material và một lần cho labor theo dự án, rồi tra theo `partyId`. CĐT tính một lần. Dùng chung hàm thuần với màn chi tiết để hai màn không lệch nhau.
- Danh mục trống: "Chưa có hợp đồng nào. Bấm «Thêm hợp đồng» để tạo; bản scan có thể đính kèm sau."
- Nếu có hợp đồng loại "Hợp đồng" mà chưa gắn đối tác: hiện băng xám "N hợp đồng chưa gắn đối tác nên chưa có số liệu, bấm Sửa để gắn". Băng này dành cho dữ liệu import cũ.

### 3.2 Form hợp đồng (`hop-dong-form.tsx`, dùng cho cả thêm và sửa, trong `CrudDialog`)

1. Tên tài liệu*; Loại tài liệu* (5 loại; `contractSchema.docType` ở `lib/du-an/schemas.ts` mở rộng đủ 5, nếu không thì sửa dòng import loại `insurance` sẽ bị zod từ chối); Trạng thái.
2. Khi Loại = Hợp đồng, hiện ô chọn "Đối tác của hợp đồng" gồm: NCC vật tư, Đội thi công, Chủ đầu tư, Khác (không tổng hợp số liệu).
   - **NCC:** `<select>` có hai nhóm, "Đã có giao dịch ở công trình này" và "NCC khác", cuối danh sách là `<QuickCreateOption />`. Dùng `useLocalQuickCreate` + `useQuickCreatePick` + `useOptionsWithCreated("supplier", …)`, render `element` ngoài `<form>` như `components/vat-tu-ncc/delivery-form.tsx:47-48,194`. Nhóm đầu để tránh gắn nhầm NCC trùng tên (bản sao có "Kim Khí" #51 rỗng bên cạnh "Thương Hiệu Trần" #44).
   - **Đội thi công:** tương tự, kind `contractor`. Mục "+ Tạo mới…" chỉ hiện với admin (`app/(app)/layout.tsx:48`), người khác chỉ chọn được.
   - **CĐT:** chỉ đọc, "CĐT: {ownerInvestor}". Nếu dự án chưa có tên CĐT thì hiện câu "Dự án chưa ghi tên CĐT, sửa ở thông tin dự án" (nút sửa dự án đã có từ commit 5c0dae8).
   - **Khác:** ô chữ `partyName`.
3. Khi đối tác là NCC, đội hoặc CĐT: có hai ô "Giá trị theo DT (VND)" và "Giá trị theo TT (VND)". Các trường hợp còn lại chỉ có một ô "Giá trị (VND)", lưu vào `valueVnd`.
4. Ngày ký, Ngày hết hạn, Nơi lưu bản gốc, Ghi chú (`note` trước đây chưa có trong form).
5. Đổi loại đối tác thì xóa khóa cũ. Zod `superRefine` kiểm khóa có khớp với loại đối tác không. Lỗi CHECK hoặc FK của DB được đổi thành câu tiếng Việt trả qua `ActionResult`.

### 3.3 Màn chi tiết `/du-an/[id]/hop-dong/[contractId]`

Đầu trang có link "← Danh mục hợp đồng", tên tài liệu, các huy hiệu loại, trạng thái và hạn, cùng nút Sửa/Xóa nếu có quyền `edit`. Sau khi xóa thì quay về danh mục.

1. **Thông tin hợp đồng:** đối tác, ngày ký, hết hạn, nơi lưu bản gốc, ghi chú, và "Nhập từ file (lần import #N)" nếu có `importRunId`.
2. **Bản scan:**
   - Bảng tệp gồm tên, loại, cỡ, người tải, ngày, cùng các nút "Xem" (mở tab mới, `?xem=1`), "Tải về", "Xóa" (chỉ quyền `edit`, có xác nhận).
   - Có vùng kéo-thả và nút "Tải lên bản scan" cho nhiều tệp. Client kiểm trước và tải từng tệp một; mỗi tệp có trạng thái riêng (đang tải, xong, lỗi kèm lý do).
   - Thông báo lỗi: "«x.docx»: chỉ nhận PDF, JPG, PNG"; "«y.pdf» nặng 31,2 MB, tối đa 25 MB".
   - Chưa có tệp: "Chưa có bản scan. Bản scan không bắt buộc." Người chỉ có quyền đọc thấy "Bạn chỉ có quyền xem và tải bản scan."
3. **Giá trị hợp đồng** (chỉ hợp đồng kinh tế): hai thẻ DT và TT. Thẻ chưa nhập ghi "Chưa nhập", kèm nút "Nhập giá trị" (mở form sửa) nếu có quyền `edit`. Khi nhóm có từ 2 hợp đồng: băng vàng "Công trình có N hợp đồng với {đối tác}: [link từng hợp đồng]. Số liệu bên dưới gộp chung N hợp đồng và so với tổng giá trị: DT x, TT y."
4. **Ba danh sách:**
   - Mỗi danh sách là một khối thu gọn được, tiêu đề có số dòng (ví dụ "Lấy hàng (124 dòng)"). Dòng tổng ghim cuối bảng; bảng cuộn khi quá 15 dòng.
   - Dưới tiêu đề ghi nguồn, ví dụ "Nguồn: Sổ công nợ vật tư (phiếu lấy hàng, thuế HĐ, điều chỉnh tăng)", kèm link "Sửa ở sổ gốc →" tới màn nhập liệu tương ứng.
   - Danh sách rỗng: "Sổ công nợ nhân công chưa có giao dịch của {đội} ở công trình này" (CĐT: "Chưa có nghiệm thu nào có giá trị CĐT"). Tổng ghi 0, không lỗi (AC3).
   - Có thêm băng "Số liệu cộng từ N Chủ thể: …" khi cặp có từ 2 Chủ thể, và băng đỏ khi danh sách lệch báo cáo (mục 2.2).
5. **Công nợ:** các dòng theo mục 2.3. Mỗi dòng có tooltip ghi công thức bằng chữ.
6. **Phần hợp đồng chưa thực hiện:** bảng 3×2 ở mục 2.3.

Hợp đồng không phải kinh tế (giấy phép, bảo hiểm, nghiệm thu, khác, hoặc "Hợp đồng" chưa gắn đối tác) chỉ có mục 1 và 2 (AC7). Riêng loại "Hợp đồng" chưa gắn đối tác có thêm câu "Gắn đối tác để xem số liệu" và nút Sửa.

### 3.4 Sổ hóa đơn xuất CĐT (đặt trong khối "Hóa đơn đã xuất cho CĐT" của hợp đồng CĐT)

- **Chọn đặt ở đây** vì đây là nơi duy nhất dùng sổ, và kế toán nhập ngay cạnh số nghiệm thu và số tiền đã nhận. Đặt ở tab Nghiệm thu sẽ tách người nhập khỏi chỗ đối chiếu.
- Sổ thuộc dự án, nên một dòng ghi chú báo: "Sổ dùng chung cho mọi hợp đồng CĐT của công trình."
- Có quyền `create` thì bảng có hàng nhập ở đầu: Ngày HĐ*, Số HĐ*, Giá trị chưa VAT*, VAT, Tổng (tự tính, chỉ đọc), Đợt nghiệm thu (gợi ý bằng datalist các `acceptanceBatch` của dự án), Ghi chú, nút "Thêm".
- Mỗi dòng có nút Sửa (sửa ngay trên dòng) và Xóa, cần quyền `edit`. Các thông báo: "Đã thêm hóa đơn 0000123"; "Số hóa đơn 0000123 đã có trong sổ (ngày 05/10/2026)"; "Nhập giá trị khác 0".
- Hàng nhập dùng `ActionResult`. Thêm, sửa hoặc xóa xong thì gọi `router.refresh()` để khối công nợ tính lại.

## 4. Các phase

Thứ tự là P1 → P2 → P3 → P4 → P5. Riêng thư mục `lib/du-an/contract-detail/` của P3 có thể làm song song với P2, vì hai phase không chung tệp nào. Tệp `[contractId]/page.tsx` thuộc P2; P3 và P4 chỉ thêm component con và một dòng render.

**Quy trình kiểm chung cho mọi phase:**
- Trong lúc làm, chạy `next dev --webpack -p 3002` trỏ vào DB bản sao (đăng nhập ở 3001 thì 3002 cũng đăng nhập theo).
- Cuối phase: dựng lại image 3001 theo cách đã quen (worktree build + patch), đặt tag `docker-erp-3001:ban-sao-hop-dong-pN`, giữ image cũ để quay lại.
- Lệnh: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm risk:verify`. Integration chạy từ PowerShell với container Postgres tạm `127.0.0.1:55432`.

### P1: Schema, migration và gắn đối tác cho hợp đồng (≈1,5 ngày)

- **Mục tiêu:** tạo, sửa được hợp đồng có loại đối tác, đối tác có mã, và hai giá trị DT/TT. Danh mục hiện các cột mới, trừ cột công nợ.
- **Phụ thuộc:** PR #21 đã merge. Mở nhánh `feat/du-an-danh-muc-hop-dong` từ `origin/main`. Nếu #21 chưa merge thì rebase lên `feat/master-data-quick-create`.
- **Tệp:**
  - sửa `prisma/schema.prisma` (ProjectContract cùng ba model và back-relation trên Supplier, Contractor, Project, User);
  - tạo `prisma/migrations/20261118120000_du_an_danh_muc_hop_dong/migration.sql`;
  - sửa `lib/du-an/schemas.ts`, `lib/du-an/contract-service.ts`;
  - sửa `app/(app)/du-an/[id]/hop-dong/{page.tsx,hop-dong-client.tsx,hop-dong-form.tsx}`;
  - tạo `lib/du-an/contract-labels.ts` (nhãn tiếng Việt của docType, partyKind và status, dùng chung cho danh mục và chi tiết);
  - tạo `lib/du-an/__tests__/contract-schema.test.ts`.
- **Các bước:**
  1. Đếm `project_contracts` trên bản sao.
  2. Sao lưu: `pg_dump -Fc` trong `ngoquyen-bansao-pg`, đặt tên `bansao-truoc-danh-muc-hop-dong-20261118.dump`.
  3. Chạy `prisma migrate status` với `host-migrate.env` để xác nhận bản sao đã có `20261117160000`.
  4. Viết schema và migration (CHECK, unique một phần bằng raw SQL), rồi chạy `prisma migrate deploy`.
  5. Zod: thêm 5 docType, `partyKind`, `supplierId`, `contractorId`, `valueTtVnd`, kèm `superRefine`.
  6. Service: snapshot `partyName`; dùng `runEntryAction`; viết `listContractPartyOptions` (NCC có giao dịch trong dự án bằng `SELECT DISTINCT "partyId"`).
  7. Danh mục dạng bảng; form như mục 3.2.
- **Kiểm:**
  - test schema: NCC thiếu `supplierId` bị từ chối; giấy phép mà có `partyKind` bị từ chối;
  - integration: CHECK chặn ở tầng DB; `valueVnd` cũ không đổi;
  - trên 3001: tạo hợp đồng NCC (dự án 4) bằng picker; tạo NCC mới bằng "+ Tạo mới…" (admin); sửa sang Đội; tab Dashboard vẫn hiện hợp đồng sắp hết hạn; các tab Nghiệm thu, Dòng tiền 3 bên, DT-HĐ-TT vẫn mở được.
- **Rollback:** chạy SQL đảo ngược (mục 6) hoặc khôi phục dump, rồi quay lại image cũ.

### P2: Màn chi tiết, thông tin hợp đồng và bản scan (≈1,5 ngày)

- **Mục tiêu:** bấm một hợp đồng thì mở màn chi tiết với mục Thông tin và Bản scan dùng được đầy đủ.
- **Phụ thuộc:** P1.
- **Tệp:**
  - tạo `app/(app)/du-an/[id]/hop-dong/[contractId]/page.tsx` (`params: Promise<{ id: string; contractId: string }>`, như `app/api/tasks/[id]/attachments/[attId]/route.ts:12-14`; đọc hướng dẫn dynamic segment trong `node_modules/next/dist/docs/` trước khi viết);
  - tạo `contract-detail-client.tsx` (đầu trang, Sửa/Xóa dùng lại `ContractForm`);
  - tạo `contract-scan-section.tsx`, `scan-actions.ts`;
  - tạo `lib/du-an/contract-scan-service.ts` (không "use server": kiểm loại và cỡ, magic bytes, ghi tệp, ghi dòng, xóa mềm, đọc stream);
  - tạo `app/api/du-an/[id]/hop-dong/[contractId]/scan/[scanId]/route.ts`;
  - sửa `test/risk-manifest.ts`, `test/risk-manifest-server-actions.ts`, `test/unit/module-release-entrypoints.test.ts`;
  - tạo `test/integration/du-an-contract-scan.integration.test.ts`.
- **Các bước:**
  1. Trang tra hợp đồng bằng `{ id, projectId, deletedAt: null }`, không thấy thì `notFound()`.
  2. Action upload: lấy `contractId` và `file` từ FormData; `findUnique` hợp đồng; nếu đã xóa hoặc khác dự án thì trả `rowGone`; gọi guard `edit` theo `projectId` lấy từ DB; gọi service. Kết quả trả `ActionResult`.
  3. Route GET: guard `read` theo `id` trên URL; tra scan với `contractId`, `contract.projectId = id`, `deletedAt` null ở cả hai; stream tệp kèm header như mục 2.4; lỗi module trả 503, 403 hoặc 401 như route của task.
  4. Kiểm giới hạn 25 MB với cấu hình `serverActions.bodySizeLimit: "25mb"` (`next.config.ts:39-40`) bằng một tệp đúng 25 MB. Nếu Next chặn trước (do phần bao multipart), đổi giới hạn thành `"26mb"` và ghi chú lý do. Client vẫn chặn tệp lớn hơn 25 MB.
- **Kiểm:**
  - integration đủ allow, deny, cross-scope, audit, recovery (bảng mục 5);
  - `pnpm risk:verify` xanh;
  - trên 3001: tải lên 3 tệp (PDF, JPG, PNG) cùng lúc; tệp .docx và tệp 30 MB bị từ chối với câu tiếng Việt; tài khoản chỉ có quyền đọc thì không thấy vùng tải lên nhưng vẫn "Xem" được; dán URL tải của dự án khác thì nhận 404/403.
- **Rollback:** quay lại image P1. Bảng scan vẫn còn nhưng không được dùng; tệp nằm dưới `uploads/contract-scans/`.

### P3: Hàm tổng hợp và số liệu cho NCC và đội (≈2 ngày)

- **Mục tiêu:** hợp đồng NCC hiện đủ mục 3 đến 6 của màn chi tiết, khớp sổ công nợ vật tư. Danh mục có cột công nợ. Hợp đồng đội hiện danh sách rỗng đúng cách.
- **Phụ thuộc:** P2 (trang). Phần thư mục `lib/` làm được ngay sau P1.
- **Tệp:**
  - tạo trong `lib/du-an/contract-detail/`: `contract-detail-types.ts`, `build-contract-summary.ts` (thuần: bucket, gộp hóa đơn, tổng Decimal, công nợ, phần chưa thực hiện, banner, cờ lệch), `ledger-party-source.ts`, `contract-group.ts`, `contract-detail-service.ts` (`getContractDetail`, `getContractListBalances`, có guard read), `__tests__/build-contract-summary.test.ts`;
  - tạo `app/(app)/du-an/[id]/hop-dong/[contractId]/{contract-value-section.tsx,contract-source-lists.tsx,contract-debt-section.tsx}`;
  - sửa `[contractId]/page.tsx` và `hop-dong-client.tsx` (thêm cột công nợ);
  - tạo `test/integration/du-an-contract-detail.integration.test.ts`.
- **Các bước:** viết hàm thuần trước, test trước; rồi đến SQL dòng chi tiết; rồi service (`queryDetailReport` lọc `partyId`); cuối cùng là UI.
- **Kiểm:**
  - unit có fixture gồm đầu kỳ, `lay_hang` có và không có số HĐ, `thue_hd`, `dieu_chinh` dương và âm, `thanh_toan` có TT khác HĐ;
  - integration: tổng trên màn bằng dòng `queryDetailReport` của cặp;
  - trên 3001: gắn một hợp đồng với NCC "Nam Hương" ở dự án 4. Mở `/cong-no-vt/chi-tiet`, lọc dự án 4 và so từng số: Phát sinh TT bằng Σ lấy hàng, Phát sinh HĐ bằng Σ hóa đơn, Đã trả TT/HĐ, Cuối kỳ TT bằng "Còn phải trả theo thực tế". Đối chiếu NCC Nam Hương × MNTC-GD1 với số cuối kỳ đã ghi 100.587.760 (memory 11/11, cần đo lại vì đã có sửa sau đó [UNVERIFIED]);
  - tạo hợp đồng thứ hai cùng NCC thì thấy băng gộp;
  - hợp đồng đội (sau khi tạo nhanh một đội) hiện ba danh sách rỗng, tổng 0.
- **Rollback:** quay lại image P2. Phase này chỉ đọc, không có dữ liệu.

### P4: CĐT, gồm sổ hóa đơn xuất và nguồn của CĐT (≈1,5 ngày)

- **Mục tiêu:** hợp đồng CĐT có đủ số liệu, nhập được hóa đơn xuất CĐT ngay trên màn.
- **Phụ thuộc:** P3.
- **Tệp:**
  - tạo `lib/du-an/owner-invoice-service.ts`, `lib/du-an/contract-detail/owner-party-source.ts`, `app/(app)/du-an/[id]/hop-dong/[contractId]/owner-invoice-book.tsx`;
  - sửa `lib/du-an/schemas.ts` (thêm `ownerInvoiceSchema`), `build-contract-summary.ts` (nhánh CĐT), `contract-source-lists.tsx`, `lib/du-an/__tests__/project-service-acl-contract.test.ts`;
  - mở rộng `test/integration/du-an-contract-detail.integration.test.ts`.
- **Các bước:**
  1. Service theo khuôn của ACL contract test: tên hàm `create…`, `update…`, `softDelete…`, `list…`; `findUnique` cùng `existing.projectId !==`; trả `runEntryAction`.
  2. Lỗi unique 23505 đổi thành câu báo trùng số hóa đơn.
  3. Nguồn CĐT có `cty_to_cdt` mang dấu âm.
  4. Viết UI sổ.
- **Kiểm:**
  - unit nhánh CĐT có hoàn trả;
  - integration AC3: nhập một nghiệm thu, một dòng `cdt_to_cty`, một hóa đơn thì số hiện đúng;
  - trên 3001, ở một dự án: tạo hợp đồng CĐT, thấy ba danh sách rỗng; nhập nghiệm thu ở tab Nghiệm thu (giá trị CĐT 100 triệu), dòng tiền CĐT → Cty 60 triệu, hóa đơn 0000123 (chưa VAT 80 triệu, VAT 8 triệu); quay lại màn hợp đồng kiểm các số còn phải trả; nhập trùng số thì nhận câu báo trùng. Hoàn tác dữ liệu thử bằng khôi phục dump.
- **Rollback:** quay lại image P3. Bảng hóa đơn CĐT bị bỏ trống, không mất gì của sổ khác.

### P5: Hoàn thiện, tài liệu, chạy thử toàn bộ (≈1 ngày)

- **Mục tiêu:** đủ cổng CI, có hướng dẫn người dùng, đã chạy thử toàn bộ AC trên 3001, có ghi chú triển khai production.
- **Phụ thuộc:** P4.
- **Tệp:**
  - sửa `docs/user-guide/` (tệp hướng dẫn module Dự án, [UNVERIFIED] tên tệp, cần tìm khi làm) và `docs/system-architecture.md` (nếu tài liệu có mô tả bảng);
  - sửa runbook triển khai (`plans/261118-1016-danh-muc-hop-dong-du-an/` phase cuối).
- **Các bước:** chạy toàn bộ test matrix; đi hết danh sách AC trên 3001 kèm ảnh chụp; viết runbook production (mục 6).
- **Kiểm:** `pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm risk:verify` xanh, `pnpm test:integration` xanh (PowerShell).

## 5. Test matrix

| AC | Unit | Integration | Tay trên 3001 |
|---|---|---|---|
| 1 Bấm mở chi tiết | — | — | P3: bấm tên hợp đồng NCC ở dự án 4 |
| 2 Khớp từng đồng | `build-contract-summary`: bucket và tổng Decimal; cờ lệch | Σ danh sách = `queryDetailReport` (phatSinh, daTra, cuoiKy, TT/HĐ) có đầu kỳ, `dieu_chinh` âm, `thue_hd` | P3: so với `/cong-no-vt/chi-tiet` |
| 3 Đội/CĐT rỗng rồi có số | danh sách rỗng ra tổng 0; CĐT có hoàn trả | thêm giao dịch labor, nghiệm thu, `cdt_to_cty`, hóa đơn xuất CĐT thì số đúng | P3 (đội), P4 (CĐT) |
| 4 Phần chưa thực hiện | ô ghi "chưa nhập giá trị"; "Vượt"; nhóm có một hợp đồng thiếu giá trị | — | P3 |
| 5 Băng gộp | `contract-group`: N và tổng giá trị | 2 hợp đồng cùng NCC | P3 |
| 6 Scan | `contract-scan-service`: mime, cỡ, magic bytes | allow (edit tải lên, read tải về); deny (read upload hoặc xóa thì `ok:false`); cross-scope (scan của dự án A qua URL dự án B trả 404; người ngoài dự án trả 403); hợp đồng đã xóa mềm trả 404; audit (có dòng audit khi tạo và xóa); recovery (xóa mềm xong tệp vẫn còn, khôi phục được) | P2 |
| 7 Loại khác chỉ thông tin + scan | render theo `partyKind` NULL | — | P2/P3: mở một giấy phép |
| 8 `valueVnd` thành DT, migration rollback | — | migration giữ `valueVnd`; chạy SQL đảo ngược trên DB test rồi `migrate deploy` lại | P1 |
| 9 Cổng CI | ACL contract test, entrypoint test | toàn bộ | P5 |

## 6. Migration, rollback, sao lưu, an toàn production

- **Trước khi migrate:** `pg_dump -Fc` (bản sao: `docker exec ngoquyen-bansao-pg pg_dump -Fc …`, rồi `docker cp` vào `C:\Users\tranv\.ngoquyen-ban-sao\backups\`). Image không tự migrate khi khởi động, nên chạy `prisma migrate deploy` bằng `host-migrate.env`.
- **SQL đảo ngược** (ghi trong phase P1, không đặt trong thư mục migration):
  `BEGIN; DROP TABLE project_owner_invoices; DROP TABLE project_contract_attachments; ALTER TABLE project_contracts DROP CONSTRAINT project_contracts_party_link_check, DROP CONSTRAINT project_contracts_party_doc_type_check, DROP COLUMN "partyKind", DROP COLUMN "supplierId", DROP COLUMN "contractorId", DROP COLUMN "valueTtVnd"; DELETE FROM "_prisma_migrations" WHERE migration_name='20261118120000_du_an_danh_muc_hop_dong'; COMMIT;`
  Lệnh này làm mất liên kết đối tác, giá trị TT, metadata scan và hóa đơn xuất CĐT. Trên production chỉ chạy sau khi đã xuất các bảng đó ra; cách thay thế là khôi phục dump.
- **Production (admin-pc) không động tới trong plan này.** Runbook cho lần triển khai sau:
  1. `SELECT "docType", count(*) FROM project_contracts WHERE "deletedAt" IS NULL GROUP BY 1` và kiểm không có `valueVnd < 0` lạ;
  2. sao lưu DB;
  3. **sao lưu cả thư mục `UPLOAD_DIR`**, vì scan nằm trên đĩa chứ không nằm trong DB; kiểm volume uploads của container production có được mount bền không [UNVERIFIED];
  4. `migrate deploy`;
  5. chạy thử AC1, AC2 trên một cặp có thật.
- **Không commit** `Quản Lý Công Nợ/` và `.claude/agent-memory/`.

## 7. Năm rủi ro lớn nhất

| # | Rủi ro | Khả năng × Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| 1 | Tổng trên màn lệch báo cáo công nợ (làm tròn, dòng đã xóa, phân loại) | Trung bình × Cao | Khối công nợ lấy thẳng từ `queryDetailReport`; danh sách cộng bằng Decimal với fragment dùng chung; cờ lệch hiện băng đỏ; integration so từng trường |
| 2 | Gắn nhầm NCC trùng tên nên số bằng 0 hoặc sai | Cao × Trung bình | Nhóm "Đã có giao dịch ở công trình này" trong picker; danh sách rỗng ghi rõ "NCC này chưa có giao dịch…"; danh mục hiện tên có mã |
| 3 | Lộ scan qua IDOR hoặc tải nội dung độc | Thấp × Cao | Guard theo URL rồi tra dòng ràng buộc `contract.projectId = id`; xóa mềm trả 404; magic bytes; `nosniff` + `CSP sandbox`; manifest P0 cùng 5 loại test |
| 4 | Lỗi bị che trên production hoặc giới hạn body chặn tệp 25 MB | Trung bình × Trung bình | Dùng `ActionResult` + `runEntryAction`; client kiểm trước; test biên tệp 25 MB, chỉnh `bodySizeLimit` nếu cần |
| 5 | Người chỉ có quyền đọc `du-an` thấy công nợ NCC, vốn thuộc module `cong-no-vt` | Trung bình × Trung bình | Theo quyết định brainstorm (xem cần `du-an` read); nêu ở Q4 để người dùng xác nhận; số hiển thị chỉ cho một cặp trong dự án người đó được xem |

Rủi ro phụ: hoàn tác import bị chặn khi hợp đồng import đã có scan. Đây là hành vi mong muốn, câu báo đã có sẵn.

**Giả định chưa kiểm [UNVERIFIED]:**
- `"25mb"` của Next nghĩa là 25 MiB, và phần bao multipart có làm vượt giới hạn không;
- bản sao đã có migration `20261117160000`;
- số dòng `project_contracts` trên production;
- volume uploads của production;
- tên tệp hướng dẫn người dùng của module Dự án;
- số cuối kỳ hiện tại của Nam Hương × MNTC-GD1 trên bản sao.

## 8. Tiêu chí xong (đo được)

- Đủ 9 AC, mỗi AC có bằng chứng (test xanh hoặc ảnh chụp trên 3001).
- Không tab nào của dự án lỗi: mở lần lượt 14 tab của dự án 4 sau P5.
- `risk:verify`, typecheck, lint, vitest unit và integration đều xanh.

## Câu hỏi còn mở

1. **Q1.** "Hóa đơn còn phải lấy" và khối "phần chưa thực hiện": plan đang loại số dư đầu kỳ chuyển sang (chỉ tính phát sinh). Với những cặp có đầu kỳ (30 cặp giữ số dư từ workbook), người dùng có muốn cộng đầu kỳ vào lũy kế lấy hàng và chuyển tiền không?
2. **Q2.** `ProjectAcceptance.amountCdtVnd` đã gồm VAT chưa? Plan so hóa đơn xuất CĐT theo tổng gồm VAT; nếu nghiệm thu là số chưa VAT thì phải so theo cột chưa VAT.
3. **Q3.** Số hóa đơn xuất CĐT có thể trùng giữa hai ký hiệu hóa đơn khác nhau không? Nếu có, cần thêm cột ký hiệu vào khóa unique.
4. **Q4.** Người chỉ có quyền đọc module Dự án có được thấy công nợ NCC và đội trên màn hợp đồng không, hay phải có thêm quyền đọc `cong-no-vt`/`cong-no-nc`?
5. **Q5.** Danh mục bỏ sửa trực tiếp trong lưới, chuyển sang hộp thoại Sửa (để bấm dòng mở được chi tiết). Người dùng có chấp nhận không?
