# Dry-run trên bản sao — Danh mục hợp đồng dự án

Ngày 2026-11-18, trên bản sao VIETPC `localhost:3001` (DB `ngoquyen-bansao-pg`, dữ liệu export 09/11). Production (admin-pc) không bị đụng.

**Kết quả:** đạt đủ AC1 → AC9. Mọi dữ liệu thử đã được dọn, và bản sao đã chạy lại image cũ.

## Môi trường

- **Image thử:** `docker-erp-3001:ban-sao-hop-dong`, build thẳng từ worktree `du-an-danh-muc-hop-dong-d92348` (main `420047c` + thay đổi của plan), giữ lại để dùng tiếp.
  - Không build bằng worktree `C:\Users\tranv\ngoquyen-bansao-du-an` như các lần trước, vì worktree đó đang có thay đổi staged của phiên khác.
  - Hệ quả: image này không có các tính năng chỉ có ở nhánh local (Vật tư NCC sửa kỳ khóa…). Không ảnh hưởng các luồng được thử ở đây.
- **Container:** `--network ngoquyen-bansao -p 127.0.0.1:3001:3000 --env-file app.env -e UPLOAD_DIR=/data/uploads -v C:\Users\tranv\.ngoquyen-ban-sao\uploads:/data/uploads`.
  - Lúc thử, container cũ được giữ ở trạng thái dừng với tên `ngoquyen-bansao-erp-truoc-hop-dong`.
  - Thử xong đã trả về tên `ngoquyen-bansao-erp`, chạy image `ban-sao-dinh-kem-task` với cùng mount.
- **Dump:**
  - `backups\bansao-truoc-danh-muc-hop-dong-20261118.dump`: trước migrate, đã có dòng hợp đồng kiểu import.
  - `backups\bansao-sau-migrate-hop-dong-20261118.dump`: sau migrate, trước mọi dữ liệu thử. Lần dọn cuối khôi phục từ dump này.
- **Tài khoản thử** (đều tạo sau dump sau-migrate, nên đã mất khi khôi phục):
  - 4 tài khoản: `hd-admin` (admin), `hd-editor` (sửa du-an P1/P4 + đọc cong-no-vt), `hd-reader` (đọc du-an + đọc cong-no-vt), `hd-duan` (chỉ đọc du-an).
  - Mật khẩu sinh ngẫu nhiên; tệp chứa mật khẩu đã xóa.
  - Lúc thử, module `du-an` / `cong-no-vt` / `cong-no-nc` được tạm đặt `ready`, vì bản sao để `development` (chỉ admin vào được).
- **Pane trình duyệt ẩn:** các thao tác giao diện (form, hộp thoại, tải tệp) được điều khiển bằng JavaScript trên trang thật, không bấm tay.

## Bằng chứng theo tiêu chí

| AC | Kết quả | Bằng chứng |
|---|---|---|
| AC1 | Đạt | Bấm tên hợp đồng trong danh mục `/du-an/4/hop-dong` → mở `/du-an/4/hop-dong/2`, đủ 5 phần (Thông tin + scan, Giá trị, Ba danh sách, Công nợ, Phần chưa thực hiện). Tương tự `/du-an/1/hop-dong/3`. |
| AC2 | Đạt | (a) Màn HĐ NCC Nam Hương × MNTC-GD1: TT đầu kỳ 0, lấy hàng 300.587.760, đã chuyển 200.000.000, còn 100.587.760; HĐ 0 / 254.670.000 / 200.000.000 / 54.670.000 — **trùng 8/8 số** với dòng `/cong-no-vt/chi-tiet`. Nam Hương × Trại Chuối: TT 3.473.929.420 / còn 56.168.420; HĐ còn −226.512.852 — trùng dòng báo cáo. (b) Script tie-out: **Vật tư 99/99, Nhân công 1/1** (`reports/tie-out-ban-sao.txt`). (c) Đối chiếu độc lập với Excel: xem mục dưới. |
| AC3 | Đạt | Hợp đồng đội (đội tạo nhanh "+ Tạo mới…" ngay trong form) trước khi nhập: 3 danh sách rỗng, tổng 0. Sau khi nhập thử 1 lấy hàng 15.000.000 (HĐ NC-01) + 1 thanh toán 10.000.000: lấy hàng 15.000.000, hóa đơn 15.000.000, chuyển 10.000.000, còn phải trả 5.000.000. Hợp đồng CĐT ở dự án 1 (không có nguồn): 3 danh sách rỗng. Hợp đồng CĐT dự án 4 sau nhập thử (nghiệm thu 500.000.000; dòng tiền +300.000.000 / −20.000.000; sổ hóa đơn 440.000.000 và điều chỉnh −55.000.000 nhập qua giao diện): A' 500.000.000, B' 385.000.000, C' 280.000.000, còn phải thu 220.000.000 / 105.000.000, HĐ còn phải xuất 115.000.000. Băng lệch `contractValue` (1.200.000.000 vs 1.000.000.000) hiện đúng. |
| AC4 | Đạt | Nhóm 2 HĐ (DT 1.550.000.000, TT chỉ 1/2 có): DT 1.249.412.240 / 1.295.330.000 / 1.350.000.000 (= 1.550.000.000 − 300.587.760 / − 254.670.000 / − 200.000.000); cột TT "Chưa nhập giá trị (1/2 hợp đồng có giá trị)". HĐ đơn: "Vượt 587.760" khi lấy hàng vượt giá trị. CĐT không giá trị: "Chưa nhập giá trị (0/1…)". |
| AC5 | Đạt | Gắn dòng HĐ kiểu import (Chờ ký) vào cùng NCC → danh mục hiện "gộp 2" ở cả hai dòng; màn chi tiết có băng "Công trình có 2 hợp đồng với NCC · Công ty TNHH Nam Hương: … DT 1.550.000.000, TT 280.000.000". |
| AC6 | Đạt | Qua giao diện thật (server action đi qua `proxy.ts`): PDF 0,2 MB, PNG, PDF 24 MiB, PDF **đúng 25 MiB** tải lên được; `.docx` → "«phu-luc.docx»: chỉ nhận PDF, JPG, PNG"; 30 MB → "«qua-lon-30mb.pdf» nặng 30 MB, tối đa 25 MB". Tệp nằm ở volume host `uploads\contract-scans\4\2\`. Tải về / xem: đúng số byte; PDF `?xem=1` inline + CSP không sandbox; PNG `?xem=1` inline + `sandbox`; `nosniff`. Vai đọc: không có nút tải lên / sửa, xem được (200); URL scan với hợp đồng khác → 404; công trình không có quyền → 403. Vai sửa: xóa mềm → tải về 404, payload trang không chứa scan đã xóa; không có nút "Xóa vĩnh viễn". Admin: thấy scan đã xóa, xác nhận "không khôi phục được", tệp bị xóa khỏi volume. Audit: create / view / download / update / delete đều có `userId` đúng người. **Giới hạn:** pane ẩn nên không mở trình xem PDF của Chrome / Edge bằng mắt; chỉ kiểm header. |
| AC7 | Đạt | Giấy phép: form chỉ có một ô "Giá trị (VND)", không có ô đối tác có mã; màn chi tiết chỉ có Thông tin + Bản scan, không có khối số. |
| AC8 | Đạt | Dòng chèn theo đúng bộ cột INSERT của adapter import (Phase 1) hiện `1.250.000.000` ở cột "Giá trị theo DT", trạng thái "Chờ ký"; sửa để gắn NCC thì trạng thái vẫn "Chờ ký". Migration có rollback: vòng `migrate deploy` → `rollback-danh-muc-hop-dong.sql` → `migrate deploy` chạy sạch trên bản sao (Phase 1). |
| AC9 | Đạt | `tsc --noEmit` 0 lỗi; `eslint` sạch; unit 142 file / 1423 test xanh; integration 28 file / 176 test xanh (Postgres tạm tmpfs); `risk:verify`: 13 route + 21 file action. (`pnpm` không cài trên VIETPC, chạy bằng `npm run` — cùng script.) |

**Quyền xem sổ:** tài khoản `hd-duan` (đọc du-an, không có cong-no-vt) thấy các tổng 300.587.760 / 254.670.000 / 100.587.760 và câu "Cần quyền xem Công nợ vật tư để xem từng dòng."; HTML trả về không chứa dòng sổ nào. `hd-reader` (có cong-no-vt) thấy từng dòng.

**Hồi quy:** dashboard dự án vẫn cảnh báo hợp đồng sắp hết hạn; tab Nghiệm thu, Dòng tiền 3 bên, Đối chiếu DT-HĐ-TT mở được (200, không lỗi).

## Đối chiếu độc lập với Excel gốc

Cặp **Gạch Nam Hương × Mầm Non Trại Chuối GĐ1**, tệp `Quản Lý Công Nợ/Theo Dõi Vật Tư/Mầm Non TC1/Gạch Nam Hương (MN).xlsx`, sheet "Đối chiếu công nợ" (đọc từ bản chép, không sửa tệp gốc).

| Khoản | Excel | Màn hợp đồng | Chênh |
|---|---|---|---|
| Lấy hàng từ 01/04/2026 (Σ "Cộng P/S" 5 kỳ) | 178.515.000 | 178.515.000 (10 dòng 02/04 → 10/09) | 0 |
| Chuyển tiền (10/04 50tr, 04/06 100tr, kỳ cuối 50tr) | 200.000.000 | 200.000.000 (10/04, 04/06, 05/08) | 0 |
| Phần trước 01/04/2026 | 84.169.400 (dư nợ 31/03) | 122.072.760 (3 × 8.795.520 tháng 12/2025 + 25/03 52.275.000 + 28/03 43.411.200) | 37.903.360 |
| Còn nợ | 62.684.400 | 100.587.760 | 37.903.360 |

Chênh lệch chỉ nằm ở phần trước 01/04 và đã có lý do: ngày 2026-11-11 người dùng sửa cặp này trên bản sao theo danh sách gạch thực tế của họ (bỏ số dư −17.016.800 và dòng "Kệ gạch" 29/03, thay các dòng tháng 3, thêm ba chuyến 8.795.520 ngày 19/23/25-12-2025). Excel là bản trước lần sửa đó. Phần phát sinh và chuyển tiền sau 01/04 khớp đến từng đồng.

## Sửa trong lúc dry-run

- **Băng "phiếu vật tư ngày chưa chốt" báo nhầm.**
  - Hiện tượng: băng báo 12 phiếu / 178.515.000 đ chưa chốt.
  - Nguyên nhân: các phiếu này là phiếu lịch sử của import chuyển đổi, nằm trong kỳ chuyển đổi đã ký (marker 684), nên theo bất biến của Vật tư NCC sẽ không bao giờ có event.
  - Sửa: `loadPendingDeliveries` bỏ qua phiếu có ngày ≤ mốc chuyển đổi hoặc nằm trong kỳ chuyển đổi của cặp, theo cùng quy tắc với lưới an toàn `period-recon-check-service`. Có thêm integration test. Sau khi build lại, băng không còn hiện.
- **Các sửa theo review độc lập**, đều có test:
  - guard hoàn tác chặn cả sửa thông tin hợp đồng sau commit;
  - hợp đồng đã xóa chỉ chặn khi còn scan, và admin mở được màn của hợp đồng đó để xóa vĩnh viễn;
  - khóa `FOR UPDATE` các hợp đồng của run trước khi kiểm;
  - scan đã xóa chỉ gửi cho admin;
  - upload có try/finally;
  - giới hạn body nâng lên `26mb` (proxy `27mb`), vì tệp đúng 25 MiB cộng phần bao multipart vượt `25mb`;
  - suy MIME theo đuôi khi trình duyệt khai lạ;
  - kiểm ngày chặt;
  - audit lưu đủ bản ghi.

## Dọn dữ liệu

- Đã khôi phục `bansao-sau-migrate-hop-dong-20261118.dump` và kiểm lại sau khi khôi phục:
  - 1 hợp đồng (dòng kiểu import, `pending`, chưa gắn);
  - 0 scan, 0 hóa đơn CĐT, 0 tài khoản thử, 0 dòng nhân công / nghiệm thu thử;
  - module trở lại `development`;
  - migration `20261118120000` vẫn còn.
- Đã xóa `uploads\contract-scans\`, giữ `task-attachments\`.
- Đã gỡ container Postgres tạm `nq-hop-dong-it-pg`.
- Dòng hợp đồng kiểu import của Phase 1 vẫn còn trong bản sao (là bằng chứng AC8). Muốn bỏ thì xóa dòng `project_contracts.id = 1`.

## Câu hỏi còn mở

- Hai mục trong review được quyết theo đúng mục tiêu Phase 1 và tiền lệ `du-an-book-rollback`, không hỏi lại người dùng. Nếu người dùng muốn khác thì cần chốt lại:
  - sửa cột cũ của hợp đồng import thì chặn hoàn tác;
  - hợp đồng đã xóa mềm không còn chặn vì đối tác hay giá trị TT.
