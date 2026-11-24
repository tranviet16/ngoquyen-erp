# Brainstorm: Làm lại UI/UX module Dự án xây dựng, trọng tâm Đối chiếu DT-HĐ-TT

Ngày: 2026-11-20. Trạng thái: đã chốt với người dùng (phương án B), chuyển sang lập plan. Chưa code.

Nguồn: khảo sát code (worktree `claude/du-an-danh-muc-hop-dong`, gồm `main` + PR #24), đo trên bản sao localhost:3001 (công trình MNTC-GD1, khung 1440×900), và tư vấn của kongming ([kongming-261120-1606-du-an-xay-dung-ui-ux-redesign.md](kongming-261120-1606-du-an-xay-dung-ui-ux-redesign.md)).

## Người dùng đã trả lời

- **Điểm đau:** cả bốn — báo cáo quá dài khó đọc; không biết việc gì cần làm; quá nhiều tab chồng chéo; nhập sổ chậm.
- **Màn hình đầu tiên phục vụ:** lãnh đạo / chỉ huy (xem nhanh dự toán so hóa đơn và thực tế, đầu mối nào vượt, còn phải lấy HĐ bao nhiêu).

## Quyết định đã chốt (20/11)

| Câu hỏi | Quyết định |
|---|---|
| Phương án | **B. Tổng quan + đi sâu.** Không gộp các tab cũ. |
| Dashboard dự án đang ghi "Thực tế" 0 đ trên công trình có sổ đội | **Đưa vào đợt này.** Công trình có sổ DT-HĐ-TT thì Dashboard đọc số chính từ sổ đội; công trình khác giữ như cũ. |
| Kế toán nhập H/S/X/Z ở đâu | **Ngay trên bảng HĐ-TT**, cho người có quyền sửa. Lưới NCC ở trang Đầu mối vẫn giữ. |
| Sổ nhập có còn là nơi đội nhập lâu dài | **Có.** Làm đủ bước 5. |

## Hiện trạng đã đo

| Màn | Số đo | Nguồn |
|---|---|---|
| Khung dự án | 14 tab một hàng, cuộn ngang, không có trạng thái tab đang mở | `app/(app)/du-an/[id]/layout.tsx:10-25,82-91` |
| Dashboard dự án | "Thực tế (đã nhập)" = **0 đ**, "Biến động −100 %" tô màu xanh, dù đội đã nhập 258 dòng thực tế | `lib/du-an/dashboard-service.ts:84`, ảnh chụp |
| Mục con DT-HĐ-TT | 9 nút ngang hàng trộn 3 báo cáo, 3 sổ nhập, 3 danh mục; vào tab là rơi vào DT-HĐ | `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:11-21`, `dt-hd-tt/page.tsx:5` |
| DT-HĐ | 30 khối đầu mối, 780 dòng bảng, trang cao **16.466 px** (~18 màn); 30/30 dòng kiểm đều ✓; tóm tắt mỗi khối là một câu ~215 ký tự | đo bằng JS trên trang |
| HĐ-TT | 17 cột; bảng rộng 1.430 px trong khung 1.082 px; tên NCC bị bóp xuống 5 dòng; tiêu đề theo mã cột Excel | ảnh chụp, `export-sheet-hd-tt.ts:8-24` |
| Hóa đơn | form thêm dòng chiếm ~1/3 màn, lưới còn ~9 dòng; không lọc được theo NCC / số HĐ / chưa gán | `hoa-don-client.tsx:109-122,190-215` |
| Ánh xạ | 716 alias; chọn Dòng DT bằng danh sách thả xuống không tìm kiếm (tới 362 dòng); lưu xong không sang dòng kế | `anh-xa-editor.tsx:145-148` |

Ba phát hiện định hình thiết kế:

1. **Báo cáo là ngõ cụt.** Mọi cảnh báo ("chưa gán", "thiếu hệ số", "chưa chốt thực tế", "chưa gắn đầu mối", "không thuộc đầu mối") là chữ thường, không có link tới chỗ sửa. Link duy nhất trên báo cáo là băng Cài đặt (`report-bits.tsx:57`).
2. **Dòng ✓/✗ của DT-HĐ không phải danh sách việc.** Kiểm khối DT-HĐ là một đồng nhất thức: mỗi hóa đơn rơi vào đúng một trong ba ngăn được cộng (`dt-hd-report.ts:167-169`). Vì vậy 30 dòng xanh chỉ là nhiễu. Việc thật là chưa gán, thiếu hệ số, chưa chốt thực tế.
3. **"In" in chính trang đang xem** (`window.print()`, `app/globals.css:273-290`). Mọi thu gọn hay bộ lọc trên màn hình sẽ làm đổi bản in A4. Excel thì an toàn vì route xuất dựng file từ đối tượng báo cáo.

## Hợp đồng brainstorm

### Outcome

- Khung dự án cho thấy người dùng đang ở đâu, và 14 tab được gom thành nhóm mà không phải cuộn ngang.
- Tab Đối chiếu DT-HĐ-TT mở ra trang **Tổng quan** phục vụ lãnh đạo:
  - số chính DT / HĐ / TT;
  - các đầu mối vượt dự toán;
  - danh sách việc cần làm, mỗi việc dẫn thẳng tới chỗ sửa.
- Ba báo cáo đọc được trên màn hình: tóm tắt trước, mở rộng khi cần, có bộ lọc, tiêu đề và cột tên cố định, tên cột dễ hiểu.
- Nhập sổ và ánh xạ nhanh hơn: lưới lọc được, ô chọn có tìm kiếm, ánh xạ liên tục từ dòng này sang dòng kế.

### Constraints

- Mọi con số báo cáo không đổi. Engine `lib/du-an/dt-hd-tt/*-report.ts` và các golden test không bị sửa.
- Bản in A4 và file Excel của ba báo cáo giống hệt trước khi làm.
- Quyền đọc / tạo / sửa giữ nguyên. Ô H/S/X/Z sửa qua action đã có, `updateCounterpartySupplier`.
- Không đổi URL nào, để link, bookmark và breadcrumb vẫn chạy.
- Quyết định 4 (17/11) giữ nguyên: các tab cũ vẫn hiện danh sách hóa đơn.
- Không đổi schema.
- Next.js trong repo khác bản quen thuộc, cần đọc `node_modules/next/dist/docs/` trước khi code.
- Desktop từ 1366 px trở lên.

### Non-goals

- Gộp hay ẩn các tab cũ (Giao dịch, Cân đối VT, Định mức, Công nợ NCC). Việc này mở lại quyết định 4; đó là phương án C bên dưới.
- Đổi cách tính, thêm tổng mới trộn các mức VAT khác nhau.
- Bản in theo bộ lọc. In luôn ra báo cáo đầy đủ.
- Ảo hóa bảng: 780 dòng render server là ổn khi đã thu gọn.
- Biến sổ nhập thành form từng bước. Lưới vẫn hợp thói quen Excel của đội.

### Acceptance criteria

1. Ở 1366 px và 1440 px, thanh tab dự án không cuộn ngang, nhóm và tab đang mở được tô sáng và có `aria-current`.
2. `/du-an/{id}/dt-hd-tt` mở Tổng quan. Mỗi số trên đó bằng đúng một ô của báo cáo tương ứng, có test chứng minh.
3. Mỗi việc trên Tổng quan tới được màn sửa trong một lần bấm, và màn đó đã lọc sẵn.
4. DT-HĐ trên màn hình mở ra 30 dòng tóm tắt đầu mối, xem hết trong khoảng 2 màn thay vì 16.466 px. Mở rộng được theo đầu mối rồi theo nhóm. Có bộ lọc Còn thiếu / Vượt / Chưa có HĐ / Thiếu hệ số / theo một đầu mối. Đầu mối đang mở được giữ trên URL.
5. HĐ-TT ở 1440 px: tên NCC không quá 2 dòng; cột NCC, tiêu đề và dòng tổng cố định khi cuộn. Người có quyền sửa nhập được H/S/X/Z ngay trên bảng, người chỉ đọc thì không.
6. Lưới Hóa đơn, Thực tế nhập và Chi thực tế lọc được theo NCC, số HĐ, chưa gán, và nhận bộ lọc ban đầu từ URL. Ô chọn NCC và Dòng DT có tìm kiếm. Ánh xạ có nút "Lưu và sang dòng kế".
7. Text PDF in và file Excel của ba báo cáo trên MNTC-GD1 bằng bản baseline lưu trước khi làm. Snapshot markup tĩnh của `DtHdView`, `DtTtView` và `HdTtView` không đổi.
8. `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` đều xanh. Test hợp đồng ACL không đổi.
9. Trên MNTC-GD1, Dashboard dự án hiện thực tế lấy từ sổ đội, bằng đúng số trên Tổng quan DT-HĐ-TT. Dashboard của các công trình không có sổ giữ nguyên số như hiện nay.

## Trade-offs

| | A. Sửa tại chỗ | B. Tổng quan + đi sâu (đề xuất) | C. B + gộp các tab cũ |
|---|---|---|---|
| Làm gì | Tab active, mục con có nhóm, tiêu đề cố định, nhãn màu, link trên cảnh báo; màn hình và bản in dùng chung một markup | A, cộng Tổng quan, bố cục màn hình tách khỏi bản in, sửa H/S/X/Z ngay trên HĐ-TT, sổ lọc được, ánh xạ nhanh, khung dự án gom 7 nhóm | B, cộng gộp Cân đối VT / Định mức / Giao dịch / Công nợ vào màn mới và làm lại Dashboard |
| Giả định chính | Điểm đau chỉ là khó đọc | Người dùng làm việc theo danh sách việc và số tổng, không theo thứ tự sheet Excel | Các tab cũ thừa |
| Hỏng đầu tiên khi | Đội vẫn hỏi "giờ làm gì" (người dùng đã xác nhận đây là điểm đau) | Người dùng quen mở thẳng báo cáo và coi Tổng quan là thêm một lần bấm | Một công trình chưa có sổ đội vẫn cần các tab cũ |
| Tệ nhất có thể | Sửa màn hình làm đổi bản in A4 mà không ai biết | Màn hình và bản in khác nhau tới mức người dùng nghi số trên màn hình; HTML DT-HĐ tăng khoảng gấp đôi | Mở lại quyết định 4, làm hỏng công trình chưa import file |
| Công sức (ước) | 3–4 ngày | 10–11 ngày, thêm 0,5–1 ngày cho Dashboard | 15–20 ngày |

**Khuyến nghị: B.** A không giải quyết được hai điểm đau người dùng chọn, "không biết việc gì cần làm" và "quá nhiều tab", lại có rủi ro bản in cao nhất. C chưa đáng làm khi mới một công trình (MNTC-GD1) dùng sổ đội: bản sao chỉ có dữ liệu sổ ở project 4.

## Better approaches

So với cách hiểu "làm lại" là viết lại các màn báo cáo, cách tốt hơn là **giữ nguyên `DtHdView` / `HdTtView` làm bản in** (`hidden print:block`) và dựng bố cục màn hình thành component thứ hai trên cùng đối tượng báo cáo (`print:hidden`).

- **Bằng chứng:** In là `window.print()` trên chính DOM đang xem (`app/globals.css:273-278`).
- **Lợi ích:** bản in giống hệt bản cũ, và màn hình không thể lệch số vì cả hai đọc chung một đối tượng.
- **Giá phải trả:** HTML của DT-HĐ tăng khoảng gấp đôi. Cần đo trên project 4 trước khi merge bước 3.

DT-TT nhỏ (202 dòng), chỉ cần thêm phần dành cho màn hình ngay tại chỗ.

## Thiết kế theo phương án B

### Khung dự án: 14 tab thành 7 nhóm, URL giữ nguyên

| Nhóm (hàng 1) | Tab (hàng 2) |
|---|---|
| Tổng quan | Dashboard |
| Tiến độ & nghiệm thu | Tiến độ, Nghiệm thu |
| Dự toán | Dự toán, DT điều chỉnh, Phát sinh (CO) |
| Đối chiếu DT-HĐ-TT | mục con có nhóm (dưới) |
| Vật tư & công nợ | Giao dịch, Cân đối VT, Định mức, Công nợ NCC |
| Hợp đồng & dòng tiền | Hợp đồng, Dòng tiền 3 bên |
| Cài đặt | — |

Với công trình có sổ, nhóm "Vật tư & công nợ" có thêm một dòng ghi chú: "Hóa đơn ở các tab này lấy từ sổ Hóa đơn".

### Mục con DT-HĐ-TT

- **Tổng quan** (mới, thay cho lệnh chuyển thẳng sang DT-HĐ)
- **Báo cáo:** DT-HĐ, DT-TT, HĐ-TT
- **Nhập sổ:** Hóa đơn, Thực tế nhập, Chi thực tế
- **Thiết lập:** Ánh xạ (có số "chưa gán"), Đầu mối, Mã nhóm

### Tổng quan — ưu tiên lãnh đạo

Nguyên tắc: mỗi con số là một ô báo cáo đã có, ghi rõ mức VAT, và có link tới đúng ô đó. Không tạo tổng mới.

1. **Số chính:**
   - Tổng dự toán và Thực tế, kèm chênh (dòng tổng Phần III);
   - HĐ gồm VAT Σ E, Thực tế Σ T, Thực tế vượt HĐ Σ U = còn phải lấy HĐ (HĐ-TT);
   - Đã trả Σ I, Nợ thực tế Σ V, Còn phải lấy về Σ Y.
2. **Đầu mối cần chú ý:** các dòng Phần II của DT-TT, xếp theo chênh DT − TT (đều gồm VAT), vượt nhiều nhất lên đầu. Hiện 10 dòng, có link "xem đủ", kèm số đầu mối chưa chốt thực tế.
3. **Việc cần làm** (ẩn dòng bằng 0). Mỗi việc ghi số lượng, số tiền và link đã lọc:
   - tên chưa gán theo nguồn;
   - đề xuất chờ xác nhận;
   - dòng DT thiếu hệ số;
   - thực tế nhập chưa gắn đầu mối;
   - đầu mối chưa chốt thực tế;
   - NCC có HĐ nhưng chưa thuộc đầu mối;
   - dự toán chưa có loại VL / NC / MTC;
   - chưa cài đặt tỷ lệ;
   - ghi chú Z của kế toán.
4. **Kiểm tổng:** một dòng "n/n khớp", bấm để mở danh sách. Dòng ✗ hiện Δ và màn cần sửa.
5. Lối tắt In và Xuất Excel cho ba báo cáo.

### Báo cáo trên màn hình

**DT-HĐ**
- Bảng tóm tắt trước, mỗi đầu mối một dòng với cột có tên: Dự toán, HĐ do NCC xuất, Trong nhóm mình, Ngoài DT, Ở nhóm khối khác, Thực tế chưa VAT, Còn phải lấy HĐ, và số theo tình trạng.
- Mở rộng một đầu mối để thấy nhóm, mở tiếp một nhóm để thấy dòng DT. Dòng hóa đơn "↳" nằm sau công tắc "Hiện dòng hóa đơn", mặc định tắt.
- Tình trạng hiện bằng nhãn màu có chữ.
- Phần B tách thành hai danh sách "Chưa gán" (mỗi tên có link "Gán") và "Ngoài DT". Việc này cần thêm một trường lý do vào `DtHdInvoiceRow`; số không đổi.

**HĐ-TT**
- Tiêu đề hai hàng gom 13 cột tiền thành Hóa đơn | Thanh toán | Thực tế | Lấy về. Tên cột dễ hiểu, giữ mã chữ nhỏ bên cạnh (ví dụ "HĐ gồm VAT · E"), công thức trong tooltip.
- Nhãn màn hình đặt trong một bảng nhãn riêng, **không** sửa `HD_TT_MONEY_COLS`, vì đó cũng là tiêu đề Excel và đã có test.
- Cột NCC cố định; các dòng nhóm dưới đầu mối của chúng.
- Sửa H/S/X/Z ngay trên bảng.
- Các dấu "(H)", "(tạm = HĐ)", "(tách)" đổi thành nhãn đặt cạnh số.
- Bấm số E mở Hóa đơn đã lọc theo NCC; bấm G mở Chi thực tế đã lọc theo NCC.

**DT-TT**
- Thanh nhảy cố định "Phần I · II · III".
- Nhóm ở Phần I thu gọn được.
- "Chưa chốt" và các dòng cảnh báo đổi thành link.

### Các bước giao, mỗi bước ship được riêng

1. **Khung dự án và mục con (~1 ngày):** tab active, 7 nhóm, mục con có nhóm, sửa link Ánh xạ thiếu `?tab=`.
2. **Tổng quan, link và Dashboard (~2,5–3 ngày):** trang Tổng quan, cảnh báo trên báo cáo thành link, Ánh xạ nhận `?tab=&status=&q=`. Dashboard dự án đọc số chính từ sổ đội khi công trình có sổ, dùng chung nguồn số với Tổng quan.
3. **DT-HĐ màn hình (~2,5 ngày):** bảng tóm tắt, mở rộng, bộ lọc, tiêu đề cố định, Phần B tách đôi. Bản cũ giữ cho in.
4. **HĐ-TT và DT-TT màn hình (~2,5 ngày):** tiêu đề nhóm, cột cố định, sửa H/S/X/Z tại chỗ, bộ lọc, thanh nhảy.
5. **Sổ nhập và Ánh xạ (2–3 ngày):**
   - lưới lọc được và nhận bộ lọc ban đầu từ URL;
   - ô chọn NCC và Dòng DT có tìm kiếm;
   - form thêm dòng gọn lại, có thể thu vào;
   - trình gán hiện các dòng nguồn;
   - nút "Lưu và sang dòng kế".

Chặn rủi ro bản in, làm trước bước 3:
- Lưu baseline "In → PDF" và Excel của ba báo cáo trên project 4.
- Thêm snapshot markup tĩnh cho ba view hiện tại.
- Sau mỗi bước, so lại với baseline.

## Lỗi dữ liệu thấy qua giao diện (theo dõi riêng)

1. **Dashboard "Thực tế (đã nhập)" sai trên công trình có sổ đội.** Thẻ này cộng `amountTt` của giao dịch, mà giao dịch sinh từ sổ Hóa đơn không có thực tế (`dashboard-service.ts:84`, `derive-transactions.ts:3`). **Đã đưa vào bước 2** theo quyết định 20/11.
2. **Hai số "tổng dự toán" khác nhau dưới một tên.** Dashboard dùng tổng dòng dự toán, còn Phần III cộng thêm các khoản theo tỷ lệ.
3. **Cảnh báo hợp đồng ghi cứng "trong 90 ngày"** (`page.tsx:113`), trong khi số ngày cấu hình được (`warningDays`).
4. **Cân đối VT hiện thẻ "Thực tế đã nhập" = 0** trên công trình có sổ, và việc này là đã biết từ trước.
5. **Mỗi NCC có hai số công nợ** (Công nợ NCC và cột V của HĐ-TT), không màn nào dẫn sang màn kia.
6. **Kongming đọc code thấy một khả năng, chưa chạy kiểm:** NCC có S nhưng không thuộc đầu mối có thể làm dòng kiểm Σ T thành ✗ mà không giải thích (`hd-tt-report.ts:90-91,130-140`). Cần một test để xác nhận.

## Rủi ro còn lại

- **HTML DT-HĐ tăng khoảng gấp đôi** vì giữ cả bản in lẫn bản màn hình. Cần đo trên project 4 trước khi merge bước 3. Nếu quá nặng, chuyển sang một markup duy nhất với class chỉ dành cho màn hình, và chấp nhận phải kiểm bản in nhiều hơn.
- **Người dùng quen mở thẳng báo cáo** có thể coi Tổng quan là thêm một lần bấm. Mục con luôn hiện, nên tới báo cáo vẫn chỉ mất một lần bấm.

## Câu hỏi chưa giải quyết (không chặn lập plan)

1. Năm tới bao nhiêu công trình sẽ dùng sổ DT-HĐ-TT? Câu trả lời quyết định có làm phương án C (gộp tab cũ) thành một dự án sau không.
2. Giữ mã chữ Excel (E, G, I…) cạnh tên cột HĐ-TT mãi, hay bỏ khi người dùng đã quen tên mới? Mặc định trong plan là giữ.
3. Ai xác nhận các "đề xuất" ánh xạ: đội hay kế toán? Mặc định là giữ quyền như hiện nay.
