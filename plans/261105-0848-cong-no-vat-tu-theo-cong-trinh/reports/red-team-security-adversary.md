# Red team — Góc nhìn kẻ tấn công (Security Adversary) + Fact Checker

Kế hoạch: `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/` (plan.md, phase 01–08)
Ngày: 2026-11-05. Mọi trích dẫn file:line đã được grep/đọc trực tiếp trên repo.

---

## Finding 1: Bấm commit lần hai biến run đã commit thành `failed`, run đó xóa được, và FK `SetNull` gỡ mất dấu của marker chuyển đổi
- **Severity:** Critical
- **Location:** Phase 5, bảng tệp, dòng `lib/import/import-engine.ts` ("Lỗi ở bất kỳ bước nào làm transaction rollback; run được đánh `failed` ở một transaction riêng"). Liên quan Phase 2, mục "Quy tắc" ("Marker chuyển đổi là marker có `importRunId` khác NULL").
- **Flaw:** Thiết kế mới đưa bước "đọc lại run" và guard độc quyền vào trong transaction, còn mọi lỗi đều dẫn tới cập nhật `status = failed` ở một transaction riêng, không có điều kiện. Vì vậy một lần commit thứ hai trên run **đã commit** (do double-click, tab cũ hoặc gửi lại form) sẽ bị chặn đúng ở bước kiểm. Nhưng sau đó nhánh catch lại ghi đè trạng thái `committed` của **chính run đó** thành `failed`. Run `failed` hiện nút "Xóa", và `deleteImportRun` chỉ từ chối run `committed`. Mọi FK `importRunId` đều là `onDelete: SetNull`, nên khi xóa run, sổ cái, phiếu và marker vẫn còn nhưng mất `importRunId`.
- **Failure scenario:**
  1. Admin commit run #42 thành công.
  2. Admin bấm lại (hoặc Back rồi gửi lại). Bước kiểm trong transaction ném lỗi "already committed", hoặc guard độc quyền chặn vì dữ liệu đã có.
  3. Nhánh catch đặt run #42 thành `failed`. Trang `/admin/import` hiện nút "Xóa" và admin xóa.
  4. `supplier_reconciliations.importRunId` bị đặt NULL. Marker 31/12/2025→26/10/2026 không còn là "marker chuyển đổi" theo `isCutoverMarker`, mà thành kỳ "do ERP ký".
  5. Admin gỡ ký được kỳ đó, rồi chốt lại kỳ 31/12→26/10. Mọi phiếu lịch sử sinh event `lay_hang`, nên nợ bị tính trùng với dòng Nhập Liệu (vỡ I3 và I4).
  6. Hoàn tác import không còn làm được vì không dòng nào mang `importRunId` (vỡ I8).
- **Evidence:**
  - `lib/import/import-engine.ts:149-157`: catch ghi `status: "failed"` vô điều kiện.
  - `lib/import/import-engine.ts:178-185`: `deleteImportRun` chỉ chặn `committed`.
  - `app/(app)/admin/import/delete-run-button.tsx:17-46`: mọi trạng thái khác `committed` đều có nút "Xóa".
  - `prisma/schema.prisma:617-618`: `importRun ImportRun? @relation(..., onDelete: SetNull)` trên `SupplierReconciliation`; cùng mẫu này ở `:342,370,397,447,…,1152`.
- **Suggested fix:**
  - Bước kiểm "đã commit" ném lỗi **trước** try/catch, hoặc dùng cập nhật có điều kiện `UPDATE … SET status='failed' WHERE id=$1 AND status='preview'`.
  - `deleteImportRun` từ chối khi `getRollbackInfo(id).total > 0`.
  - Đổi FK `supplier_reconciliations.importRunId` sang `RESTRICT`, hoặc thêm cột bất biến `kind = 'cutover'` để danh tính marker không phụ thuộc cột nullable.
  - Thêm test: commit lần hai giữ nguyên `committed`, run vẫn không xóa được.

## Finding 2: Digest không ràng buộc với thứ người dùng đã xem; ánh xạ, `ack`, `pair` là JSON client gửi lên không kiểm; `expected` sửa được sau commit
- **Severity:** High
- **Location:** Phase 5, dòng `import-engine.ts` (`refreshPreview`, `commitImport(runId)`) và dòng `import-actions.ts` (`refreshPreviewAction`, `getLastMapping`, "`doCommit(runId)` không cần file"). Phase 7: mục "Khóa ánh xạ" (`ack:<mã>`, `pair:<s>:<p>`) và "Thứ tự ghi" bước 7 (ghi `expected` vào `reviewJson`). Phase 8, runbook bước 8 ("Dùng lại ánh xạ lần trước").
- **Flaw:**
  1. Lúc commit, server so digest tính lại với digest **đã lưu trong `reviewJson`**. Client không gửi digest nó đã render, nên bất kỳ `refreshPreviewAction` nào chen giữa (tab khác, admin khác) cũng cập nhật cả mapping lẫn digest lưu, và commit vẫn qua. Vậy I7 ("commit đúng thứ đã xem") không đứng.
  2. `ack:*` và `pair:*` chỉ là khóa trong mapping do client gửi. Plan không nói rõ server có tự chặn "lựa chọn 1 bị khóa" (CSV thiếu cặp, `#REF!`, thành phần âm) hay chỉ disable radio trên UI. Hiện mapping được `JSON.parse … as ResolvedMapping` mà không kiểm schema.
  3. Plan không cấm `refreshPreview` trên run đã commit. Trong khi đó `expected` (mốc đối soát V1–V7) nằm chung trong `reviewJson`, nên một lần refresh sau commit sẽ ghi đè mốc mà `verification-report.ts` dùng để so.
  4. `getLastMapping` mang theo cả `ack:*`, nên lần chạy sau tự động "xác nhận" các lệch mà không ai xem lại. Ack cũng không ghi ai xác nhận, lúc nào.
- **Failure scenario:**
  - Admin A xem bảng cặp: Nam Hương × CDC chọn 0 (ròng).
  - Tab cũ của A (hoặc admin B) bấm "Lưu & tính lại" với `pair:7:12 = 1` và `ack:pair-lech-7-12 = 1`.
  - A bấm Ghi. Digest khớp với bản đã lưu, nên hai dòng lũy kế âm hoặc lệch được ghi mà A chưa từng thấy.
  - Sau đó một lần refresh nhầm làm `expected` khớp với DB. Bảng V1–V7 hiện xanh và che lỗi apply.
- **Evidence:**
  - `app/(app)/admin/import/import-actions.ts:77-79`: `JSON.parse(String(mappingRaw)) as ResolvedMapping`, không có zod.
  - `lib/import/import-engine.ts:314`: hoàn tác xóa luôn `ImportRun`, tức mất dấu vết ack và mapping của lần chạy trước.
  - Plan Phase 5: "chạy lại `review`, so digest, yêu cầu `blocking` rỗng và đủ `ack`". Không có tham số digest từ client.
  - Plan Phase 7 bước 7: "Ghi `expected` vào `reviewJson`".
- **Suggested fix:**
  - `doCommit(runId, expectedDigest)` lấy digest từ trang đã render; server so với digest tính lại **và** với digest đã lưu.
  - `refreshPreview` chỉ chạy khi `status = 'preview'` và chạy dưới cùng advisory lock của commit.
  - Tách `expected` ra cột ghi-một-lần (ví dụ `verificationExpected`), không ghi lại sau commit.
  - Kiểm mapping bằng zod ở server: id tồn tại, đúng bảng, chưa xóa mềm. `pair=1` trên cặp bị cấm phải thành `blocking` ở server.
  - Lưu `ackedBy` và `ackedAt`. `getLastMapping` loại bỏ `ack:*` và `pair:*`.

## Finding 3: Guard độc quyền và review chạy **trước** khi khóa NCC; "đóng băng" go-live chỉ là thông báo
- **Severity:** High
- **Location:** Phase 5, thứ tự trong `commitImport` ("`pg_advisory_xact_lock(hashtext('import-commit'))` → … → chạy lại `review` … → `apply`"). Phase 7: "Guard độc quyền lịch sử", `review-builder.ts` ("chạy guard"), "Thứ tự ghi" bước 1 (`lockSuppliers` nằm trong `apply`). Phase 8, runbook bước 1 ("Thông báo đóng băng").
- **Flaw:** Khóa `import-commit` không loại trừ đường ghi nghiệp vụ, vì các đường đó dùng khóa `vat-tu-ncc:<id>`. Guard độc quyền (không có sổ ≤ 26/10, không có marker sống, không có marker cũ) được đánh giá khi chưa giữ khóa NCC; tới `apply` mới khóa. Điều này trái với quy ước "khóa rồi mới kiểm" của module. Go-live cũng không khóa kỹ thuật module, dù hệ thống đã có công tắc `development` chặn mọi người dùng không phải admin.
- **Failure scenario:**
  - Trong 300 giây commit, một cán bộ vật tư (quyền `create`) tạo kỳ đối chiếu 27/09→26/10 cho cặp A×X, hoặc tạo phiếu ngày 20/10. Guard đã đọc xong trước đó.
  - `apply` chèn marker 31/12/2025→26/10/2026 chồng lên kỳ vừa tạo. Unique một phần chỉ bắt khi trùng biên.
  - Kết quả: hai kỳ chồng nhau, hoặc một phiếu nằm trong kỳ chuyển đổi đã ký mà không có event. V6 chỉ phát hiện sau khi đã ghi.
- **Evidence:**
  - `lib/vat-tu-ncc/period-lock.ts:7-11`: "lấy cùng một khoá advisory … TRONG transaction rồi mới kiểm".
  - `lib/vat-tu-ncc/reconciliation-service.ts:62-63`: `createReconciliation` chỉ cần `minLevel: "create"`.
  - `lib/vat-tu-ncc/delivery-service.ts:50-51`: `createDelivery` cũng chỉ cần `create`.
  - `lib/acl/released-module-request.ts:36-41`: module ở trạng thái `development` chặn mọi người không phải admin.
  - `lib/acl/module-availability.ts:5`: `["ready", "development"]`.
- **Suggested fix:**
  - Ngay sau khóa `import-commit`, gọi `lockSuppliers(tx, mọi NCC đã ánh xạ của run)` rồi mới chạy review và guard.
  - Đặt `SET LOCAL lock_timeout`.
  - Runbook bước 5–11: chuyển `vat-tu-ncc`, `cong-no-vt`, `thanh-toan.ke-hoach` sang `development` (admin vẫn vào được), bước 13 mới mở lại.

## Finding 4: Hoàn tác có guard nhưng bỏ sót `dieu_chinh` lùi ngày; I3 không được cưỡng chế; hoàn tác xóa dấu vết và để lại thay đổi `Project.entityId`
- **Severity:** High
- **Location:** Phase 5, dòng `lib/import/rollback-guards.ts` và `rollbackImportRun`. Plan.md, mục "Bất biến" I3 và I8. Phase 7, "Thứ tự ghi" bước 2 ("gán `entityId` cho công trình đang NULL").
- **Flaw:**
  - Guard chỉ từ chối khi có kỳ ERP ký, hoặc khi dòng sổ ngoài run tham chiếu phiếu của run **qua `deliveryId`**. `dieu_chinh` cố ý không bị khóa kỳ, nên người có quyền sửa `cong-no-vt` vẫn ghi được `dieu_chinh` ngày ≤ 26/10 vào giữa kỳ chuyển đổi đã ký. I3 ("tiền tới 26/10 chỉ đến từ run chuyển đổi") vì vậy chỉ được kiểm một lần ở V6.
  - Hoàn tác xóa luôn bản ghi `ImportRun`, là "paper trail" duy nhất theo comment của engine.
  - Chủ thể, NCC, công trình và vật tư không có cột `importRunId`, nên "trả danh sách danh mục mà run đã tạo" không có nguồn dữ liệu.
  - `entityId` đã gán cho công trình không được hoàn nguyên.
- **Failure scenario:**
  1. Sau import, kế toán ghi `dieu_chinh` −5.000.000 ngày 15/10 cho A×X. Thao tác hợp lệ vì không bị khóa.
  2. Bước 9 của runbook hoàn tác. Guard không thấy `dieu_chinh` nên cho qua. Dòng đó mồ côi, không còn số dư hay lũy kế gốc.
  3. Import lại: guard độc quyền chặn vì còn "dòng sổ vật tư ngày ≤ 26/10 chưa xóa mềm", buộc phải sửa DB bằng tay. Nếu V6 đã chạy trước khi `dieu_chinh` được ghi thì lệch tồn tại mà không ai biết.
  4. Công trình đã bị gán `entityId` theo lần đầu. Lần import lại với Chủ thể khác bị chặn "lệch Chủ thể", và không có bản ghi nào cho biết ai gán.
- **Evidence:**
  - `lib/ledger/transaction-classification.ts:27-28`: "`dieu_chinh` cố ý không nằm đây".
  - `lib/ledger/ledger-service.ts:61-63`: `if (!isPeriodLockedType(transactionType)) return;`.
  - `lib/import/import-engine.ts:286,314`: `DELETE … WHERE "importRunId"`, rồi `tx.importRun.delete`.
  - `lib/import/import-engine.ts:10-12`: "The ImportRun record itself provides a paper trail".
  - `prisma/schema.prisma`: `importRunId` chỉ có ở 19 model giao dịch; Entity, Supplier, Project, Item không có. `Project.entityId` ở `:275`.
- **Suggested fix:**
  - Guard từ chối khi có **bất kỳ** dòng sổ vật tư nào ngoài run, thuộc cặp của run, có `createdAt > committedAt`.
  - Cưỡng chế I3 khi ghi: chặn `dieu_chinh` có ngày nằm trong một marker chuyển đổi.
  - Giữ `ImportRun` với trạng thái `rolled_back` thay vì xóa.
  - Lưu `createdRefs` và `entityId` cũ của công trình trong cột ghi-một-lần; khi hoàn tác thì hoàn nguyên hoặc báo rõ.

## Finding 5: Gói thư mục — `sourceFile` bị nạp ở mọi truy vấn danh sách, file rác bị lưu vĩnh viễn, đường dẫn từ client không kiểm
- **Severity:** Medium
- **Location:** Phase 1 (`ImportRun.sourceFile Bytes?`). Phase 5, dòng `lib/import/file-bundle.ts`, `import-upload-form.tsx` (`webkitdirectory`, `webkitRelativePath`) và `import-actions.ts` (`startPreview`). Phase 6, `bundle-classifier.ts`.
- **Flaw:**
  1. `listImportRuns` và `getImportRun` dùng `findMany`/`findUnique` không có `select`. Khi thêm cột bytea tới 20 MB (dạng base64 thì khoảng 27 MB), mỗi lần mở `/admin/import` sẽ kéo bytea của 50 run từ Postgres vào RAM.
  2. `webkitdirectory` gửi **mọi** file trong thư mục, kể cả `.claude/agent-memory/*.md` đang có thật trong `Quản Lý Công Nợ/`. Bộ phân loại chỉ "bỏ qua và liệt kê" mà vẫn mã hóa các file đó vào gói, rồi lưu vĩnh viễn trong DB. Plan không có chính sách xóa `sourceFile`.
  3. `path` lấy từ client, chỉ chuẩn hóa NFC, không chặn `..`, `\`, đường dẫn tuyệt đối hay ký tự điều khiển. `bundleHash` nối các dòng `path\tsha256`, nên một path chứa `\t`/`\n` tạo được hai gói khác nhau có cùng hash. Path cũng quyết định "thư mục con" (công trình) và tự điền ánh xạ "khi trùng khít".
  4. Giới hạn 20 MB được kiểm sau khi Next đã đệm 25 MB, và không giới hạn kích thước sau giải nén XLSX. Mỗi lần "Lưu & tính lại" và mỗi lần commit đều parse lại toàn bộ file, lần commit thì parse ngay trong transaction 300 giây.
- **Failure scenario:**
  - Sau vài lần chạy thử, trang lịch sử import chậm hoặc hết bộ nhớ.
  - Ghi chú agent nội bộ nằm trong bảng `import_runs` lâu dài.
  - Một path `Trại Chuối/../Mầm Non TC2/Lộc Tài.xlsx` (hoặc path dạng NFD trên macOS) bị phân loại sai công trình, rồi được tự điền ánh xạ.
- **Evidence:**
  - `lib/import/import-engine.ts:162-172`: `findMany({ orderBy, take })` và `findUnique({ where: { id } })`, không có `select`.
  - `app/(app)/admin/import/page.tsx:12`: `getRuns()` trên mỗi lần render.
  - `next.config.ts`: `serverActions.bodySizeLimit: "25mb"`.
  - `find "Quản Lý Công Nợ"` cho thấy `.claude/agent-memory/ak-engineer-kongming/*.md` nằm trong thư mục nguồn (27 file, 969 KB).
- **Suggested fix:**
  - Dùng `omit: { sourceFile: true, reviewJson: true }` ở danh sách; tách loader riêng khi cần đọc nguồn.
  - Lọc phần mở rộng (`.xlsx`, `.csv`) ở cả client lẫn server **trước** khi mã hóa.
  - Từ chối path có `..`, `\`, `/` ở đầu, ký tự điều khiển, hoặc trùng nhau sau NFC.
  - Băm `bundleHash` bằng JSON chuẩn tắc (hoặc tiền tố độ dài), không nối bằng `\t`.
  - Dùng `sheetRows` hoặc giới hạn số ô; đặt hạn lưu `sourceFile`.

## Finding 6: Route theo công trình lộ số dư `cong-no-vt` dưới guard `vat-tu-ncc`; route cặp không đối chiếu kỳ với công trình; test guard được dẫn làm bằng chứng không phủ route mới
- **Severity:** Medium
- **Location:** Phase 3, mục "Tạo" ("`cong-trinh/[projectId]/page.tsx` … các cột nợ TT/HĐ (từ `queryDetailReport`)", "Đọc dữ liệu và kiểm quyền giống trang NCC hiện có (guard `vat-tu-ncc`)", `.../doi-chieu/[reconciliationId]/page.tsx`). Phase 3, Tasks bước 6 và mục Tests (`module-release-entrypoints.test.ts`).
- **Flaw:**
  - Cửa NCC hiện tại **cố ý** chỉ hiện tab "Thanh toán" khi người dùng có quyền đọc `cong-no-vt`, và trang thanh toán guard bằng `cong-no-vt`. `queryDetailReport` được test giữ ngoài ranh giới server action, tức nơi gọi phải tự guard đúng module. Plan lại đặt cột nợ TT/HĐ (dữ liệu sổ `cong-no-vt`) và tab "Thanh toán" trong layout cặp dưới guard `vat-tu-ncc`.
  - Trang chi tiết đối chiếu hiện có kiểm `view.supplierId !== sid`; plan không yêu cầu kiểm thêm `view.projectId === projectId`. Hệ quả là một liên kết tự dựng hiện tiêu đề "Bê tông HP × Trại Chuối" nhưng nội dung (và nút Ký) là kỳ của công trình khác.
  - `module-release-entrypoints.test.ts` chỉ quét file `lib/**` **đã được git track** và các danh sách cố định, không quét page hay layout mới. Bước kiểm ở plan vì vậy xanh mà không chứng minh gì.
- **Failure scenario:**
  - Một người dùng có `vat-tu-ncc` nhưng bị gỡ `cong-no-vt` (override `ModulePermission`) mở `/vat-tu-ncc/cong-trinh/5` và thấy nợ hiện tại của mọi NCC tại công trình đó.
  - Kế toán nhận link `/vat-tu-ncc/cong-trinh/5/ncc/3/doi-chieu/88`, trong đó kỳ 88 thuộc công trình 9, và ký nhầm cặp.
- **Evidence:**
  - `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:17-19,37-42`: `showPaymentTab = canReadCongNoVt && congNoVtReleased`.
  - `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:24`: `requireModuleAccess("cong-no-vt", …)`.
  - `test/unit/module-release-entrypoints.test.ts:161-164`: `balance-report-service.ts` `not.toMatch("use server")`.
  - `test/unit/module-release-entrypoints.test.ts:73-83`: `git ls-files -- lib/**/*.ts`.
  - `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx:51`: `if (view.supplierId !== sid) notFound();`.
  - `lib/acl/modules.ts:42-44`: `vat-tu-ncc` và `cong-no-vt` là hai module riêng.
- **Suggested fix:**
  - Cột nợ và tab hoặc trang `thanh-toan` của route cặp phải kiểm `canAccessEntitlement(userId, "cong-no-vt", read)` như layout NCC.
  - Trang đối chiếu cặp kiểm `view.supplierId === sid && view.projectId === pid`.
  - `signReconciliation` nhận thêm cặp kỳ vọng và kiểm.
  - Mở rộng test entrypoint bằng danh sách page và service mới, và chạy test sau `git add`.

## Finding 7: Script dọn pilot xóa theo danh sách id với phép kiểm vòng tròn; FK `SetNull` tạo dòng mồ côi; xóa kỳ đã ký mà không lưu trữ hay ghi audit; lệnh sao lưu nhiều khả năng hỏng
- **Severity:** Medium
- **Location:** Phase 8, `scripts/vat-tu-pilot-cleanup.sql`, `scripts/vat-tu-cutover-inventory.sql`, runbook bước 2, 4 và 6.
- **Flaw:**
  1. Khối `DO` so "số đã xóa = số đã duyệt", nhưng cả hai đều đếm từ cùng bảng tạm. Phép kiểm này không chứng minh id nào là dữ liệu pilot: gõ nhầm một id thì vẫn khớp số.
  2. Xóa phiếu hoặc dòng đợt thanh toán làm `ledger_transactions.deliveryId` / `paymentRoundItemId` bị `SET NULL` trên những event không có trong danh sách. Tiền vẫn ở lại sổ dưới dạng dòng "tay" không nguồn, và đếm số không phát hiện được.
  3. Xóa "2 kỳ Nam Hương đã ký", tức xóa cả `signedSnapshotJson` (nguồn in lại biên bản đã ký), bằng SQL thô: vượt qua audit extension, không lưu trữ.
  4. Lệnh `docker exec docker-postgres-1 pg_dump -Fc -d ngoquyyen_erp > …` không có `-U nqerp`, nên chạy dưới user `root` và bị "role root does not exist". Nếu chạy trong Windows PowerShell 5.1, toán tử `>` còn làm hỏng dump nhị phân. Đây là lưới an toàn duy nhất trước khi xóa.
- **Failure scenario:** Danh sách duyệt có phiếu pilot nhưng thiếu một event `lay_hang` của phiếu đó. Script xóa phiếu, event còn lại với `deliveryId = NULL` và `projectId = NULL`. `VALIDATE CONSTRAINT` thất bại, hoặc tệ hơn, nếu event có `projectId` thì nợ ảo tồn tại vĩnh viễn. Bản sao lưu thì không khôi phục được.
- **Evidence:**
  - `prisma/schema.prisma:724-725`: `delivery … onDelete: SetNull`.
  - `prisma/schema.prisma:730-731`: `paymentRoundItem … onDelete: SetNull`.
  - `prisma/schema.prisma:610-611`: "Bản đông cứng đầy đủ … tại thời điểm ký — nguồn in lại".
  - `lib/prisma.ts:2-24,124`: audit chạy qua extension, SQL thô bỏ qua.
  - `docker/docker-compose.yml:6`: `POSTGRES_USER: nqerp`.
  - `plans/261006-0307-…/reports/pilot-result.md:127`: hai kỳ Nam Hương đã ký.
- **Suggested fix:**
  - `DELETE … WHERE id IN (tạm) AND "importRunId" IS NULL AND "createdAt" BETWEEN <cửa sổ pilot> …`.
  - Kiểm trước: `SELECT count(*) FROM ledger_transactions WHERE "deliveryId" IN (phiếu xóa) AND id NOT IN (sổ xóa)` phải bằng 0, nếu không thì `RAISE`.
  - `DELETE … RETURNING *` vào bảng lưu trữ (giữ cả `signedSnapshotJson`), và ghi `audit_logs` có `userId` người chạy.
  - Script kiểm kê chạy trong `BEGIN READ ONLY`.
  - Sao lưu bằng `pg_dump -U nqerp -Fc -f /tmp/x.dump` trong container, rồi `docker cp` ra ngoài.

## Finding 8: `prisma migrate dev` chạy trên container mà ứng dụng thật đang dùng
- **Severity:** Medium (UNVERIFIED một phần: không đọc được `.env`)
- **Location:** Phase 1, Tasks bước 1–2 ("Sao lưu DB dev nếu có dữ liệu", "`npx prisma migrate dev --create-only`").
- **Flaw:** Container Postgres "dev" (compose `docker`, cổng 5433, volume `D:/docker-data/ngoquyyen-erp/postgres`) cũng là DB của bản `erp-3001`: nó tham gia mạng `docker_default` và trỏ host `postgres`. `.env.example` trỏ `localhost:5433/ngoquyyen_erp`. Khi phát hiện drift, `migrate dev` (kể cả với `--create-only`) đề nghị **reset schema**. Thư mục `prisma/migrations/` lại đang chứa hai file SQL ngoài chuẩn, làm tăng khả năng có drift. Plan coi đây là "DB dev" và chỉ sao lưu "nếu có dữ liệu".
- **Failure scenario:** Lập trình viên chạy bước 2 với `DATABASE_URL` mặc định, Prisma báo drift và hỏi reset. Một lần bấm "y" xóa sạch dữ liệu thật trước go-live, trong khi bản sao lưu (Finding 7) có thể không dùng được.
- **Evidence:**
  - `docker/docker-compose.yml:1-12`: `ports: "5433:5432"`, volume ổ D.
  - `docker/docker-compose.erp-3001.yml:17,26-31`: `@postgres:5432/ngoquyyen_erp`, `networks: docker_default (external)`.
  - `.env.example:2`: `localhost:5433/ngoquyyen_erp`.
  - `prisma/migrations/phase-a-clean.sql`, `prisma/migrations/phase-a-tabs-expansion.sql`.
- **Suggested fix:**
  - Viết migration bằng tay, hoặc dùng `prisma migrate diff --from-migrations … --to-schema-datamodel … --script`.
  - Nếu dùng `migrate dev`, chỉ chạy trên DB tạm (`.env.test`).
  - Ghi rõ trong phase: cấm `migrate dev` khi `DATABASE_URL` trỏ 5433/`ngoquyyen_erp`.

---

## Fact-check log

Mẫu ≥15 khẳng định cho các phase có tham chiếu code. Chỉ liệt kê đầy đủ những mục FAILED / UNVERIFIED; mục VERIFIED ghi gọn.

### FAILED / không chính xác
| Phase | Khẳng định của plan | Kết quả |
|---|---|---|
| 3 | "Đọc dữ liệu và kiểm quyền giống trang NCC hiện có (guard `vat-tu-ncc`)" | FAILED. Trang thanh toán NCC guard bằng `cong-no-vt` (`thanh-toan/page.tsx:24`); tab bị ẩn theo `cong-no-vt` (`[supplierId]/layout.tsx:42`). |
| 3 | Bước 6 và Tests: `module-release-entrypoints.test.ts` chứng minh "route mới đi qua guard module `vat-tu-ncc`" | FAILED. Test chỉ quét `lib/**` đã được git track cùng các danh sách cố định (`:73-83`, `:7-55`), không quét page hay layout mới. |
| 5 | `rollback-guards` "Trả danh sách danh mục mà run đã tạo" | FAILED. Entity, Supplier, Project, Item không có `importRunId` (awk trên `schema.prisma`), nên không có nguồn dữ liệu. |
| 5 | `rollbackImportRun` "xóa luôn marker có `importRunId` của run" (trình bày như việc mới) | Không chính xác: đã có sẵn ở `import-engine.ts:303`. |
| 8 | Bước 8 "Dùng lại ánh xạ lần trước từ lần chạy thử" | FAILED (tự mâu thuẫn). Bước 2 chạy thử trên **bản khôi phục** DB; `ImportRun` của lần đó nằm ở DB khác, và id "Tạo mới" không tồn tại ở DB thật. |
| 2 | "Đổi chữ ký không mặc định để `tsc` liệt kê đủ nơi gọi" | Một phần FAILED. Truy vấn trực tiếp `supplierReconciliation.findMany({supplierId, signedBySupplier})` ở `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:36-38` (cờ khóa) không bị `tsc` bắt. |

### UNVERIFIED
| Phase | Khẳng định | Ghi chú |
|---|---|---|
| 8 | Lệnh `docker exec docker-postgres-1 pg_dump -Fc -d ngoquyyen_erp > …` chạy được | Thiếu `-U nqerp`; image postgres:16-alpine chạy exec dưới `root`. Tên container suy từ compose project `docker`, chưa chạy thử. |
| 1 | `migrate dev` chạy trên "DB dev" an toàn | `.env` bị chặn đọc; `.env.example:2` trỏ đúng container dùng chung với `erp-3001`. |
| 6 | Hành vi `XLSX.SSF.parse_date_code` và CSV `raw:true` | `package.json:60` dùng xlsx 0.20.3 (CDN), `package-lock.json` cũng 0.20.3, nhưng `pnpm-lock.yaml:104-106` vẫn ghi `^0.18.5`. Plan kiểm bằng `pnpm test`, nên môi trường pnpm có thể chạy phiên bản khác. |

### VERIFIED (rút gọn)
- **Plan.md:**
  - `balance-report-service.ts:108` `queryDetailReport`
  - `delivery-service.ts:114-115` (xóa mềm event khi sửa phiếu)
  - `ledger-service.ts:299-302` (HĐ = 0 khi upsert từ phiếu)
  - `period-bounds.ts:106-111`
  - `commit-panel.tsx:26` (`"{}"`)
  - `cong-no-vat-tu.parse.ts:57,68`
  - `excel-utils.ts:26-34` (năm 206 lọt qua kiểm `Date.UTC`)
  - `import-engine.ts:124` (không có timeout)
  - `cong-no-vat-tu.adapter.ts:204` (catch từng dòng)
  - `du-an/supplier-debt-service.ts:53-98` (đọc `project_transactions`, guard `du-an` theo dự án `:104`)
  - thư mục plan tiền đề và `pilot-result.md` tồn tại
- **Phase 1:**
  - `schema.prisma:621` `@@index([supplierId, periodFrom])`
  - `:917-931` ImportRun chưa có `sourceFile` / `reviewJson`
  - `20260729162000…/migration.sql:24-26` `supplier_recon_period_unique`
  - `20260504160000…/migration.sql:50-51` index `supplier_reconciliations_supplierId_periodFrom_idx`
  - `projectId Int?` ở delivery (`:554`), payment item (`:661`), ledger (`:700`)
  - `category` (`:662`); `Project.entityId` (`:275`)
  - tên bảng `@@map` đúng; migration mới nhất `20261006110000` < `20261106090000`
  - `docs/code-standards.md:328` (`fsync`)
- **Phase 2:**
  - `period-lock.ts:36` `lockSuppliers`, `:67` `findSignedPeriodCovering`, `:87` `assertPeriodOpen`, `:102` `loadPeriodBoundsContext`, `:129` `assertPeriodBounds`
  - `period-bounds.ts` là hàm thuần
  - `reconciliation-derive-service.ts`: `:104` `computeReconciliation`, `:264` `headerNames`, `:39/:47` `ReconPaymentRow`/`ReconTaxRow`
  - `supplier-balance.ts:14`
  - `ledger-service.ts:55` `assertMaterialPeriodOpen`, `:87-99` khóa số dư ban đầu
  - `delivery-service.ts:25-37` view tháng không có `projectId`
  - `payment-service.ts:220` `upsertItem`
  - danh sách 8 tệp gọi khớp kết quả grep
  - `period-lock-supplier-ids.test.ts`, `period-bounds.test.ts`, 8 tệp integration và `payment-service.test.ts` đều tồn tại
  - `components/ledger/{transaction-form-dialog,opening-balance-client}.tsx` tồn tại
- **Phase 3:**
  - `delivery-grid.tsx:160-171` không có try/catch
  - `delivery-form.tsx`, `reconciliation-form.tsx`, `round-detail-client.tsx` tồn tại
  - `master-data/schemas.ts:22` không có `entityId`
  - `project-service.ts:109-111` có guard admin
  - `projects/{page,projects-client}.tsx`, `cong-no-client.tsx`, `patch-actions.test.ts` tồn tại
- **Phase 4:**
  - `DetailRow` ở `balance-report-service.ts:24`
  - `report-period.ts`, `components/ledger/report-period-selector.tsx`, `components/ledger/multi-select-filter.tsx`, `components/sortable-table/` tồn tại
  - route export: `cong-no-tong-hop` → đọc `cong-no-vt` (`route.ts:54,61`), kiểm `entityIds` ≤ 200 (`:119-126`)
- **Phase 5:**
  - `import-engine.ts:61-73`, `:110`, `:124-132`
  - `adapter-types.ts:76` `parse(buffer)`
  - `cong-no-nhan-cong.adapter.ts:20,70-71`
  - `e2e/import-export.spec.ts:10`
  - `adapter-registry.ts:20,24,25`
  - nút hoàn tác vẫn hiện cho adapter đã gỡ: `page.tsx` `rollbackByAdapter.get(r.adapter) ?? true`
  - `lib/import/README.md` và các test registry, adapters, engine tồn tại
- **Phase 8:**
  - tên DB `ngoquyyen_erp` (`docker-compose.yml`)
  - `scripts/backup-db.sh` không chạy trên Windows (`pilot-result.md:12,106`)
  - hai kỳ Nam Hương đã ký (`pilot-result.md:127`)
  - các tệp `docs/user-guide/*.md`, `system-architecture.md`, `project-changelog.md` tồn tại

Status: DONE
