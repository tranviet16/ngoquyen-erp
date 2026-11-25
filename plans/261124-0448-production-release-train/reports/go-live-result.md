# Kết quả go-live 11/2026

Tệp này ghi kết quả go-live của đợt phát hành 11/2026 (bản phát hành `6863630`, production chuyển sang VIETPC).
- **Phần A:** phiếu xác nhận số liệu, kế toán điền trước khi chuyển.
- **Phần B:** điền lúc chuyển (phase 4).

Repo này công khai, nên tệp chỉ ghi kết luận, không ghi số tiền hay tên NCC. NCC được ghi bằng mã trong ERP (`NCC #id`, tra ở `/vat-tu-ncc`). Số cụ thể nằm trên màn hình ERP và trong file Excel của phòng kế toán. Bản có tên NCC lưu ngoài repo, trên máy VIETPC.

## Phần A. Phiếu xác nhận số liệu (phase 3)

### Bối cảnh

- Bản sao dữ liệu trên VIETPC sẽ trở thành production. Các bước import **không chạy lại** ở đâu nữa.
- Vì vậy người duyệt xác nhận: số đang có trên bản sao là số go-live.
- Bản sao đang chứa:
  - lần import chuyển đổi công nợ vật tư (run #7, ghi ngày 10/11/2026, mốc chuyển đổi 26/10/2026), từ file Excel lưu lúc 14:52 ngày 05/11/2026;
  - các chỉnh sửa sau import ngày 10–16/11/2026, liệt kê ở mục "Thay đổi sau import" bên dưới, gồm cả phần bổ sung Mầm Non theo bản đối chiếu 13–17/11/2026;
  - sổ DT-HĐ-TT Mầm Non.
- **Người duyệt:** kế toán phụ trách công nợ vật tư.

**Cách xem:** trên máy VIETPC, mở `http://localhost:3001`. Người quản trị đăng nhập giúp bằng tài khoản admin.

**Chỉ xem, không sửa:**
- Không bấm "Hoàn tác" ở danh sách `/admin/import`. Nút đó xoá toàn bộ lần chuyển đổi.
- Không thêm hay sửa dòng nào trong lúc xem.
- Thấy sai thì ghi vào cột "Ghi chú" của phiếu.

### Máy đã kiểm (2026-11-24/25, chỉ đọc)

**Kết quả lưu lúc import (10/11).** Đây là ảnh chụp lúc ghi, chưa tính các thay đổi sau đó.

| Mục | Kết quả |
|---|---|
| Lỗi chặn của run #7 | 0 |
| Xác nhận bắt buộc của run #7 | 17/17 đã xác nhận: 1 tách CDC, 2 phiếu không có tiền, 8 cặp, 6 neo V1 |
| V1, neo Excel | 17/23 neo khớp. 6 neo lệch đều đã được xác nhận lúc import |
| V2, đầu kỳ 2026 = Số Dư | 83/91 cặp khớp. 8 cặp còn lại lệch Số Dư, lúc import đã chọn "Chọn lũy kế dù lệch" |
| V3, lũy kế = CSV | 48/48 cặp |
| V4, "Lấy Hàng" sau mốc đã ghép phiếu | 11/11 |

**Đối chiếu độc lập (25/11).** Máy đọc lại các file Excel bằng chương trình riêng, không dùng bộ đọc của import, rồi so với sổ ERP:
- 23/25 file nguồn còn đúng checksum lúc import. Hai file Mầm Non khác (NCC #53, #52) đã được sửa ngày 12/11 để điền khoản trả 23/07.
- Bảng tiền chi tiết nằm ngoài repo.

| Mục | Kết quả |
|---|---|
| Nhập Liệu 01/01–26/10/2026 | Cả 908 dòng vào ERP đúng từng đồng, cột thực tế và cột HĐ, ở mọi cặp NCC × công trình. Không thiếu, không trùng, không sai cặp. Hai dòng thuế của NCC #6 được ghi thành loại "thuế HĐ", tổng tiền không đổi |
| Số dư đầu kỳ (sheet "Số Dư Ban Đầu") | 32/32 số dư ERP nhận lúc import khớp sheet. Mọi dòng số dư khác 0 đều vào ERP, hoặc thành số dư đầu kỳ, hoặc thành dòng lũy kế CSV |
| Tách CDC | Phần chia của 4 NCC cộng đúng bằng số dư CDC trong sheet. Riêng NCC #45 lệch 273 đồng ở cột HĐ, đã xác nhận lúc import |
| Lũy kế CSV | 46/46 cặp: dòng lũy kế + Nhập Liệu 2026 = CSV ở cả 4 cột (lấy hàng TT, đã trả TT, lấy hàng HĐ, đã trả HĐ) |
| Thay đổi sau import | Mọi dòng sổ bị sửa, xoá hoặc thêm sau import đều đã được liệt kê và truy nguồn (mục dưới). Đều đã có xác nhận của anh/chị, nhóm g–i xác nhận ngày 25/11 |
| Bổ sung Mầm Non (bước 12a) | 14/14 NCC khớp số chốt 16/11 ở cả 4 cột. Sau 16/11 không có thay đổi nào ở Mầm Non |
| DT-HĐ-TT Mầm Non | `after.sql` trùng kết quả chạy thử. DT-HĐ có 30 dấu ✓, không có ✗. DT-TT có ✓ ở cả 47 dòng. HĐ-TT có hai dòng kiểm đều ✓ |
| Dữ liệu thử | Đã xoá qua app ngày 24/11 (xem phase 3). Các lần thử ngày 11–12/11 đã được khôi phục từ bản sao lưu, không còn dòng nào |

Máy chỉ chứng minh ERP giữ đúng những gì file Excel ghi. Máy không biết file Excel có đúng với thực tế không, và không biết các lần gộp tên hay chọn ngày có đúng không. Những phần đó nằm trong bảng kế toán kiểm.

### Thay đổi sau import (10–16/11/2026)

| # | Thay đổi | Khi nào, cách làm | Căn cứ | Trạng thái |
|---|---|---|---|---|
| a | Chốt kỳ 27/10–26/11 cho các phiếu sau mốc của 6 cặp: NCC #4 × Dải cây xanh, NCC #4 × Mầm non GĐ2, NCC #5 × Dải cây xanh, NCC #5 × Trại Chuối, NCC #6 × Trại Chuối, NCC #1 × Trại Chuối | 10/11 và 13/11, qua app | Bước 12 của runbook. Phiếu lấy từ Excel (V4) | Kỳ chưa ký. Khi nhập bù không nhập lại các phiếu 27–31/10 này |
| b | NCC #1 × Mầm non Trại chuối: thay 10 dòng lấy hàng tháng 3/2026 và số dư đầu kỳ theo bảng gạch thực tế | 11/11, script | Anh/chị xác nhận 11/11, runbook bước 2 | Đã xác nhận |
| c | NCC #47 × Mầm non: bổ sung tiền thực tế cho dòng lấy hàng 31/07 | 12/11, script | Anh/chị xác nhận 12/11 | Đã xác nhận |
| d | NCC #54 × Mầm non: thêm 2 khoản trả ngày 21/09 | 12/11, script | Anh/chị xác nhận 12/11 | Đã xác nhận |
| e | Gộp "346 Cát Dài" vào "326 - Lô 34": dòng lũy kế của 4 NCC chuyển công trình, số tiền giữ nguyên. Công trình 346 Cát Dài bị xoá mềm | 12/11, script | Anh/chị quyết định 12/11 | Đã xác nhận |
| f | Bổ sung Mầm Non (bước 12a) | 13/11 và 16/11, script | Bản đối chiếu với file đội 13–17/11 | Đã xác nhận, 14/14 khớp |
| g | NCC #1 × Dải cây xanh: sửa phiếu trong kỳ chuyển đổi. Gạch m² tách thành hai loại Terazo (Kệ, Dẫn Hướng). Đổi đơn giá gạch viên ngày 17/10 và 22/10. Phiếu 28/10 và 31/10 cũng tách hai loại. Hệ thống tự tạo 4 báo giá theo các giá mới | Sáng 11/11, tài khoản admin, qua app, trong lúc thử tính năng sửa phiếu | Khác file theo dõi của NCC #1 ở Dải cây xanh: file ghi một loại gạch m² và giá cũ. Ngày 21/10, tổng hai loại sau khi tách ít hơn file 4,8 m². Nợ tại 26/10 thấp hơn neo V1 của file | Anh/chị xác nhận đúng ngày 25/11. ERP là số đúng, file theo dõi chưa cập nhật |
| h | Hai phiếu NCC #1 ngày 27/10 (mỗi phiếu 5.400 viên): xoá khỏi Dải cây xanh, nhập lại ở Trại Chuối với đơn giá khác | 11–12/11, tài khoản admin, qua app | Ngày 12/11 anh/chị nói đây là hai lần giao thật cho Trại Chuối. File theo dõi ghi chúng ở Dải cây xanh | Anh/chị xác nhận đúng ngày 25/11 |
| i | NCC #1 × Trại Chuối: một khoản chuyển khoản ngày 24/10 | 12/11, tài khoản admin, qua app | Excel bản 05/11 không có khoản này | Anh/chị xác nhận đúng ngày 25/11 |

Nhóm g, h, i do tài khoản admin nhập trên app, và anh/chị đã xác nhận ngày 25/11 đó là số thật. Kế toán vẫn xem các cặp NCC #1 × Dải cây xanh và NCC #1 × Trại Chuối có khớp sổ của mình không, rồi ghi vào cột Ghi chú của mục 7.

### Kế toán kiểm

Đánh dấu một ô ở cột Kết quả cho mỗi dòng. Cột "Máy kiểm" ghi phần máy đã làm (25/11) và phần còn lại cho người.

| # | Kiểm gì | Ở đâu | Đạt khi | Máy kiểm (25/11) | Kết quả | Ghi chú |
|---|---|---|---|---|---|---|
| 1 | 6 neo V1 lệch | `/admin/import/7`, mục 7, bảng V1 (cột "Kết quả", "Chênh") | Mỗi neo lệch là do chính file Excel tự mâu thuẫn (ví dụ nhãn gộp), không phải ERP thiếu dòng | ERP không thiếu dòng nào so với Nhập Liệu. 4/6 neo đã giải thích được: NCC #4 có hai file (Dải cây xanh, Trại Chuối), cộng lại bằng đúng nợ ERP của NCC #4. NCC #53 và #52: file đã điền khoản trả 23/07 ngày 12/11, nay khớp ERP. **Còn 2 neo cần người xem:** file "hết 30.4.26" của NCC #5 (file cũ, dừng ở 30/04), NCC #2 × Trại Chuối (dính khoản 346 Cát Dài) | Đạt | |
| 2 | Ánh xạ tên NCC và công trình | `/admin/import/7`, mục 3 "Ánh xạ tên" | Các tên gom lại đúng là cùng một NCC hoặc công trình, kể cả các nhóm lần chạy thử 09/11 còn ngờ (NCC #44, #47, #49, #69 và #70) và Chủ thể «Công Ty Quản Lý» | Máy không quyết được. Các lần gộp đáng xem nhất: hai tên nguồn khác gộp vào NCC #44; một tên nguồn trong CSV gộp vào NCC #61; một tên nguồn gộp vào NCC #49; hai nhãn công trình trong CSV gộp vào Trại Chuối. Tên nguồn cụ thể xem ở mục 3 của trang | Đạt | |
| 3 | Tách CDC | `/admin/import/7`, mục 4 | Phần CDC dồn đúng công trình | Số học đạt: phần chia của 4 NCC cộng đúng bằng số dư CDC. Chọn công trình CDC nào nhận phần nào: người xem | Đạt | |
| 4 | 8 cặp lệch Số Dư đã xác nhận | `/admin/import/7`, mục 5 "Duyệt từng cặp", và danh sách "loại trừ" dưới V2 ở mục 7 | Với từng cặp, đúng là lấy lũy kế CSV thay cho Số Dư | Cả 8 cặp chỉ lệch ở **cột HĐ**; nợ thực tế khớp. 2 cặp của NCC #45 lệch dưới 300 đồng (làm tròn). **6 cặp lệch HĐ thật**, kế toán so với sổ hoá đơn: NCC #5, #1, #6, #2, #4 (cùng ở Trại Chuối) và NCC #57 × Mầm non | Đạt | |
| 5 | 9 ngày mơ hồ | `/admin/import/7`, mục 6 | Ngày đã chọn đúng theo chứng từ gốc | Máy không có nguồn thứ ba. Người xem | Đạt | |
| 6 | 2 cặp có phiếu mà không có tiền | `/admin/import/7`, mục 7, bảng V1: hai file của NCC #77 và #78 ở Dải cây xanh. Mở mục 10 để xem phiếu | Đúng là hai cặp này chỉ theo dõi phiếu, không phát sinh công nợ | Đạt về dữ liệu: hai NCC không có dòng nào trong Nhập Liệu, Số Dư hay CSV; ERP không có dòng sổ nào, phiếu vẫn được theo dõi. Có nên phát sinh nợ hay không: người xem | Đạt | |
| 7 | Kiểm tay (bước 11 của runbook) | `/vat-tu-ncc/cong-trinh/<id>` cho 3 cặp NCC × công trình kế toán nắm rõ nhất | Nợ ở "Kỳ chuyển đổi (khóa)" 01/01–26/10/2026 bằng số trong Excel | Máy đã so **mọi** cặp: Nhập Liệu, Số Dư và CSV đều vào ERP đúng từng đồng lúc import. Hiện nay chỉ các cặp có thay đổi sau import (mục a–i) khác Excel bản 05/11. Kế toán vẫn kiểm 3 cặp quen để đối chiếu với sổ của mình, nên chọn ít nhất một cặp không nằm trong mục a–i | Đạt | |
| 8 | Tổng hợp công nợ theo công trình | `/cong-no-vt/tong-hop-cong-trinh`, kiểu "Năm 2026" và "Toàn bộ" | Cuối kỳ TT / HĐ của Năm 2026 bằng "Còn nợ" của kiểu Toàn bộ, và bằng Excel | Người xem màn hình và bản xuất Excel | Đạt | |
| 9 | Bổ sung Mầm Non | `/vat-tu-ncc/cong-trinh/4` (Mầm Non Trại Chuối GĐ1) | 14 NCC của bản đối chiếu 13–17/11 khớp số chốt 16/11 trong file đội Mầm Non | Đạt: 14/14, không có thay đổi sau 16/11 | Đạt | |
| 10 | Ba báo cáo DT-HĐ-TT | `/du-an/4/dt-hd-tt/dt-hd`, `/dt-tt`, `/hd-tt` | Tổng trên màn hình bằng file đối chiếu, mọi dòng kiểm đều ✓ | Đạt (24/11) | Đạt | |

### Kết luận của người duyệt

- [x] **Đồng ý** dùng số trên bản sao làm số go-live. Không chạy lại import trên admin-pc.
- [ ] **Chưa đồng ý.** Lý do và việc cần sửa:

Người duyệt (chức danh): kế toán phụ trách công nợ vật tư. Anh/chị báo kết quả lúc khoảng 11 giờ ngày 25/11/2026: kế toán đồng ý, không có mục nào không đạt.

**Đóng băng (11:09 ngày 25/11/2026):**
- Sao lưu bản sao: `erp-prod-20261125-1109.dump`, có tệp SHA-256 kèm theo, bằng `scripts/backup-erp-vietpc.ps1`.
- Đăng xuất mọi phiên: bảng `sessions` còn 0 dòng.
- Dừng container app `ngoquyen-bansao-erp`. Container dùng chính sách `unless-stopped`, nên vẫn dừng sau khi Docker khởi động lại. Cơ sở dữ liệu `ngoquyen-bansao-pg` vẫn chạy cho bản sao lưu hằng đêm.
- Từ giờ đến lúc chuyển không ghi gì thêm vào bản sao.

**Nhập bù sau khi chuyển (phase 5):**
- Import dùng file Excel lưu ngày 05/11. Vì vậy phần phải nhập bù là mọi dòng kế toán thêm vào Excel sau bản đó, kể cả dòng có ngày trước 26/10, không chỉ các dòng có ngày sau 26/10.
- Không nhập lại những gì ERP đã có: các phiếu đã chốt kỳ ở mục a, hai phiếu ở mục h, khoản ở mục i, và phần bổ sung Mầm Non.
- Máy có thể so file Excel hiện tại với bản 05/11 để liệt kê đúng các dòng mới.

## Phần B. Chuyển sang production (phase 4)

Điền lúc chuyển.

| Mục | Giá trị |
|---|---|
| Thông báo người dùng, khoá Excel | |
| Dump cuối trên admin-pc (tên tệp, SHA-256) | Bỏ, theo quyết định của anh/chị ngày 25/11: không làm gì trên admin-pc nữa |
| Dừng `ngoquyen-erp-3001` trên admin-pc | Bỏ, theo cùng quyết định. App cũ vẫn chạy ở `admin-pc:3001`; thông báo cho người dùng phải ghi không dùng địa chỉ đó |
| Dump cuối trên VIETPC (tên tệp, SHA-256) | `erp-prod-20261125-1136.dump`, `C05986AC3A442505C963859DC9B6F1311C0A2AB4FD8A4609E96E6B17CE520B00` (25/11 11:36) |
| Chuẩn hoá checksum migration | 3 migration (không phải 2), cùng nội dung, chỉ khác xuống dòng. Sau khi sửa: 62/62 khớp file LF của `6863630` |
| Chạy `ngoquyen-prod-erp`, `migrate status`, `/api/health` | Chạy từ 25/11, image `6863630`, chỉ mở ở `127.0.0.1:3001`. Trạng thái migration kiểm bằng SQL: 62/62 đã áp dụng, không thiếu, không lạ. `/api/health` ok |
| Kiểm nhanh khi module còn đóng | Đạt (25/11): trang đăng nhập, hai trang công nợ vật tư, ba báo cáo DT-HĐ-TT "Kiểm tổng: 79/79 khớp". Thử tải tệp chuyển sang phase 5, vì chưa có tài khoản nhân viên để giao việc |
| Mở lại module (giờ) | 25/11 12:51: Dự án xây dựng, Vật tư / NCC, Công nợ vật tư, Thanh toán – Kế hoạch, Thanh toán – Tổng hợp. Công nợ nhân công và Tài chính vẫn đóng, chờ anh/chị quyết. Dump trước khi lưu `erp-prod-20261125-1250.dump` (SHA-256 `C10528109A7C5A6CC15D3FEFAE6C02E9514BDB418D90E2C419998A30ECFA8A76`); dump mốc sau khi mở `erp-prod-20261125-1251.dump` (SHA-256 `C8E074A328AFD9B0B78DC0E1510515E7A7950CD5F1BE1387950B7FDA27DA8D0A`) |
| `tailscale serve`, địa chỉ mới gửi người dùng (giờ) | Bật 25/11 12:52, chỉ trong tailnet; `http://vietpc:3001/api/health` trả `ok`. Chính sách Tailscale thêm luật cho VIETPC cổng 3001 lúc 15:51; anh/chị đăng nhập được từ máy khác lúc 15:54. Địa chỉ gửi người dùng là `http://vietpc:3001`. Chưa gửi: chờ tạo tài khoản nhân viên (phase 5) |
| Người duyệt ký nhận mở lại | |
