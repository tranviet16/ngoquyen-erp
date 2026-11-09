# Red team — Failure Mode Analyst (Flow Tracer)

- Ngày: 05/11/2026
- Phạm vi: `plan.md`, `phase-01` … `phase-08` của `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/`
- Cách làm: dò luồng code thật (entry → guard → nhánh → đích) cho các khẳng định hành vi của plan; kiểm một số khẳng định dữ liệu trên thư mục `Quản Lý Công Nợ/`.

## Kết quả dò luồng (Flow Tracer)

| Khẳng định trong plan | Kết quả | Luồng thật |
|---|---|---|
| P1 "Sau `NOT VALID`, xóa mềm dòng cũ thiếu công trình sẽ vi phạm CHECK" | ĐÚNG nhưng THIẾU | Postgres kiểm CHECK `NOT VALID` cho **mọi UPDATE**, không riêng xóa mềm: `payment-service.ts:363-370, 409-412, 472-475, 495-498, 534-537` đều UPDATE dòng đợt mà không đụng `projectId`. Xem Finding 3. |
| P2 "Rollback: git revert … code cũ vẫn chạy … chặt hơn" | SAI | `reconciliation-service.ts:73-80` và `period-close-service.ts:319-321` INSERT marker không có `projectId` → vi phạm `supplier_recon_project_required` (23514). Xem Finding 5. |
| Kiến trúc #3 "mọi đường ghi một cặp đều tuần tự dưới khóa NCC" | SAI ở commit import | Phase 5 chạy `review` (guard, multiset) **trước** `apply`; `lockSuppliers` chỉ là bước 1 của `apply` (phase 7 "Thứ tự ghi"). Xem Finding 2. |
| P5 "Run cũ vẫn hoàn tác được vì rollback không cần adapter" | ĐÚNG | `import-engine.ts:276-314`: không gọi `getAdapter`, chỉ `DELETE` thô; `DELETE` không bị CHECK kiểm. |
| P5 "xóa luôn marker có `importRunId` của run" | ĐÃ CÓ SẴN | `import-engine.ts:303` đã `DELETE FROM supplier_reconciliations WHERE "importRunId"`. Không phải việc mới. |
| plan.md #4: sửa phiếu xóa mềm event, chốt lại đặt HĐ = 0 | ĐÚNG | `delivery-service.ts:108-116`; `ledger-service.ts:299-302`. |
| Commit chạy trong timeout mặc định 5 giây | ĐÚNG | `import-engine.ts:124-127` không truyền tùy chọn. |
| `commit-panel.tsx:26` luôn gửi `{}` | ĐÚNG | `app/(app)/admin/import/[runId]/commit-panel.tsx:26`. |
| P7 "Phiếu nằm trong kỳ chuyển đổi đã ký, nên chốt kỳ và sửa phiếu đều bị chặn" | ĐÚNG trong `[31/12/2025, 26/10/2026]` | `delivery-service.ts:93-94` (kiểm ngày cũ và ngày mới) và `period-bounds.ts:101-104` (chồng lấn kỳ đã ký). Không có khóa nào cho cặp **không có** marker. Xem Finding 6. |

---

## Finding 1: Tiền trả bị tính trùng sau go-live (đợt thanh toán, và dòng "Lấy Hàng" sau mốc được `ack`)
- **Severity:** Critical
- **Location:** Phase 7, mục "Chống tính trùng → Sau 26/10" và "Guard độc quyền lịch sử"; Phase 8, Runbook bước 1 và 3.
- **Flaw:** Plan chỉ có một cơ chế chống trùng cho tiền trả: guard "dòng sổ vật tư ngày ≤ 26/10". Đợt thanh toán ghi sổ theo **ngày đóng đợt**, không theo ngày chi thật. Vì vậy một khoản đã có trong Nhập Liệu ("Trả Nợ") vẫn được ghi lại lần nữa khi đóng đợt sau go-live. Không bước nào trong runbook hay adapter đối chiếu đợt thanh toán với "Trả Nợ".
- **Failure scenario:**
  - (a) Đợt `vat_tu` tháng 10 được duyệt ngày 20/10. Kế toán chuyển tiền và ghi "Trả Nợ" 22/10 vào Nhập Liệu. Import ghi khoản này thành `thanh_toan` 22/10 (nằm trong marker đã ký). Sau go-live, admin đóng đợt ngày 08/11. `syncClosedRoundToLedger` ghi thêm một `thanh_toan` ngày 08/11, rơi vào kỳ mở 27/10→26/11, nên `assertPeriodOpen` cho qua. Nợ NCC bị trừ hai lần.
  - (b) Đợt được đóng trong khoảng 27/10 → ngày go-live: ERP đã có `thanh_toan` ngày 03/11. Nhập Liệu cũng có "Trả Nợ" 03/11, và plan ghi dòng này thành `thanh_toan` trong kỳ mở (phase 7 dòng 79). Guard độc quyền chỉ xét ≤ 26/10, V6 cũng chỉ xét ≤ 26/10, nên không chặn.
  - (c) Một dòng "Lấy Hàng" sau mốc không khớp vì lệch dung sai (±1 đồng, ±3 ngày), trong khi phiếu tương ứng vẫn được nhập ở trạng thái mở. Người dùng `ack` "ghi như dòng sổ", nên dòng `lay_hang` được ghi. Khi chốt kỳ 27/10→26/11, phiếu sinh thêm một event `lay_hang` nữa. Hàng bị tính hai lần.
  - V1–V7 chạy lúc commit, nên không thấy (a): việc đóng đợt xảy ra sau đó.
- **Evidence:**
  - `lib/payment/payment-ledger-sync.ts:25-28` lấy mọi dòng `vat_tu` có `soDuyet > 0`. `:31` dùng `businessDate = toBusinessDateUtc(closedAt)`. `:39` chỉ kiểm khóa kỳ ở ngày đóng. `:62-70` chỉ idempotent theo `paymentRoundItemId`.
  - `lib/payment/payment-service.ts:588-601`: `closeRound` chạy cho mọi đợt `approved`, không xét ngày chi thật.
  - `lib/vat-tu-ncc/period-lock.ts:67-84`: chỉ chặn khi có kỳ **đã ký** bao trùm ngày ghi.
  - `lib/ledger/ledger-service.ts:285-298`: event sinh từ phiếu (qty × giá) là nguồn tiền độc lập với dòng sổ đã `ack`.
  - Plan phase 7 dòng 78: "trừ khi người dùng `ack` từng dòng 'ghi như dòng sổ'"; dòng 79: "Dòng 'Trả Nợ' sau mốc ghi thành `thanh_toan` trong kỳ mở"; dòng 84: guard chỉ xét "ngày ≤ 26/10".
  - Phase 8 dòng 18-20: kiểm kê chỉ liệt kê "dòng đợt `vat_tu` thiếu công trình".
- **Suggested fix:**
  - Kiểm kê trước go-live mọi đợt `vat_tu` ở trạng thái `submitted`/`approved` và mọi dòng sổ có `paymentRoundItemId` ngày > 26/10. Người dùng quyết từng dòng: đóng đợt trước giờ đóng băng và gạch "Trả Nợ" tương ứng trong Excel, hoặc gắn cờ "đã có trong Excel" để `syncClosedRoundToLedger` bỏ qua.
  - Trong adapter, đối chiếu "Trả Nợ" sau mốc với các dòng `thanh_toan` ERP đang có của cặp (theo ngày ± N, số tiền ± 1 đồng). Có ứng viên thì chặn.
  - Với dòng "Lấy Hàng" được `ack`: chỉ cho `ack` khi không còn phiếu ứng viên nào trong run. Nếu có, phiếu đó phải bị loại khỏi run hoặc được gắn với dòng sổ.

## Finding 2: Commit import kiểm guard và multiset trước khi giữ khóa NCC; khóa giữ lâu làm nghẽn người ghi khác
- **Severity:** High
- **Location:** Phase 5, `commitImport` trong bảng "Files to Create / Modify"; Phase 7, "Thứ tự ghi" bước 1 và "Guard độc quyền lịch sử".
- **Flaw:** Thứ tự trong plan là `import-commit lock → kiểm hash → review (guard độc quyền, multiset phiếu sau mốc, marker cũ) → apply → lockSuppliers`. Vì vậy mọi kết luận của `review` được tính khi chưa giữ khóa NCC, rồi `apply` ghi theo kết luận cũ. Ở READ COMMITTED, ghi đồng thời commit giữa hai bước này thì `review` không thấy. Đây đúng là khe check-then-write mà `period-lock.ts:7-11` được thiết kế để loại bỏ. "Đóng băng module" chỉ là thông báo (phase 8 bước 1), không phải chặn bằng kỹ thuật.
- **Failure scenario:**
  - Trong lúc commit đang parse lại 24 file, một cán bộ vật tư (chưa đọc thông báo đóng băng) nhập phiếu 28/10 cho Quang Minh × DCX. `createDelivery` khóa NCC, insert, rồi commit.
  - `review` của import đã tính multiset từ trước, nên vẫn chèn phiếu 28/10 của file. Hai phiếu giống nhau cùng mở; chốt kỳ 27/10→26/11 sinh hai event.
  - Cũng vậy, một dòng sổ tay ≤ 26/10 hoặc một marker ERP lọt qua guard độc quyền và chỉ bị V6 phát hiện sau khi đã commit.
  - Ngược lại, khi import đã giữ khóa NCC (tới 300 giây), `createDelivery` và `LedgerService.create` chạy transaction mặc định 5 giây. Chúng chờ trong `pg_advisory_xact_lock` rồi hết hạn ở phía Prisma, nhưng backend vẫn giữ connection cho tới khi import xong. Pool `pg` mặc định có 10 connection, nên khoảng 9 request bị kẹt là đủ làm treo toàn bộ ứng dụng, mọi module.
- **Evidence:**
  - Phase 5 dòng 29: "`pg_advisory_xact_lock(hashtext('import-commit'))` → đọc lại run … → chạy lại `review` … → `apply`". Phase 7 dòng 88: "1. `lockSuppliers(tx, mọi NCC của run)`" là bước đầu của `apply`.
  - `lib/vat-tu-ncc/delivery-service.ts:54-58`: `$transaction` không có tùy chọn timeout.
  - `lib/ledger/ledger-service.ts:72-75`: `prisma.$transaction((tx) => fn(tx))` dùng mặc định.
  - `lib/prisma.ts:110`: `new Pool({ connectionString })`, `max` mặc định 10.
  - `lib/vat-tu-ncc/period-lock.ts:36-42`.
- **Suggested fix:**
  - Trong `commitImport`, ngay sau khóa `import-commit`, suy ra tập NCC từ ánh xạ đã lưu và dữ liệu đã parse, gọi `lockSuppliers`, **rồi mới** chạy `review`, so digest và `apply`.
  - Chặn ghi bằng kỹ thuật trong cửa sổ import (cờ chỉ đọc cho `vat-tu-ncc`, `cong-no-vt`, đóng đợt `vat_tu`), không chỉ thông báo.
  - Đặt `SET LOCAL lock_timeout` cho các đường ghi thường, để chúng lỗi nhanh thay vì giữ connection.

## Finding 3: CHECK `NOT VALID` làm hỏng mọi UPDATE trên dòng cũ; VALIDATE quét cả dòng đã xóa mềm và lịch sử; guard bỏ sót tiền cũ không có công trình
- **Severity:** High
- **Location:** Phase 1, "Nội dung migration" (5 CHECK) và ghi chú dòng 60; Phase 8, Runbook bước 3 và 6; Phase 7, "Guard độc quyền lịch sử".
- **Flaw:**
  - (1) Plan chỉ lường trước việc xóa mềm. Thực tế, mọi UPDATE trên dòng cũ thiếu `projectId` đều trả 23514, kể cả UPDATE không đụng `projectId`.
  - (2) `VALIDATE CONSTRAINT` quét toàn bảng, gồm dòng `deletedAt IS NOT NULL` và dòng đợt thanh toán đã đóng từ lâu. Đây không phải dữ liệu pilot, nên script dọn theo danh sách pilot không xử lý chúng.
  - (3) Guard độc quyền chỉ chặn **marker** cũ có `projectId` NULL. Nó không chặn sổ vật tư hay số dư ban đầu cũ có `projectId` NULL của cùng NCC, trong khi các báo cáo cấp NCC vẫn cộng chúng.
- **Failure scenario:**
  - Ngay sau bước 5 (deploy + migrate), một đợt `submitted` có dòng `vat_tu` không công trình không duyệt được (`approveItem`, `bulkApproveAsRequested` → 23514). Đợt nháp không "làm mới số dư" được. Đợt `approved` không đóng được, vì phase 2 ném lỗi khi dòng `vat_tu` thiếu công trình. Module thanh toán, vốn không nằm trong danh sách đóng băng hoàn toàn, bị kẹt.
  - Ở bước 6, `VALIDATE` của `supplier_recon_project_required` thất bại vì một marker đã xóa mềm từ trước, hoặc `payment_item_vat_tu_project_required` thất bại vì đợt đã đóng từ tháng 6. Runbook chỉ nói "dừng và hỏi người dùng" trong lúc build mới đã chạy, hệ thống đang đóng băng, và không có phương án nào được quyết trước.
  - Nếu bỏ qua VALIDATE rồi import: số dư cũ (ví dụ Nam Hương id 1, 310.605.120, có từ 04/08, không phải pilot 07/10) vẫn được cộng ở tổng NCC và ma trận NCC × Chủ thể, cộng thêm số dư mới theo cặp. V1–V7 đều theo cặp nên không thấy.
- **Evidence:**
  - Phase 1 dòng 60: "việc xóa mềm một dòng cũ thiếu công trình sẽ vi phạm CHECK". Phase 8 dòng 48: "CHECK nào không qua thì dừng và hỏi người dùng".
  - `lib/payment/payment-service.ts:363-370, 409-412, 472-475, 495-498, 534-537`: UPDATE dòng đợt.
  - `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:394`: `useState<number | null>(item.projectId)`.
  - `lib/vat-tu-ncc/delivery-service.ts:61`: `projectId: data.projectId ?? null`.
  - `prisma/migrations/20260729162000_reconciliation_derived_snapshot/migration.sql:12-22`: đã xóa mềm marker trùng; mọi marker đều có `projectId` NULL vì cột chưa tồn tại.
  - `lib/vat-tu-ncc/supplier-balance.ts:23-26` và `lib/cong-no-vt/balance-report-service.ts:132-140`: cộng số dư ban đầu không lọc công trình.
  - `plans/261006-0307-…/reports/pilot-result.md:124`: "Id 1 Nam Hương 310.605.120 có sẵn từ 04/08".
  - Phase 7 dòng 84: chỉ chặn "marker cũ (`projectId` NULL)".
- **Suggested fix:**
  - Kiểm kê phải đếm **mọi** dòng thiếu công trình, gồm dòng đã xóa mềm và đợt đã đóng. Chạy `VALIDATE` trên DB chạy thử trước ngày go-live.
  - Quyết trước khi deploy: backfill `projectId` cho dòng lịch sử, hoặc thu hẹp CHECK (ví dụ `"deletedAt" IS NULL AND …`, hoặc miễn cho đợt `closed`).
  - Xử lý hết đợt `vat_tu` đang chạy trước khi migrate.
  - Mở rộng guard độc quyền: chặn nếu NCC còn dòng sổ hoặc số dư vật tư sống có `projectId` NULL.

## Finding 4: Lỗ hổng hoàn tác dẫn tới kẹt "import lại"; tác dụng phụ không được hoàn tác
- **Severity:** High
- **Location:** Phase 5, `rollback-guards.ts`; Phase 7, "Guard độc quyền lịch sử" và "Thứ tự ghi" bước 2; Phase 8, Runbook bước 9 và mục "Rollback vận hành".
- **Flaw:**
  - Guard hoàn tác chỉ từ chối khi có (i) kỳ **đã ký** do ERP tạo, hoặc (ii) dòng sổ ngoài run tham chiếu phiếu của run qua `deliveryId`.
  - Guard độc quyền của lần import sau lại chặn khi có **bất kỳ** marker còn sống, hoặc bất kỳ dòng sổ ≤ 26/10.
  - Hai guard không khớp nhau. Có những thứ sống sót qua hoàn tác: marker ERP chưa ký, `dieu_chinh` ngày ≤ 26/10 (không bị khóa kỳ), và dòng tay ≤ 26/10 ở cặp mà marker vừa bị xóa. Các thứ đó chặn lần import lại.
  - Ngoài ra, việc gán `Project.entityId` và danh mục tạo mới không được hoàn tác, và không có cột nào ghi lại chúng.
- **Failure scenario:**
  - Sau import, kế toán chốt kỳ 27/10→26/11 cho Bê tông HP × Trại Chuối. Mọi phiếu sau mốc đều đã được nhập tay (multiset bỏ qua phiếu của file), nên không event nào trỏ vào phiếu của run. Kỳ chưa ký. Kế toán còn thêm một `dieu_chinh` 15/09 để sửa neo lệch.
  - Phát hiện ánh xạ sai Tiên Lãng, admin bấm hoàn tác. Guard cho qua. Marker chuyển đổi bị xóa; marker 27/10→26/11 và `dieu_chinh` 15/09 còn lại.
  - Import lại thì guard độc quyền chặn ("marker còn sống", "dòng ≤ 26/10"). Công trình "Tiên Lãng (SH)" giữ `entityId` sai đã gán lúc commit, nên ánh xạ lần mới bị chặn vì "lệch Chủ thể".
  - Runbook bước 9 ("hoàn tác … import lại") đi vào ngõ cụt, chỉ còn cách khôi phục bản sao lưu.
- **Evidence:**
  - `lib/import/import-engine.ts:283-314`: chỉ `DELETE … WHERE "importRunId"`.
  - `lib/vat-tu-ncc/period-close-service.ts:313-322`: chốt kỳ ERP tạo marker không có `importRunId`.
  - `lib/vat-tu-ncc/reconciliation-service.ts:73-80`: tạo kỳ tay.
  - `lib/ledger/transaction-classification.ts:27-31` (`dieu_chinh` không thuộc `PERIOD_LOCKED_TYPES`) và `lib/ledger/ledger-service.ts:55-64`.
  - `lib/cong-no-vt/material-ledger-service.ts:144-147`: admin patch chỉ kiểm khóa cho loại bị khóa.
  - `prisma/schema.prisma:266-289`: `Project` không có `importRunId`.
  - Phase 5 dòng 30: guard chỉ xét "kỳ ký với `importRunId IS NULL`". Phase 7 dòng 84: "marker còn sống". Phase 7 dòng 89: "gán `entityId` cho công trình đang NULL".
- **Suggested fix:**
  - Đồng bộ hai guard. Guard hoàn tác từ chối khi cặp có bất kỳ marker ERP nào (ký hoặc chưa ký), hoặc có dòng không thuộc run ngày ≤ 26/10 (kể cả `dieu_chinh`). Hoặc guard độc quyền bỏ qua marker và dòng bắt đầu sau `CUTOVER_DATE`.
  - Ghi vào `reviewJson` danh sách danh mục đã tạo và các lần gán `entityId`, rồi hoàn tác việc gán khi rollback. Đơn giản hơn: bắt buộc gán Chủ thể ở master data trước (runbook bước 7) và cấm adapter tự gán.

## Finding 5: Khẳng định "rollback phase 2 bằng git revert, code cũ vẫn chạy" là sai sau khi migrate
- **Severity:** High
- **Location:** Phase 2, "Ownership & Rollback"; Phase 1, "Ownership & Rollback".
- **Flaw:** CHECK của phase 1 vẫn kiểm mọi INSERT và UPDATE mới. Index `supplier_recon_period_unique` đã bị drop. Code cũ thì không biết `projectId`.
- **Failure scenario (luồng đã dò):**
  - `createReconciliation` cũ INSERT không có `projectId` → 23514 (`supplier_recon_project_required`).
  - `commitPeriodClose` cũ: `existingRecon = findFirst({supplierId, periodFrom, periodTo})` khớp marker của **một cặp bất kỳ**, nên không tạo marker. Nếu không khớp thì INSERT thiếu `projectId` → 23514.
  - `loadPeriodBoundsContext` cũ nạp marker của mọi cặp, rồi áp quy tắc liền kề theo marker muộn nhất của NCC. Ví dụ A×X đã tới 26/11 còn A×Y mới tới 26/10, thì A×Y bị buộc bắt đầu từ 27/11, sai.
  - `createDelivery` hoặc sổ vật tư cũ không có công trình → 23514.
  - Kết quả: revert code sau go-live làm module vật tư ngừng hoạt động, không phải "chặt hơn".
- **Evidence:**
  - Phase 2 dòng 72: "Rollback: git revert. Cột schema nullable nên code cũ vẫn chạy; marker có `projectId` bị code cũ hiểu là khóa cả NCC, tức chặt hơn."
  - `lib/vat-tu-ncc/reconciliation-service.ts:73-80`.
  - `lib/vat-tu-ncc/period-close-service.ts:314-321`.
  - `lib/vat-tu-ncc/period-lock.ts:107-110` (không lọc công trình) và `:124-135` của `period-bounds.ts` (liền kề theo marker muộn nhất).
  - `lib/vat-tu-ncc/delivery-service.ts:61`.
  - Phase 1 dòng 32: `DROP INDEX "supplier_recon_period_unique"`.
- **Suggested fix:**
  - Ghi rõ: sau `migrate deploy`, mọi phase từ 2 trở đi chỉ được sửa tiến. Rollback code bắt buộc đi kèm khôi phục DB (bước 2) và build cũ.
  - Nếu cần một đường revert thật, tách CHECK thành migration riêng, áp sau khi go-live ổn định.

## Finding 6: Khóa chuyển đổi chỉ phủ cặp có marker; cặp chỉ có số dư và cặp mới vẫn nhận ghi ngày ≤ 26/10; marker vi phạm quy tắc 3 của biên kỳ
- **Severity:** Medium
- **Location:** Phase 7, "Thứ tự ghi" bước 6 ("mỗi cặp có dữ liệu tới 26/10"); plan.md, bất biến I3; Phase 2, `period-lock.ts`.
- **Flaw:**
  - I3 ("tiền tới 26/10 chỉ đến từ run chuyển đổi") chỉ được thực thi gián tiếp qua marker đã ký **của từng cặp**.
  - "Dữ liệu tới 26/10" không định nghĩa rõ cặp chỉ có Số Dư (không có dòng 2026, không có phiếu) có được marker hay không.
  - Cặp phát sinh sau go-live không có marker nào.
  - Ngoài ra, marker `31/12/2025→26/10/2026` của cặp giữ số dư ròng (`asOf` 31/12/2025) vi phạm quy tắc 3 của `validatePeriodBounds`: from phải ≥ asOf + 1.
- **Failure scenario:**
  - Cặp Phương Minh × Cát Dài chỉ có Số Dư, nên không được marker. `suggestNextPeriod` gợi ý kỳ 01/01/2026→26/01/2026. Kế toán nhập bù một `thanh_toan` 10/09 qua sổ vật tư; `assertPeriodOpen` cho qua vì không có kỳ ký nào. Khoản này đã có trong Excel nhưng nằm ở cặp tên khác, nên bị tính trùng và V6 không bao giờ chạy lại.
  - Code tương lai kiểm lại biên của marker chuyển đổi (ví dụ một bước "kiểm toàn bộ marker") sẽ báo lỗi trên dữ liệu hợp lệ.
- **Evidence:**
  - `lib/vat-tu-ncc/period-lock.ts:67-84`: chỉ chặn khi có kỳ ký bao trùm.
  - `lib/vat-tu-ncc/period-bounds.ts:159-171`: không có marker thì `from = openingAsOf + 1`.
  - `lib/vat-tu-ncc/period-bounds.ts:106-113`: quy tắc 3.
  - Phase 7 dòng 93: "Ghi marker chuyển đổi cho mỗi cặp có dữ liệu tới 26/10".
- **Suggested fix:**
  - Định nghĩa marker cho **mọi** cặp có tiền nhập (số dư, lũy kế, dòng) hoặc có phiếu.
  - Thêm guard toàn cục: khi đã có run chuyển đổi committed, từ chối ghi loại bị khóa vào sổ vật tư với ngày ≤ `CUTOVER_DATE` ở mọi cặp.
  - Ghi miễn trừ quy tắc 3 cho marker có `importRunId`, hoặc đặt `periodFrom = 01/01/2026` cho cặp giữ số dư ròng.

## Finding 7: Đối soát V2–V7 chạy sau commit và không chặn; hệ thống được mở lại dựa vào người bấm hoàn tác
- **Severity:** Medium
- **Location:** Phase 7, "Đối soát" (dòng 109) và "Thứ tự ghi" bước 7; Phase 8, Runbook bước 9 và 13.
- **Flaw:**
  - Plan tự gọi V2–V7 lệch ở cột DB là "lỗi apply, cần hoàn tác", nhưng không kiểm trong transaction. Dữ liệu sai được commit, hiển thị ngay, và chỉ được gỡ nếu có người bấm hoàn tác.
  - Không định nghĩa cách xử lý khi V1 tính từ DB lệch V1 đã xem trước (và đã `ack`).
  - Hoàn tác lại bị guard chặn ngay khi có kỳ ERP ký (Finding 4). Chỉ cần một người chốt và ký kỳ trước khi ai đó nhìn bảng đối soát là mất đường hoàn tác.
- **Failure scenario:** Commit xong, V5 lệch số phiếu ở 2 cặp vì khử trùng khác giữa lúc xem trước và lúc apply. Admin chụp màn hình rồi mở lại hệ thống (bước 13). Hôm sau kế toán ký kỳ 27/10→26/11 của một cặp lệch, và hoàn tác bị từ chối vĩnh viễn.
- **Evidence:**
  - `lib/import/import-engine.ts:124-141`: commit là một transaction rồi kết thúc.
  - Phase 7 dòng 94 và 109: "V2–V7 lệch ở cột DB là lỗi apply, cần hoàn tác". Phase 8 dòng 51 và 59.
- **Suggested fix:** Tính V2–V7 từ `tx` sau `apply` và trước khi cập nhật trạng thái run. Lệch quá dung sai thì `throw`, transaction tự rollback. V1 của DB phải bằng V1 đã `ack` (± 1 đồng); khác thì cũng `throw`. Lưu kết quả vào `reviewJson`.

## Finding 8: Lỗ hổng triển khai — thứ tự dừng/migrate/chạy, môi trường chạy thử trỏ DB thật, khôi phục sao lưu xóa dữ liệu module khác
- **Severity:** Medium
- **Location:** Phase 8, "Tasks & Steps" bước 2; Runbook bước 2, 5 và mục "Rollback vận hành".
- **Flaw:**
  - (a) Container không tự migrate. Bước 5 "Build và deploy bản mới; chạy `npx prisma migrate deploy`" không nói thứ tự.
    - Nếu build mới chạy trước khi migrate: Prisma chọn mọi cột scalar, nên mọi truy vấn `supplierReconciliation` hoặc `importRun` lỗi vì thiếu `projectId`, `sourceFile`.
    - Nếu migrate trước trong khi container cũ còn phục vụ: ghi của code cũ vi phạm CHECK (Finding 5).
  - (b) "Chạy thử trên bản khôi phục của DB thật theo đúng runbook từ bước 2 tới 11" có cả deploy, dọn pilot `COMMIT` và import. Compose `erp-3001` lại hard-code `DATABASE_URL` tới DB thật `ngoquyyen_erp`. Plan không nêu DB hay container riêng cho lần chạy thử.
  - (c) "Khôi phục từ bản sao lưu ở bước 2" sau khi đã mở lại hệ thống là `pg_dump` toàn DB. Mọi dữ liệu của module khác (đợt thanh toán, dự án, công việc…) kể từ go-live sẽ mất.
- **Failure scenario:** Người chạy thử làm đúng chữ "bước 2–11" trên compose `erp-3001`. `migrate`, dọn pilot và import đều chạy vào DB thật mà không có người dùng duyệt.
- **Evidence:**
  - `Dockerfile.prod:52` (chỉ copy `prisma/`) và `:68` (`CMD ["node", "server.js"]`).
  - `docker/docker-compose.erp-3001.yml:15-17`: `restart: unless-stopped` và `DATABASE_URL: …@postgres:5432/ngoquyyen_erp`.
  - `lib/import/import-engine.ts:163-166` và `lib/vat-tu-ncc/reconciliation-service.ts:33-36`: `findMany` không có `select`.
  - Phase 8 dòng 37, 47, 61-63.
- **Suggested fix:**
  - Runbook ghi rõ: dừng container → `migrate deploy` → chạy build mới.
  - Chạy thử trên DB tên khác (ví dụ `ngoquyyen_erp_dryrun`), với compose hoặc env riêng, và kiểm `DATABASE_URL` trước mỗi lệnh.
  - Chỉ cho khôi phục sao lưu trước bước 13. Sau đó chỉ sửa tiến (`dieu_chinh` hoặc SQL có duyệt).

## Finding 9: CSV lũy kế có thể cũ hơn Nhập Liệu tại giờ đóng băng; runbook không xuất lại CSV
- **Severity:** Medium
- **Location:** Phase 7, "Duyệt từng cặp (D3)"; Phase 8, Runbook bước 1 và 12.
- **Flaw:**
  - Phép kiểm `(G − LH26) − (H+I − Trả26) = S` lấy LH26 "gồm cả dòng sau 26/10, vì CSV là số hiện hành".
  - CSV là bản xuất tĩnh (tên file "đến 26.7.26"). Gói bằng chứng chỉ khẳng định số "hiện hành" tại lúc xuất.
  - Excel vẫn được cập nhật tới giờ đóng băng, có thể nhiều tuần sau. Runbook không có bước xuất lại CSV từ file tổng tại giờ đóng băng.
- **Failure scenario:**
  - Giữa lúc xuất CSV và giờ đóng băng, kế toán thêm 3 dòng Nhập Liệu cho Nam Hương × Trại Chuối. Phép kiểm lệch đúng bằng số đó, nên mặc định lặng lẽ chuyển sang 0 (ròng).
  - Nếu người dùng `ack` chọn 1 như plan cho phép, hai dòng lũy kế 31/12/2025 sai đúng phần chênh. V3 lệch sau commit (xem Finding 7).
- **Evidence:**
  - Tệp `Quản Lý Công Nợ/Tong Cong No - Tổng công nợ đến 26.7.26.csv`.
  - `reports/debate-evidence-packet.md:86-87`: "numbers are current (linked to the main file despite the '26.7.26' label)"; 43/86 cặp khớp.
  - Phase 7 dòng 56, 62-64.
  - Phase 6 dòng 78 ("tối đa 1 CSV", tức CSV là tùy chọn).
- **Suggested fix:**
  - Runbook bước 1 thêm: xuất lại CSV từ file tổng đã đóng băng, ghi giờ xuất, đưa vào gói.
  - Adapter so mốc của CSV với ngày Nhập Liệu muộn nhất. CSV cũ hơn thì chặn lựa chọn 1, thay vì để người dùng `ack`.

---

## Ghi chú phụ (không xếp hạng)

- **Khối gộp Lộc Tài mâu thuẫn trong phase 6.**
  - Dòng 59 ghi "Mọi phiếu vẫn thuộc công trình của thư mục", trong khi test dòng 102 tách 19/06, 25/06, 26/06 sang Dải cây xanh.
  - Dữ liệu thật: `Theo Dõi Vật Tư/Trại Chuối/Máy xúc Lộc Tài HT.xlsx`, sheet "Đối chiếu công nợ", dòng 48-53 có "Cộng Trại Chuối 2.600.000" và "Cộng dải cây xanh 8.950.000" trong cùng một khối. File DCX cũng có khối "Trại Chuối + Dải cây xanh".
  - Theo quy tắc thư mục, cùng một phiếu thật có thể rơi vào hai cặp khác nhau, và khử trùng theo (NCC, công trình) không gộp được. Nếu có phiếu như vậy sau 26/10, sẽ có hai event.
- `listImportRuns` và `getImportRun` (`lib/import/import-engine.ts:162-172`, gọi qua server action `app/(app)/admin/import/import-actions.ts:19,25`) không có `select`. Sau khi thêm `sourceFile Bytes` và `reviewJson`, mỗi lần mở lịch sử sẽ kéo toàn bộ gói file nguồn về client.
- Có thêm một dòng ngày bẩn chưa có trong test: "26/10/206" (năm 3 chữ số) ở `Dải Cây Xanh/Máy xúc Lộc Tài HT - DCX.xlsx`, dòng 38.

## Câu hỏi chưa giải

1. Hiện có bao nhiêu đợt `vat_tu` ở trạng thái `submitted`/`approved`, và bao nhiêu dòng sổ có `paymentRoundItemId`? (quyết định mức độ Finding 1 và 3)
2. "Cặp có dữ liệu tới 26/10" có bao gồm cặp chỉ có Số Dư không?
3. Lần chạy thử dùng DB và container nào?

Status: DONE
