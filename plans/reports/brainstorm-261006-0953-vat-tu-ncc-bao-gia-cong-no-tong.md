# Brainstorm: Theo dõi vật tư NCC theo ngày, báo giá theo thời điểm, công nợ tổng theo mốc thời gian

- Ngày: 2026-10-06
- Nhánh: main
- Nguồn mẫu: `Bê tông Hải Phòng.xlsx`, `Gạch Nam Hương.xlsx`, `Máy xúc Lộc Tài HT.xlsx` (thư mục "Bảng theo dõi CN vật tư các CT theo mẫu lãnh đạo"), `Báo giá vật tư.xlsx`, `Mầm Non/Vat Tu/Quản Lý Công Nợ Vật Tư.xlsx` (sheet "Công Nợ" là bảng tổng NCC × Chủ thể; không có sheet tên "Tổng").
- Kế hoạch liên quan đã hoàn thành: `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/plan.md` (status: completed, pilot tay Nam Hương còn chờ).

## 1. Kết luận chính

Phần lớn yêu cầu đã được xây xong trong kế hoạch tháng 7/2026 và đang chạy trên `main`. Việc "nhập 1 nơi rồi truyền đi" chính là kiến trúc hiện tại: phiếu vật tư ngày → chốt kỳ (gắn giá từ báo giá) → sổ cái công nợ vật tư → báo cáo tháng, công nợ lũy kế, bảng đối chiếu NCC. Khoảng trống thực sự nằm ở ba chỗ:

1. Chưa có bảng tổng NCC × Chủ thể kiểu sheet "Công Nợ" (Lấy hàng / Trả / Nợ cho TT và HĐ, cộng cột TỔNG CÔNG TY) tính từ đầu dự án. Truy vấn `queryDebtMatrix` đã có sẵn 8 chỉ số này nhưng chưa trang nào dùng.
2. Bộ chọn mốc thời gian còn cứng: báo cáo tháng chỉ theo tháng dương lịch và một chủ thể; công nợ lũy kế chỉ có "tính đến hết tháng X", không có cửa sổ từ–đến, không có tuần/quý/năm/kỳ NCC/tuỳ chọn.
3. Kỳ chốt cố định 27→26 không khớp các kỳ thực tế trong 3 file mẫu (29/3→26/4, 01/4→27/4, 28/4→26/5, 01/5→26/5, 26/5→26/6). Đây là quyết định đã chốt tháng 7, cần người dùng quyết định lại với bằng chứng mới.

Khoảng trống nhỏ hơn: trang báo giá chưa hiển thị "giá cũ / giá chênh / Tăng-Giảm-Mới" như file Excel và chưa cho sửa dòng; chưa có chỗ ghi nhanh "ngày trả tiền" ngay trong không gian NCC (hiện đi qua đợt thanh toán hoặc grid nhập liệu sổ cái).

## 2. Đối chiếu từng yêu cầu với hiện trạng

| Yêu cầu của người dùng | Mẫu Excel | Hiện trạng trong hệ thống | Kết luận |
|---|---|---|---|
| Nhập phiếu lấy vật tư theo ngày, theo NCC và công trình | Sheet "Vật tư ngày": STT, ngày, loại vật tư, KL, ĐVT, CB vật tư, CHCT, KT | `/vat-tu-ncc/[ncc]/ngay` grid: ngày, vật tư, SL, ĐVT, đơn giá, thành tiền, dự án, CB VT, CHCT, KT, ghi chú (`components/vat-tu-ncc/delivery-grid.tsx`, bảng `supplier_delivery_daily`) | Đã có |
| Tổng hợp theo tháng | Sheet "Vật tư tháng" | `/vat-tu-ncc/[ncc]/thang` đọc view `vw_supplier_delivery_monthly` | Đã có |
| Theo dõi báo giá cập nhật liên tục, giá áp theo thời điểm mua | `Báo giá vật tư.xlsx`: ngày, tên VT, giá cũ, giá mới, chênh, ghi chú | `/vat-tu-ncc/[ncc]/bao-gia` + `supplier_price_quotes(itemId, unitPrice, effectiveFrom)`; `resolveQuotePrice` chọn mức mới nhất có hiệu lực ≤ ngày phiếu; áp giá lúc chốt kỳ, kế toán sửa được từng phiếu | Đã có lõi. Thiếu: cột giá cũ/chênh (suy ra từ mức trước), nút sửa (service `updatePriceQuote` có, UI chưa), gợi ý giá ngay khi nhập phiếu ngày |
| Đơn giá tại thời điểm, thành tiền, dư mang sang, cộng phát sinh, chuyển khoản, tổng nợ | Sheet "Đối chiếu công nợ": A / B / C / A+B−C, tổng phụ theo công trình | `/vat-tu-ncc/[ncc]/doi-chieu` dẫn xuất từ sổ cái (`reconciliation-derive-service.ts`): A = số dư tại periodFrom−1, B = Σ lay_hang, C = Σ thanh_toan, tổng phụ theo công trình và vật tư; ký → khoá kỳ | Đã có |
| Ngày trả tiền | Dòng C "16/4/2026 (CK) 300.000.000" | Đợt thanh toán đóng → tự sinh `thanh_toan` (`lib/payment/payment-ledger-sync.ts`); hoặc nhập tay dòng `thanh_toan` ở `/cong-no-vt/nhap-lieu` | Đã có đường đi; thiếu lối nhập nhanh trong không gian NCC |
| Công nợ tổng từ đầu dự án, theo NCC × Chủ thể | Sheet "Công Nợ": LH TT / Trả TT / Nợ TT / LH HĐ / Trả HĐ / Nợ HĐ cho từng chủ thể + TỔNG CÔNG TY | `/cong-no-vt` chỉ hiện tổng nợ và top 5; `/cong-no-vt/chi-tiet` có Đầu kỳ / PS / Đã trả / Cuối kỳ theo Chủ thể × NCC × Công trình nhưng chỉ lọc "đến hết tháng"; `queryDebtMatrix` (`lib/ledger/ledger-aggregations.ts:287`) đã tính đúng ma trận này nhưng không trang nào gọi | Thiếu trang hiển thị |
| Chọn hiển thị theo năm / tháng / tuần / mốc khác | Sheet "Báo Cáo Tháng" theo tháng; sheet "Công Nợ" toàn thời gian | `queryMonthlyByParty` cố định tháng dương lịch, một chủ thể; `queryDetailReport` chỉ có mốc cắt | Thiếu cửa sổ từ–đến tổng quát |
| Kỳ đối chiếu | 29/3→26/4, 01/4→27/4, 28/4→26/5, 01/5→26/5, 26/5→26/6 (lệch nhau theo NCC và kỳ đầu) | `periodRange()` cố định 27 tháng trước → 26 tháng đích cho mọi NCC | Không khớp mẫu; xem mục 5 |

## 3. Hợp đồng bàn giao (brainstorm contract)

**Outcome.** Kế toán vật tư nhập phiếu ngày và báo giá tại một nơi (`/vat-tu-ncc`), hệ thống tự áp giá theo ngày phát sinh, và lãnh đạo xem được công nợ vật tư ở mọi mốc thời gian: toàn bộ từ đầu dự án (ma trận NCC × Chủ thể như sheet "Công Nợ"), theo năm, quý, tháng, tuần, kỳ NCC hoặc khoảng tuỳ chọn, với bất biến Đầu kỳ + Lấy hàng − Trả = Cuối kỳ và Cuối kỳ của cửa sổ bất kỳ bằng lũy kế tại mốc cuối.

**Constraints.**
- Giữ nguyên nguồn sự thật: mọi số tổng tính động từ `ledger_transactions` + `ledger_opening_balances`; không lưu số tổng dẫn xuất (quyết định tháng 7, đã có test bảo vệ).
- Kỳ đã ký bất biến; mọi thay đổi số đi qua `dieu_chinh` kỳ sau.
- Dùng đúng Next.js 16 và Prisma 7 trong repo (đọc `node_modules/next/dist/docs/` trước khi viết route mới), ACL qua `requireReleasedModuleRequest("cong-no-vt" | "vat-tu-ncc")`.
- Bảng mới tuân thủ hợp đồng sắp xếp ba trạng thái (`components/sortable-table`).
- Unit 698 và integration 41 hiện xanh phải giữ xanh; thêm test cho truy vấn cửa sổ thời gian.
- Không thay đổi module công nợ nhân công ngoài việc dùng chung truy vấn tổng quát (ledgerType tham số hoá sẵn).

**Non-goals.**
- Không viết importer Excel đầy đủ (giữ quyết định tháng 7: số dư đầu + tái lập vài kỳ tay).
- Không đổi mô hình VAT/HĐ; dòng "Thuế HĐ" trong đối chiếu Bê tông HP ghi bằng `dieu_chinh` có nội dung.
- Không sửa luồng đợt thanh toán (`/thanh-toan`).
- Không gộp hai trang báo cáo tháng và lũy kế thành pivot tổng quát (phương án C bên dưới, để sau).

**Acceptance criteria.**
1. Trang `/cong-no-vt/tong-hop`: dòng = NCC, nhóm cột = từng Chủ thể + TỔNG CÔNG TY, mỗi nhóm có LH / Trả / Nợ cho TT và HĐ; mặc định toàn thời gian; số khớp `queryDebtMatrix` và khớp sheet "Công Nợ" trên dữ liệu seed pilot.
2. Bộ chọn mốc thời gian dùng chung cho `/cong-no-vt/tong-hop`, `/cong-no-vt/bao-cao-thang` và `/cong-no-vt/chi-tiet`: Toàn bộ / Năm / Quý / Tháng / Tuần / Kỳ NCC 27→26 / Tuỳ chọn từ–đến; chọn tháng cho kết quả giống hệt báo cáo tháng hiện nay.
3. Test đơn vị cho truy vấn cửa sổ: với mọi [from, to], Đầu kỳ = lũy kế tại from−1; Cuối kỳ = lũy kế tại to; tổng theo tuần trong một tháng cộng lại bằng tháng.
4. Báo giá: bảng hiển thị giá trước đó và chênh lệch (Tăng / Giảm / Mới) suy từ mức liền trước cùng vật tư; sửa được dòng; grid phiếu ngày gợi ý đơn giá theo báo giá hiệu lực khi nhập (vẫn sửa tay).
5. Tab "Thanh toán" trong `/vat-tu-ncc/[ncc]`: ghi dòng `thanh_toan` (ngày, số tiền, chủ thể, công trình, nội dung) qua `createMaterialTransaction`; dòng xuất hiện ở mục C của bảng đối chiếu đúng kỳ.
6. Nếu chốt phương án kỳ linh hoạt (mục 5): chốt kỳ và đối chiếu nhận [from, to] tuỳ chọn với mặc định 27→26, kỳ đầu của NCC mặc định từ phiếu sớm nhất chưa chốt, chặn chồng lấn với kỳ đã ký và bắt buộc liền kề kỳ ký trước.
7. Cập nhật `docs/user-guide/can-bo-vat-tu.md` và `ke-toan.md` cho luồng phiếu ngày → báo giá → chốt kỳ → đối chiếu → công nợ tổng; chạy runbook pilot Nam Hương còn treo.

## 4. Các phương án cho phần báo cáo theo mốc thời gian

| Phương án | Nội dung | Giả định phụ thuộc nhất | Hỏng đầu tiên khi | Nhận xét |
|---|---|---|---|---|
| A. Mở rộng truy vấn hiện có (khuyến nghị) | Thêm tham số `from`/`to` vào `queryMonthlyByParty` và `queryDebtMatrix` (thay CTE first_of_month/last_of_month), thêm trang tổng hợp dùng `queryDebtMatrix`, một component chọn mốc thời gian dùng chung | Sổ cái đủ nhỏ để tính động mỗi lần xem (file Nhập Liệu hiện ~1.300 dòng cho toàn công ty; index `(ledgerType, entityId, partyId, projectId, date)` đã có) | Khi sổ cái lên hàng trăm nghìn dòng và nhiều người xem cùng lúc; lúc đó thêm cache theo request là đủ | Thay đổi nhỏ nhất, tái dùng toàn bộ SQL đã có test, không chạm quyết định "không lưu số dẫn xuất" |
| B. Bảng snapshot số dư theo kỳ | Tính trước số dư tháng vào bảng riêng, báo cáo đọc từ đó | Mọi ghi/xoá/gỡ ký sổ cái đều kích hoạt tính lại đúng | Khi một đường ghi mới (import, điều chỉnh admin) quên invalidate → số lệch giữa đối chiếu và tổng | Mâu thuẫn với quyết định tháng 7 (đối chiếu dẫn xuất, closing k = opening k+1 vì cùng đọc một sổ cái); quá tay với khối lượng hiện nay |
| C. Một trang pivot tổng quát | Gộp tổng quan, báo cáo tháng, lũy kế thành một bảng chọn chiều (Chủ thể / NCC / Công trình / Vật tư) và mốc thời gian | Người dùng chấp nhận bỏ mẫu báo cáo tháng quen thuộc và template xuất Excel `cong-no-monthly` | Khi lãnh đạo cần in đúng mẫu cũ | Linh hoạt nhất nhưng là viết lại UI, ảnh hưởng test ACL và export; để pha sau nếu A không đủ |

**Trade-offs tóm tắt.** A cho đủ ba mốc người dùng nêu (năm, tháng, tuần) và cả kỳ NCC với chi phí thấp; B mua tốc độ bằng rủi ro lệch số; C mua tính linh hoạt bằng việc phá mẫu đang dùng.

**Better approaches.** Có một hướng tốt hơn đề xuất ban đầu của người dùng: không xây mới chỗ nhập và theo dõi báo giá, vì chúng đã tồn tại và được kiểm thử (bằng chứng: `lib/vat-tu-ncc/*`, pilot Nam Hương khớp chuỗi 310.605.120 → 255.005.120 → 285.465.120 trong integration test). Chi phí chuyển hướng bằng 0; phần việc còn lại là trang tổng hợp, bộ chọn mốc thời gian, vài cải thiện báo giá và quyết định về biên kỳ.

## 5. Quyết định cũ cần người dùng xem lại: biên kỳ chốt

- **Quyết định gốc (29/7/2026):** kỳ cố định 27 tháng trước → 26 tháng đích cho mọi NCC, không tranh luận lại.
- **Bằng chứng mới:** 3 file mẫu theo mẫu lãnh đạo dùng kỳ khác nhau theo NCC và theo kỳ đầu: Bê tông HP 29/3→26/4 rồi 26/4→26/5 rồi 27/6→26/7; Nam Hương 01/4→27/4 rồi 28/4→26/5 rồi 26/5→26/6; Lộc Tài 01/5→26/5 rồi 26/5→26/6.
- **Hệ quả nếu giữ cố định:** tổng nợ lũy kế vẫn đúng, nhưng dòng A/B/C của từng kỳ không trùng bảng NCC đã ký trước đây (ví dụ phiếu 27/4 của Nam Hương nằm kỳ 5 trong hệ thống nhưng kỳ 4 trong Excel). Tái lập lịch sử sẽ lệch từng kỳ.
- **Lựa chọn:**
  1. Giữ cố định, chuẩn hoá từ nay về sau; lịch sử chỉ nhập số dư đầu tại 26/x gần nhất. Chi phí 0, mất khả năng in lại đúng các kỳ cũ.
  2. Cho phép [from, to] tuỳ chọn khi chốt kỳ và tạo bảng đối chiếu, mặc định 27→26, có chặn chồng lấn và bắt buộc liền kề kỳ đã ký. `SupplierReconciliation` đã lưu `periodFrom/periodTo` nên phần dẫn xuất không đổi; chỉ `period-close-service` và UI chốt kỳ đổi tham số. Ước tính 8 giờ.

Khuyến nghị lựa chọn 2 vì kỳ đầu tiên của mỗi NCC luôn bắt đầu từ ngày lấy hàng đầu tiên chứ không phải ngày 27, và mẫu lãnh đạo đang chấp nhận lệch một ngày giữa các NCC.

## 6. Phác thảo pha cho bước lập kế hoạch

1. Truy vấn cửa sổ thời gian + trang `/cong-no-vt/tong-hop` + component chọn mốc dùng chung (khoảng 12 giờ, gồm test).
2. Báo giá: giá trước / chênh / sửa dòng; gợi ý giá khi nhập phiếu ngày; tab Thanh toán trong không gian NCC (khoảng 6 giờ).
3. Biên kỳ linh hoạt nếu được chốt (khoảng 8 giờ).
4. Tài liệu người dùng + chạy runbook pilot Nam Hương + nhập số dư đầu cho các NCC còn lại (khoảng 4 giờ, phần nhập liệu do người dùng).

## 7. Quyết định đã chốt (người dùng, 2026-10-06 10:05)

1. **Biên kỳ chốt:** cho phép [from, to] tuỳ chọn khi chốt kỳ và lập đối chiếu; mặc định 27→26; kỳ đầu của NCC mặc định từ phiếu sớm nhất chưa chốt; chặn chồng lấn kỳ đã ký và bắt buộc liền kề kỳ ký trước. Thay thế quyết định (2) của kế hoạch 29/7/2026.
2. **Thuế hoá đơn:** thêm loại giao dịch sổ cái riêng (đề xuất mã `thue_hd`), làm tăng nợ như lấy hàng, hiển thị thành dòng riêng trong đối chiếu (mục C của mẫu Bê tông HP) và cộng vào cột Lấy hàng / Phát sinh của mọi báo cáo. Mọi truy vấn phân loại theo `transactionType` phải nhận loại mới: `querySummary`, `queryMonthlyByParty`, `queryCurrentBalance`, `queryDebtMatrix` (`lib/ledger/ledger-aggregations.ts`), `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts`), `computeReconciliation` (`lib/vat-tu-ncc/reconciliation-derive-service.ts`), zod enum trong `lib/cong-no-vt/schemas.ts`, lựa chọn loại trong `components/ledger-grid/transaction-grid.tsx`, và khoá kỳ `assertPeriodOpen`.
3. **Xuất Excel:** bảng tổng hợp NCC × Chủ thể xuất được Excel theo mẫu sheet "Công Nợ", thêm template vào `app/api/export/excel/route.ts` cạnh `cong-no-monthly`; nằm trong acceptance criteria.
4. **Tuần:** tuần ISO (thứ Hai → Chủ nhật).

Acceptance criteria bổ sung: (8) loại `thue_hd` tăng nợ đúng ở tất cả báo cáo và đối chiếu, có test; (9) xuất Excel tổng hợp khớp số trên màn hình; (10) preset Tuần dùng tuần ISO.

Không còn câu hỏi mở. Chuyển sang `/ak:plan`.
