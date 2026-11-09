# Ứng viên #2 — Công nợ vật tư theo công trình (lăng kính: toàn vẹn dữ liệu và bất biến)

- Ngày: 05/11/2026. Đầu vào: `reports/debate-evidence-packet.md`, `plans/reports/brainstorm-261105-1504-cong-no-vat-tu-theo-cong-trinh.md`. D1–D7 giữ nguyên.
- Mọi trích dẫn `file:line` đã kiểm lại trên working tree `main` @ `df1e1e7`. Số liệu Excel kiểm bằng openpyxl trên `Quản Lý Công Nợ/`.

## 0. Tóm tắt kiến trúc

1. Vẫn một sổ cái. Khóa, biên kỳ, đối chiếu, ký, snapshot, khóa số dư ban đầu đổi phạm vi từ NCC sang **cặp (NCC × công trình)**. Chủ thể luôn suy từ `Project.entityId`.
2. Khóa advisory `vat-tu-ncc:<NCC>:<CT>`. Bốn ràng buộc CHECK … NOT VALID buộc có công trình cho sổ vật tư, phiếu ngày, dòng đợt thanh toán `vat_tu`, kỳ đối chiếu mới.
3. Lịch sử ≤ 26/10/2026 có **đúng một nguồn tiền**: Nhập Liệu, cộng số dư ròng hoặc hai dòng lũy kế 31/12/2025. Phiếu ngày lịch sử chỉ là bản ghi khối lượng, không bao giờ sinh sổ cái.
4. Mỗi cặp có lịch sử nhận một **kỳ chuyển đổi đã khóa** 31/12/2025→26/10/2026 (gắn `importRunId`). Kỳ này khóa toàn bộ lịch sử và ép kỳ ERP đầu tiên bắt đầu 27/10. Không gỡ ký được; chỉ hoàn tác import mới gỡ.
5. Toàn bộ dữ liệu nạp bằng **một adapter `vat-tu-chuyen-doi`, một lần chạy**: chọn cả thư mục `Quản Lý Công Nợ` (file tổng + CSV + 24 file theo dõi), đóng thành một gói có hash. Xem trước nhiều bước (ánh xạ tên → duyệt từng cặp → khớp phiếu và neo Excel → xác nhận), ghi trong một transaction, hoàn tác nguyên khối.
6. Engine import được củng cố: lưu file nguồn, review có digest (chặn "xem một đằng, ghi một nẻo"), trạng thái run cập nhật trong cùng transaction, khóa commit, fail-fast, guard hoàn tác.
7. Đối soát chứng minh được: neo "Tổng nợ" từng file (đã hiệu chỉnh dòng sau biên khối), Đầu kỳ 2026 = Số Dư, lũy kế = CSV. Tính trước khi ghi (trong bộ nhớ) và sau khi ghi (từ DB); hai kết quả phải trùng.
8. Giao diện: cửa vào theo công trình bằng route lồng `cong-trinh/[projectId]/ncc/[supplierId]`, trang tổng hợp xoay chiều trên `queryDetailReport`, `du-an/[id]/cong-no` đọc sổ cái.

## 1. Phát hiện khi kiểm chứng (bổ sung hoặc sửa packet)

- **F1.** Import UI chưa có bước giải quyết xung đột. `commit-panel.tsx` luôn gửi mapping rỗng (`app/(app)/admin/import/[runId]/commit-panel.tsx:26`), trang run chỉ hiện lỗi. Câu "preview shows conflicts… user resolves" trong packet không đúng với code. D3 và D7 đều cần UI review mới.
- **F2.** `commitImport` kiểm trùng hash ngoài transaction (`lib/import/import-engine.ts:110`) và ghi trạng thái `committed` sau khi transaction ghi dữ liệu đã đóng (`:124-132`). Crash hoặc hai lần commit đồng thời có thể nhân đôi dữ liệu. `$transaction` không đặt timeout (mặc định 5 s).
- **F3.** Adapter cũ bắt lỗi từng dòng bên trong transaction (`lib/import/adapters/cong-no-vat-tu.adapter.ts:204`). Với PostgreSQL, một câu lỗi làm hỏng cả transaction, các dòng sau đều lỗi. Adapter mới phải fail-fast.
- **F4.** `readMatrix` dùng `raw: false` (`lib/import/adapters/cong-no-vat-tu.parse.ts:37`), làm mất phân biệt ô ngày với ô chữ và mất phần lẻ. File này dùng chung với adapter nhân công (`lib/import/adapters/cong-no-nhan-cong.adapter.ts:20`), nên không sửa mà viết parser mới.
- **F5.** Khối đối chiếu chứa dòng ngoài biên. Bê tông HP × Trại Chuối, khối 27/09→26/10 có dòng 27/10 (18 m³ × 1.610.000 = 28.980.000), và "Tổng nợ" 509.563.111 đã gồm dòng này (405.507.111 + 254.056.000 − 150.000.000). Vậy nợ ERP tại 26/10 phải là 480.583.111. Tiêu chí nghiệm thu phải hiểu là: nợ ERP(Y) + Σ dòng của khối có ngày > Y = Tổng nợ.
- **F6.** Khối neo không phải lúc nào cũng là 27/09→26/10. Bê tông HP (MN) dừng ở 26/06 và không có Tổng nợ. Hùng Chi, Việt Đức dừng 26/07. Gạch NH (MN) có biên gõ sai "27/08→26/07". Lộc Tài TC có hai khối trùng biên 26/05→26/06. Tùng Lâm DCX không có Tổng nợ. Quang Minh DCX có thêm khối 27/10→26/11 (159.360.000 = 152.160.000 + 7.200.000).
- **F7.** Dòng tiếp nối không có STT và ngày ("Bơm BT | 1 | ca" dưới dòng bê tông) thuộc ngày của dòng trên. Dòng tổng phụ ("Tổng cát xây Việt Trì | 76 | 37.240.000") phải bỏ. Có lỗi gõ năm "14/09/20260", "19/4/2025".
- **F8.** Nhập Liệu: một dòng có thể gộp nhiều dòng phiếu cùng ngày (01/07 "Bê tông M200" 11.010.000 = BT M200 10.010.000 + Bù cước 1.000.000). Hai dòng "Lấy Hàng" có tên vật tư "Thuế hóa đơn". 61 dòng "Lấy Hàng" chỉ có cột HĐ. 3 dòng "Trả Nợ" không có số tiền. 3 ngày năm 0206 là ô chữ. Mỗi dự án có đúng một Chủ thể, trừ "Cống hộp - Tiên lãng".
- **F9.** `deliveryId` trên sổ cái nghĩa là "event sinh từ phiếu khi chốt kỳ". Sửa phiếu sẽ xóa mềm event (`lib/vat-tu-ncc/delivery-service.ts:114-115`), chốt lại sẽ ghi đè số tiền và đặt HĐ = 0 (`lib/ledger/ledger-service.ts:302`). Gắn `deliveryId` vào dòng Nhập Liệu sẽ cho một lần sửa phiếu xóa được lịch sử Excel.
- **F10.** CSV là UTF-8 không BOM. Có ô số lệch cột (cột L "Ngày tháng" chứa 254.670.000 ở dòng "MN trại chuối"). Bảng phụ cuối file có `#REF!`.
- **F11.** Thư mục `Quản Lý Công Nợ/` có thư mục con `.claude/`, nên bộ phân loại gói phải bỏ qua file lạ. `e2e/import-export.spec.ts:10` đang dùng adapter `cong-no-vat-tu`.

## 2. Trả lời 9 vấn đề

### 2.1 Đổi phạm vi sang (NCC × công trình)
**Cơ chế.**
- Schema: thêm `supplier_reconciliations.projectId` (FK projects) và unique một phần `(supplierId, projectId, periodFrom, periodTo) WHERE deletedAt IS NULL AND projectId IS NOT NULL`.
- `lib/vat-tu-ncc/period-lock.ts`:
  - `lockPairs(client, pairs)` khóa theo (supplierId, projectId) tăng dần.
  - Các hàm nhận cặp: `assertPeriodOpen(s, p, date)`, `findSignedPeriodCovering`, `loadPeriodBoundsContext(s, p)` (marker và số dư ban đầu của cặp), `assertPeriodBounds`, `suggestRangeForPair`, `assertPairOpeningEditable`.
  - `validatePeriodBounds` (`lib/vat-tu-ncc/period-bounds.ts:84`) là hàm thuần, giữ nguyên.
- Marker cũ (projectId NULL) được coi là **khóa toàn NCC**. Nó vẫn chặn ghi ở mọi công trình của NCC đó, nên migration không mở khóa âm thầm. Code mới không cho sửa, ký hay gỡ marker cũ; runbook dọn chúng.
- Các đường ghi đều đổi sang cặp:
  - Phiếu ngày: khóa cả cặp cũ lẫn cặp mới khi đổi công trình.
  - Chốt kỳ theo cặp: lọc phiếu theo projectId, marker có projectId.
  - Đối chiếu, ký, gỡ ký, snapshot: `computeReconciliation` tách sang module không "use server", lọc theo projectId, dùng `pairBalanceAsOf`.
  - Sổ cái tay và bulk: dùng `collectPairs`.
  - Số dư ban đầu: khóa theo cặp.
  - Đồng bộ đợt thanh toán: khóa các cặp của đợt; dòng `vat_tu` thiếu công trình báo lỗi rõ. `upsertItem` bắt buộc projectId cho `vat_tu` (`lib/payment/payment-service.ts:220`).
- Bất biến mới: với mọi dòng sổ vật tư, entityId = `Project.entityId`. Service và import đều kiểm.
- Migration dữ liệu: không backfill. Import bị chặn nếu NCC trong gói còn marker cũ.

**Giả định chính.** Mỗi sự kiện vật tư thuộc đúng một công trình, mỗi công trình thuộc đúng một Chủ thể.
**Hỏng đầu tiên khi** có khoản chi hoặc phiếu dùng chung nhiều công trình mà không tách dòng (bị từ chối, phải tách), hoặc một công trình có hai Chủ thể như Tiên Lãng chưa tách (import chặn).

### 2.2 Chống tính trùng giữa Nhập Liệu và lịch sử khối lượng
**Cơ chế: mỗi khoảng thời gian chỉ có một nguồn tiền.**
- **≤ 26/10:** tiền chỉ đến từ Nhập Liệu (cộng số dư ròng hoặc lũy kế).
  - Phiếu ngày lịch sử vẫn nhập đủ theo D6 (khối lượng, ĐVT, vật tư, công trình, NCC, giá nếu có), nhưng nằm trong kỳ chuyển đổi đã khóa.
  - Vì vậy chốt kỳ không thể chạm tới chúng (biên kỳ buộc kỳ ERP đầu từ 27/10), và sửa/xóa phiếu bị từ chối.
  - Việc không tính trùng được bảo đảm bằng **cấu trúc**, không dựa vào ghép.
- **Không gắn `deliveryId`** cho dòng lịch sử, vì hai lý do: F9, và có ngày N phiếu ứng với 1 dòng (F8).
- **Ghép chỉ để kiểm tra**, theo khóa (NCC, CT, ngày nghiệp vụ):
  - Lượt 1, một-một: |Thành tiền phiếu − Tổng TT dòng NL| ≤ 1 đ. Chỉ xét dòng `lay_hang` có TT > 0 (bỏ dòng chỉ HĐ và dòng thuế). Thứ tự xác định theo số tiền rồi số dòng.
  - Lượt 2, gộp theo ngày: tổng phần còn lại hai bên bằng nhau ±1 đ.
  - Lượt 3: gợi ý chéo công trình (cùng NCC, ngày, số tiền nhưng ở công trình khác).
  - Phiếu và dòng NL chưa khớp được liệt kê trong xem trước và lưu vào báo cáo run, nhưng không chặn vì không ảnh hưởng nợ. Cặp không có file theo dõi (Tiên Lãng, dự án đã xong) không bị tính là lệch.
- **> 26/10:**
  - Phiếu ngày nhập ở dạng chưa chốt, có giá nếu khối đối chiếu có giá.
  - Dòng NL "Lấy Hàng" > 26/10 không vào sổ cái. Mỗi dòng phải khớp một phiếu > 26/10 (trong gói hoặc đã có trong ERP) theo NCC, CT, ngày, số tiền ±1 đ (phiếu chưa có giá thì so theo số dòng). Thiếu phiếu là **lỗi chặn**.
  - Dòng "Trả Nợ" > 26/10 cũng chặn, vì phải nhập qua ERP. Hiện không có dòng nào như vậy.

**Giả định chính.** Nhập Liệu đầy đủ và đúng cho mọi sự kiện tiền ≤ 26/10; neo Excel kiểm chứng điều này.
**Hỏng đầu tiên khi** một phiếu thật ≤ 26/10 không có dòng Nhập Liệu, làm nợ bị thiếu. Lỗi này lộ ra qua neo lệch và phiếu chưa khớp. Cách sửa: sửa Excel rồi import lại trước go-live, hoặc dùng `dieu_chinh` sau go-live.

### 2.3 Kỳ đối chiếu lịch sử
**Cơ chế.** Không import các khối tháng thành `SupplierReconciliation`. Mỗi cặp có lịch sử nhận một marker chuyển đổi:
- periodFrom 31/12/2025, periodTo 26/10/2026, signedBySupplier = true, signedDate = lúc commit, importRunId = run.
- note "Chuyển đổi từ Excel đến 26/10/2026 — import #N".
- 4 cột tổng và snapshot JSON tính bằng `computeReconciliation` của cặp, ngay trong transaction.

Hệ quả:
- (a) Liền kề: kỳ ERP mới phải bắt đầu 27/10 (luật 4 của `validatePeriodBounds`), kỳ gợi ý là 27/10→26/11.
- (b) Kiểm "mọi phiếu trong kỳ ký có event" (`lib/vat-tu-ncc/reconciliation-derive-service.ts:349`) chỉ chạy khi ký tay, không áp lên marker chuyển đổi.
- (c) Không gỡ ký được marker chuyển đổi; chỉ hoàn tác import mới xóa nó.
- (d) Số dư ban đầu của cặp thành chỉ-đọc.
- (e) Chuỗi số dư giữ liền: closing ngày 26/10 = opening của kỳ 27/10→26/11.

Khối Excel dùng làm nguồn dòng phiếu, nguồn giá và neo kiểm tra. Khối neo là khối muộn nhất có Y ≤ 26/10; các khối khác chỉ hiện chênh lệch để tham khảo.

Lý do không import từng khối tháng:
- Biên sửa tay bị chồng hoặc hở (26/05 nằm ở hai khối, biên "27/08→26/07", hai khối trùng biên ở Lộc Tài TC).
- Bản gộp bị tách theo D2, nên số ERP sẽ khác giấy đã ký. Nhập khối là "đã ký" thì ERP có bản ký không giống bản NCC ký.
- Để "chưa ký" thì lịch sử mở ghi, và chốt lại sẽ sinh event trùng.

**Giả định chính.** Không cần in lại đối chiếu tháng cũ từ ERP. Lưu trữ Excel vẫn còn, và "Vật tư tháng" cùng sổ cái xem được theo khoảng ngày.
**Hỏng đầu tiên khi** cần bản ERP của một đối chiếu tháng cũ để đối chất với NCC.

### 2.4 Dòng lũy kế 31/12/2025 và duyệt từng cặp
**Cơ chế.** Chạy trong cùng run chuyển đổi, sau bước ánh xạ tên.
- **Số liệu mỗi cặp** (Chủ thể lấy theo `Project.entityId` của công trình):
  - S = Số Dư Ban Đầu (TT, HĐ); cộng lại nếu nhiều dòng về cùng một cặp.
  - LH26 và Trả26 = tổng Nhập Liệu 2026 của cặp, **gồm cả dòng > 26/10** vì CSV là số hiện hành.
  - Từ CSV: G, (H+I), M, N, cộng các dòng hợp đồng cùng cặp sau khi ánh xạ bí danh NCC và tên công trình.
- **Kiểm:**
  - TT: (G − LH26) − (H+I − Trả26) = S_TT ±1 đ.
  - HĐ: (M − LH26HĐ) − (N − Trả26HĐ) = S_HĐ ±1 đ.
- **Quyết định mỗi cặp**, khóa mapping `pair:<supplierId>:<projectId>`:
  - 1 = lũy kế theo CSV: hai dòng ngày 31/12/2025, `lay_hang` (G − LH26, M − LH26HĐ) và `thanh_toan` (H+I − Trả26, N − Trả26HĐ). Nội dung dòng ghi số, ngày, giá trị hợp đồng lấy từ CSV.
  - 0 = giữ số dư ròng: một dòng `ledger_opening_balances`, asOf theo Số Dư.
- **Mặc định:** 1 khi cả TT lẫn HĐ khớp; 0 khi lệch hoặc thiếu dữ liệu.
  - Lựa chọn 1 bị khóa khi CSV thiếu cặp đó, có `#REF!`, hoặc có thành phần < 0.
  - Vẫn được chọn 1 cho cặp lệch, nhưng màn hình ghi rõ hậu quả ("Đầu kỳ 2026 = X thay vì Y; neo 26/10 lệch Z") và cần tick xác nhận riêng.
- Cặp chỉ có trong CSV (S = 0) được duyệt nếu phép kiểm đạt.

**Giả định chính.** CSV phản ánh đúng toàn bộ Nhập Liệu tại thời điểm xuất, vì nó liên kết với file tổng.
**Hỏng đầu tiên khi** CSV và file tổng được chụp ở hai thời điểm khác nhau: mọi cặp đang hoạt động lệch đúng bằng phần chênh. Mặc định "giữ ròng" vẫn bảo toàn nợ, và người dùng thấy ngay.

### 2.5 UX import cho D7
**Cơ chế.** Một adapter, một run, một gói thư mục. Xem trước nhiều bước, ánh xạ có tùy chọn "tạo mới", duyệt từng cặp, xác nhận, digest, commit không cần upload lại, hoàn tác có guard, và phần đối soát sau commit. Chi tiết ở §6.
**Giả định chính.** Chrome hoặc Edge chọn được thư mục (`webkitdirectory`), và gói nhỏ hơn 25 MB (`next.config.ts`, `serverActions.bodySizeLimit`). Thực tế gói khoảng 0,65 MB.
**Hỏng đầu tiên khi** người dùng chọn file rời thay vì thư mục: mất gợi ý công trình từ tên thư mục. Khi đó mỗi file thành một mục ánh xạ công trình riêng; vẫn làm được, chỉ chậm hơn.

### 2.6 Adapter file tổng
**Cơ chế: thay thế, không vá.**
- Gỡ `cong-no-vat-tu`, `gach-nam-huong`, `quang-minh` khỏi registry và xóa file. Cả ba ghi dòng không có công trình (sẽ vi phạm CHECK mới), và adapter file tổng không chống trùng. Hoàn tác các run cũ vẫn chạy, vì rollback không cần adapter.
- Parser mới đọc ô có kiểu (ngày lấy bằng serial + `XLSX.SSF.parse_date_code`, không qua múi giờ), đọc Nhập Liệu theo vị trí cột sau khi kiểm nhãn tiêu đề dòng 3. Cột D và E được phép trống tiêu đề.
- Sửa năm gõ sai theo năm chủ đạo của sheet (0206 → 2026).
- projectId lấy qua khóa ánh xạ `tên CT@Chủ thể`. itemId gán khi tên vật tư đã được ánh xạ; nếu không, giữ tên trong `content`.
- Cột tiền: Tổng TT/HĐ là số gốc. amount = round(total/(1+VAT%), 2), vat = total − amount. Khi Tiền VAT trong Excel lệch hơn 1 đ thì ghi cảnh báo.
- Phân loại: "Thuế hóa đơn" → `thue_hd`; dòng chỉ HĐ → `lay_hang` có TT = 0 kèm số và ngày HĐ; dòng tiền bằng 0 bị bỏ (liệt kê).
- Nội dung luôn có tham chiếu nguồn `NL#<dòng>`.
- Chống trùng bằng guard độc quyền lịch sử theo cặp (§6.7).

**Giả định chính.** Thứ tự cột Nhập Liệu ổn định (A…S như dòng 3 hiện tại).
**Hỏng đầu tiên khi** có người chèn hoặc xóa cột: kiểm nhãn thất bại, báo lỗi chặn rõ ràng thay vì đọc sai cột.

### 2.7 Giao diện nhập theo công trình
**Cơ chế.**
- Route mới:
  - `/vat-tu-ncc/cong-trinh`: danh sách công trình có vật tư.
  - `/vat-tu-ncc/cong-trinh/[projectId]`: NCC của công trình, nợ TT/HĐ, trạng thái kỳ gần nhất (chuyển đổi / chưa ký / đã ký).
  - `/vat-tu-ncc/cong-trinh/[projectId]/ncc/[supplierId]/{ngay,thang,chot-ky,doi-chieu,doi-chieu/[reconciliationId],thanh-toan}`: layout nhận đủ hai tham số. Mỗi trang là vỏ mỏng dùng lại client component hiện có, với projectId cố định.
- Trang theo NCC hiện có:
  - `ngay`, `thang`, `bao-gia` giữ nguyên.
  - `chot-ky`, `doi-chieu`, `kiem-tra-khop`, `thanh-toan` nhận `?congTrinh=` (page đọc được searchParams) và hiện bộ chọn công trình khi thiếu tham số.
- Thêm index `(projectId, date)` cho phiếu ngày.
- Form phiếu bắt buộc chọn công trình; trong route theo cặp thì khóa sẵn.
- `delivery-grid.tsx` bọc try/catch và hiện toast cho tạo, sửa, xóa.
- `du-an/[id]/cong-no` đọc sổ cái qua `queryDetailReport({ projectIds: [id] })`, giữ kiểu `SupplierDebtRow`.

**Giả định chính.** Layout App Router không nhận searchParams, nên tab không dựa vào query. Kiểm lại trong `node_modules/next/dist/docs` khi code; lần này không đọc được do hook chặn.
**Hỏng đầu tiên khi** một chuyến hàng giao cho hai công trình: phải nhập hai phiếu.

### 2.8 Trang tổng hợp
**Cơ chế.**
- Trang `/cong-no-vt/tong-hop-cong-trinh`. Service gọi `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:108`) một lần.
- Module thuần `project-debt-pivot.ts` xoay chiều NCC→CT hoặc CT→NCC, có tổng nhóm và tổng chung. Lọc Chủ thể bằng entityIds; preset kỳ lấy từ `lib/ledger/report-period.ts`.
- Cột theo chế độ:
  - Preset có cận dưới: Đầu kỳ / PS tăng / PS giảm / Cuối kỳ, cho cả TT và HĐ.
  - "Toàn bộ": Số dư chuyển sang (ròng) / LH lũy kế / Đã trả lũy kế / Còn nợ, cho cả TT và HĐ. Cột "chuyển sang" chỉ khác 0 ở cặp giữ số dư ròng, để đẳng thức Còn nợ = chuyển sang + LH − Đã trả luôn hiện trên màn hình.
- Xuất Excel bằng template `cong-no-cong-trinh`. Ma trận cũ giữ nguyên.

**Giả định chính.** Lũy kế được biểu diễn bằng dòng 31/12/2025 (đã chốt).
**Hỏng đầu tiên khi** có người xem năm 2025: lịch sử hiện như phát sinh năm 2025. Đây là đánh đổi đã chấp nhận; trong phần chi tiết, dòng lũy kế có nhãn "Lũy kế chuyển đổi".

### 2.9 Go-live
**Cơ chế.** Runbook §7, gồm các bước:
1. Đóng băng.
2. Sao lưu và kiểm bản sao.
3. Kiểm kê bằng SQL chỉ đọc.
4. Người dùng duyệt danh sách dọn.
5. Deploy và migrate.
6. Dọn pilot bằng script có danh sách id đã duyệt và kiểm số dòng.
7. VALIDATE các CHECK.
8. Import một run.
9. Đối soát.
10. Kiểm tay vài màn hình.
11. Chốt kỳ ERP đầu cho một cặp để kiểm tiếp.
12. Đóng băng Excel (chỉ đọc, lưu checksum).
13. Mở lại hệ thống.

**Giả định chính.** Có khung giờ đóng băng, trong đó không ai ghi vat-tu-ncc, cong-no-vt hay đợt thanh toán vật tư.
**Hỏng đầu tiên khi** có người ghi một khoản chi vật tư ≤ 26/10 trong lúc đóng băng. Guard độc quyền chặn commit và liệt kê dòng đó.

## 3. Bất biến và test chứng minh

| # | Bất biến | Test chứng minh |
|---|---|---|
| I1 | Mọi đường ghi vật tư lấy khóa cặp (tăng dần) trước khi kiểm và ghi | `lib/vat-tu-ncc/__tests__/period-lock-pairs.test.ts`: thứ tự và khử trùng khóa `vat-tu-ncc:3:7` |
| I2 | Kỳ đã ký bất biến theo cặp; marker cũ (projectId NULL) khóa toàn NCC | `test/integration/vat-tu-ncc-khoa-theo-cap.integration.test.ts`: ký A@X; phiếu A@Y cùng ngày được, A@X bị từ chối; marker cũ chặn mọi CT |
| I3 | Sổ vật tư, phiếu, dòng `vat_tu`, kỳ mới bắt buộc công trình (DB) | `test/integration/vat-tu-schema-constraints.integration.test.ts`: insert thiếu project lỗi 23514; sổ nhân công không bị ảnh hưởng |
| I4 | entityId = Project.entityId cho dòng sổ vật tư | khoa-theo-cap test (g): tạo dòng lệch Chủ thể bị từ chối; import chặn ánh xạ lệch |
| I5 | Không tính trùng tại mốc: dòng ≤ 26/10 chỉ từ run chuyển đổi; phiếu lịch sử không sinh sổ cái | `test/integration/vat-tu-chuyen-doi-import.integration.test.ts`: chốt 01/10→26/10 bị biên kỳ chặn; tạo phiếu 20/10 bị khóa; chốt 27/10→26/11 chỉ sinh event cho phiếu > 26/10 |
| I6 | closing kỳ chuyển đổi = nợ ERP 26/10 = opening kỳ ERP đầu | cùng file: Bê tông HP TC 480.583.111; sau chốt kỳ đầu = 509.563.111 |
| I7 | Commit nguyên tử, chống trùng theo nội dung, trạng thái run ghi trong cùng transaction | `test/integration/import-engine.integration.test.ts` (commit đồng thời: một thắng) + test chuyển đổi (import lại file sửa 1 byte bị guard độc quyền chặn) |
| I8 | Hoàn tác khôi phục đúng trạng thái trước; từ chối khi đã có kỳ ERP ký hoặc event ERP dùng phiếu import | test chuyển đổi: đếm từng bảng trước/sau; hai ca từ chối |
| I9 | Commit từ chối nếu review đổi kể từ lúc xem trước (digest) | test chuyển đổi: tạo NCC trùng tên giữa xem trước và commit → từ chối |
| I10 | Lũy kế: hai dòng cộng lại = S ±1 đ, thành phần ≥ 0; Đầu kỳ 2026 = Số Dư mọi cặp | `pair-lifetime.test.ts` (Nam Hương × Tân lộc CDC: G 1.039.650.000, I 930.313.300) + test tích hợp báo cáo |
| I11 | Còn nợ(Toàn bộ, T) = Cuối kỳ(Năm, T); Đầu kỳ + PS tăng − PS giảm = Cuối kỳ theo CT và theo nhóm; Σ con = tổng nhóm | `lib/cong-no-vt/__tests__/project-debt-pivot.test.ts` + `test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts` |
| I12 | Ngày nghiệp vụ không lệch múi giờ; ngày bẩn giải xác định, không giải được thì chặn | `dirty-date.test.ts`: ô ngày (2026,11,4) trong khối 01/04→27/04 → 11/04; "19/4/2025" → 19/04/2026; "14/09/20260" → 14/09/2026; (2026,9,10) trong khối 27/09→26/10 → 09/10 |
| I13 | Khử trùng theo bội số lớn nhất: trùng giữa khối/file gộp lại, lặp trong cùng khối giữ nguyên | `delivery-dedupe.test.ts`: Lộc Tài MN2 27/10 ở hai khối → 1; Nam Hương TC 25/06 5.400 × 1.450 hai dòng một khối → 2; hai file Quang Minh TC → max |
| I14 | Neo Excel: Σ nợ ERP của các CT thành viên tại Y + Σ dòng khối > Y = Tổng nợ ±1 đ; xem trước và sau commit trùng nhau | `projection.test.ts` (509.563.111; Nam Hương nhóm 294.445.120) + test tích hợp |
| I15 | Marker chuyển đổi không gỡ ký, không sửa, không xóa bằng UI | khoa-theo-cap test (h) |

Các bất biến đang có vẫn giữ: ngày lưu UTC 00:00 theo ngày Asia/Bangkok, window `< to + 1 ngày`, `dieu_chinh` không bị khóa kỳ, module nhân công không đổi hành vi, server action có guard module, `revalidatePath` dùng đường dẫn cụ thể.

## 4. Các phase

Đồ thị phụ thuộc: P1 → {P2, P3, P7}; P4 làm được ngay vì là module thuần; P2 → P6; {P2, P3, P4} → P5; {P5, P6, P7} → P8.
Các luồng chạy song song: A (P2 → P6), B (P3), C (P4), D (P7). Không có hai phase song song cùng sửa một file. P3 và P5 cùng chạm `adapter-registry.ts` và `[runId]/page.tsx` nhưng chạy tuần tự.

### P1 — Schema và migration (2 h, không phụ thuộc)
- **Mục tiêu:** đủ cột, index, ràng buộc cho phạm vi theo cặp và cho review import, không đổi hành vi.
- **Files:**
  - `prisma/schema.prisma` — sửa:
    - `SupplierReconciliation.projectId Int?` + relation, `@@index([supplierId, projectId, periodFrom])`.
    - `Project.supplierReconciliations`.
    - `SupplierDeliveryDaily @@index([projectId, date])`.
    - `ImportRun.sourceFile Bytes?`, `reviewJson Json?`.
    - Cập nhật comment về unique một phần.
  - `prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review/migration.sql` — tạo mới (nội dung §5).
  - `test/integration/vat-tu-schema-constraints.integration.test.ts` — tạo mới.
- **Bước:** sao lưu DB dev → sửa schema → viết SQL → `npx prisma generate` → `npx prisma migrate deploy` trên DB test (fsync off) → `npx tsc --noEmit`.
- **Test:** schema-constraints:
  - Sổ vật tư, phiếu, dòng `vat_tu`, kỳ mới, số dư ban đầu vật tư thiếu project đều bị từ chối.
  - Sổ nhân công thiếu project vẫn được.
  - Unique cặp và unique marker cũ đều hoạt động.
  - Các suite cũ vẫn xanh.
- **Rollback:** SQL ngược ghi trong file phase (drop constraint, index, cột; tạo lại `supplier_recon_period_unique`), hoặc khôi phục bản sao lưu.

### P2 — Phạm vi theo cặp trên mọi đường ghi (14 h, sau P1)
- **Mục tiêu:** D1 đầy đủ; UI hiện có vẫn chạy với tham số công trình.
- **Files (sửa, trừ khi ghi "tạo"):**
  - `lib/vat-tu-ncc/period-lock.ts` — `lockPairs/collectPairs/withPairLock`; mọi hàm nhận (s, p); marker cũ là khóa toàn NCC; `suggestRangeForPair`; `assertPairOpeningEditable`; `isCutoverMarker` (importRunId ≠ null).
  - `lib/vat-tu-ncc/supplier-balance.ts` — `pairBalanceAsOf(s, p, asOf)`.
  - `lib/vat-tu-ncc/reconciliation-compute.ts` — tạo, không "use server": `computeReconciliation(s, p, from, to, db)`, `headerNames`.
  - `lib/vat-tu-ncc/reconciliation-derive-service.ts` — dùng module compute; list/ký/gỡ ký theo cặp; từ chối gỡ ký marker chuyển đổi và marker cũ.
  - `lib/vat-tu-ncc/reconciliation-service.ts` — CRUD kỳ theo cặp; từ chối marker cũ.
  - `lib/vat-tu-ncc/period-close-service.ts` — `previewPeriodClose(s, p, range)`, `commitPeriodClose(s, p, …)`; lọc phiếu theo project; marker có projectId (`:319`).
  - `lib/vat-tu-ncc/delivery-service.ts` — khóa cặp cũ và mới; bắt buộc project.
  - `lib/vat-tu-ncc/period-recon-check-service.ts` — lọc theo project; cờ "trong kỳ chuyển đổi".
  - `lib/vat-tu-ncc/schemas.ts` — projectId bắt buộc.
  - `lib/ledger/ledger-service.ts` — nhánh material: khóa cặp, bắt buộc projectId, kiểm entity = Project.entityId, khóa số dư theo cặp (`:87`).
  - `lib/cong-no-vt/material-ledger-service.ts` — bulk dùng `collectPairs` (`:176`, `:284`).
  - `lib/cong-no-vt/schemas.ts` — projectId bắt buộc.
  - `lib/payment/payment-ledger-sync.ts` — `lockPairs`, `assertPeriodOpen` theo cặp, báo lỗi rõ khi thiếu project.
  - `lib/payment/payment-service.ts` — `upsertItem`: `vat_tu` bắt buộc projectId và entity khớp.
  - `app/(app)/vat-tu-ncc/[supplierId]/{chot-ky,doi-chieu,kiem-tra-khop,thanh-toan}/page.tsx` và các client tương ứng, `doi-chieu/[reconciliationId]/{page,sign-button}.tsx` — nhận `?congTrinh=`, có bộ chọn công trình, nhãn "Kỳ chuyển đổi (khóa)".
  - `components/vat-tu-ncc/{delivery-form,reconciliation-form}.tsx` — công trình bắt buộc.
  - `components/ledger/{transaction-form-dialog,opening-balance-client}.tsx` — prop bổ sung `requireProject` cho sổ vật tư; sổ nhân công không đổi.
- **Bước:** đổi chữ ký trong `period-lock.ts` trước; để `tsc` liệt kê mọi call site (đã biết 9 file ở §2.1); sửa từng file; tách module compute; thêm guard marker cũ và marker chuyển đổi.
- **Test:**
  - Thay `period-lock-supplier-ids.test.ts` bằng `period-lock-pairs.test.ts`.
  - Cập nhật fixture có project trong `test/integration/{vat-tu-ncc-chot-ky-linh-hoat,vat-tu-ncc-pilot,vat-tu-ncc-thanh-toan,ledger-business-date,payment-service,cong-no-luy-ke,cong-no-thue-hd,cong-no-window}.integration.test.ts` và `lib/payment/__tests__/payment-service.test.ts`.
  - Tạo mới `vat-tu-ncc-khoa-theo-cap.integration.test.ts`, gồm các ca:
    - (a) ký cặp X không khóa cặp Y;
    - (b) biên kỳ độc lập theo cặp;
    - (c) số dư ban đầu X chỉ-đọc, Y sửa được;
    - (d) đóng đợt thanh toán có dòng ở cặp đã ký bị từ chối, cặp khác qua;
    - (e) marker cũ chặn mọi công trình của NCC;
    - (f) sổ tay thiếu công trình bị từ chối;
    - (g) lệch Chủ thể bị từ chối;
    - (h) gỡ ký marker chuyển đổi bị từ chối.
- **Phụ thuộc:** P1. **Sở hữu:** toàn bộ `lib/vat-tu-ncc/*`, `lib/ledger/ledger-service.ts`, `lib/payment/*`, `lib/cong-no-vt/{material-ledger-service,schemas}.ts`, các trang `[supplierId]` liệt kê ở trên.
- **Rollback:** git revert. Cột schema nullable nên code cũ vẫn chạy được.

### P3 — Engine import: gói file, lưu nguồn, review, guard, UI (12 h, sau P1)
- **Mục tiêu:** engine có thể chở một chuyển đổi nhiều file, có review và chống trùng chắc chắn.
- **Files:**
  - `lib/import/file-bundle.ts` — tạo: `encodeBundle/decodeBundle`; JSON `{v:1, files:[{path(NFC), size, sha256, data}]}` sắp theo path; giới hạn ≤ 200 file, ≤ 20 MB.
  - `lib/import/adapters/adapter-types.ts` — sửa:
    - `parse(buffer, ctx?: { fileName })`.
    - Thêm `review?(data, mapping, db) → ReviewPayload` và `acceptsBundle?`.
    - Thêm kiểu `ReviewSection` (`mapping` / `decision` / `table` / `ack`) và `ReviewPayload { digest, sections, blocking, expected }`.
    - Ghi rõ quy tắc fail-fast.
  - `lib/import/import-engine.ts` — sửa:
    - Preview: lưu `sourceFile`, tự điền ánh xạ chỉ khi tên chuẩn hóa trùng khít, chạy review, lưu `reviewJson`.
    - `refreshPreview(runId, mapping)` — mới.
    - `commitImport(runId, buffer?, mapping?)`, toàn bộ trong một transaction có `{timeout: 300_000, maxWait: 10_000}`: `pg_advisory_xact_lock(hashtext('import-commit'))`; đọc lại run và kiểm hash trong transaction; chạy lại review rồi so digest, yêu cầu `blocking` rỗng và đủ ack; `apply`; cập nhật trạng thái run trong cùng transaction.
    - Rollback gọi guard ngay trong transaction.
  - `lib/import/rollback-guards.ts` — tạo:
    - Gom các cặp vật tư mà run đã chạm và `lockPairs`.
    - Từ chối nếu cặp có kỳ đã ký mà `importRunId IS NULL`.
    - Từ chối nếu dòng sổ cái chưa xóa mềm, có `importRunId` khác run, tham chiếu phiếu của run.
    - Trả về danh mục đã tạo (giữ lại, chỉ báo).
  - `app/(app)/admin/import/import-actions.ts` — sửa: `startPreview` nhận nhiều file kèm JSON đường dẫn khi adapter dùng gói; thêm `refreshPreviewAction`; `doCommit(runId)` không cần file. Giữ nguyên guard.
  - `app/(app)/admin/import/import-upload-form.tsx` — sửa: chọn thư mục (`webkitdirectory`) cho adapter dùng gói.
  - `app/(app)/admin/import/[runId]/page.tsx` — sửa: hiện review và phần đối soát.
  - `app/(app)/admin/import/[runId]/review-panel.tsx` — tạo (client): sửa ánh xạ (ứng viên / "Tạo mới" / null khi được phép); bảng quyết định có nút "đặt theo mặc định"; ack; các bảng dùng `components/sortable-table`; nút "Lưu & tính lại".
  - `app/(app)/admin/import/[runId]/commit-panel.tsx` — sửa: commit dùng file đã lưu; khóa nút khi còn lỗi chặn.
  - `lib/import/adapters/adapter-registry.ts` — sửa: gỡ 3 adapter.
  - Xóa `lib/import/adapters/{cong-no-vat-tu.adapter,gach-nam-huong.adapter,quang-minh.adapter}.ts`.
- **Test:**
  - `lib/import/__tests__/file-bundle.test.ts` — tạo: tất định, NFC, giới hạn, hash ổn định.
  - Sửa `lib/import/__tests__/adapter-registry.test.ts` và `lib/import/adapters/__tests__/adapters.test.ts` (bỏ phần của adapter đã xóa).
  - Viết lại `test/integration/import-engine.integration.test.ts` trên `cong-no-nhan-cong`: file nguồn được lưu; commit không cần buffer; commit đồng thời chỉ một thắng; trạng thái nằm trong transaction; dữ liệu và trạng thái nhất quán khi apply lỗi.
  - Sửa `e2e/import-export.spec.ts` sang adapter nhân công.
- **Phụ thuộc:** P1 (cột ImportRun). **Sở hữu:** `lib/import/*` (trừ thư mục `vat-tu-chuyen-doi/`), `app/(app)/admin/import/*`, `e2e/import-export.spec.ts`.
- **Rollback:** git revert. Run cũ không phụ thuộc cột mới.

### P4 — Parser chuyển đổi, module thuần (12 h, bắt đầu ngay)
- **Mục tiêu:** đọc đúng, tất định toàn bộ dữ liệu Excel/CSV; chưa chạm DB.
- **Files** (tạo mới trong `lib/import/adapters/vat-tu-chuyen-doi/`):
  - `cutover-constants.ts` — `CUTOVER_DATE = 2026-10-26`, `CUTOVER_FROM = LIFETIME_DATE = 2025-12-31`, `AMOUNT_TOLERANCE = 1`.
  - `types.ts` — kiểu dữ liệu đã parse.
  - `cell-reader.ts` — đọc `XLSX.read(buf, {cellDates:false, cellNF:true})`. Mỗi ô có loại `text`/`date`/`number`/`empty`. Ngày lấy bằng `XLSX.SSF.parse_date_code`. Chữ chuẩn hóa NFC.
  - `dirty-date.ts` — `resolveBlockDate(cell, block)`:
    - Ô ngày: thử hai ứng viên (giữ nguyên / đảo ngày-tháng khi ngày ≤ 12).
    - Ô chữ: d/m/yyyy, năm 5 chữ số lấy 4 chữ số đầu, năm lệch thì thử năm của khối.
    - Ưu tiên ứng viên duy nhất nằm trong [from, to]; nếu không có thì ứng viên duy nhất trong ±7 ngày (kèm cảnh báo); còn lại là lỗi chặn.
    - Thêm `parseNlDate(cell, sheetYear)`.
  - `main-file-parser.ts` — Nhập Liệu và Số Dư như §6.2.
  - `csv-lifetime-parser.ts` — decode UTF-8 (bỏ BOM nếu có), `XLSX.read(text, {type:"string", raw:true})`. Mang tên NCC xuống các dòng dưới; bỏ dòng "Cộng"; dừng ở "Tổng cộng" đầu tiên; ô `#REF!` thì gắn cờ.
  - `tracking-file-parser.ts` — khối đối chiếu: biên, nhãn CT, nhãn vật tư, header từng khối, dòng tiếp nối, bỏ tổng phụ, A/B/C/Tổng nợ, sửa biên to < from; khối "Vật tư ngày".
  - `delivery-dedupe.ts` — bội số lớn nhất theo (ngày, vật tư chuẩn hóa, KL, đơn giá) trên mọi khối/file cùng (NCC, CT); dòng "Vật tư ngày" chưa có trong đối chiếu (so multiset theo ngày, KL, ĐVT) được thêm, không giá.
  - `bundle-classifier.ts` — phân loại file tổng / CSV / file theo dõi / bỏ qua; gợi ý thư mục; stem tên NCC.
- **Test** (`.../vat-tu-chuyen-doi/__tests__/`, fixture dựng bằng `XLSX.utils.aoa_to_sheet`):
  - `dirty-date.test.ts`, `delivery-dedupe.test.ts` (các ca ở I12, I13).
  - `main-file-parser.test.ts`: D/E trống; 3 dòng 0206; dòng chỉ HĐ; dòng thuế; Trả Nợ cặp TT/HĐ; dòng 0 đồng; dòng > 26/10.
  - `csv-lifetime-parser.test.ts`: khối Nam Hương dòng 4–10; `#REF!`; bảng phụ bị bỏ.
  - `tracking-file-parser.test.ts`: khối 27/09→26/10 của Bê tông HP TC, gồm Tổng nợ 509.563.111 và dòng 27/10; khối tổng phụ của Quang Minh; hai khối trùng biên.
  - `bundle-classifier.test.ts`.
  - `real-files.smoke.test.ts` (`skipIf` khi thư mục không có): NL 922 dòng (773 Lấy Hàng, 149 Trả Nợ), 3 dòng sửa năm, 11 dòng > 26/10; Số Dư 73 dòng; 24 file theo dõi; mọi ngày đều giải được hoặc được liệt kê.
- **Phụ thuộc:** không có. **Sở hữu:** thư mục mới, không đụng file cũ.

### P5 — Review, apply, đối soát của adapter chuyển đổi (16 h, sau P2, P3, P4)
- **Mục tiêu:** một run nạp đủ dữ liệu, có duyệt, nguyên tử, chứng minh được.
- **Files** (tạo mới trong cùng thư mục, trừ khi ghi khác):
  - `name-resolution.ts` — các khóa ánh xạ ở §6.3; tự điền khi trùng tên chuẩn hóa; đề xuất "tạo mới". Cấm tạo trùng tên đang có.
  - `pair-lifetime.ts` (thuần) — so sánh và giá trị mặc định (§2.4).
  - `delivery-matching.ts` (thuần) — ba lượt ghép (§2.2).
  - `projection.ts` (thuần) — nợ trong bộ nhớ theo cặp và ngày; kiểm neo V1–V5.
  - `review-builder.ts` — đọc danh mục một lần, đọc dữ liệu đang có để chạy guard, dựng section, `blocking`, `expected`, digest (sha256 của JSON chuẩn tắc, không có timestamp).
  - `apply-cutover.ts` — thứ tự ghi ở §6.6; INSERT theo lô; ném lỗi ngay khi có lỗi.
  - `verification-report.ts` — tính lại V1–V7 từ DB và so với `expected` đã lưu.
  - `vat-tu-chuyen-doi.adapter.ts` — `name: "vat-tu-chuyen-doi"`, label "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)", `acceptsBundle`, `supportsRollback`.
  - `lib/import/adapters/adapter-registry.ts` — sửa: đăng ký adapter.
  - `app/(app)/admin/import/[runId]/cutover-verification.tsx` — tạo: server component hiện đối soát.
- **Test:**
  - Unit: `pair-lifetime.test.ts`, `delivery-matching.test.ts` (01/07: 10.010.000 + 1.000.000 khớp gộp với 11.010.000), `projection.test.ts` (Bê tông HP TC: ERP(26/10) 480.583.111 + 28.980.000 = 509.563.111; Nam Hương nhóm TC + CDC = 294.445.120).
  - Tích hợp `test/integration/vat-tu-chuyen-doi-import.integration.test.ts`, dùng gói tổng hợp nhỏ (file tổng, CSV, 3 file theo dõi):
    1. Chưa ánh xạ thì có lỗi chặn; sau ánh xạ ra bảng cặp với mặc định đúng.
    2. Commit: marker chuyển đổi cho từng cặp; Đầu kỳ 2026 = S; LH Toàn bộ = G − dòng NL > 26/10; phiếu trùng giữa khối chỉ còn 1; dòng NL > 26/10 không có trong sổ cái.
    3. Khóa sau commit (như I5, I6).
    4. Import lại bị chặn.
    5. Digest khác thì commit bị từ chối.
    6. Hoàn tác: trước chốt kỳ ERP thì khôi phục đúng số dòng từng bảng; sau chốt hoặc ký kỳ ERP thì bị từ chối.
    7. Lỗi DB giữa chừng: run `failed`, không còn dòng nào được ghi.
- **Phụ thuộc:** P2 (marker theo cặp, `computeReconciliation`), P3 (review, gói file), P4. **Sở hữu:** thư mục `vat-tu-chuyen-doi/`, `cutover-verification.tsx`, một dòng trong registry.

### P6 — Cửa vào theo công trình và du-an (10 h, sau P2)
- **Mục tiêu:** D-nhập theo công trình; lỗi khóa kỳ hiện trên UI; du-an đọc sổ cái.
- **Files:**
  - `app/(app)/vat-tu-ncc/page.tsx` — sửa: thêm lối vào "Theo công trình".
  - `app/(app)/vat-tu-ncc/cong-trinh/page.tsx` — tạo.
  - `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/page.tsx` — tạo.
  - `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/ncc/[supplierId]/layout.tsx` — tạo.
  - `.../ncc/[supplierId]/{ngay,thang,chot-ky,doi-chieu,thanh-toan}/page.tsx` và `.../doi-chieu/[reconciliationId]/page.tsx` — tạo: vỏ mỏng dùng lại client component với projectId cố định.
  - `lib/vat-tu-ncc/project-overview-service.ts` — tạo ("use server" + guard `vat-tu-ncc`): `listProjectsWithMaterial`, `listPairsOfProject` (nợ lấy từ `queryDetailReport`), `listMonthlyByPair` (truy vấn trực tiếp vì view `vw_supplier_delivery_monthly` không có projectId).
  - `components/vat-tu-ncc/delivery-grid.tsx` — sửa: try/catch + toast ở `handleCreate`, `handleEdit`, xóa (`:160-171`); chế độ khóa công trình.
  - `lib/du-an/supplier-debt-service.ts` — sửa: đọc sổ cái (amountTaken = PS tăng, amountPaid = PS giảm, balance = Cuối kỳ), giữ kiểu.
  - `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx` — sửa: link sang trang cặp.
- **Test:**
  - `test/integration/vat-tu-ncc-cong-trinh.integration.test.ts`: số dư từng cặp = `queryDetailReport`; nợ du-an = sổ cái; tháng theo cặp chỉ có phiếu của cặp đó.
  - `e2e/vat-tu-ncc-cong-trinh.spec.ts`: ghi phiếu vào kỳ đã khóa thì thấy toast lỗi.
- **Phụ thuộc:** P2. **Sở hữu:** các file trên; không đụng file của P2.

### P7 — Trang tổng hợp theo công trình và xuất Excel (8 h, sau P1, song song)
- **Files:**
  - `lib/cong-no-vt/project-debt-pivot.ts` — tạo, thuần.
  - `lib/cong-no-vt/project-debt-summary-service.ts` — tạo, "use server" + guard `cong-no-vt`.
  - `app/(app)/cong-no-vt/tong-hop-cong-trinh/page.tsx` và `tong-hop-cong-trinh-client.tsx` — tạo: dùng lại `components/ledger/report-period-selector.tsx`, `multi-select-filter.tsx`, `components/sortable-table`.
  - `lib/export/templates/cong-no-cong-trinh.ts` — tạo.
  - `app/api/export/excel/route.ts` — sửa: đăng ký template với quyền `cong-no-vt`.
  - `app/(app)/cong-no-vt/page.tsx` — sửa: thêm link.
- **Test:**
  - `project-debt-pivot.test.ts`: tổng hai chiều xoay bằng nhau; Σ con = tổng nhóm; đẳng thức kỳ.
  - `test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts`: một cặp lũy kế và một cặp ròng; Còn nợ(Toàn bộ, T) = Cuối kỳ(Năm, T); Đầu kỳ 2026 = S.
  - Test template: header, dòng tổng.
- **Phụ thuộc:** P1. **Sở hữu:** các file trên; `route.ts` chỉ phase này sửa.

### P8 — Go-live (5 h chuẩn bị + khoảng 3 h chạy cùng người dùng)
- **Files:**
  - `scripts/vat-tu-cutover-inventory.sql` — tạo, chỉ đọc.
  - `scripts/vat-tu-pilot-cleanup.sql` — tạo: transaction; bảng tạm chứa id đã duyệt; khối DO so số dòng xóa với số đã duyệt, sai thì RAISE; mặc định kết thúc bằng ROLLBACK cho tới khi người dùng đổi thành COMMIT.
  - `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md` — tạo.
  - `docs/system-architecture.md` — sửa: phạm vi cặp, marker chuyển đổi, review import.
  - `docs/project-changelog.md` — sửa.
  - `docs/code-standards.md` — sửa: quy tắc adapter fail-fast, có review, ghi trong một transaction.
- **Test:** `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` đều xanh; chạy thử runbook trên bản sao DB thật.

## 5. Schema và migration

Migration `20261106090000_vat_tu_pair_scope_and_import_review` (một file):
1. `supplier_reconciliations`:
   - Thêm `"projectId" INTEGER`, FK tới `projects(id)` ON DELETE RESTRICT.
   - `DROP INDEX "supplier_recon_period_unique"`.
   - `CREATE UNIQUE INDEX "supplier_recon_pair_period_unique" ON (supplierId, projectId, periodFrom, periodTo) WHERE "deletedAt" IS NULL AND "projectId" IS NOT NULL`.
   - `CREATE UNIQUE INDEX "supplier_recon_legacy_period_unique" ON (supplierId, periodFrom, periodTo) WHERE "deletedAt" IS NULL AND "projectId" IS NULL`.
   - Index `(supplierId, projectId, periodFrom)`.
2. `supplier_delivery_daily`: index `(projectId, date)`.
3. Bắt buộc công trình bằng CHECK … NOT VALID (dòng mới và dòng bị sửa đều bị kiểm; dòng cũ chưa kiểm):
   - `ledger_material_project_required`: `"ledgerType" <> 'material' OR "projectId" IS NOT NULL`.
   - `ledger_opening_material_project_required`: cùng điều kiện, trên `ledger_opening_balances`.
   - `supplier_delivery_project_required`: `"projectId" IS NOT NULL`.
   - `payment_item_vat_tu_project_required`: `"category" <> 'vat_tu' OR "projectId" IS NOT NULL`.
   - `supplier_recon_project_required`: `"projectId" IS NOT NULL`.
4. `import_runs`: thêm `"sourceFile" BYTEA`, `"reviewJson" JSONB`.

- **Data migration:** không backfill; marker cũ được coi là khóa toàn NCC cho tới khi dọn. Sau khi dọn pilot (runbook bước 6), chạy `ALTER TABLE … VALIDATE CONSTRAINT` cho cả 5 CHECK. VALIDATE chỉ bật cờ, không đổi định nghĩa schema; trong repo đã có tiền lệ dùng CHECK trong migration.
- **Sao lưu:** bắt buộc `pg_dump -Fc` qua `docker exec` trước `migrate deploy`, rồi kiểm bản sao bằng `pg_restore -l`.
- **Lưu ý:** từ lúc migrate tới lúc dọn, xóa mềm một dòng pilot thiếu công trình sẽ vi phạm CHECK. Vì vậy script dọn dùng DELETE và chạy ngay sau migrate.

## 6. Thiết kế import (D6, D7)

### 6.1 Gói và phân loại
- Người dùng chọn thư mục `Quản Lý Công Nợ`. Trình duyệt gửi file kèm `webkitRelativePath`; server dựng gói tất định, hash, lưu vào `ImportRun.sourceFile`.
- Phân loại file:
  - File tổng: có sheet "Nhập Liệu" và "Số Dư Ban Đầu".
  - CSV: đuôi `.csv` và có "Tổng phát sinh".
  - File theo dõi: `.xlsx` nằm trong thư mục con, có sheet bắt đầu bằng "Đối chiếu công nợ" hoặc "Vật tư ngày".
  - Còn lại (ví dụ `.claude/`) bị bỏ qua và liệt kê.
- Phải có đúng một file tổng và tối đa một CSV, sai là lỗi chặn. Không có CSV thì mọi cặp giữ số dư ròng.

### 6.2 Quy tắc đọc
- **Nhập Liệu:**
  - Header dòng 3 được kiểm theo vị trí: A Ngày GD, B Loại GD, C Chủ Thể, D NCC (được trống), E Dự án (được trống), F Tên Vật Tư, G–J TT, K–N HĐ, O Số HĐ, P Ngày HĐ, Q Nội dung, R Trạng Thái, S Ghi Chú.
  - Dòng cần có NCC và ngày hợp lệ; năm lạ sửa theo năm chủ đạo, kèm cảnh báo.
  - "Trả Nợ" → `thanh_toan` (TT và/hoặc HĐ trên cùng một dòng).
  - "Lấy Hàng" có tên vật tư "thuế" → `thue_hd`; các dòng "Lấy Hàng" khác → `lay_hang`.
  - Dòng 0 đồng bị bỏ và liệt kê.
  - Dòng > 26/10 xử lý như §2.2.
- **Số Dư Ban Đầu:** header dòng 5. Dòng thiếu ngày xác nhận lấy 01/01/2026 kèm cảnh báo. Nhiều dòng về cùng một cặp thì cộng lại kèm cảnh báo.
- **CSV:**
  - Đọc theo cột A–Q như packet. Dòng chi tiết là dòng có số ở G hoặc M; tên NCC mang xuống từ dòng có cột B gần nhất.
  - Đã trả TT = H + I. Kiểm G − (H+I) = J khi J là số; lệch thì cảnh báo.
  - Dòng thiếu Q (tên công trình) gắn cờ "không xác định cặp".
- **File theo dõi:**
  - Mỗi file thuộc (NCC của stem tên file, CT của thư mục). Mọi dòng trong file thuộc CT của thư mục, vì không có cột công trình theo dòng.
  - Khối bắt đầu ở dòng có `từ ngày X đến (hết) ngày Y`. Header dò lại cho từng khối. Có cột vật tư thì lấy tên vật tư theo dòng, không thì lấy nhãn "Tên vật tư:".
  - Dòng hợp lệ có KL > 0. Dòng tiếp nối (không STT, không ngày) lấy ngày của dòng trên. Bỏ dòng bắt đầu bằng Tổng / Cộng / Dư nợ / A / B / C / D và dòng "0".
  - Ngày giải theo `resolveBlockDate`. Biên to < from thì sửa thành ngày 26 đầu tiên sau from, kèm cảnh báo.
  - Khối neo là khối muộn nhất có Y ≤ 26/10 và có Tổng nợ. Nhãn có "+" tách thành các CT thành viên, chỉ dùng cho neo.

### 6.3 Ánh xạ, bí danh, tách Tiên Lãng
| Khóa | Nguồn | Giá trị cho phép |
|---|---|---|
| `entity:<tên>` | Chủ thể NL / Số Dư | id, tạo mới |
| `supplier:<tên chuẩn hóa>` | NL, Số Dư, CSV (bí danh "Cty (Anh Công)" → Khánh Đức; "Cty Hiệu Trần (Anh Hiếu)" → Thương Hiệu Trần), stem file ("Thép Hiệu Trần ( chú Hiếu )") | id, tạo mới |
| `project:<tên>@<Chủ thể>` | NL, Số Dư ("Cống hộp - Tiên lãng@Lưu Minh Xuân" → Tiên Lãng (Việt Úc); "@Lê Văn Huyên" → Tiên Lãng (SH)) | id, tạo mới (Chủ thể lấy từ khóa) |
| `project-csv:<tên>` | CSV ("Ngô quyền Trại chuối" → Trại Chuối; "Tiên Lãng (Việt Úc)"; "Tân lộc CDC", "ĐVP -CDC" → CDC, xem Q1) | id |
| `project-folder:<thư mục>` | thư mục file theo dõi ("Mầm Non TC1" → Mầm non Trại chuối; "Mầm Non TC2" → Mầm non GĐ2) | id |
| `project-label:<tên>` | thành viên nhãn gộp, chỉ dùng cho neo | id, null (bỏ khỏi neo) |
| `item:<tên chuẩn hóa>` | file theo dõi (bắt buộc), NL (tùy chọn, null = giữ chữ) | id, tạo mới (ĐVT "ca" → loại machine), null cho tên chỉ có ở NL |
| `pair:<s>:<p>` | duyệt cặp | 1 lũy kế / 0 ròng |
| `ack:<mã>` | xác nhận lệch neo, chọn lũy kế cho cặp lệch | 1 |

- Ánh xạ tên NCC, CT, Chủ thể không có lựa chọn "bỏ qua", vì bỏ qua là mất nợ.
- Công trình đang có entityId khác Chủ thể của dòng thì chặn. Công trình có entityId null thì được gán khi commit (có liệt kê).
- Nhiều tên nguồn trỏ về cùng một id là hợp lệ (cộng dồn). Một tên trỏ ra nhiều id chỉ làm được qua khóa `@Chủ thể`.

### 6.4 Chống tính trùng
- Tóm tắt §2.2:
  - ≤ 26/10: tiền chỉ từ NL, phiếu nằm trong marker đã khóa.
  - > 26/10: phiếu chưa chốt; dòng NL "Lấy Hàng" bị bỏ và phải khớp phiếu; dòng "Trả Nợ" bị chặn.
- Trong file theo dõi: khử trùng giữa khối và giữa file bằng bội số lớn nhất.
- Với dữ liệu đã có: chỉ chèn phần chênh multiset theo (s, p, ngày, itemId, KL).

### 6.5 Xem trước hiển thị gì (theo thứ tự)
1. Tóm tắt: số file, số dòng theo loại, số dòng bỏ qua có lý do, số ngày đã sửa.
2. **Lỗi chặn**: tên chưa ánh xạ; lệch Chủ thể; ngày không giải được (kèm file, sheet, ô, chữ gốc); guard độc quyền lịch sử (dòng sổ cái hoặc số dư đã có của cặp, liệt kê id); marker cũ; dòng NL > 26/10 thiếu phiếu; "Trả Nợ" > 26/10; phiếu ≤ 26/10 ở cặp không có lịch sử (nghi ánh xạ sai).
3. Ánh xạ tên, có ứng viên mờ; tự điền chỉ khi trùng khít.
4. **Duyệt từng cặp**: S, G, H+I, M, N, LH/Trả 2026, chênh TT, chênh HĐ, trạng thái (khớp / lệch / thiếu CSV / thiếu Số Dư / `#REF!`), mặc định, hậu quả.
5. Khớp phiếu ↔ Nhập Liệu theo cặp: số khớp 1-1, số khớp gộp ngày, danh sách chưa khớp hai phía, gợi ý chéo công trình.
6. **Neo Excel**: từng file hoặc nhóm, gồm Tổng nợ, Σ dòng > Y, nợ dự kiến tại Y, chênh; các khối khác hiện để tham khảo.
7. Dòng NL > 26/10 ↔ phiếu: 11/11.
8. Phiếu sẽ nhập theo cặp (≤ 26/10 và > 26/10, có giá / chưa giá, số bị gộp vì trùng).
9. Danh mục sẽ tạo mới.

### 6.6 Thứ tự ghi trong một transaction
`lockPairs` (mọi cặp) → tạo Chủ thể, NCC, CT (có entityId), vật tư → gán entityId cho CT đang null → số dư ròng (cặp chọn 0) → dòng lũy kế (cặp chọn 1) → dòng NL ≤ 26/10 (INSERT theo lô) → phiếu ngày (phần chênh) → marker chuyển đổi kèm snapshot (`computeReconciliation`) → ghi `expected` vào `reviewJson`.
Mọi dòng mang `importRunId`.

### 6.7 Chống trùng khi chạy lại (idempotency)
- Lớp 1: hash gói (engine).
- Lớp 2: **guard độc quyền lịch sử**. Mỗi cặp trong run không được có sẵn dòng sổ vật tư ngày ≤ 26/10 (chưa xóa mềm), không được có số dư ban đầu, không được có marker còn sống; NCC trong run không được có marker cũ. Lớp này chặn cả trường hợp file đã sửa (hash khác).
- Lớp 3: phiếu chỉ chèn phần chênh multiset.
- Lớp 4: digest review bảo đảm commit đúng thứ người dùng đã xem.

### 6.8 Hoàn tác
- Hoàn tác nguyên khối qua `/admin/import`. Không cần thứ tự LIFO giữa các run, vì chỉ có một run.
- Bị từ chối khi:
  - một cặp có kỳ ký bởi ERP (`importRunId` NULL);
  - có event ERP chưa xóa tham chiếu phiếu của run (đã chốt kỳ 27/10→26/11).
- Danh mục đã tạo được giữ lại và liệt kê để người quản trị tự ngừng dùng nếu cần.
- Hoàn tác cũng xóa marker chuyển đổi, nên lịch sử mở lại sạch cho lần import sau.

### 6.9 Báo cáo đối soát sau commit (dung sai ±1 đ)
- **V1 Neo:** với mỗi file hoặc nhóm (NCC s, tập CT M), nợ TT ERP Σ_{p∈M}(s, p, tại Y) + Σ dòng khối có ngày > Y = Tổng nợ. Nhóm gộp so theo tổng các thành viên.
- **V2:** Đầu kỳ 2026 (TT, HĐ) = S, cho mọi cặp. Cặp đã chấp nhận lệch được đánh dấu riêng.
- **V3:** cặp lũy kế: PS tăng Toàn bộ + Σ NL > 26/10 = G (TT) và M (HĐ); Đã trả = H+I và N.
- **V4:** dòng NL > 26/10 ↔ phiếu > 26/10 khớp đủ.
- **V5:** số phiếu theo cặp = số dự kiến sau khử trùng.
- **V6:** không có dòng ≤ 26/10 nào ngoài run, ở các cặp đã import.
- **V7:** mỗi cặp có đúng một marker chuyển đổi.

Mỗi chỉ số hiện hai cột: "xem trước" và "DB". Hai cột khác nhau là lỗi apply, cần hoàn tác.

## 7. Runbook go-live (dàn ý)
1. **Điều kiện:** build xanh; Docker bật; thông báo đóng băng vat-tu-ncc, cong-no-vt, đợt thanh toán vật tư; chốt giờ đóng băng các file Excel.
2. **Sao lưu:** `docker exec docker-postgres-1 pg_dump -Fc -d ngoquyyen_erp`, lưu checksum, kiểm bằng `pg_restore -l`.
3. **Kiểm kê:** chạy `scripts/vat-tu-cutover-inventory.sql`, liệt kê theo nguồn (import / phiếu / đợt thanh toán / tay):
   - sổ vật tư, số dư ban đầu vật tư, phiếu ngày, báo giá, marker (có và không có projectId);
   - dòng `vat_tu` thiếu công trình.
   Xuất danh sách cho người dùng.
4. **Duyệt:** người dùng duyệt danh sách xóa, trong đó 2 kỳ Nam Hương đã ký thuộc pilot 07/10. Báo giá pilot của Lộc Tài: giữ hay xóa (Q3).
5. **Deploy:** deploy bản mới, chạy `npx prisma migrate deploy`.
6. **Dọn pilot:** chạy `scripts/vat-tu-pilot-cleanup.sql` với id đã duyệt. Chạy lại kiểm kê, kết quả phải bằng 0. Sau đó VALIDATE 5 CHECK; CHECK nào không qua thì dừng và hỏi người dùng.
7. **Chuẩn bị danh mục (tùy chọn):** tạo trước "Tiên Lãng (Việt Úc)" và "Tiên Lãng (SH)" ở `/du-an` nếu muốn đặt tên riêng; nếu không thì tạo khi ánh xạ.
8. **Import:** vào `/admin/import`, chọn "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)", chọn thư mục. Lần lượt: ánh xạ → Lưu & tính lại → duyệt cặp → xem khớp phiếu, neo, 11/11 → ack → commit.
9. **Đối soát:** V1–V7 đều đạt hoặc đã được giải thích. Ghi kết quả vào `reports/go-live-result.md`. Nếu sai: hoàn tác (được phép vì chưa có kỳ ERP ký), sửa Excel hoặc ánh xạ, import lại.
10. **Kiểm tay:** trang công trình; tổng hợp Năm 2026 và Toàn bộ; danh sách đối chiếu có kỳ chuyển đổi; ghi phiếu ngày 20/10 phải hiện lỗi khóa kỳ.
11. **Kiểm tiếp:** chốt kỳ 27/10→26/11 cho Quang Minh DCX. Nếu không có thanh toán trong kỳ thì nợ phải bằng 159.360.000 (Tổng nợ khối 27/10→26/11 của Excel).
12. **Đóng băng Excel:** đặt chỉ-đọc, lưu bản lưu trữ kèm checksum. Thông báo ERP là nguồn; phiếu sau giờ đóng băng nhập trong ERP.
13. **Mở lại hệ thống.**

## 8. Rủi ro (top 5)
| # | Rủi ro | Khả năng × Tác động | Giảm thiểu |
|---|---|---|---|
| R1 | Ánh xạ sai NCC hoặc CT giữa ba nguồn, làm lệch cặp | Cao × Cao | Không tự tạo khi chưa có quyết định; guard Chủ thể; phiếu ≤ 26/10 ở cặp không có lịch sử bị chặn; gợi ý chéo công trình; neo hiện trước commit |
| R2 | Ngày bẩn bị giải sai làm phiếu > 26/10 rơi sai kỳ | TB × Cao | Cửa sổ chặt; không giải được thì chặn; liệt kê mọi phiếu > 26/10 kèm chữ gốc; I12 |
| R3 | Đổi phạm vi khóa gây hồi quy ở thanh toán, sổ tay, phiếu | TB × Cao | Đổi chữ ký để `tsc` bắt mọi call site; CHECK ở DB; test tích hợp cho từng đường ghi |
| R4 | DB thật có dữ liệu vật tư thật ngoài pilot (đợt thanh toán `vat_tu` thiếu CT, phiếu thật) | TB × Cao | Kiểm kê trước; guard độc quyền chặn tính trùng; CHECK NOT VALID; người dùng duyệt từng nhóm |
| R5 | Excel tự mâu thuẫn (Lộc Tài TC gộp DCX cùng lúc có file DCX riêng; CSV chưa cập nhật DCX) làm neo lệch không do ERP | Cao × TB | Neo không chặn mà cần ack; hiện song song nhiều neo; mặc định "giữ ròng" bảo toàn nợ; quyết định ghi lại trong run |

## 9. Câu hỏi mở cho người dùng
1. "Tân lộc CDC" và "ĐVP -CDC" (CSV, nhãn đối chiếu Nam Hương) gộp về một công trình "CDC" như Số Dư Ban Đầu, hay tách thành hai công trình (khi đó dòng CDC trong Số Dư phải được tách số)? Kế hoạch mặc định gộp.
2. Các file theo dõi có tiếp tục được cập nhật tới ngày import không? Nếu có, phiếu từ 01/11 tới giờ đóng băng sẽ được import. Nếu đã dừng ở 31/10, phiếu sau đó phải nhập tay vào ERP ngay sau import.
3. Trong dữ liệu pilot 07/10, có gì cần giữ không, ví dụ báo giá Lộc Tài 3.400.000 / 2.600.000 / 3.000.000 nếu là giá thật? Mặc định xóa toàn bộ dữ liệu vật tư pilot sau khi người dùng duyệt danh sách.

## 10. Tổng effort
P1 2 h + P2 14 h + P3 12 h + P4 12 h + P5 16 h + P6 10 h + P7 8 h + P8 5 h = **79 h**, chưa tính khoảng 3 h chạy go-live cùng người dùng. Có thể chạy song song 3–4 luồng sau P1, nên đường găng là P1 → P2 → P5 → P8, khoảng 37 h.
