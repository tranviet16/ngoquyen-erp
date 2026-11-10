# Kết quả chạy thử go-live — 09/11/2026

**Kết luận: đạt.** Toàn bộ quy trình đã chạy trên bản sao dữ liệu thật và trên build hiện tại của `main` (`34f6aaa`): kiểm kê → dọn → migrate → import cả thư mục Excel qua sản phẩm → đối soát → kiểm tay → hoàn tác.
- Đối soát: V2 92/92, V3 41/41, V4 11/11, V1 16/23. 7 neo V1 lệch đều do chính Excel, xem mục 5.
- Trước go-live thật, người duyệt cần quyết các điểm ở mục 8.

Chạy theo [runbook](go-live-runbook.md) Phần A, bước 3–11, và có thêm hai kiểm: guard độc quyền, hoàn tác.

## 1. Môi trường (lệch so với runbook Phần A)

| Runbook | Lần chạy thử này | Lý do |
|---|---|---|
| Sao lưu `docker-postgres-1` trên máy này | Dùng bản export `ngoquyyen-erp-docker-export-20261109-092751.zip`, xuất lúc 09:28 từ máy đang chạy `docker-postgres-1`. Bản export đã kiểm SHA-256 và khôi phục thử. | DB thật không nằm trên máy này: trên máy này không có `D:/docker-data`, và Docker Desktop đã bị reset lúc 08:54. Một bản sao của zip được lưu tại `D:\ngoquyyen-erp-backups\`. |
| DB chạy thử trong `docker-postgres-1` | Container riêng `ngoquyen-dryrun-pg` (127.0.0.1:5434, user `nqerp`, mật khẩu ngẫu nhiên lưu ngoài repo) | Như trên |
| `pnpm dev` | Bản production (`npm run build` + `npm run start`), cổng 3100, `DATABASE_URL` trỏ DB chạy thử | Ở chế độ dev, OneDrive khóa tệp trong `.next` (lỗi `EPERM`) nên route biên dịch hỏng. Ngoài ra Git Bash trên máy này không có `pnpm`. |
| Admin đăng nhập bằng tài khoản thật | Tạo tài khoản admin thử `dryrun-admin@nq.local`, chỉ có trong DB chạy thử | Không dùng mật khẩu thật. Việc đăng ký tài khoản cần `E2E=true`; biến này chỉ bật đăng ký và tắt giới hạn tần suất (`lib/auth.ts`). |
| Bước 8 qua `/master-data` | Dùng SQL | Rút ngắn. Hai việc đã làm: tạo Chủ thể «Lê Văn Huyên», «Lưu Minh Xuân»; gán Chủ thể #2 cho công trình #4; tạo công trình «346 Cát Dài». |
| Ánh xạ 107 khóa trên UI | Ghi bản ánh xạ vào `import_runs.mapping`, rồi bấm **Lưu & tính lại** trên UI | 107 ô chọn là nhiều. Bản xem trước vẫn do sản phẩm tính lại (v2→v4). |

## 2. Khôi phục và kiểm kê (bước 3–4)

- `pg_restore --no-owner --no-acl --exit-on-error` không báo lỗi. Số dòng khớp manifest:
  - `_prisma_migrations` 58, `ledger_transactions` 12, số dư 3, phiếu 9, kỳ 4, báo giá 3;
  - công trình 4, Chủ thể 1, NCC 6, đợt thanh toán 0, người dùng 1.
- `inventory-1`: 31 dòng đề xuất, **toàn bộ là pilot 07/10**, khớp danh sách mục 12 của runbook:
  - 4 kỳ đối chiếu, trong đó 2 kỳ Nam Hương đã ký;
  - 12 dòng sổ, 3 số dư, 9 phiếu, 3 báo giá `PILOT`.
- Không có dòng nào cần `assign`. Không có đợt thanh toán. Các mục 11d, 11e, 11f trống.
- Mục 14: chỉ Nam Hương, Lộc Tài, BT Hải Phòng bị xoá lịch sử; cả ba đều có trong gói Excel, nên không giữ NCC nào.

## 3. Dọn (bước 6) và migrate (bước 7)

- Duyệt `candidates.csv` nguyên trạng.
  - Lần chạy thử (ROLLBACK): bảng TÓM TẮT có ba cột bằng nhau ở cả 9 dòng.
  - Lần ghi thật: có dòng "ĐÃ COMMIT"; `cleanup-result` ghi 31 dòng.
- `inventory-3`: mục 1 = 0 ở cả 10 dòng.
- `prisma migrate deploy`: áp dụng migration `20261106090000_vat_tu_pair_scope_and_import_review`. Bước kiểm trước migrate và 3 CHECK đều qua trên dữ liệu thật. Lệnh báo "Database schema is up to date".

## 4. Import (bước 9)

- Upload thư mục `Quản Lý Công Nợ` qua `/admin/import`: 25 tệp `.xlsx`/`.csv` (0,9 MB), bỏ qua 2 tệp khác. Run #5 tạo ở trạng thái `preview` v1, phân tích khoảng 1 phút.
- Bản v1 khớp P1 của runbook:
  - Nhập Liệu: 922 dòng (771 lấy hàng, 2 thuế HĐ, 146 trả nợ; 11 sau mốc; bỏ 3);
  - Số Dư: 73 dòng; CSV: 59 dòng hợp đồng (bỏ 22);
  - phiếu: 538 sau khử trùng (gộp 32);
  - ngày đã sửa năm: 23.
- Lỗi chặn và cách xử lý qua các phiên bản:

| Phiên bản | Lỗi chặn / chưa xác nhận | Xử lý |
|---|---|---|
| v1 | 116 lỗi: 9 ngày + 107 ánh xạ tên | Ghi ánh xạ (mục 6) và 9 lựa chọn ngày (mục 7) |
| v2 | 2 lỗi + 2 xác nhận | «346 Cát Dài» là công trình chỉ có trong CSV, chưa có Chủ thể → tạo công trình (Ngô Quyền). CDC Đại Ngàn lệch HĐ −273 → dồn vào Tân Lộc CDC. 2 xác nhận `no-money` (Tùng Lâm 5 phiếu, Gia Bảo 29 phiếu ở Dải cây xanh). |
| v3 | 0 lỗi + 7 xác nhận V1 | Xác nhận 7 neo lệch (mục 5) |
| v4 | 0 | **Ghi dữ liệu**: `committed` sau 7 giây; 1.644 dòng nhập, 14 bỏ qua |

- Tách CDC Nam Hương đúng tới từng đồng: Tân Lộc CDC 109.336.700 / 0; ĐVP-CDC 44.600.000 / 27.734.400.

## 5. Đối soát (bước 10)

- **V2** (Đầu kỳ 2026 = Số Dư): 92/92 cặp khớp.
- **V3** (lũy kế = CSV): 41/41 cặp khớp.
- **V4** ("Lấy Hàng" sau mốc đã ghép phiếu): 11/11, đúng danh sách P1 (BT HP TC 28.980.000, Lộc Tài DCX/MN2, Nam Hương DCX ×5, Quang Minh DCX ×3 + TC).
- **V1** (neo Excel): 16/23 khớp, gồm các số kỳ vọng ở P1:
  - Bê tông HP × Trại Chuối: 480.583.111 + 28.980.000 = 509.563.111;
  - Nam Hương nhóm TC + Tân Lộc CDC + ĐVP-CDC: 294.445.120;
  - Quang Minh DCX: 152.160.000;
  - Lộc Tài MN2: 260.380.000 + 1.400.000.

  7 neo lệch, cần người duyệt soát:

  | File | Chênh | Ghi chú |
  |---|---|---|
  | Dải Cây Xanh/Máy xúc Lộc Tài HT - DCX | +92.844.188 | Hai file máy xúc Lộc Tài lệch đúng bằng "Tổng nợ" của nhau: 92.844.188 + 133.150.000 = 225.994.188 = tổng nợ ERP của Lộc Tài ở Trại Chuối + Dải cây xanh. Tiền đúng; khối neo mang nhãn gộp cả hai công trình, nên mỗi file bị so với tổng hai công trình. |
  | Trại Chuối/Máy xúc Lộc Tài HT | +133.150.000 | (như trên) |
  | Mầm Non TC1/Gạch lát Hùng Chi (MN) | −60.000.000 | ERP 5.187.100 tại 26/07 so với Excel 65.187.100 |
  | Mầm Non TC1/Thiết bị điện Việt Đức HP (MN) | −39.523.807 | Liên quan ô B116 không có ngày (chọn tạm 27/06) |
  | Trại Chuối/Quang Minh cát,gạch hết 30.4.26 | −227.200.000 | Neo 26/05 của file cũ; file "đến 26.5.26" thì khớp 97.230.000 |
  | Trại Chuối/Thép Hiệu Trần (chú Hiếu) | −110.563.550 | Neo gộp 4 công trình (TC, MN TC, Tiên Lãng SH, Quán Toan) |
  | Trại Chuối/Xi măng Phương Minh | −24.010.000 | Neo gộp TC, Quán Toan, 346 Cát Dài |

- **P2 (SQL sau import)**:
  - run #5 `committed`, `expected.cutoverDate = 2026-10-26`;
  - **96 marker / 96 cặp**, tất cả đã ký;
  - 0 dòng sổ ≤ 26/10 nằm ngoài run; 0 phiếu lịch sử có event;
  - dòng lũy kế 26/12/2025: 37 `lay_hang`, 27 `thanh_toan`. Số lượng không phải đúng 2 dòng mỗi cặp: cặp không có tiền trả thì chỉ có dòng lấy hàng.
- Danh mục sau import: 42 NCC, 13 công trình (9 công trình tạo mới, mã `CDVT-000x`, đúng Chủ thể), 3 Chủ thể, 133 vật tư.

## 6. Kiểm tay (bước 11)

- `/vat-tu-ncc/cong-trinh/1` (Trại Chuối) → Bê tông HP: nợ **480.583.111 ₫** ở "Kỳ chuyển đổi (khóa)" 01/01–26/10/2026; phiếu cuối ngày 27/10.
- `/cong-no-vt/tong-hop-cong-trinh`, lấy Nam Hương làm ví dụ:
  - **Năm 2026**: cuối kỳ TT 456.421.120 / HĐ 75.966.288, bằng "Còn nợ" của kiểu **Toàn bộ**;
  - **Kỳ chuẩn T1/2026**: đầu kỳ 196.788.320, bằng đầu kỳ Năm 2026. Vậy dòng lũy kế 26/12/2025 nằm ngoài cửa sổ.
- Quang Minh × Xây dựng Dải cây xanh:
  - thêm phiếu ngày 20/10/2026 → toast "thuộc giai đoạn đã chuyển đổi từ Excel (tới hết 26/10/2026)"; số phiếu không đổi (48); hộp thoại vẫn mở;
  - tab **Chốt kỳ** hiện kỳ chuyển đổi 01/01–26/10/2026 và gợi ý **27/10/2026 → 26/11/2026**.
- Bước 12 (chốt kỳ đầu trong ERP) chưa làm, vì Phần A chỉ gồm bước 3–11.

## 7. Kiểm thêm

- **Guard độc quyền**: upload lại cùng thư mục tạo run #6, run này bị chặn với lỗi "Đã có run chuyển đổi #5 đang ở trạng thái đã ghi — hoàn tác run đó trước khi import lại", kèm 18 lỗi theo từng cặp đã có sổ, số dư hoặc kỳ tới 26/10.
- **Hoàn tác** run #5 ở `/admin/import`:
  - có 2 lần hỏi xác nhận; xoá 1.644 dòng (sổ 972, số dư 38, phiếu 538, marker 96); run chuyển `rolled_back`; danh mục được giữ.
  - Sau đó tính lại run #6 thì hết lỗi guard, tức đường import lại đã mở.

## 8. Cần người duyệt quyết trước go-live

1. **Chủ thể**: Excel ghi «Công Ty Quản Lý», DB ghi «Công ty CP Xây dựng Ngô Quyền». Lần chạy thử coi là cùng một Chủ thể, vì công trình Trại Chuối @ Công Ty Quản Lý tự khớp vào Trại Chuối #1, mà #1 thuộc Ngô Quyền.
2. **Gom bí danh NCC** (bảng đầy đủ: [dry-run-mapping-proposal.tsv](dry-run-mapping-proposal.tsv)). Các nhóm chưa chắc chắn:
   - «Công ty Kim Khí» + «Cty CPTM Kim khí TT (Ô Hiếu)»: lần chạy thử gộp làm một. «Ô Hiếu» có thể là Hiệu Trần.
   - «Quang Minh (chống thấm)»: lần chạy thử để riêng, khác Quang Minh cát/gạch.
   - «Cty Phương Vũ camera» và «Công ty Phương Vũ»: gộp làm một.
   - «Ông Phương (nhân công)» và «Ô Phương (Máy lu)»: để riêng.
3. **9 ngày** (theo chứng từ gốc):
   - 7 ô mơ hồ; lần chạy thử chọn cách đọc nằm trong khối 27/09→26/10;
   - Cát xây Quang Minh (MN) B20 «3,4,5/4/2026»: lần chạy thử chọn 03/04;
   - Việt Đức (MN) B116: lần chạy thử chọn 27/06.
4. **7 neo V1 lệch** ở mục 5. Riêng hai file máy xúc Lộc Tài: nếu xác nhận nhãn gộp là đúng thì chỉ cần `ack`.
5. **Phiếu không có tiền**: Tùng Lâm (5 phiếu) và Vận chuyển Gia Bảo (29 phiếu) ở Dải cây xanh có trong file theo dõi nhưng không có dòng tiền.
6. **CDC Đại Ngàn** HĐ −273: lần chạy thử dồn vào Tân Lộc CDC.
7. **«346 Cát Dài»** (công trình chỉ có trong CSV): tạo ở bước 8 với Chủ thể Ngô Quyền.

## 9. Sửa runbook

- Phần A: có thể chạy trên bất kỳ máy nào có Docker, từ một bản export đã kiểm. Không bắt buộc dùng `docker-postgres-1` cục bộ.
- Bước 8 phải có thêm: tạo Chủ thể «Lê Văn Huyên» và «Lưu Minh Xuân» **trước khi import**, để gán cho «Mầm Non Trại Chuối GĐ1». Lý do: import chặn khi công trình đã có mà chưa có Chủ thể. Tạo «346 Cát Dài» kèm Chủ thể.
- P4 đã xác nhận:
  - nhãn adapter, các mục của màn duyệt, khóa ánh xạ;
  - mã xác nhận là `ack:<mã>` = 1; quyết định CDC là `cdc:<NCC>@<Chủ thể>` = id công trình;
  - lỗi chặn với công trình chưa có Chủ thể;
  - V1–V4 tính giống nhau ở xem trước và lúc ghi;
  - marker và `expected.cutoverDate`; guard độc quyền.

  Chưa kiểm: tên image `ngoquyen-erp-3001` và cách build (bước 7.1).

## 10. Thời gian thực tế (máy này)

| Việc | Thời gian |
|---|---|
| Khôi phục dump | < 1 phút |
| Kiểm kê, dọn hai lần, kiểm kê lại | khoảng 2 phút |
| Migrate | < 1 phút |
| Upload và phân tích | khoảng 1 phút |
| Mỗi lần "Lưu & tính lại" | khoảng 1 phút |
| Ghi dữ liệu | 7 giây |
| Hoàn tác | vài giây |

Phần tốn thời gian nhất ở go-live thật là **duyệt ánh xạ 107 khóa** và các quyết định ở mục 8. Nên duyệt trước theo bảng đề xuất.

## 11. Dọn sau chạy thử

Dừng app ở cổng 3100. Xoá container `ngoquyen-dryrun-pg` khi không cần đối chiếu thêm. Tài khoản admin thử và mật khẩu DB chạy thử chỉ nằm trong container đó và trong scratchpad của phiên.
