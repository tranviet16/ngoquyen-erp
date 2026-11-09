# Red team — Phá giả định (Assumption Destroyer) + kiểm phạm vi trạng thái

- Kế hoạch: `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/` (plan.md, phase-01 → phase-08)
- Vai trò kiểm chứng: Scope Auditor — cột/JSON/hằng/trạng thái mới có tôn trọng vòng đời không; mọi nơi tạo và đọc; có trạng thái sẵn có làm cùng việc không.
- Cách kiểm: grep/đọc code tại commit `df1e1e7`; đọc dữ liệu thật trong `Quản Lý Công Nợ/` bằng openpyxl (read_only) và csv.
- Ngày: 05/11/2026

---

## Finding 1: Dòng "Lấy Hàng" sau mốc được `ack` "ghi như dòng sổ" vẫn nhập phiếu mở tương ứng, nên lần chốt ERP đầu tiên tính nợ hai lần. Khoảng 27/10 → go-live cũng không được đóng băng.

- **Severity:** Critical
- **Location:** Phase 7, mục "Chống tính trùng → Sau 26/10" và "Guard độc quyền lịch sử". Phase 8, runbook bước 1. Plan, Success Criteria (11/11; Quang Minh × DCX = 159.360.000).
- **Flaw:** Kế hoạch giả định dữ liệu sau mốc vẫn như ảnh chụp hôm nay: 11 dòng, khớp đủ 11/11, không có "Trả Nợ". Thực tế người dùng vẫn nhập song song vào Excel cho tới giờ đóng băng ở go-live, sau khoảng 82 giờ làm. Câu hỏi mở số 2 của plan cũng thừa nhận phiếu sau 26/10 sẽ được import tới ngày import.
  - Quy tắc ghép sau mốc cần **số tiền ± 1 đồng**. Sheet "Vật tư ngày" không có cột giá, nên phiếu chỉ có ở đó sẽ không bao giờ khớp. Phiếu lệch giá cũng không khớp; ví dụ cùng ngày có hai mức 3.500.000 và 2.800.000 ở Lộc Tài DCX, dòng 37 và 43.
  - Dòng không khớp có hai lối ra: bị chặn, hoặc được `ack` "ghi như dòng sổ" để ghi `lay_hang`. Trong khi đó, **mọi** phiếu sau mốc đều được nhập ở trạng thái mở ("Phiếu được ghi ở trạng thái chưa chốt"). Không có quy tắc nào bỏ phiếu đã được một dòng sổ `ack` "đại diện".
  - Thanh toán sau mốc cũng không được khử trùng. "Trả Nợ" sau mốc được ghi thành `thanh_toan`, nhưng guard độc quyền chỉ xét dòng ≤ 26/10. Khoản trả đó có thể đã vào sổ qua đóng đợt thanh toán hoặc tab Thanh toán của ERP trong tháng 11.
- **Failure scenario:**
  - Ngày 05/11, Lộc Tài DCX có 1 ca. Phiếu nằm trong "Vật tư ngày", hoặc đơn giá trong khối khác số tiền ở Nhập Liệu.
  - Không khớp nên bị chặn. Người dùng `ack` thì ghi `lay_hang` 2.800.000; phiếu vẫn được nhập ở trạng thái mở.
  - Chốt ERP 27/10→26/11 sinh thêm event 2.800.000. Nợ tăng gấp đôi, V3 (LH Toàn bộ = G) lệch, neo 159.360.000 hỏng.
  - Với thanh toán: đợt thanh toán đóng ngày 10/11 ghi `thanh_toan` (`lib/payment/payment-ledger-sync.ts:35-71`). Cùng khoản đó có trong Nhập Liệu dưới dạng "Trả Nợ" và bị ghi lần nữa.
  - Lệch CSV: nếu CSV không được xuất lại cùng lúc với Nhập Liệu, LH26 (gồm cả dòng sau mốc) không khớp G. Mọi cặp có phát sinh tháng 11 âm thầm rơi về mặc định 0 (số dư ròng).
- **Evidence:**
  - phase-07: "Dòng 'Lấy Hàng' sau mốc không khớp là **lỗi chặn**, trừ khi người dùng `ack` từng dòng 'ghi như dòng sổ' (khi đó ghi `lay_hang` thường trong kỳ mở)". Và: "Phiếu được ghi ở trạng thái chưa chốt".
  - phase-07, guard: "dòng sổ vật tư ngày ≤ 26/10". Không có quy tắc nào cho thanh toán sau mốc.
  - Dữ liệu: `Theo Dõi Vật Tư/Trại Chuối/Xi măng Anh Thư.xlsx`, sheet "Vật tư ngày", dòng 54 và 75: `STT | Ngày/tháng/năm | Khối lượng | ĐVT | Cán bộ vật tư | Chỉ huy công trường | Kế toán phụ trách`. Không có cột giá.
  - Khối 27/10→26/11 đang được ghi tiếp:
    - Gạch NH DCX: dòng 32 (VTN) và 44 (ĐC).
    - Quang Minh DCX: dòng 61 và 81.
    - Quang Minh Trại Chuối "đến 26.5.26": dòng 220 và 332.
    - Lộc Tài MN2: dòng 33.
  - Ghi thanh toán ở ERP: `lib/payment/payment-ledger-sync.ts:35-71`; `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:27`.
- **Suggested fix:**
  - Ack phải gắn với phiếu: "dòng Nhập Liệu X = phiếu Y" thì không ghi dòng sổ, phiếu Y giữ mở và lấy đơn giá từ số tiền Nhập Liệu. Còn "ghi dòng sổ" thì phiếu cùng (NCC, công trình, ngày ± 3) phải bị đánh dấu không sinh event. Không bao giờ cho cả hai cùng tồn tại.
  - Khử trùng `thanh_toan` sau mốc với dòng ERP có sẵn (đợt thanh toán, tab Thanh toán), hoặc đóng băng mọi ghi vật tư trong ERP từ 27/10.
  - Runbook: bắt buộc xuất lại CSV đúng giờ đóng băng.
  - Thay tiêu chí "11/11" bằng "mọi dòng sau mốc khớp hoặc được giải quyết rõ".

## Finding 2: Biên khối trong file theo dõi không đáng tin, nên cách giải ngày bẩn và cách chọn khối neo V1 sai trên dữ liệu thật.

- **Severity:** High
- **Location:** Phase 6, mục "Ngày bẩn" và "File theo dõi" (biên khối sai). Phase 7, V1 ("lấy khối muộn nhất có biên Y ≤ 26/10").
- **Flaw:** Kế hoạch coi nhãn "từ ngày X đến hết ngày Y" là nguồn phân xử ngày. Nhưng nhãn bị copy mà không sửa, trùng nhau, hoặc đảo ngược. Ngày chữ không mơ hồ (ngày > 12, chỉ có 1 ứng viên) nằm ngoài nhãn quá ±7 ngày vẫn bị chặn. V1 chọn khối theo nhãn, nên lấy nhầm khối đang ghi dở.
- **Failure scenario (đều từ dữ liệu thật):**
  1. `Trại Chuối/Xi măng Anh Thư.xlsx`, "Đối chiếu công nợ":
     - Dòng 82 có nhãn `26/4/2026 → 26/5/2026`, giống dòng 49.
     - Dòng 86 chứa chữ `27/07/2026`, khớp với "Vật tư ngày" dòng 73 (`27/7→26/8`).
     - Đây là ứng viên duy nhất, cách nhãn 62 ngày, nên bị **chặn**. Người dùng buộc phải sửa Excel dù dữ liệu đúng.
  2. `Mầm Non TC2/Lộc Tài - MN2.xlsx`, khối dòng 9 và dòng 45 cùng nhãn `27/09→26/10`.
     - Khối dòng 45 thực ra là kỳ sau: A = 261.780.000 (dòng 48) = Tổng nợ khối 1 (dòng 21), vốn đã gồm 27/10 0,5 ca (dòng 16). Khối này lặp lại 27/10 ở dòng 49, Tổng nợ = 263.180.000 (dòng 57).
     - V1 lấy khối muộn nhất (dòng 45): ERP(26/10) = 260.380.000, là Nhập Liệu ≤ 26/10 của Lộc Tài × MN GĐ2. Cộng 1.400.000 ra 261.780.000, khác 263.180.000.
     - Kết quả là lệch giả, trong khi ví dụ V1 của plan khẳng định MN2 đạt.
  3. `Dải Cây Xanh/Máy xúc Lộc Tài HT - DCX.xlsx`, khối dòng 9 và dòng 68 cùng nhãn `27/09→26/10`; khối dòng 68 là khối đang ghi.
     - Dòng 16–28 cho thấy quy luật: ngày 1–12/10 được lưu thành `2026-01-10 … 2026-12-10`.
     - Phiếu thật 10/11 gõ vào khối dòng 68 trước go-live sẽ được lưu thành `2026-10-11`. Ứng viên là {11/10, 10/11}; 11/10 nằm trong [27/09, 26/10] nên được chọn **âm thầm**.
     - Phiếu sau mốc biến thành lịch sử nằm trong marker đã ký, không bao giờ sinh event.
  4. `Mầm Non TC1/Gạch Nam Hương (MN).xlsx` dòng 154: `27/08/2026 → 26/07/2026` (đảo). "Vật tư ngày" dòng 128 cũng vậy.
  5. Năm 3 chữ số `26/10/206` (Lộc Tài DCX, dòng 38). Plan chỉ nêu năm 5 chữ số.
- **Evidence:** các dòng dữ liệu trên. Plan phase-06: "Ưu tiên ứng viên duy nhất nằm trong [from, to]… trong ±7 ngày… Còn lại là lỗi chặn". Phase-07 V1: "lấy khối muộn nhất có biên Y ≤ 26/10".
- **Suggested fix:**
  - Suy biên khối từ nội dung: chuỗi A_k = Tổng nợ_{k−1}, và Y_{k−1}+1. Nhãn trùng hoặc đảo chỉ là cảnh báo.
  - Ngày có đúng 1 ứng viên thì nhận kèm cảnh báo, không chặn.
  - V1 chọn khối theo chuỗi A/Tổng nợ, không theo nhãn.
  - Khi khối có nhãn ≤ 26/10 nhưng chứa ngày > Y, phải có quy tắc riêng cho ứng viên rơi vào tháng sau mốc.
  - Thêm 5 ca thật trên vào `tracking-file-parser.test.ts` và `dirty-date.test.ts`.

## Finding 3: Dòng lũy kế ngày 31/12/2025 rơi vào cửa sổ của các preset có sẵn (Kỳ chuẩn T1/2026, Tuần 1/2026), làm Đầu kỳ = 0 và PS tăng = LH trọn đời.

- **Severity:** High
- **Location:** Plan, "Kiến trúc đã chọn" mục 6. Phase 4, "Cột theo chế độ" (liệt kê 27→26 và Tuần là preset có cận dưới).
- **Flaw:** Ngày 31/12/2025 được biện minh bằng `period-bounds.ts:106-111`, nhưng hàm đó chỉ áp cho chốt kỳ. Báo cáo dùng `date < from` để tính Đầu kỳ.
  - Kỳ chuẩn T1/2026 là 27/12/2025 → 26/01/2026.
  - Tuần ISO 1/2026 là 29/12/2025 → 04/01/2026.
  - Cả hai chứa 31/12/2025. Với mọi cặp duyệt lũy kế, Đầu kỳ = 0 và PS tăng = (G − LH26) + phát sinh tháng 1, tức hàng tỷ đồng.
  - Đẳng thức Đầu kỳ + PS − Trả = Cuối kỳ vẫn đúng, nên test của phase 4 vẫn xanh.
  - Ma trận `/cong-no-vt/tong-hop` cũng không còn "giữ nguyên" về nghĩa: cột LH ở preset "Toàn bộ" đang gộp số dư ban đầu (pilot: LH Nam Hương 385.465.120 = 310.605.120 + PS). Sau import, cột này trộn G trọn đời (cặp lũy kế) với S + LH26 (cặp ròng).
- **Failure scenario:** Kế toán mở `/cong-no-vt/tong-hop-cong-trinh?period=ncc&y=2026&m=1`, đúng nếp kỳ 27→26 của Excel. Bê tông HP × Trại Chuối hiện Đầu kỳ 0 và PS tăng khoảng 10,6 tỷ, thay cho Đầu kỳ = Số Dư. `/cong-no-vt/bao-cao-thang` và ma trận tổng hợp ở cùng preset cũng sai như vậy.
- **Evidence:**
  - `lib/vat-tu-ncc/period.ts:11-12`: `from = Date.UTC(year, month-2, 27)`.
  - `lib/ledger/report-period.ts:242`: preset `ncc` dùng `periodRange`.
  - `lib/ledger/report-period.ts:75-81`: `isoWeekRange` (thứ Hai của tuần 1/2026 là 29/12/2025).
  - `lib/cong-no-vt/balance-report-service.ts:143-148`: `open_tx` lọc `date < from`, PS lọc `date >= from`.
  - `plans/261006-0307-…/reports/pilot-result.md`, bảng "Tổng hợp NCC × Chủ thể".
- **Suggested fix:**
  - Ghi dòng lũy kế ở ngày ≤ 26/12/2025, trước cận dưới của mọi preset năm 2026.
  - Đặt `periodFrom` của marker chuyển đổi cùng ngày đó, để dòng lũy kế vẫn nằm trong kỳ đã ký. Số dư ròng dùng cùng `asOf`.
  - Hoặc phân loại rõ dòng "đầu kỳ tổng hợp" để query cửa sổ luôn tính vào Đầu kỳ.
  - Thêm test cho Kỳ chuẩn T1/2026 và Tuần 1/2026.
  - Ghi rõ nghĩa mới của cột LH ở ma trận cũ.

## Finding 4: "tsc liệt kê đủ nơi gọi" là sai. Lưới Nhập liệu và Số dư ban đầu của VT tạo dòng tạm với `projectId: null` qua API không định kiểu, và không phase nào sở hữu chúng.

- **Severity:** High
- **Location:** Phase 2, mục "Quy tắc" ("Đổi chữ ký hàm không có giá trị mặc định") và bảng "Files to Create / Modify" (hàng "Nơi gọi…").
- **Flaw:** Màn nhập tay chính của sổ vật tư là `/cong-no-vt/nhap-lieu` (lưới AG).
  - `onAddRow` gửi stub `projectId: null` qua `actions.bulkUpsert` với kiểu `Record<string, unknown>`, rồi người dùng chọn dự án sau.
  - `patchMaterialTransaction(id, patch: Record<string, unknown>)` và `bulkUpsertMaterialTransactions` không định kiểu, nên tsc không báo.
  - Phase 2 chỉ liệt kê `components/ledger/{transaction-form-dialog,opening-balance-client}.tsx`.
  - `components/ledger-grid/*` dùng chung cho `cong-no-nc` (nhân công), nên sửa phải giữ nguyên hành vi nhân công.
- **Failure scenario:** Sau phase 2 (zod bắt buộc công trình) và CHECK của phase 1, mọi lần "Thêm dòng" ở `/cong-no-vt/nhap-lieu` và `/cong-no-vt/so-du-ban-dau` đều báo "Lỗi tạo dòng". Nếu nới cho tạo trước rồi chọn dự án sau, thì Chủ thể mặc định `defaults.entityId` dễ lệch `Project.entityId` và lần patch bị từ chối. CI vẫn xanh vì không test nào đi qua lưới.
- **Evidence:**
  - `components/ledger-grid/transaction-grid.tsx:163-189` (stub có `projectId: null`, gọi `actions.bulkUpsert([stub])`).
  - `components/ledger-grid/opening-grid.tsx:106-111`.
  - `app/(app)/cong-no-vt/nhap-lieu/page.tsx:9` và `app/(app)/cong-no-vt/so-du-ban-dau/page.tsx:8`; `app/(app)/cong-no-nc/{nhap-lieu,so-du-ban-dau}/page.tsx` dùng chung.
  - `lib/cong-no-vt/material-ledger-service.ts:110` và `:159`.
- **Suggested fix:**
  - Đưa `components/ledger-grid/*` và hai trang VT vào phạm vi phase 2 hoặc 3. Với `ledgerType = material`: bắt chọn công trình trước khi tạo, và suy Chủ thể từ công trình.
  - Thêm test cho lưới VT (thêm dòng có và không có công trình) và một ca hồi quy cho lưới nhân công.
  - Grep mọi nơi gọi qua `Record<string, unknown>`, không chỉ dựa vào tsc.

## Finding 5: CHECK `NOT VALID` vẫn chặn UPDATE dòng cũ, và go-live chỉ dọn dòng pilot. Dòng `vat_tu` cũ (không phải pilot) làm vỡ quy trình duyệt và đóng đợt thanh toán ngay từ lúc deploy.

- **Severity:** High
- **Location:** Phase 1, mục "Nội dung migration". Phase 8, runbook bước 3–6.
- **Flaw:**
  - PostgreSQL kiểm CHECK (kể cả `NOT VALID`) trên **mọi** INSERT/UPDATE của dòng.
  - Đợt thanh toán đã chạy thật từ 05/2026. Dòng `vat_tu` hiện không bắt buộc công trình; phase 3 mới thêm bắt buộc.
  - Mỗi lần làm mới số dư, duyệt hay từ chối đều UPDATE `payment_round_items`, và đóng đợt sẽ INSERT dòng sổ vật tư có `projectId` NULL.
  - Runbook chỉ xóa danh sách pilot. Dòng thật thiếu công trình chỉ được "liệt kê" rồi "dừng và hỏi" ở bước VALIDATE, lúc app **đã** migrate, mà rollback sau go-live là "sửa tiến, không lùi".
- **Failure scenario:**
  - Một đợt đang "đã gửi" có dòng vật tư thiếu công trình. Giám đốc bấm duyệt thì gặp 23514 (hoặc lỗi 500 bị che ở production). Đợt kẹt, không đóng được.
  - Go-live dừng ở bước 6 trong khi hệ thống đang đóng băng, và không có đường dữ liệu nào trong sản phẩm để gán công trình cho dòng cũ.
- **Evidence:**
  - `lib/payment/payment-service.ts:409-412` (làm mới số dư), `:472-475` (`approveItem`), `:495-498` (`rejectItem`), `:534-537` (`bulkApproveAsRequested`).
  - `lib/payment/payment-ledger-sync.ts:41-71` (`projectId: item.projectId`).
  - `docs/project-changelog.md:282,311` (Payment Round Refactor 2026-05-15, "Existing payment rounds unaffected").
  - phase-03: "`round-detail-client.tsx`: bắt buộc chọn công trình khi loại là `vat_tu`", tức hiện chưa bắt buộc.
- **Suggested fix:**
  - Thêm bước bù dữ liệu **trước** migrate: kiểm kê, rồi người dùng gán công trình cho dòng `vat_tu`, sổ vật tư và phiếu cũ không phải pilot, qua UI hoặc script được duyệt. Cần hỏi người dùng vì liên quan D7.
  - Điều kiện chạy tiếp: kiểm kê dòng không phải pilot = 0.
  - Với từng bảng: chỉ thêm CHECK sau khi bù xong, rồi VALIDATE ngay. Bỏ cửa sổ `NOT VALID` kéo dài.

## Finding 6: Trạng thái "marker cũ" (index unique riêng, nhánh khóa toàn NCC, guard, test) là trạng thái chết và không test được.

- **Severity:** Medium
- **Location:** Phase 1 (`supplier_recon_legacy_period_unique`; test "Unique của marker cũ vẫn hoạt động"). Phase 2, "Quy tắc" (marker cũ khóa toàn NCC), `loadPeriodBoundsContext`, test (f). Phase 7, guard "NCC còn marker cũ".
- **Flaw:**
  - CHECK `supplier_recon_project_required` chặn mọi INSERT có `projectId` NULL. Test phase 1 và test (f) của phase 2 không thể tạo fixture marker cũ, trừ khi drop constraint trong test.
  - Marker cũ chỉ là 4 kỳ pilot (id 1–4), đều nằm trong danh sách xóa ở bước 6, chạy ngay sau migrate khi hệ thống đang đóng băng.
  - Vòng đời thật của trạng thái này là vài phút không có người dùng. Kế hoạch vẫn thêm vĩnh viễn một index, các nhánh truy vấn và guard.
- **Failure scenario:** Lập trình viên phải drop hoặc tạo lại constraint trong test để có fixture. Test xanh nhưng không chứng minh gì về production. Code và index vĩnh viễn phục vụ một trạng thái không thể tồn tại sau go-live.
- **Evidence:**
  - phase-01: SQL có `CHECK ("projectId" IS NOT NULL) NOT VALID` cùng `CREATE UNIQUE INDEX … WHERE "projectId" IS NULL`.
  - `plans/261006-0307-…/reports/pilot-result.md`, mục "Dữ liệu pilot": kỳ id 1–2 đã ký, id 3–4 chưa ký.
  - phase-08, bước 6.
- **Suggested fix:**
  - Dọn pilot (DELETE) trước migrate.
  - Migration kiểm 0 marker có `projectId` NULL rồi thêm CHECK đã VALIDATE.
  - Bỏ index unique cho marker cũ, bỏ nhánh "marker cũ" trong period-lock và guard import, bỏ test (f) và test unique cũ.

## Finding 7: I2 (Chủ thể = `Project.entityId`) chỉ kiểm lúc ghi, nhưng phase 3 mở sửa trực tiếp `Project.entityId` mà không khóa và không kiểm dòng đã có.

- **Severity:** High
- **Location:** Phase 3, "Sửa" (cột "Chủ thể" trong master data). Phase 2, "Quy tắc" (I2). Phase 7, "Thứ tự ghi" bước 2 (gán `entityId` cho công trình đang NULL).
- **Flaw:**
  - Chủ thể được lưu trên từng dòng sổ, số dư ban đầu và event, nhưng lúc chốt kỳ lại suy từ `Project.entityId` hiện hành.
  - Sửa Chủ thể của công trình sau import không đụng các dòng cũ và không lấy khóa NCC, nên phá giả định "mọi đường ghi một cặp đều tuần tự dưới khóa NCC".
  - Unique của số dư ban đầu chứa `entityId`, nên cùng một cặp có thể có hai dòng số dư.
  - Hoàn tác import không trả lại `entityId` đã gán ở bước 2, vì "Master data … is preserved".
- **Failure scenario:**
  - Sau import, admin đổi Chủ thể của "Trại Chuối" từ Công Ty Quản Lý sang Lê Văn Huyên.
  - Lịch sử vẫn ở Công Ty Quản Lý, event chốt 27/10→26/11 sang Lê Văn Huyên.
  - Ma trận NCC × Chủ thể và trang tổng hợp tách một cặp thành hai nhóm.
  - Tiêu chí "Chủ thể dòng sổ = `Project.entityId`" sai cho toàn bộ lịch sử. Bộ lọc Chủ thể (phase 4) bỏ sót phần lịch sử.
- **Evidence:**
  - `lib/master-data/project-service.ts:101`: `PROJECT_PATCH_WHITELIST = ["code","name","status"]`; phase 3 sẽ thêm `entityId`.
  - `lib/master-data/project-service.ts:109-125`: không khóa, không kiểm gì.
  - `lib/vat-tu-ncc/period-close-service.ts:295`: Chủ thể lấy từ `Project.entityId` lúc chốt.
  - `lib/cong-no-vt/balance-report-service.ts:155`: `GROUP BY "entityId"` của dòng sổ.
  - `prisma/schema.prisma:763`: `@@unique([ledgerType, entityId, partyId, projectId])`.
  - `lib/import/import-engine.ts:272-275`.
- **Suggested fix:**
  - Chặn đổi `entityId` khi công trình đã có dòng sổ, số dư hoặc phiếu vật tư. Nếu phải đổi, làm trong một transaction có khóa NCC và đi qua chính sách kỳ đã ký.
  - Lưu `entityId` cũ trong run để hoàn tác trả lại.
  - Thêm test.

## Finding 8: Trạng thái mới của `ImportRun` (`sourceFile`, `reviewJson`, ánh xạ) không có vòng đời. Danh sách import tải hết file nhị phân, và "Dùng lại ánh xạ từ lần chạy thử" không thực hiện được.

- **Severity:** Medium
- **Location:** Phase 5 (bảng `import-engine.ts`, `import-actions.ts`). Phase 8, Tasks bước 2 và runbook bước 8.
- **Flaw:**
  1. `listImportRuns` gọi `findMany` không có `select`, và `getImportRun` trả cả dòng. Mỗi lần xem trước hoặc chạy thử lưu một gói khoảng 1,3 MB (thư mục khoảng 969 KB, sau base64). Trang `/admin/import` sẽ đọc BYTEA của tối đa 50 run ở mỗi lần mở. Không có chính sách xóa nguồn sau commit hoặc hoàn tác.
  2. Lần chạy thử diễn ra "trên bản khôi phục của DB thật", tức DB khác. `ImportRun.mapping` của lần chạy thử nằm ở DB đó. Ở go-live trên DB thật không có run trước để "Dùng lại", và id của bản ghi "Tạo mới" ở DB thử không tồn tại ở DB thật.
- **Failure scenario:** Đến go-live, khi hệ thống đã đóng băng, người dùng phải ánh xạ lại từ đầu: khoảng 47 NCC kèm bí danh, khoảng 12 công trình, vật tư và quyết định từng cặp. Thời gian đóng băng kéo dài, và lỗi ánh xạ khác lần chạy thử, nên kết quả chạy thử mất giá trị làm bằng chứng. Song song, trang lịch sử import ngày càng chậm.
- **Evidence:**
  - `lib/import/import-engine.ts:162-167` và `:170-172`.
  - `app/(app)/admin/import/page.tsx:12` và `app/(app)/admin/import/[runId]/page.tsx:19`.
  - `prisma/schema.prisma:927` (`mapping Json?` thuộc từng run).
  - phase-08: "Chạy thử trên bản khôi phục của DB thật" và "(có thể 'Dùng lại ánh xạ lần trước' từ lần chạy thử)".
- **Suggested fix:**
  - Thu hẹp `select` ở danh sách và trang chi tiết.
  - Xóa `sourceFile` sau commit, hoàn tác hoặc xóa run, hoặc lưu ở bảng riêng.
  - Cho xuất và nạp ánh xạ dưới dạng tệp JSON khóa theo tên (không theo id): "Tải ánh xạ" ở DB thử, "Nạp ánh xạ" ở DB thật.

## Finding 9: Nơi đọc theo NCC không đổi chữ ký nên tsc không báo, và sẽ bị sao chép nguyên vào route cặp. Chốt A×Y cùng biên với A×X có thể không tạo marker mà test vẫn xanh.

- **Severity:** Medium
- **Location:** Phase 2, bảng tệp (`period-close-service.ts`, `supplier-balance.ts`) và test (b). Phase 3, mục "Tạo" (vỏ mỏng "đọc dữ liệu và kiểm quyền giống trang NCC hiện có").
- **Flaw:**
  - `thanh-toan/page.tsx` tính cờ khóa từ **mọi** kỳ đã ký của NCC, không phân biệt công trình, và hiện "Nợ hiện tại" bằng `supplierBalanceAsOf` cho toàn NCC. Hàm này giữ nguyên chữ ký theo phase 2, nên tsc im lặng.
  - Trong `commitPeriodClose`, `existingRecon` tìm theo (supplierId, from, to). Phase 2 chỉ viết "marker tạo với `projectId`".
  - Test (b) "Chốt A×Y cùng kỳ không báo chồng lấn" chỉ kiểm không có lỗi, không kiểm marker A×Y có tồn tại.
- **Failure scenario:**
  - Ký A×X kỳ 27/10–26/11. Chốt A×Y cùng biên tìm thấy marker của A×X nên bỏ qua bước tạo. A×Y có event nhưng không có marker, nên không đối chiếu hay ký được. Test (b) vẫn xanh.
  - Ở route cặp A×Y, các dòng thanh toán tháng 11 hiện "đã khóa" (nút sửa tắt) vì A×X đã ký, và "Nợ hiện tại" là tổng mọi công trình của A.
- **Evidence:**
  - `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:36-40`, `:56-60` và `:40`.
  - `lib/vat-tu-ncc/period-close-service.ts:314-321`.
  - `lib/vat-tu-ncc/supplier-balance.ts:14-37` (opening cộng theo `partyId`, bỏ qua `asOfDate` và công trình).
- **Suggested fix:**
  - Liệt kê rõ ở phase 2 các vị trí trên kèm điều kiện theo cặp: lookup `existingRecon` theo cặp, cờ khóa theo cặp, nợ theo `pairBalanceAsOf`.
  - Sửa test (b) để khẳng định có đúng một marker A×Y và một marker A×X.
  - Thêm test cho cờ khóa và số nợ ở route cặp.

---

## Phạm vi kiểm chứng (để người lập kế hoạch không kiểm lại)

- Nhập Liệu có 922 dòng thật (773 Lấy Hàng, 149 Trả Nợ), dòng nào cũng có NCC, công trình và Chủ thể. Ngoài ra có 389 dòng "ma" (dòng 927–1315), chỉ chứa công thức trả về 0 ở cột I/J/M/N; parser phải dừng theo ô "Loại GD" trống, không theo dòng 0 đồng.
- Mỗi công trình có đúng một Chủ thể ở cả Nhập Liệu lẫn Số Dư, trừ "Cống hộp - Tiên lãng" (Lưu Minh Xuân 11/20 dòng, Lê Văn Huyên 7/15 dòng). Giả định D4 đứng vững.
- Có 3 dòng năm 0206 (dòng 5–7), đều là ô chữ. Có 11 dòng sau 26/10 (dòng 912–926), đều là "Lấy Hàng" chỉ có TT.
- CSV là số hiện hành: Bê tông HP × Trại Chuối có J = 509.563.111 (đã gồm 27/10); Lộc Tài DCX có J = 135.950.000 (đã gồm 27/10). Tiêu đề CSV nằm ở **hai dòng** ("Tên công ty" ở dòng 3, "Tổng phát sinh" ở dòng 4), và cột I không có nhãn. Cột H chỉ có giá trị ở dòng "Cộng"/"Tổng cộng", và ở đó trùng với I.
- `queryDetailReport` không xét `asOfDate` của số dư ban đầu (`balance-report-service.ts:131-138`). Preset "Toàn bộ" có `from` = null (`report-period.ts:182`), nên cột "chuyển sang" chỉ gồm số dư ròng. Phát biểu ở phase 4 đúng; vấn đề nằm ở các preset có cận dưới (Finding 3).
- Nhận định "layout không đọc được `searchParams`" và route tĩnh `cong-trinh` đứng cạnh `[supplierId]`: không phát hiện vấn đề.

## Câu hỏi chưa giải quyết

1. Từ 27/10 tới go-live, ERP có đang ghi thanh toán vật tư (đợt thanh toán hoặc tab Thanh toán) không? Nếu có, cần quy tắc khử trùng với "Trả Nợ" ở Nhập Liệu.
2. DB thật có bao nhiêu dòng `payment_round_items` loại `vat_tu` mà `projectId` NULL, và đợt nào đang mở? Docker đang tắt nên chưa đếm được.
3. Người dùng có chấp nhận bước bù công trình cho dữ liệu cũ (UPDATE) như một ngoại lệ của D7 không?
