# Brainstorm — Công nợ vật tư theo công trình, tổng hợp theo năm / từ đầu, nhập số dư từ Excel

- Ngày: 05/11/2026
- Tư vấn kèm theo: [kongming-261105-1504-cong-no-vat-tu-theo-cong-trinh-design-counsel.md](kongming-261105-1504-cong-no-vat-tu-theo-cong-trinh-design-counsel.md)
- Dữ liệu nguồn: `Quản Lý Công Nợ/` (file tổng `Quản Lý Công Nợ Vật Tư.xlsx`, CSV `Tong Cong No - Tổng công nợ đến 26.7.26.csv`, thư mục `Theo Dõi Vật Tư/<công trình>/<NCC>.xlsx`)

## Kết quả cần đạt

Mỗi phiếu vật tư được nhập một lần, ngay trong công trình. Sổ cái được sinh từ phiếu, không còn nhập lại sang file tổng. Một trang tổng hợp công nợ vật tư cho phép:
- xem theo năm hoặc từ đầu tới giờ;
- nhóm theo NCC (mở rộng xuống công trình) hoặc theo công trình (mở rộng xuống NCC);
- lọc theo Chủ thể và xuất Excel.

Đối chiếu, chốt kỳ và ký xác nhận làm riêng cho từng NCC × công trình. Số dư trong các file Excel đã cung cấp được nhập vào ERP, kèm bảng kiểm tra khớp.

## Quyết định đã chốt với người dùng

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Phạm vi khóa/ký đối chiếu | **Ký riêng từng công trình** (NCC × công trình), không ký chung theo NCC |
| 2 | Khi CSV "Tổng công nợ" lệch "Số Dư Ban Đầu" | **Duyệt từng cặp**: xuất bảng so sánh, người dùng quyết từng cặp trước khi import |
| 3 | Cống hộp Tiên Lãng | **Hai công trình riêng**. Theo số liệu: "Việt Úc" thuộc Lưu Minh Xuân (Quang Minh HĐ −190.000.000 khớp), "SH" thuộc Lê Văn Huyên (Quang Minh −60.000.000 và Hiệu Trần 7.101.200 khớp). Người dùng xác nhận khi duyệt ánh xạ |
| 4 | Mốc chuyển đổi | **Hết 26/10/2026**, trùng biên kỳ đối chiếu 27/09→26/10. Người dùng chỉ ra 11 dòng 27–31/10 đều có khối lượng và đơn giá trong file theo công trình, nên import chúng thành phiếu ngày, không nhập tay |
| 6 | Lịch sử khối lượng (cập nhật khi lập kế hoạch) | **Đưa toàn bộ** lịch sử khối lượng có trong các file theo dõi vào ERP (thay cho mặc định "không"). Phải chống tính trùng với dòng Nhập Liệu |
| 7 | Cách nạp dữ liệu (cập nhật khi lập kế hoạch) | **Mọi dữ liệu nạp qua chức năng Import của sản phẩm** sau khi build xong (`/admin/import`: xem trước → ghi → gỡ), không dùng script chạy một lần |
| 5 | Bản đối chiếu gộp nhiều công trình | **Tách mỗi công trình một bản.** "Trại Chuối + Tân Lộc CDC + ĐVP-CDC" (Nam Hương) và "Trại Chuối + Dải cây xanh" (Lộc Tài) thành các bản riêng; số mang sang của Trại Chuối không còn gồm nợ CDC. Không xây cấu hình nhóm công trình |

Quyết định mặc định của brainstorm, người dùng có thể phản đối:
- **Mỗi thanh toán phải gắn công trình**, như Nhập Liệu đang làm (mọi dòng "Trả Nợ" đều có công trình). Một lần chuyển khoản trả cho nhiều công trình thì tách thành nhiều dòng; không xây máy phân bổ tự động.

## Hiện trạng đã kiểm chứng

- Nguồn sự thật là `ledger_transactions` + `ledger_opening_balances`. Sổ cái đã có `projectId`. `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:108`) đã nhóm theo Chủ thể × NCC × công trình theo cửa sổ thời gian. Bảng đối chiếu dẫn xuất đã có `byProject` (`lib/vat-tu-ncc/reconciliation-derive-service.ts:206`).
- `vat-tu-ncc` vào **theo NCC**: `/vat-tu-ncc/[supplierId]/{ngay, thang, chot-ky, doi-chieu, bao-gia, thanh-toan}`. Không có trang nào lọc theo công trình. `SupplierReconciliation`, khóa advisory, biên kỳ và khóa số dư ban đầu đều khóa theo `supplierId`.
- `/cong-no-vt/tong-hop` là ma trận NCC × Chủ thể. Preset "Toàn bộ" chỉ tính từ số dư ròng ngày 01/01/2026, nên chưa có lũy kế lấy hàng / đã trả trọn đời.
- Adapter `lib/import/adapters/cong-no-vat-tu.adapter.ts` có 3 lỗi:
  - làm mất `projectId` và `itemId` của giao dịch (gộp tên công trình vào `content`);
  - chạy lại thì chèn trùng;
  - ô tiêu đề cột NCC và Dự án (cột D, E) của Nhập Liệu để trống.
- DB thật còn dữ liệu pilot ngày 07/10, gồm 2 kỳ Nam Hương đã ký (`plans/261006-0307-…/reports/pilot-result.md`). Docker Desktop hiện đang tắt.

## Bằng chứng từ dữ liệu

- **Nhập Liệu:** 922 dòng, 01/01→31/10/2026, chỉ có "Lấy Hàng" (773 dòng) và "Trả Nợ" (149 dòng). Đây là bản nhập lại từng phiếu của các file theo công trình. Ví dụ: Nam Hương, Trại Chuối, 06/04: 8.000 viên × 1.900 = 15.200.000.
  - TT và HĐ là hai sổ song song. Việc xuất hóa đơn được ghi thành một dòng "Lấy Hàng" chỉ có số HĐ.
  - 3 dòng ghi năm 0206.
- **CSV "Tổng công nợ":** số lũy kế trọn đời, đang cập nhật theo file tổng. Phần "Hàng hóa" là TT, phần "Giá thành / Hóa đơn" là HĐ. Mỗi dòng là NCC × hợp đồng × công trình; tên công trình viết không thống nhất, có ô `#REF!`, và có một bảng phụ ở cuối file.
  - Kiểm tra (lũy kế − phát sinh 2026) = Số Dư Ban Đầu: **43/86 cặp khớp tới từng đồng**.
  - Các cặp lệch có nguyên nhân rõ: tên NCC khác nhau ("Cty Anh Công" = "Khánh Đức"; Phương Minh ghi 326 bên này, 346 Cát Dài bên kia), CSV thiếu các NCC của Tiên Lãng, CSV chưa cập nhật Dải cây xanh, phía HĐ chênh số tròn (100.000.000; 111.410.000; 291.629.000).
- **File theo công trình:** mỗi file có 3 sheet "Vật tư ngày", "Vật tư tháng", "Đối chiếu công nợ", gồm nhiều khối theo tháng 27→26, mới nhất tới 27/10→26/11.
  - Ngày có số ngày > 12 được lưu dạng **chữ** (`27/10/2026`). Ngày có số ngày ≤ 12 được lưu dạng **ngày nhưng đảo ngày/tháng** (`04/11/2026` thực là 11/04). Còn có lỗi gõ năm (19/4/2025).
  - Cùng một phiếu có thể lặp ở hai khối của cùng file (Lộc Tài MN2, dòng 27/10).
  - 11 dòng 27–31/10 khớp số tiền với Nhập Liệu: Bê tông HP 18 m³ × 1.610.000; Lộc Tài 1 ca và 0,5 ca × 2.800.000; Nam Hương DCX 5.400 viên × 1.350 (×2) và 230,4 m² × 88.000 (×2); Quang Minh 4/4/8 m³ (DCX) và 4 m³ (Trại Chuối) × 450.000.

## Phương án được chọn

1. **Nhập theo công trình.** Thêm trang `/vat-tu-ncc/cong-trinh/[projectId]`: danh sách NCC trong công trình kèm số dư, bấm vào thì tới phiếu ngày / tháng / chốt kỳ / đối chiếu / thanh toán của đúng NCC × công trình đó. Dùng lại các bảng và component hiện có, thêm index `(projectId, date)` cho phiếu ngày. Trang `du-an/[id]/cong-no` đọc từ sổ cái thay cho snapshot import tĩnh.
2. **Đối chiếu theo NCC × công trình.**
   - `SupplierReconciliation` thêm `projectId`. Unique một phần gồm (NCC, công trình, từ ngày).
   - Khóa advisory theo `vat-tu-ncc:<NCC>:<công trình>`. `assertPeriodOpen`, biên kỳ (liền kề marker gần nhất), gợi ý kỳ, khóa số dư ban đầu, ký/gỡ ký và snapshot đều lấy theo cặp này.
   - Sổ cái vật tư mới phải có công trình. Đợt thanh toán loại `vat_tu` phải có công trình.
   - Chủ thể suy từ `Project.entityId`; sau khi tách Tiên Lãng, mỗi công trình có đúng một Chủ thể.
3. **Lũy kế "từ đầu tới giờ".** Với mỗi (Chủ thể, NCC, công trình) đã được duyệt, ghi 2 dòng sổ cái ngày 31/12/2025:
   - một dòng `lay_hang` = lũy kế lấy hàng TT/HĐ;
   - một dòng `thanh_toan` = lũy kế đã trả TT/HĐ;
   - hai dòng này thay cho dòng số dư ban đầu. Cặp chưa duyệt thì giữ dòng số dư ròng.

   Không phải sửa câu truy vấn báo cáo nào. Năm 2026 có Đầu kỳ = số dư ròng cũ. Toàn bộ hiện LH và đã trả trọn đời.
4. **Trang tổng hợp mới** `/cong-no-vt/tong-hop-cong-trinh`, chạy trên `queryDetailReport`:
   - xoay được NCC → công trình hoặc công trình → NCC, lọc Chủ thể;
   - preset có cận dưới hiện Đầu kỳ / PS tăng / PS giảm / Cuối kỳ (TT và HĐ);
   - preset Toàn bộ hiện LH lũy kế / Đã trả / Còn nợ;
   - có xuất Excel. Ma trận `tong-hop` cũ giữ nguyên.
5. **Import một lần**, bằng script có `ImportRun` (gỡ được), chạy thử in bảng kiểm tra trước, ghi dưới khóa NCC × công trình:
   1. Sao lưu DB, rồi dọn dữ liệu pilot vật tư sau khi người dùng duyệt danh sách dòng.
   2. Danh mục: bảng ánh xạ bí danh NCC và tên công trình (CSV / file tổng / file theo công trình → id); tách Tiên Lãng Việt Úc / SH; đặt `Project.entityId`; người dùng duyệt bảng này.
   3. Bảng so sánh CSV với Số Dư Ban Đầu theo cặp, người dùng duyệt từng cặp. Cặp được duyệt ghi 2 dòng lũy kế 31/12/2025, còn lại ghi số dư ròng 01/01/2026.
   4. Nhập Liệu tới 26/10/2026 vào sổ cái, có `projectId` (và vật tư nếu tìm được), sửa năm 0206, không chèn trùng khi chạy lại. Sửa adapter cho ô tiêu đề trống.
   5. Từ 27/10/2026, import phiếu ngày từ các file theo công trình (11 phiếu, có khối lượng và đơn giá). Đọc ngày theo hai kiểu: ô chữ `dd/mm/yyyy`, ô ngày thì đảo lại ngày/tháng và kiểm tra nằm trong kỳ của khối; bỏ phiếu lặp giữa các khối. Kỳ 27/10→26/11 sẽ được chốt trong ERP.

## Ràng buộc

- Giữ các luật đang chạy: quy ước ngày sổ cái (ngày nghiệp vụ Asia/Bangkok, lưu UTC 00:00), kỳ đã ký không sửa được, chênh lệch đi qua `dieu_chinh`, mọi đường ghi tuần tự theo khóa.
- Sao lưu DB trước mọi migration hoặc import. Dọn pilot và xóa dữ liệu chỉ làm khi người dùng đồng ý riêng.
- Next.js 16, Prisma 7. Server action trong `lib/<module>/` có guard module; bảng dùng `components/sortable-table`. Module công nợ nhân công không đổi hành vi.

## Ngoài phạm vi

- Theo dõi công nợ theo từng hợp đồng (số, ngày, giá trị HĐ chỉ ghi vào nội dung dòng lũy kế).
- Báo cáo riêng cho các năm trước 2026 (không có dữ liệu chi tiết; xem năm 2025 sẽ thấy cả lịch sử như phát sinh 2025).
- Đưa lịch sử khối lượng trước 27/10/2026 vào phiếu ngày (số tiền đã có trong Nhập Liệu; xem câu hỏi mở).
- Công nợ nhân công. Các bên nhân công đang nằm trong sổ vật tư như Excel (Ông Lưu, Ông Mạnh…) vẫn giữ nguyên như vậy.

## Tiêu chí nghiệm thu

- Nợ ERP của từng NCC × công trình tại 26/10/2026 bằng "Tổng nợ" trong khối đối chiếu 27/09→26/10 của file tương ứng. Với bản gộp thì so tổng các công trình trong nhóm.
- Năm 2026: Đầu kỳ = Số Dư Ban Đầu theo từng cặp. Toàn bộ: khớp CSV với mọi cặp đã duyệt.
- Có test chứng minh Còn nợ (Toàn bộ, đến T) = Cuối kỳ (Năm, đến T) và Đầu kỳ + PS tăng − PS giảm = Cuối kỳ khi nhóm theo công trình.
- Chốt và ký kỳ của NCC A tại công trình X không khóa NCC A tại công trình Y. Ghi phiếu vào kỳ đã ký bị từ chối, và UI hiện thông báo lỗi.
- Kỳ 27/10→26/11 có 11 phiếu import với khối lượng và đơn giá đúng như trong Excel.
- `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` đều xanh.

## Đánh đổi

- **Lũy kế bằng 2 dòng sổ cái** (chọn): dựa trên giả định không cần báo cáo riêng năm 2025. Hỏng đầu tiên khi có người xem năm 2025 hoặc tháng 12/2025: toàn bộ lịch sử hiện như phát sinh. Phương án thay thế là thêm cột lũy kế vào `ledger_opening_balances`, phải sửa khoảng 6 câu truy vấn và `toCongNoSheetCell`. Phương án bảng snapshot riêng tạo hai nguồn sự thật.
- **Đối chiếu theo NCC × công trình** (người dùng chọn): dựa trên giả định mỗi bản giấy chỉ thuộc một công trình. Hỏng đầu tiên khi NCC vẫn muốn ký một bản gộp nhiều công trình; khi đó cần thêm nhóm công trình. Cái giá phải trả: khóa, biên kỳ và snapshot đổi khóa; dữ liệu pilot ký theo NCC phải gỡ.
- **Mốc 26/10 + 11 phiếu import** (chọn): dựa trên giả định 11 phiếu trong file theo công trình là đủ và đúng. Hỏng đầu tiên nếu sau 31/10 có phiếu chỉ nằm trên giấy. Kiểm tra lại lúc go-live, vì từ 01/11 tới ngày chuyển đổi mọi phiếu phải được nhập vào ERP.

## Cách tốt hơn

Không cần module mới. Chỉ cần thêm một cửa vào theo công trình, đổi phạm vi khóa đối chiếu, thêm 2 dòng lũy kế và một trang xoay chiều, tất cả trên đúng sổ cái hiện có. Lý do: sổ cái đã có công trình, `queryDetailReport` đã nhóm Chủ thể × NCC × công trình, đối chiếu dẫn xuất đã có `byProject`. Như vậy vẫn chỉ có một nguồn số liệu, và báo cáo năm / toàn bộ không phải viết lại.

## Rủi ro

- Ánh xạ tên NCC và công trình giữa ba nguồn là việc thủ công: sai một dòng là lệch cặp. Giảm rủi ro bằng bảng ánh xạ được duyệt và bảng kiểm tra khớp.
- Ngày trong file theo công trình rất bẩn; phải kiểm tra từng phiếu nằm trong kỳ của khối.
- Đổi khóa đối chiếu chạm vào mọi đường ghi vật tư (phiếu ngày, sổ cái tay, số dư ban đầu, đồng bộ đợt thanh toán). Bộ test khóa kỳ hiện có phải chuyển sang khóa NCC × công trình.

## Bước tiếp theo

Lập kế hoạch triển khai (`/ak:plan`) từ file này, rồi `/ak:cook`.

## Câu hỏi còn mở

1. Có cần đưa lịch sử khối lượng trước 27/10/2026 vào phiếu ngày để xem "Vật tư tháng" các tháng cũ trong ERP không? Mặc định là không. Nếu cần, phải ghép từng phiếu với dòng Nhập Liệu tương ứng để không tính trùng.
2. Có phiếu nào từ 01/11/2026 tới ngày chuyển đổi đang chỉ nằm trên giấy không? Những phiếu đó phải nhập vào ERP ngay sau import.
