# Red team — Góc nhìn Phạm vi & Độ phức tạp (kèm vai trò Contract Verifier)

- Ngày: 05/11/2026
- Đối tượng: `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/plan.md` + phase 01–08
- Ràng buộc: D1–D7 và kết quả trong brainstorm là phạm vi được yêu cầu, không phải phát hiện. Chỉ đánh dấu phần **thêm ngoài yêu cầu**, phần **phức tạp hơn mức cần** cho một yêu cầu, và chỗ **hai cơ chế làm cùng một việc**.
- Mọi trích dẫn file:line đã kiểm bằng grep/đọc mã trên `main` (df1e1e7).

---

## Finding 1: 5 CHECK `NOT VALID` là lớp thứ năm cho cùng quy tắc I1, kéo theo một dây chuyền việc ngoài yêu cầu
- **Severity:** High
- **Location:** Phase 1, mục "Nội dung migration" (5 lệnh `ADD CONSTRAINT … NOT VALID`); Phase 5, dòng `adapter-registry.ts`; Phase 8, runbook bước 6.
- **Flaw:** Yêu cầu ("sổ vật tư mới phải có công trình; đợt `vat_tu` phải có công trình") đã được chặn ở 4 lớp khác trong chính kế hoạch: zod (phase 2 `schemas.ts`), kiểm ở service (ledger-service nhánh material, `payment-ledger-sync`, `upsertItem`), chữ ký hàm không mặc định, và kiểm `missing_project` có sẵn khi chốt kỳ (`lib/vat-tu-ncc/period-close-service.ts:128,269`). Lý do kế hoạch đưa ra cho CHECK là "chặn cả đường ghi SQL thô". Nhưng trong mã chỉ có các đường ghi SQL thô vào các bảng này: `cong-no-vat-tu.adapter.ts:166,191`, `gach-nam-huong.adapter.ts:223`, `quang-minh.adapter.ts:221` (kế hoạch xóa cả ba) và `cong-no-nhan-cong.adapter.ts:181,205` (sổ nhân công, CHECK miễn trừ). Sau phase 5, đường ghi thô duy nhất là adapter mới do kế hoạch tự viết và tự đối soát. Như vậy CHECK chỉ chặn những đường ghi sẽ không còn tồn tại.
  Hệ quả dây chuyền do CHECK gây ra:
  1. Gỡ `gach-nam-huong`, `quang-minh` chỉ vì "vi phạm CHECK ở phase 1" (phase 5).
  2. Phải dọn pilot bằng `DELETE`, không được xóa mềm (phase 1, dòng 60).
  3. Thêm bước `VALIDATE` kèm nhánh "dừng và hỏi người dùng" giữa lúc go-live (phase 8, bước 6).
  4. Mọi `UPDATE` vào dòng cũ thiếu công trình đều lỗi 23514 khi chạy: `adminPatchMaterialTransaction` (`lib/cong-no-vt/material-ledger-service.ts:138-147`); cập nhật dòng đợt (`lib/payment/payment-service.ts:266,363,409,472,495,534`); `closeRound` → `syncClosedRoundToLedger` insert sổ với `projectId: item.projectId` (`lib/payment/payment-ledger-sync.ts:47`).
- **Failure scenario:** Điều kiện CHECK không loại trừ dòng đã xóa mềm, trong khi codebase xóa mềm khắp nơi (`reconciliation-service.ts:140`, `delivery-service.ts:159,164`, `ledger-service.ts:249`). Mọi dòng `supplier_reconciliations` hiện có, kể cả dòng đã xóa mềm, đều có `projectId` NULL vì cột mới thêm. Do đó `VALIDATE CONSTRAINT supplier_recon_project_required` sẽ hỏng, trừ khi danh sách dọn có cả dòng đã xóa mềm và các đợt thanh toán cũ. Runbook xử lý chỗ này bằng cách "dừng và hỏi" trong lúc hệ thống đang đóng băng. Nếu để CHECK mãi ở `NOT VALID`, đảm bảo ở tầng DB không bao giờ có, nhưng mọi chi phí ở trên vẫn phải trả.
  Index `LedgerTransaction @@index([ledgerType, projectId, date])` cũng là thêm thắt. Đã có `@@index([ledgerType, entityId, partyId, projectId, date])` (`prisma/schema.prisma:740`); sổ vật tư chỉ khoảng 1.000 dòng/năm (922 dòng trong 10 tháng); `queryDetailReport` vốn GROUP BY toàn bộ. Index `(projectId, date)` cho phiếu ngày thì brainstorm có yêu cầu, nên giữ.
- **Evidence:** Phase 1: "`CHECK ("ledgerType" <> 'material' OR "projectId" IS NOT NULL) NOT VALID` … `CHECK ("projectId" IS NOT NULL) NOT VALID`". Phase 5: "Gỡ … vì cả ba ghi dòng không có công trình (vi phạm CHECK ở phase 1)". Phase 8, bước 6: "CHECK nào không qua thì dừng và hỏi người dùng".
- **Suggested fix:** Bỏ 5 CHECK và index sổ cái. Giữ zod + guard service (đúng phần được yêu cầu), thêm một đối soát sau import: "0 dòng vật tư thiếu công trình". Nếu người dùng muốn đảm bảo ở DB thì hỏi ở bước validate. Khi đó dọn pilot **trước** migrate, tạo CHECK đã kiểm ngay lúc migrate (không qua NOT VALID rồi VALIDATE), và chỉ đặt trên `ledger_transactions` và `ledger_opening_balances`, nơi chứa tiền.

## Finding 2: Chế độ kép "marker cũ" duy trì mã cho dữ liệu mà runbook xóa vài phút sau migrate
- **Severity:** High
- **Location:** Phase 2, "Quy tắc" (marker cũ khóa toàn NCC); dòng `period-lock.ts` ("cộng marker cũ của NCC"); test (f). Phase 1, index `supplier_recon_legacy_period_unique`. Phase 7, "Guard độc quyền lịch sử" ("NCC trong run còn marker cũ") và mục lỗi chặn "marker cũ". Phase 8, runbook bước 5→6.
- **Flaw:** Mọi kỳ đối chiếu trên DB thật hiện là dữ liệu pilot (`reports/debate-evidence-packet.md:76`: DB thật chứa pilot, gồm 2 kỳ Nam Hương đã ký). Runbook chạy theo thứ tự: đóng băng (bước 1) → migrate (bước 5) → `DELETE` pilot (bước 6). Ngữ nghĩa "marker cũ" chỉ có hiệu lực trong khoảng hệ thống đang đóng băng, và thành mã chết ngay sau `VALIDATE`. Dù vậy, mọi truy vấn kỳ vẫn phải mang thêm nhánh `projectId = p OR projectId IS NULL`:
  - `findSignedPeriodCovering` (`lib/vat-tu-ncc/period-lock.ts:74-83`);
  - `loadPeriodBoundsContext` (`:107-110`);
  - gỡ ký "kỳ sau" (`reconciliation-derive-service.ts:406-411`);
  - tra marker khi chốt (`period-close-service.ts:314-319`);
  - CRUD kỳ (`reconciliation-service.ts`);
  - cộng thêm guard ở phase 7, test (f) và một partial unique index riêng.
  Đây là hai cơ chế cho cùng một việc: mã chạy giữ tương thích, song song với runbook dọn dữ liệu.
- **Failure scenario:** Nhánh `OR projectId IS NULL` không có dữ liệu nào chạy qua sau go-live, nên một lỗi trong đó không kiểm được trên môi trường thật. Ví dụ: gỡ ký "kỳ sau của cùng cặp" bỏ sót một marker NULL. Nếu người dùng chọn giữ dữ liệu pilot (câu hỏi mở 5), sản phẩm ra mắt với khóa toàn NCC lẫn khóa theo cặp, đúng điều D1 đã bác.
- **Evidence:** Phase 2: "Marker cũ (`projectId` NULL) được coi là khóa toàn NCC. Code mới không cho tạo, sửa, ký hay gỡ ký marker cũ; runbook phase 8 dọn chúng". Phase 1 tạo `supplier_recon_legacy_period_unique … WHERE "projectId" IS NULL`.
- **Suggested fix:** Chuyển bước dọn pilot lên **trước** deploy (bước 4.5). Lúc đó chưa có CHECK, nên `DELETE` hay xóa mềm đều được. Thêm điều kiện tiên quyết "0 kỳ có `projectId` NULL" trước khi migrate. Sau đó xóa ngữ nghĩa marker cũ, index legacy, test (f) và guard marker cũ ở phase 7.

## Finding 3: Bốn cơ chế chống trùng/nhất quán cho cùng một nút "Ghi"
- **Severity:** High
- **Location:** Phase 5, dòng `import-engine.ts` (`pg_advisory_xact_lock(hashtext('import-commit'))`, kiểm hash trong transaction, chạy lại `review` + so digest, `blocking`, `ack`) và dòng `file-bundle.ts` (`bundleHash` tất định). Phase 7, "Guard độc quyền lịch sử" và "Thứ tự ghi" bước 1 (`lockSuppliers`). V6, V7.
- **Flaw:** Với adapter gói duy nhất, guard độc quyền chạy dưới `lockSuppliers` trong cùng transaction đã:
  - (a) tuần tự hóa hai commit đồng thời: commit thứ hai chờ khóa NCC rồi thấy dữ liệu của commit thứ nhất;
  - (b) từ chối import lại cả khi file đã sửa (chính kế hoạch viết "chặn cả trường hợp file đã sửa, hash khác").

  Vì vậy khóa toàn cục `import-commit`, kiểm hash trong transaction và `bundleHash` tất định (NFC, sắp xếp, `path\tsha256`) là thừa với adapter này. Với các adapter một file, đó là gia cố một engine không ai yêu cầu đổi: kiểm tra cũ nằm ngoài transaction (`lib/import/import-engine.ts:95-118`), nhưng nút commit đã tự khóa khi đang chạy (`app/(app)/admin/import/[runId]/commit-panel.tsx:56`).
  Digest và "chạy lại review + `blocking` rỗng + đủ `ack`" cũng trùng việc: nếu commit chạy lại review trên nguồn đã lưu và đòi đủ mọi mã `ack` hiện hành, người dùng chắc chắn đã xác nhận mọi thứ có thể đổi dữ liệu. So digest chỉ thêm từ chối giả.
- **Failure scenario:** Review chứa "toàn bộ bản ghi" cho các select ánh xạ (phase 5, review-panel), và digest là "sha256 của JSON chuẩn tắc" (phase 7, review-builder). Nếu digest phủ cả danh sách lựa chọn, chỉ cần ai đó thêm một vật tư ở master data giữa "Lưu & tính lại" và "Ghi" là digest đổi và commit bị từ chối giữa go-live. Người dùng phải tính lại preview của 27 file trong cửa sổ đóng băng. Một nút có bốn lý do từ chối khác nhau cũng khó gỡ lỗi.
- **Evidence:** Phase 5: "`pg_advisory_xact_lock(hashtext('import-commit'))` → đọc lại run và kiểm hash trùng trong transaction → chạy lại `review`, so digest, yêu cầu `blocking` rỗng và đủ `ack`". Phase 7: "Guard này chặn cả trường hợp file đã sửa, hash khác".
- **Suggested fix:**
  - Giữ: lưu nguồn, timeout, cập nhật trạng thái run trong transaction, chạy lại review trong transaction với `blocking = []` và tập `ack` ⊇ mã bắt buộc.
  - Bỏ: digest (I7), khóa `import-commit`, tính tất định của `bundleHash`.
  - Nếu cần chống bấm hai lần: `UPDATE import_runs SET status='committing' WHERE id=$1 AND status='preview'` như một claim theo dòng.

## Finding 4: Chiến lược "đổi chữ ký không mặc định để tsc liệt kê nơi gọi" bỏ sót consumer không có kiểu; phase 2 sửa nhầm component chết
- **Severity:** High
- **Location:** Phase 2, "Quy tắc" (tsc); dòng "Nơi gọi trong … `components/ledger/{transaction-form-dialog,opening-balance-client}.tsx`"; mục "Tests".
- **Flaw:**
  - Hai component kế hoạch nhắm tới **không được render ở đâu cả**. Chúng chỉ còn qua các shim re-export không ai import: `components/cong-no-vt/transaction-form-dialog.tsx:4`, `components/cong-no-vt/transaction-grid.tsx:6-7`, `app/(app)/cong-no-vt/so-du-ban-dau/so-du-ban-dau-client.tsx:5`. Không có chỗ nào dùng `<TransactionGrid>` hay `<OpeningBalanceClient>`.
  - UI nhập đang chạy thật:
    - `components/ledger-grid/transaction-grid.tsx`, dùng chung cho `app/(app)/cong-no-vt/nhap-lieu/page.tsx:56` **và** `app/(app)/cong-no-nc/nhap-lieu/page.tsx:64`. Cột "Dự án" tùy chọn (`:132`), dòng mới có `projectId: null` (`:170`).
    - `components/ledger-grid/opening-grid.tsx`, dùng ở cả hai trang `so-du-ban-dau/page.tsx:8`.
  - Server action nhận `Record<string, unknown>` (`lib/cong-no-vt/material-ledger-service.ts:110, 159-161, 261, 268-270`), nên tsc không báo `app/(app)/cong-no-vt/nhap-lieu/page.tsx:65-67` và `so-du-ban-dau/page.tsx:50-51`.
  - Fixture zod kiểm lúc chạy, không qua tsc:
    - `lib/vat-tu-ncc/__tests__/period.test.ts:39-59`: base của `deliverySchema` không có `projectId`.
    - `lib/cong-no-vt/__tests__/schemas.test.ts:6-11,31`: kỳ vọng `lay_hang` không có `projectId` vẫn parse được.

    Cả hai đều không nằm trong danh sách test của phase 2.
- **Failure scenario:**
  - Sau phase 2, lưới Nhập liệu (đường nhập tay chính cho `thanh_toan`, `thue_hd`, `dieu_chinh`) dán nhiều dòng có ô Dự án trống → lỗi zod, cả transaction bulk rollback (`material-ledger-service.ts:170-191`).
  - `pnpm test` đỏ ở hai test không phase nào sở hữu.
  - Nếu sửa ngay lưới dùng chung cho bắt buộc công trình thì phá bất biến "Module nhân công không đổi hành vi".
- **Evidence:** Phase 2: "Đổi chữ ký hàm **không có giá trị mặc định**, để `npx tsc --noEmit` liệt kê đủ mọi nơi gọi" và "form sổ vật tư thêm `requireProject`" (trên component chết).
- **Suggested fix:** Thay hai component chết bằng `components/ledger-grid/{transaction-grid,opening-grid}.tsx` cùng hai trang `cong-no-vt/{nhap-lieu,so-du-ban-dau}` trong bảng sở hữu của phase 2/3. Thêm prop `requireProject`, chỉ trang vật tư bật. Đưa hai file unit test vào phase 2. Liệt kê consumer của `deliverySchema|transactionSchema|openingBalanceSchema` bằng grep, không trông vào tsc.

## Finding 5: Đối soát V1–V7 hai cột và ghép phiếu 3 lượt: dựng lại phép tính sổ cái trong bộ nhớ, kiểm lại bất biến đã được bảo đảm bằng cấu trúc
- **Severity:** Medium
- **Location:** Phase 7, "Files to Create" (`projection.ts`, `verification-report.ts`, `delivery-matching.ts`); mục "Đối soát"; "Chống tính trùng → Ghép để kiểm tra"; `cutover-verification.tsx` (cột "xem trước" và "DB"). plan.md Goal 5.
- **Flaw:**
  - (a) `projection.ts` cài lại phép tính nợ theo cặp tại một ngày, việc đã có bằng SQL: `lib/vat-tu-ncc/supplier-balance.ts:21-33`; `lib/cong-no-vt/balance-report-service.ts:108` dùng `increaseSql/decreaseSql`. Nó còn phải chép đúng quy tắc số dư cuối ngày `asOf` (`period-bounds.ts:106-111`). Đây là cài đặt song song; lệch một chi tiết là ra "lệch" giả giữa hai cột.
  - (b) Nhiều V-check kiểm lại điều đã được bảo đảm:
    - V2 đúng theo cấu trúc: `pair-lifetime.ts` chỉ cho mặc định 1 khi S khớp ±1, còn cặp ròng thì ghi thẳng S.
    - V5 là unit test khử trùng.
    - V6 trùng guard độc quyền chạy trong cùng transaction.
    - V7 trùng guard và `supplier_recon_pair_period_unique`.

    Chỉ V1, V3, V4 so với số Excel độc lập.
  - (c) Ghép phiếu lịch sử 3 lượt (một-một, gộp ngày, gợi ý chéo công trình) là "chỉ để kiểm tra", "không chặn". Chống tính trùng đã đạt bằng cấu trúc (I3/I4): event chỉ sinh qua `upsertFromDelivery` theo `deliveryId` (`lib/ledger/ledger-service.ts:310-324`), mà phiếu lịch sử không có `deliveryId`. Ánh xạ sai đã bị V1 và lỗi chặn "phiếu ≤ 26/10 ở cặp không có lịch sử" bắt.
- **Failure scenario:** Phần lớn 16 giờ của phase 7 đổ vào máy chẩn đoán. Đến go-live, một lỗi nhỏ trong projection (ví dụ xếp `thue_hd` khác nhóm với SQL) làm cột "xem trước" tô đỏ, và người dùng phải phân xử lệch ảo ngay trong cửa sổ đóng băng.
- **Evidence:** Phase 7: "`projection.ts` (thuần) — Nợ trong bộ nhớ theo cặp và ngày; kiểm neo V1–V5 trước khi ghi"; "Chỗ chưa khớp được liệt kê nhưng không chặn"; "V2–V7 lệch ở cột DB là lỗi apply".
- **Suggested fix:** Tính bảng kiểm trước khi ghi bằng cách chạy `apply` cùng truy vấn đối soát SQL trong một transaction rồi rollback: một đường mã, một cột. Brainstorm có yêu cầu "chạy thử in bảng kiểm tra trước", và cách này đáp ứng được. Giữ V1/V3/V4 (V2 để hiển thị). Giữ ghép sau mốc vì có ảnh hưởng tới dữ liệu ghi; ghép lịch sử thì bỏ, hoặc rút về so tổng theo cặp.

## Finding 6: Khung `ReviewSection` tổng quát chỉ có một consumer, song song với một slot riêng của adapter
- **Severity:** Medium
- **Location:** Phase 5, các dòng `adapter-types.ts`, `review-panel.tsx`, `[runId]/page.tsx` ("phần đối soát (slot phase 7 điền)"). Phase 7, `cutover-verification.tsx`.
- **Flaw:** Không adapter nào trong 9 adapter đang đăng ký (`lib/import/adapters/adapter-registry.ts:17-27`) sẽ cài `review`; phase 5 bước 2 ghi rõ adapter một file "không có `review`". Dù vậy, engine vẫn nhận thêm:
  - một DSL 4 loại section (`mapping`/`decision`/`table`/`ack`);
  - một renderer chung có radio, nút "Đặt theo mặc định", lọc "chỉ dòng lệch";
  - `ReviewPayload.expected`, một khái niệm riêng của chuyển đổi nằm trong kiểu chung.

  Trong khi đó phase 7 vẫn chèn một server component riêng của adapter vào trang engine. Vậy là có hai cơ chế cho UI riêng của adapter.
- **Failure scenario:** Các nhu cầu riêng của chuyển đổi phải nhét vào DSL hoặc lọt qua slot: câu hậu quả "Đầu kỳ 2026 = X thay vì Y", lựa chọn 1 bị khóa kèm lý do, bảng V hai cột. Mỗi chỉnh sửa khi chạy thử đều đụng tệp engine của phase 5, trong khi phase 7 "chỉ import (không sửa) tệp của phase 2, 5, 6". Xung đột sở hữu nổ ra đúng lúc cần lặp nhanh nhất.
- **Evidence:** Phase 5: "kiểu `ReviewSection` (`mapping` / `decision` / `table` / `ack`) và `ReviewPayload {digest, sections, blocking, expected}`"; "`review-panel.tsx` … Hiển thị chung `ReviewSection`". Phase 7: "`cutover-verification.tsx` (tạo, server component)".
- **Suggested fix:** Engine chỉ lưu `reviewJson` dạng mờ (opaque), `blocking: string[]` và `requiredAcks: string[]`. Adapter tự xuất component review, đăng ký cạnh adapter, và `[runId]/page.tsx` render component đó. Một cơ chế, thuộc phase 7.

## Finding 7: Cây route lồng `cong-trinh/[projectId]/ncc/[supplierId]/*` phức tạp hơn mức yêu cầu; "vỏ mỏng" thực ra không mỏng
- **Severity:** Medium
- **Location:** Phase 3, "Files to Create / Modify"; plan.md "Tổng hợp tranh luận", dòng Route.
- **Flaw:** Brainstorm yêu cầu trang `/vat-tu-ncc/cong-trinh/[projectId]` liệt kê NCC, bấm vào thì tới các tab của cặp. Brainstorm không yêu cầu một họ route thứ hai. Logic đọc dữ liệu nằm ở page.tsx, không ở client component:
  - `thanh-toan/page.tsx:20-77` có 7 truy vấn, trong đó cờ khóa dựa trên kỳ ký **toàn NCC** (`:36-39`, `:58-60`) phải viết lại theo cặp;
  - `ngay/page.tsx` dài 51 dòng;
  - phần chặn quyền ở layout `[supplierId]/layout.tsx:28-47` (ACL, tab Thanh toán chỉ hiện khi `cong-no-vt` đã phát hành, tab admin) phải nhân đôi.

  Ngoài ra ba tab ở cửa NCC thành trang chọn công trình, và `doi-chieu/[id]` thành trang chuyển hướng.
  Revalidate: 7 service đang revalidate đường dẫn literal theo NCC (`delivery-service.ts:74-75,135-136,169-170`; `reconciliation-service.ts:82,118,143`; `reconciliation-derive-service.ts:386,435`; `price-quote-service.ts:35-37,56-58,70-72`; `material-ledger-service.ts:25`). Kế hoạch chỉ thêm đường dẫn cặp ở `period-close-service`.
- **Failure scenario:** Hai layout trôi khác nhau, ví dụ tab Thanh toán hiện ở layout này nhưng ẩn ở layout kia khi `cong-no-vt` chưa phát hành. Sau ký, gỡ ký hay sửa phiếu, route cặp dựa vào cơ chế router cache ngầm thay vì revalidate tường minh như phần còn lại của module.
- **Evidence:** Phase 3: "vỏ mỏng dùng lại client component hiện có"; Phase 2: "`period-close-service.ts` … thêm `revalidatePath` cho route cặp của phase 3" (chỉ duy nhất chỗ này).
- **Suggested fix:**
  - Giữ hai trang danh sách đã được yêu cầu.
  - Liên kết sang `/vat-tu-ncc/[supplierId]/<tab>?projectId=X`. Tab theo cặp hiện bộ chọn công trình khi thiếu tham số; đây là bộ chọn kế hoạch vốn đã định làm. Link tab giữ query qua một nav client nhỏ.
  - Cách này bớt được 1 layout, 7 route, 1 trang chuyển hướng và cả một họ revalidate mới.
  - Nếu vẫn giữ route lồng: tách phần chặn quyền của layout và loader của trang ra hàm dùng chung, và liệt kê đủ mọi điểm revalidate.

## Finding 8: Gỡ 3 adapter cũ là ngoài yêu cầu, lại bỏ sót consumer
- **Severity:** Medium
- **Location:** Phase 5, các dòng `adapter-registry.ts`, "Xóa `lib/import/adapters/{…}`", e2e; mục Ownership.
- **Flaw:** Brainstorm chỉ nói "Sửa adapter cho ô tiêu đề trống" (sửa, không xóa) với `cong-no-vat-tu`; không nói gì về `gach-nam-huong`, `quang-minh`. Lý do gỡ hai adapter này là CHECK (Finding 1). Các consumer bị sót:
  - `scripts/smoke-import-apply.ts:38-39` (danh sách case);
  - `scripts/smoke-import-apply.ts:115` gọi `commitImport(preview.runId, buf, mapping)`, sẽ gãy với `commitImport(runId)` của phase 5. `tsconfig.json:33` include `**/*.ts` nên `tsc` đỏ, nhưng không phase nào sở hữu `scripts/`;
  - `docs/system-architecture.md:231` trỏ `cong-no-vat-tu.adapter.ts:189-200`;
  - comment ở `lib/import/adapters/excel-utils.ts:3`.
- **Failure scenario:** Phase 5 xanh `vitest` nhưng `npx tsc --noEmit` đỏ vì script smoke. Luồng B bị chặn, hoặc ai đó xóa script tùy tiện.
- **Evidence:** Phase 5: "Gỡ `CongNoVatTuAdapter`, `GachNamHuongAdapter`, `QuangMinhAdapter` …"; Ownership chỉ có "`lib/import/*` …, `app/(app)/admin/import/*`, `e2e/import-export.spec.ts`".
- **Suggested fix:** Chỉ gỡ đăng ký `cong-no-vat-tu`, adapter có nguy cơ chèn trùng mà brainstorm đã nêu. Giữ hai adapter phiếu nếu người dùng không đồng ý gỡ (hỏi ở bước validate). Thêm `scripts/smoke-import-apply.ts` và `docs/system-architecture.md:231` vào bảng sở hữu của phase 5.

## Finding 9: Kiểm "Chủ thể = `Project.entityId`" là cơ chế thứ hai cho việc codebase đã làm bằng cách suy ra; brainstorm cũng yêu cầu "suy"
- **Severity:** Medium
- **Location:** Phase 2, "Quy tắc" ("`entityId` phải bằng `Project.entityId`; lệch thì báo lỗi"); các dòng `ledger-service.ts` và `payment-service.ts`. Phase 3, `round-detail-client.tsx`. plan.md I2.
- **Flaw:** Brainstorm viết: "Chủ thể suy từ `Project.entityId`". Mã hiện có đã suy như vậy: `period-close-service.ts:7` ("Chủ Thể của event suy từ Project.entityId"), `:205`, `:295`, kèm vi phạm `missing_entity` (`:130`). Kế hoạch lại giữ `entityId` do client gửi và thêm phép kiểm bằng nhau ở ledger-service, payment-service và import. Kết quả là hai nguồn cho cùng một sự thật, cộng một phép kiểm. Kế hoạch cũng không nói gì khi `Project.entityId` là NULL, trong khi đó là mặc định của mọi công trình tạo mới:
  - `lib/master-data/schemas.ts:22-38` không có `entityId`;
  - `lib/master-data/project-service.ts:49`;
  - `du-an-xay-dung.adapter.ts:518`;
  - `bang-can-doi-vat-tu.adapter.ts:471`;
  - `cong-no-nhan-cong.adapter.ts:146`.
- **Failure scenario:** UI đợt thanh toán chọn Chủ thể trước công trình (`e2e/payment-round.spec.ts:38`). Kế toán chọn công trình thuộc Chủ thể khác thì bị lỗi sau khi bấm lưu. Với công trình chưa gán Chủ thể: hoặc mọi lần ghi bị coi là "lệch", hoặc phép kiểm bị bỏ qua, thành lỗ hổng. Dán bulk ở Nhập liệu thì hỏng từng dòng.
- **Evidence:** như trên.
- **Suggested fix:** Với ghi vật tư và dòng `vat_tu`, server suy `entityId` từ `Project.entityId` và bỏ qua giá trị client gửi. Khi NULL thì dùng lại thông báo `missing_entity`. UI tự điền và khóa Chủ thể sau khi chọn công trình. Cột Chủ thể ở master data vẫn giữ, vì cần để điền các giá trị NULL.

## Finding 10: "Dùng lại ánh xạ lần trước" không phục vụ được kịch bản đã nêu
- **Severity:** Medium
- **Location:** Phase 5, dòng `import-actions.ts` (`getLastMapping`). Phase 8, runbook bước 8 ("có thể 'Dùng lại ánh xạ lần trước' từ lần chạy thử") và bước 9 ("hoàn tác …, import lại"); phase 8 Task 2 (chạy thử trên bản khôi phục).
- **Flaw:**
  - Lần chạy thử diễn ra trên bản khôi phục, tức một DB khác, nên ImportRun của nó không có trên DB thật.
  - Hoàn tác xóa luôn dòng ImportRun (`lib/import/import-engine.ts:314`, `await tx.importRun.delete`), nên sau "hoàn tác rồi import lại" thì ánh xạ cũng mất.
  - Các lựa chọn "Tạo mới" trong lần chạy thử ứng với id không tồn tại trên DB thật.

  Trường hợp duy nhất tính năng chạy được là xem trước lần hai trên cùng DB mà chưa commit, nhưng "Lưu & tính lại" trên cùng run đã lo việc đó.
- **Failure scenario:** Đến go-live, người dùng bấm "Dùng lại ánh xạ" theo runbook thì không có gì để dùng, hoặc nhận về ánh xạ trỏ sai id, ngay trong cửa sổ đóng băng.
- **Evidence:** như trên.
- **Suggested fix:** Bỏ `getLastMapping`. Dựa vào tự điền khi tên chuẩn hóa trùng khít (phase 5): sau lần import đầu tạo danh mục, lần import lại sẽ tự khớp. Nếu thật sự cần dùng lại giữa hai DB thì hỏi người dùng; khi đó xuất/nhập ánh xạ JSON khóa theo tên, không theo id.

---

## Contract verification

Ký hiệu: ✓ có trong kế hoạch; ◐ có một phần; ✗ thiếu.

| Interface (đổi theo kế hoạch) | Nơi gọi tìm được (số; file:line) | Kế hoạch bao phủ? |
|---|---|---|
| `findSignedPeriodCovering(s, date, client)` → `(s, p, date)` | 3: `period-lock.ts:92`; `test/integration/ledger-business-date.integration.test.ts:128,131` | ◐ test có trong danh sách fixture, nhưng không có trong 9 file ở Task 1 |
| `assertPeriodOpen(s, date, client)` → `(s, p, date)` | 13: `material-ledger-service.ts:145`; `delivery-service.ts:57,93,94,113,148,156`; `payment-ledger-sync.ts:39`; `ledger-service.ts:63`; `ledger-business-date.integration.test.ts:112,116,120,124` | ✓ (test chỉ dưới dạng fixture) |
| `loadPeriodBoundsContext(s, client)` | 3: `reconciliation-service.ts:49`; `period-close-service.ts:147`; `period-lock.ts:135` | ✓ |
| `assertPeriodBounds(s, range, client, selfId)` | 4: `reconciliation-service.ts:72,106`; `reconciliation-derive-service.ts:341`; `period-close-service.ts:251` | ✓ |
| `suggestRangeForSupplier` → `suggestRangeForPair` | 2: `reconciliation-service.ts:50`; `period-close-service.ts:149` | ✓ |
| `LedgerService.assertSupplierOpeningEditable(partyId)` (công khai) | 3: `ledger-service.ts:398,441`; **`lib/cong-no-vt/material-ledger-service.ts:244`** | ◐ Kế hoạch thêm `assertPairOpeningEditable` ở `period-lock.ts` **và** "khóa số dư theo cặp (`:87-99`)" ở ledger-service, tức hai nơi cho một việc; không nêu nơi gọi chéo file `:244` |
| `LedgerService.upsertFromDelivery({projectId: number\|null})` | 1: `period-close-service.ts:296` | ✓ |
| `LedgerService.create/update/softDelete` (material) | `material-ledger-service.ts:38,48,57,187`; integration `vat-tu-ncc-thanh-toan:77`, `vat-tu-ncc-pilot:131,281`, `cong-no-thue-hd:73,171` | ✓ |
| `supplierBalanceAsOf(s, asOf, db)` (+ `pairBalanceAsOf`) | 3: `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:40`; `reconciliation-derive-service.ts:112`; `vat-tu-ncc-thanh-toan.integration.test.ts:175` | ◐ trang thanh-toan theo cặp phải đổi sang `pairBalanceAsOf`, kế hoạch không nêu |
| `previewPeriodClose(s, range?)` → `(s, p, range?)` | 10: `chot-ky-client.tsx:67`; `chot-ky/page.tsx:21`; `vat-tu-ncc-chot-ky-linh-hoat:77,124,130,139`; `vat-tu-ncc-pilot:109,118,213,235` | ✓ |
| `commitPeriodClose(s, range, prices)` → `(s, p, range, prices)` | 8: `chot-ky-client.tsx:109`; `vat-tu-ncc-chot-ky-linh-hoat:78,153,158`; `vat-tu-ncc-pilot:110,119,214,242` | ✓ |
| `listDeliveries(s, opts)` / `listDeliveriesMonthly(s)` | 2: `ngay/page.tsx:24`; `thang/page.tsx:19` | ✓ |
| `createDelivery/updateDelivery/softDeleteDelivery` | 15: `delivery-grid.tsx:132,148,161,168`; `vat-tu-ncc-chot-ky-linh-hoat:169,248,279,280,284,285`; `vat-tu-ncc-pilot:270`; `lib/acl/__tests__/admin-level-callsite-inventory.test.ts:25` | ✓ (test inventory kiểm theo tên, không gãy) |
| `deliverySchema` (`projectId` bắt buộc) | 6: `delivery-form.tsx:33`; `delivery-service.ts:52,80`; **`lib/vat-tu-ncc/__tests__/period.test.ts:48,54,59`** | ✗ `period.test.ts` |
| `reconciliationSchema` (+`projectId`) / `checkReconciliationRange` | `reconciliation-form.tsx:27,42,62`; `reconciliation-service.ts:27` | ◐ `checkReconciliationRange` không được nêu tên |
| `createReconciliation/softDeleteReconciliation` | `doi-chieu-client.tsx:61,73`; `vat-tu-ncc-chot-ky-linh-hoat:155`; `admin-level-callsite-inventory.test.ts:26` | ✓ |
| `listReconciliationsDerived(s)` | 6: `doi-chieu/page.tsx:22`; `cong-no-thue-hd:123`; `vat-tu-ncc-chot-ky-linh-hoat:89`; `vat-tu-ncc-pilot:170,255`; `vat-tu-ncc-thanh-toan:123` | ✓ |
| `checkPeriodConsistency(s, from, to)` | 2: `kiem-tra-khop-client.tsx:57`; `vat-tu-ncc-pilot:194` | ✓ |
| `transactionSchema` cong-no-vt (`projectId` bắt buộc với vật tư) | `material-ledger-service.ts:37,47,186`; `thanh-toan-client.tsx:21`; **`lib/cong-no-vt/__tests__/schemas.test.ts:15-31`** | ✗ `schemas.test.ts` |
| `patchMaterialTransaction` / `bulkUpsertMaterialTransactions` (`Record<string, unknown>`) | **`app/(app)/cong-no-vt/nhap-lieu/page.tsx:65-67`** qua `components/ledger-grid/transaction-grid.tsx` (dùng chung với `cong-no-nc/nhap-lieu/page.tsx:64`); `thanh-toan-client.tsx:154,167`; `cong-no-thue-hd:250` | ✗ lưới thật không có trong kế hoạch; kế hoạch nhắm `components/ledger/transaction-form-dialog.tsx` (chết) |
| `patchMaterialOpeningBalance` / `bulkUpsertMaterialOpeningBalances` | **`app/(app)/cong-no-vt/so-du-ban-dau/page.tsx:50-51`** qua `components/ledger-grid/opening-grid.tsx` (dùng chung với `cong-no-nc/so-du-ban-dau/page.tsx:8`); `cong-no-thue-hd:185` | ✗ kế hoạch nhắm `components/ledger/opening-balance-client.tsx` (chết) |
| `syncClosedRoundToLedger(roundId, client, closedAt)` | 7: `payment-service.ts:600`; `vat-tu-ncc-thanh-toan:250`; `vat-tu-ncc-pilot:341,342`; `ledger-business-date:80,97,98,140` | ✓ |
| `upsertItem(UpsertItemInput)` (`vat_tu` bắt buộc công trình) | 11: `app/(app)/thanh-toan/actions.ts:16`; `test/integration/payment-service.integration.test.ts:67,102`; `lib/payment/__tests__/payment-service.test.ts:192,199,207,214,225,242,254,265` | ✓ (`payment-service.test.ts:192-207` dùng `projectId: null, category: "vat_tu"`, phải sửa) |
| `ImportAdapter.parse(buffer)` → `parse(buffer, ctx?)` | 10: `import-engine.ts:57,120`; `adapters.test.ts:43,94,126,232,262,281`; `scripts/smoke-sl-dt-parse.ts:6`; `scripts/smoke-sl-dt-apply.ts:13` | ✓ (tham số tùy chọn, tương thích ngược) |
| `previewImport(buffer, adapter, fileName, createdBy)` (nhận gói) | 7: `import-actions.ts:40`; `import-engine.integration.test.ts:61,71,90,101,117`; `scripts/smoke-import-apply.ts:102` | ◐ kế hoạch không ghi chữ ký mới; script không được sở hữu |
| `commitImport(runId, buffer, mapping)` → `commitImport(runId)` | 5: `import-actions.ts:82`; `import-engine.integration.test.ts:72,94,102`; **`scripts/smoke-import-apply.ts:115`** | ✗ script smoke (tsc sẽ đỏ) |
| `rollbackImportRun(id)` (+guard) | 3: `import-actions.ts:54`; `import-engine.integration.test.ts:107`; `scripts/smoke-import-apply.ts:142` | ✓ (đã có sẵn `DELETE supplier_reconciliations WHERE importRunId`, `import-engine.ts:303`, nên phần "xóa luôn marker" trong phase 5 là mô tả trùng) |
| Adapter bị gỡ `cong-no-vat-tu`, `gach-nam-huong`, `quang-minh` | 22: `adapter-registry.ts:8,12,13,20,24,25`; `adapter-registry.test.ts:8,11,12`; `adapters.test.ts:30,34,35,192,253`; `import-engine.integration.test.ts:61,71,90,101,117`; `e2e/import-export.spec.ts:10`; **`scripts/smoke-import-apply.ts:38,39`**; `lib/import/README.md:13-14`; **`docs/system-architecture.md:231`** (+ comment `excel-utils.ts:3`) | ◐ thiếu script smoke và dòng docs |
| `cong-no-vat-tu.parse.ts` (giữ) | 2 consumer còn lại: `cong-no-nhan-cong.adapter.ts:20`; `lib/cong-no-vt/__tests__/schemas.test.ts:4` | ✓ |
| Họ `revalidatePath` literal theo NCC (hợp đồng ngầm với route mới) | 7 service: `delivery-service.ts`, `reconciliation-service.ts`, `reconciliation-derive-service.ts`, `price-quote-service.ts`, `material-ledger-service.ts`, `period-close-service.ts` (+ trang `thanh-toan`) | ◐ chỉ thêm route cặp ở `period-close-service` |
| Tài liệu tham chiếu `period-lock` | `docs/codebase-summary.md:214,263`; `docs/system-architecture.md:199-202` | ◐ phase 8 không sửa `codebase-summary.md` |

## Câu hỏi về phần được yêu cầu (chỉ hỏi, không đề xuất cắt)

1. D6 (toàn bộ lịch sử khối lượng): người dùng có cần đủ ĐVT, CB vật tư, CHCT, KT từ sheet "Vật tư ngày" bổ sung cho khối đối chiếu, hay chỉ cần KL và giá trong khối? Câu trả lời quyết định có cần nhánh phân giải ngày "giữa dòng trước và dòng sau" cho sheet không có biên khối hay không.
2. Mục 2 của Câu hỏi mở: nếu sau 26/10 không có phiếu nhập tay nào trong ERP trước go-live, có cần "chèn phần chênh multiset" cho phiếu sau mốc (phase 7, Guard độc quyền) không?
3. Test e2e `vat-tu-ncc-cong-trinh.spec.ts` chỉ để chứng minh toast. Người dùng có chấp nhận test component hoặc integration thay thế, vì job e2e CI (`.github/workflows/test.yml`, job `e2e-security`) phải dựng dữ liệu NCC, công trình và kỳ ký đã ký?

Status: DONE
