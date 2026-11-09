# Tư vấn thiết kế: công nợ vật tư theo công trình, tổng hợp theo năm và từ đầu tới nay, nhập dữ liệu từ Excel

- Ngày: 05/11/2026
- Người tư vấn: Kongming (advisory-only, không sửa code)
- Phạm vi: trả lời 6 câu hỏi của caller về thiết kế và chiến lược cutover cho module `vat-tu-ncc` + `cong-no-vt`
- Bằng chứng đã xác minh trong repo: `prisma/schema.prisma:551-766`, `lib/ledger/*`, `lib/vat-tu-ncc/*`, `lib/cong-no-vt/balance-report-service.ts`, `lib/import/adapters/cong-no-vat-tu.{adapter,parse}.ts`, `plans/261006-0307-.../reports/pilot-result.md`, và dòng đầu của file CSV "Tổng công nợ".

## TL;DR

1. Giữ `SupplierReconciliation` theo NCC làm đơn vị khoá/ký; thêm bộ lọc công trình hoặc Chủ thể vào bảng đối chiếu và bản in. Không chuyển sang kỳ theo (NCC × công trình) hay nhóm công trình do người dùng định nghĩa.
2. Lũy kế "từ đầu tới giờ" giải quyết bằng cách nhập hai dòng sổ cái tổng hợp ngày 31/12/2025 cho mỗi (Chủ thể, NCC, công trình): một `lay_hang` (LH lũy kế TT/HĐ) và một `thanh_toan` (đã trả lũy kế TT/HĐ), đồng thời bỏ dòng số dư ban đầu tương ứng. Mọi báo cáo hiện có tự đúng ở cả chế độ năm và chế độ toàn bộ mà không sửa SQL.
3. Nhập liệu theo công trình là một lối đi mới (`/vat-tu-ncc/cong-trinh/[projectId]`) trên đúng các bảng hiện có; thanh toán bắt buộc gán công trình như Excel đang làm, không xây máy phân bổ.
4. Trang tổng hợp mới lấy dữ liệu từ `queryDetailReport` (đã nhóm theo Chủ thể × NCC × công trình), xoay chiều trong TS; `tong-hop` hiện tại giữ nguyên.
5. Cutover tại 26/10/2026: Nhập Liệu là nguồn sự thật 2026 đến 26/10; CSV "Tổng công nợ" cấp lũy kế trước 2026; dọn dữ liệu pilot trước khi nhập; import là script một lần có `ImportRun` để rollback; sửa adapter để giữ `projectId`.

## Bài toán thực sự

Người dùng cần một nơi duy nhất để (a) ghi vật tư theo công trình, (b) xem tổng hợp công nợ vật tư theo NCC và theo công trình, ở chế độ năm và chế độ từ đầu tới nay, có cột Chủ thể, và (c) nạp số liệu hiện có. Họ không yêu cầu đổi cách ký đối chiếu với NCC. Vì vậy quyết định cốt lõi là **mô hình dữ liệu cho lũy kế** và **chiến lược cutover**; phần còn lại là điều hướng và trình bày trên sổ cái hiện có.

Bất biến phải giữ (đã có trong code và tài liệu): nguồn sự thật là `ledger_transactions` + `ledger_opening_balances`; Đầu kỳ + Tăng − Giảm = Cuối kỳ; kỳ ký bất biến; mọi đường ghi khoá advisory theo NCC (`lib/vat-tu-ncc/period-lock.ts:30-37`).

## Câu 1 — Phạm vi kỳ đối chiếu

**Khuyến nghị: giữ theo NCC; thêm lọc công trình / Chủ thể ở bảng đối chiếu và bản in.**

Lý do dựa trên code:

- Toàn bộ cơ chế khoá kỳ, liền kề marker, khoá số dư ban đầu, và snapshot ký đều khoá theo `supplierId`: `findSignedPeriodCovering` và `loadPeriodBoundsContext` (`period-lock.ts`), `assertSupplierOpeningEditable` (`lib/ledger/ledger-service.ts:87-99`), `commitPeriodClose` (`period-close-service.ts`), `signReconciliation` (`reconciliation-derive-service.ts`). Chuyển sang (NCC × công trình) phải đổi khoá advisory, partial unique, biên kỳ, kiểm "đủ phiếu" và mốc số dư ban đầu — tức viết lại phase 5 và bỏ hai kỳ Nam Hương đã ký trong pilot.
- Bảng đối chiếu dẫn xuất đã mang `projectId` ở từng dòng lấy hàng và `byProject` subtotal; snapshot ký cũng chứa chúng. Một bản in "Đối chiếu Nam Hương — Trại Chuối" chỉ là lọc dòng theo công trình và tính A theo công trình (thêm tham số `projectIds`/`entityId` vào `supplierBalanceAsOf`, hiện hàm này cộng toàn NCC ở `supplier-balance.ts`).
- Bằng chứng Excel ủng hộ: nhóm "Trại Chuối + Tân Lộc CDC + ĐVP-CDC" của Nam Hương = kỳ NCC lọc theo Chủ thể Công Ty Quản Lý; Lộc Tài "Trại Chuối + Dải cây xanh" trải hai Chủ thể = kỳ NCC không lọc. Cả hai đều là tập con của kỳ NCC, không cần bảng "nhóm công trình".

Việc nhỏ cần làm: thêm `projectId` vào `ReconPaymentRow`/`ReconTaxRow` (hiện chỉ có `projectLabel`) để lọc snapshot cũ bằng nhãn, snapshot mới bằng id; lưu nhãn phạm vi in vào `note` của marker nếu người dùng muốn ghi "kỳ này gửi cho công trình X".

Giả định chịu lực: một NCC dùng cùng biên kỳ 27→26 cho mọi công trình. Bằng chứng: toàn bộ sheet Đối chiếu đều 27→26. Điều kiện hỏng đầu tiên: khi người dùng cần ký công trình A trong khi công trình B của cùng NCC còn đang mở, hoặc hai công trình có biên kỳ khác nhau. Khi đó mới cân nhắc marker có `projectId` nullable (null = toàn NCC) và khoá vẫn theo NCC.

## Câu 2 — Chế độ "từ đầu tới giờ"

**Khuyến nghị: phương án (b) — dòng sổ cái tổng hợp ngày 31/12/2025, bỏ dòng số dư ban đầu tương ứng.**

So sánh trên trường hợp xấu nhất:

| Phương án | Nguồn sự thật | Bất biến Đầu + PS − Trả = Cuối | Churn code | Rủi ro xấu nhất |
|---|---|---|---|---|
| (a) thêm cột lũy kế vào `ledger_opening_balances` | Một bảng nhưng hai biểu diễn (net và cặp LH/Trả) | Giữ nếu mọi SQL được sửa đồng bộ | Migration + sửa 6 điểm SQL: `querySummary`, `queryWindowByParty`, `queryDebtMatrix`, `queryDetailReport`, `supplierBalanceAsOf`, `getBalancesBulk`, và `toCongNoSheetCell` (`lhTt = openTt + layTt` sai ở chế độ lũy kế) | Một báo cáo quên nhánh lũy kế → số lệch âm thầm |
| **(b) hai dòng sổ cái 31/12/2025** | Một bảng, một biểu diễn | Giữ tự động: chế độ năm 2026 có Đầu kỳ = Σ dòng < 01/01/2026 = LH − Trả = net cũ; chế độ toàn bộ có LH = Σ lay_hang gồm dòng lũy kế | Không sửa SQL báo cáo; chỉ import + nhãn UI | Ai đó sửa tay dòng lũy kế; giảm nhẹ bằng `importRunId` + `content` quy ước + quyền admin; không thể xem riêng năm 2024, 2025 (CSV cũng không có) |
| (c) bảng snapshot lũy kế riêng | Hai nguồn | Phải tự chứng minh ở mỗi báo cáo | Thêm bảng + join ở mọi chỗ | Lệch giữa snapshot và sổ cái, không có cơ chế phát hiện |

Chi tiết (b):

- Mỗi khoá (entityId, partyId, projectId) có trong CSV: dòng `lay_hang` với `totalTt` = Tổng phát sinh hàng hoá, `totalHd` = Tổng giá trị hoá đơn; dòng `thanh_toan` với `totalTt` = Đã thanh toán, `totalHd` = Đã CK. `date` = 2025-12-31 UTC 00:00, `status` = approved, `content` = "Lũy kế đến 31/12/2025 — nguồn Tổng công nợ.csv", `importRunId` của run cutover.
- Cổng kiểm tra bắt buộc trước khi ghi: với mỗi khoá, (LH − Trả theo CSV) − (net theo sheet Số Dư Ban Đầu) phải bằng 0 cho cả TT và HĐ. Caller đã xác minh Nam Hương × Trại Chuối khớp đúng 59.868.420. Khoá nào lệch → in ra danh sách để người dùng quyết, không ghi.
- Khoá chỉ có ở Số Dư Ban Đầu mà không có CSV (hoặc ngược lại): giữ dòng số dư ban đầu như hiện nay cho khoá đó. Hai cơ chế cộng chung trong một phép toán nên không mâu thuẫn; chỉ là LH lũy kế của khoá đó bị thiếu phần đã trả — ghi chú trong báo cáo import.
- Hệ quả tốt: `so-du-ban-dau` gần như trống cho sổ vật tư; `openingAsOf` null → `suggestRangeForSupplier` lấy kỳ chuẩn chứa hôm nay (27/10→26/11), đúng kỳ đầu sau cutover.
- Hệ quả cần biết: preset "Toàn bộ" ở `/cong-no-vt/tong-hop` sẽ đổi nghĩa từ "net 01/01/2026 + 2026" sang lũy kế thật; các con số trong `pilot-result.md` không còn là mốc đối chiếu.

Giả định: CSV là số hiện hành (caller đã xác minh có liên kết) và hợp đồng gộp được theo công trình. Điều kiện hỏng đầu tiên: nếu sau này người dùng đòi báo cáo theo từng năm trước 2026, (b) không trả lời được và phải nhập lại lịch sử theo năm — lúc đó vẫn là thêm dòng sổ cái, không phải đổi mô hình.

## Câu 3 — Nhập theo công trình và gán thanh toán

**Khuyến nghị: điều hướng project-first trên bảng hiện có, không module mới.**

- Route `/vat-tu-ncc/cong-trinh/[projectId]`: danh sách NCC có phiếu hoặc dòng sổ cái trong công trình, tab Ngày và Tháng lọc theo `projectId`, nút tạo phiếu với công trình khoá sẵn, và liên kết sang chốt kỳ / đối chiếu của NCC (vẫn theo NCC). Thêm index `(projectId, date)` cho `supplier_delivery_daily` (hiện chỉ có `(supplierId, date)`, `schema.prisma:574`). ACL dùng cùng module `vat-tu-ncc`.
- Trang `du-an/[id]/cong-no` chuyển nguồn sang `queryDetailReport({ projectIds: [id] })` thay vì `ProjectSupplierDebtSnapshot`; giữ bảng cũ, không xoá schema trong đợt này.
- Công trình chung hai Chủ thể (Cống hộp Tiên Lãng): sổ cái đã khoá theo (entityId, projectId) nên import không gặp vấn đề. Với phiếu ngày tương lai, thêm cột `entityId Int?` trên `SupplierDeliveryDaily` (mặc định null = lấy từ `Project.entityId`; `collectViolations`/`commitPeriodClose` đọc `d.entityId ?? project.entityId`). Khoảng 20 dòng, không tách đôi dự án trong module `du-an`. Chỉ làm khi người dùng xác nhận đây là một công trình với hai bên mua vật tư; nếu thực ra là hai gói thầu riêng thì tạo hai dự án và không cần cột mới.
- Thanh toán: Excel gán từng dòng trả nợ cho một công trình, nên ERP làm đúng như vậy. `projectId` bắt buộc với `thanh_toan` ở tab Thanh toán và lưới Nhập liệu (schema zod, không phải DB constraint vì dòng từ đợt thanh toán có thể null). Một lần chuyển khoản trả cho nhiều công trình = nhiều dòng, do kế toán tách. Không xây phân bổ tự động FIFO: đó là quản trị tự bịa, và sẽ làm số theo công trình không đối chiếu được với Excel cũ. Dòng `thanh_toan` chưa có công trình hiển thị trong nhóm "Chưa gán công trình" ở mọi báo cáo theo công trình; tổng theo NCC vẫn khớp. Với đợt thanh toán, yêu cầu `projectId` khi `category = vat_tu` ở mức schema của `PaymentRoundItem` (`lib/payment/payment-service.ts` đã truyền projectId xuống sổ cái).

Điều kiện hỏng đầu tiên: nếu kế toán thường trả một lần cho cả NCC và chỉ muốn ghi một dòng, số theo công trình sẽ dồn vào "Chưa gán" và trang theo công trình mất giá trị — khi đó mới cân nhắc màn tách dòng gợi ý theo nợ còn lại, vẫn là nhiều dòng sổ cái.

## Câu 4 — Trang tổng hợp

**Khuyến nghị: một trang mới `/cong-no-vt/tong-hop-cong-trinh` dùng `queryDetailReport`; `tong-hop` (NCC × Chủ thể) giữ nguyên.**

- `queryDetailReport` (`balance-report-service.ts`) đã trả 8 số theo (Chủ thể, NCC, công trình) với cùng ngữ nghĩa cửa sổ của `report-period.ts`; `queryDebtMatrix` không nhóm theo công trình nên không phải điểm mở rộng. Xoay chiều trong một module thuần (giống `debt-matrix-columns.ts`): nhóm theo NCC → mở rộng công trình, hoặc nhóm theo công trình → mở rộng NCC; Chủ thể là bộ lọc đa chọn (đã có `supplier-multi-select` làm mẫu) và là cột phụ trên dòng con, không phải nhóm cột như `tong-hop` để bảng không quá rộng.
- Cột theo preset: preset có cận dưới (năm, quý, tháng, kỳ 27→26, tuỳ chọn) hiển thị Đầu kỳ / PS tăng / PS giảm / Cuối kỳ cho TT và HĐ; preset `all` ẩn Đầu kỳ (luôn 0 sau phương án (b)) và đổi nhãn thành LH lũy kế / Trả lũy kế / Còn nợ. Cùng dữ liệu, chỉ khác nhãn, nên test bất biến "Còn nợ (all, đến T) = Cuối kỳ (năm, đến T)" viết được ngay.
- Excel xuất theo mẫu `lib/export/templates/cong-no-monthly.ts`, hai sheet: theo NCC và theo công trình.
- Không trộn hai trang: `tong-hop` phục vụ sheet "Công Nợ" đã pilot; trang mới phục vụ "Quản Lý Công Nợ Vật Tư cải tiến". Một bộ chọn mốc dùng chung.

## Câu 5 — Import và cutover

**Nguồn sự thật 2026:** sheet Nhập Liệu (đủ, cấp số tiền, có Chủ thể, công trình, cặp TT/HĐ). Không nhập "Vật tư ngày" của file theo công trình vào `supplier_delivery_daily` cho giai đoạn trước cutover: phiếu không có event sẽ bị chốt kỳ lần sau gom lại và đếm trùng với dòng Nhập Liệu; sheet lại cuộn và ngày bẩn. Số lượng theo ngày trước cutover nằm ngoài phạm vi báo cáo công nợ.

**Mốc cutover: hết ngày 26/10/2026.**

- Nhập Liệu: nhập mọi dòng `date ≤ 26/10/2026` thành `ledger_transactions`. Dòng 27–31/10 (ước khoảng 10–20 dòng theo mật độ 773 dòng/10 tháng) tái nhập làm phiếu ngày từ sheet "Vật tư ngày" nếu có số lượng; dòng nào thiếu số lượng thì nhập như dòng sổ cái. Trả nợ 27–31/10 nhập qua tab Thanh toán.
- Lý do chọn 26/10 thay vì 31/10: Đầu kỳ của kỳ ERP đầu tiên (27/10→26/11) bằng đúng "Tổng nợ" của block Excel 27/09→26/10 cho từng NCC — đây là cổng nghiệm thu rõ ràng. Nếu chọn 31/10, kỳ đầu lẫn 5 ngày dòng import không có số lượng, và rủi ro ai đó nhập lại 5 ngày đó làm phiếu gây đếm trùng.
- Quy tắc sau cutover: lấy hàng chỉ qua phiếu ngày → chốt kỳ; thanh toán qua đợt thanh toán hoặc tab Thanh toán, không cả hai cho cùng một lần chuyển khoản.

**Dữ liệu pilot trong DB thật (`pilot-result.md`, mục "Dữ liệu pilot đã tạo"):** Nam Hương có số dư 310.605.120 asOf 27/04/2026 và hai kỳ đã ký 28/04→26/05, 27/05→26/06 với event tháng 5–6 — chồng lên khoảng Nhập Liệu 2026. Trước khi import: sao lưu; gỡ ký hai kỳ Nam Hương (admin, kỳ mới nhất trước); xoá toàn bộ dữ liệu sổ vật tư của các NCC có trong Excel (`ledger_transactions` material, `ledger_opening_balances` material, `supplier_reconciliations`, `supplier_delivery_daily`, `supplier_price_quotes` pilot). Vì Excel đang là nơi theo dõi thật, tôi giả định ERP không có dòng 2026 nào nằm ngoài Excel; script dọn phải in danh sách dòng không thuộc `importRunId` nào để người dùng xác nhận trước khi xoá.

**Công cụ import:** một script một lần `scripts/import-cong-no-cutover.ts` (dry-run mặc định), tạo một `ImportRun` để rollback, ghi trong một transaction. Không mở rộng UI adapter cho CSV lũy kế vì đây là việc làm đúng một lần và cần bảng ánh xạ do người dùng duyệt. Vẫn sửa adapter cho Nhập Liệu vì nó là đường nhập lặp lại:

- `cong-no-vat-tu.parse.ts` `parseTxSheet`: header hàng 2 có ô trống ở cột NCC/Dự án nên `col()` so khớp chính xác trả −1; bổ sung dò theo hàng header phụ hoặc chỉ số cột cố định có kiểm tra, và trả `projectName` riêng thay vì gộp vào `content`.
- `cong-no-vat-tu.adapter.ts` `apply` nhánh tx: resolve `projectId` qua `mapping[project:...]`/tìm theo tên và ghi vào INSERT (hiện thiếu `"projectId"`). `itemId` để null: tên vật tư trong Nhập Liệu là văn bản tự do, không nên tạo danh mục từ import.
- Idempotency: dùng cơ chế có sẵn `supportsRollback` — nhập lại = rollback run cũ rồi chạy lại; thêm kiểm tra ở `validate` từ chối khi đã có run hoàn tất của cùng adapter chưa rollback. Không thêm cột hash.
- Ba dòng năm 0206: chuẩn hoá năm < 2000 thành 2026 trong script kèm cảnh báo; cặp dòng trả nợ TT/HĐ nhập như hai dòng; dòng "Lấy Hàng" chỉ có HĐ nhập với `totalTt = 0` — ma trận cộng TT và HĐ độc lập nên đúng.

**Bảng ánh xạ CSV (người dùng duyệt):** file `plans/<slug>/reports/cutover-mapping.csv` với cột: tên công trình trong CSV, `projectId`, `entityId`, ghi chú. Nguồn Chủ thể: sheet Số Dư Ban Đầu theo (NCC, công trình); không có thì lấy `Project.entityId`; vẫn không có thì để trống cho người dùng điền. Khoá có hai Chủ thể trong Số Dư Ban Đầu (Đại Ngàn × Cống hộp): mặc định gán lũy kế CSV cho Chủ thể có số dư lớn hơn, Chủ thể còn lại giữ dòng số dư ban đầu; ghi rõ trong file để người dùng đổi. Dòng `#REF!` và bảng phụ cuối CSV: loại, liệt kê trong báo cáo dry-run.

## Câu 6 — Phản biện cách đặt vấn đề

- Câu hỏi 1 kéo phạm vi lên "thiết kế lại đối chiếu" trong khi yêu cầu của người dùng là nhập theo công trình và tổng hợp. Giữ đối chiếu như cũ là quyết định giảm việc lớn nhất.
- "Phiên bản cải tiến của Quản Lý Công Nợ Vật Tư" sau phương án (b) chỉ còn là một trang pivot + nhãn cột theo preset; phần lớn độ phức tạp nằm ở cutover, nên dồn công sức kiểm tra vào script import và các cổng đối chiếu số.
- Không cần bảng nhóm công trình, không cần bảng snapshot lũy kế, không cần máy phân bổ thanh toán — cả ba đều là quản trị thêm mà Excel hiện tại không có.
- Một bẫy chưa nêu: `supplierBalanceAsOf` và `queryDebtMatrix` cộng số dư ban đầu bất kể `asOfDate`; sau (b) điều này vô hại vì không còn dòng số dư ban đầu cho các khoá đã có lũy kế, nhưng nếu giữ phương án (a) thì phải xử lý.
- Bẫy thứ hai: importer ghi SQL thô, bỏ qua khoá NCC và khoá kỳ (backlog red-team #21). Với cutover một lần sau khi đã gỡ ký và dọn, điều này chấp nhận được; nhưng script nên gọi `lockSuppliers` cho tập NCC để nhất quán với mọi đường ghi khác.

## Danh sách việc

1. Sao lưu DB; liệt kê và xác nhận dữ liệu sổ vật tư hiện có là pilot; gỡ ký hai kỳ Nam Hương; dọn.
2. Sửa parser/adapter Nhập Liệu: `projectName` riêng, `projectId` vào INSERT, dò header chịu ô trống, chặn chạy trùng run.
3. Viết `scripts/import-cong-no-cutover.ts`: đọc Nhập Liệu (≤ 26/10), Số Dư Ban Đầu, CSV lũy kế, bảng ánh xạ; dry-run in bảng kiểm tra (CSV net − SDBĐ net theo khoá; tổng theo NCC tại 26/10 so với "Tổng nợ" Excel); ghi trong một transaction dưới `lockSuppliers`, gắn `ImportRun`.
4. Tái nhập phiếu 27–31/10 và trả nợ 27–31/10 qua UI.
5. Route `/vat-tu-ncc/cong-trinh/[projectId]` + index `(projectId, date)`; `projectId` bắt buộc cho `thanh_toan` thủ công; tuỳ chọn `entityId` override trên phiếu ngày.
6. Lọc công trình/Chủ thể ở bảng đối chiếu và bản in; `projectId` trong `ReconPaymentRow`/`ReconTaxRow`; `supplierBalanceAsOf` nhận bộ lọc.
7. Trang `/cong-no-vt/tong-hop-cong-trinh` + Excel; nhãn cột theo preset; test bất biến lũy kế = cuối kỳ.
8. `du-an/[id]/cong-no` đọc từ sổ cái.
9. Cập nhật `docs/system-architecture.md` mục Vật tư NCC (lũy kế bằng dòng 31/12/2025, quy ước cutover, thanh toán theo công trình).

## Tiêu chí thành công

- Với mỗi NCC: Nợ TT và Nợ HĐ trong ERP tại 26/10/2026 bằng "Tổng nợ" block 27/09→26/10 trong sheet Đối chiếu (hoặc tổng các file theo công trình của NCC đó).
- Với mỗi (NCC, công trình) có ánh xạ: chế độ "Toàn bộ" cho LH lũy kế / Trả lũy kế / Còn nợ bằng dòng CSV tương ứng.
- Chế độ "Năm 2026" cho Đầu kỳ bằng Số Dư Ban Đầu và Cuối kỳ đến 31/10 bằng sheet "Công Nợ" của file Quản Lý Công Nợ Vật Tư.
- Test: Còn nợ (all, đến T) = Cuối kỳ (year, đến T) cho mọi khoá; tổng theo công trình = tổng theo NCC = tổng công ty trên cùng cửa sổ.
- Sau cutover một kỳ 27/10→26/11: chốt kỳ và ký cho một NCC thử nghiệm không bị chặn bởi biên kỳ hay mốc số dư ban đầu.

## Giả định (thay cho câu hỏi)

| Giả định | Độ tin cậy | Điều gì làm đổi khuyến nghị |
|---|---|---|
| Mỗi NCC dùng chung biên kỳ 27→26 cho mọi công trình | Cao (mọi sheet Đối chiếu đều 27→26) | Cần ký riêng từng công trình hoặc biên kỳ khác nhau → marker có `projectId` nullable |
| CSV lũy kế hiện hành, gộp hợp đồng theo công trình là đúng; cổng kiểm tra net khớp cho đa số khoá | Trung bình-cao (một khoá đã xác minh) | Nhiều khoá lệch → giữ dòng số dư ban đầu cho các khoá đó, lũy kế chỉ cho khoá khớp |
| ERP không có dòng sổ vật tư 2026 nào nằm ngoài Excel (toàn bộ là pilot) | Trung bình | Có dữ liệu thật → không dọn toàn bộ; dọn theo NCC có trong Excel và đối chiếu từng NCC |
| Kế toán chấp nhận tách một lần chuyển khoản thành nhiều dòng theo công trình (như Excel) | Cao (Nhập Liệu đã làm vậy) | Từ chối → nhóm "Chưa gán công trình" và màn tách dòng gợi ý |
| Cống hộp Tiên Lãng là một công trình với hai Chủ thể cùng mua vật tư | Thấp | Là hai gói riêng → hai dự án, bỏ cột `entityId` override |
| Không cần báo cáo theo từng năm trước 2026 | Trung bình (CSV không có) | Cần → nhập thêm dòng lũy kế theo năm, vẫn mô hình (b) |
| Người dùng chấp nhận "Toàn bộ" ở `tong-hop` đổi nghĩa thành lũy kế thật | Cao (đúng yêu cầu) | Muốn giữ nghĩa cũ → thêm preset "Từ 2026" |

## Câu hỏi còn mở cho người dùng (có mặc định)

1. Có cần số lượng theo ngày trước 26/10/2026 trong ERP không? Mặc định: không nhập.
2. Cống hộp Tiên Lãng là một công trình hai Chủ thể hay hai gói riêng? Mặc định: một công trình, thêm override Chủ thể trên phiếu.
3. Đợt thanh toán vật tư có luôn gán công trình được không? Mặc định: bắt buộc khi `category = vat_tu`.
