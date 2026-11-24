# Runbook production — Đối chiếu DT-HĐ-TT (bản phát hành 1)

Chỉ chạy khi người dùng đã duyệt deploy. Mọi bước dưới đây là trên **admin-pc** (`docker-postgres-1`, `ngoquyen-erp-3001`, DB `ngoquyyen_erp`, user `nqerp`). Không chạy trên máy VIETPC (bản sao dùng tên container khác để tránh nhầm).

Kết quả chạy thử trên bản sao: [dry-run-result.md](dry-run-result.md).

## 0. Điều kiện trước

- [ ] Go-live công nợ vật tư (`plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md`) đã xong, kể cả bước 12a (bổ sung sổ Mầm Non). Import này thay giao dịch dự án của MNTC-GD1 và đồng bộ dự toán. Nó không đụng sổ công nợ vật tư (`ledger_transactions`), nhưng cần có các NCC mà bước 12a tạo (Tiến Phát, Tiến Đạt, Thanh Tùng, Gia Hưng Thịnh, Phúc An Khang, Văn Toán, kèm MST).
- [ ] Code: nhánh `feat/du-an-dt-hd-tt` đã merge vào nhánh deploy (có migration `20261117160000_du_an_dt_hd_tt`).
- [ ] Bản file đội mới nhất `Can Doi Vat Tu 2.xlsx` đã đóng trong Excel. Chép **bản sao** ra thư mục riêng; import bản sao, không import file gốc.
- [ ] Dùng hàm `Set-ErpDatabaseUrl` và quy tắc bí mật ở mục 0.2–0.3 của go-live runbook. Không in mật khẩu.

## 1. Sao lưu → dừng app → migrate → chạy build mới

> **Đợt phát hành 11/2026 (`plans/261124-0448-production-release-train/`): bỏ qua mục này và không chạy script.** Bước 7 của go-live công nợ vật tư deploy cùng một image và áp cả `20261117160000_du_an_dt_hd_tt`. Sau go-live, làm tiếp từ mục 2 (vẫn ghi số liệu nền trước khi import). Script dưới đây chỉ dành cho trường hợp deploy riêng DT-HĐ-TT trên DB đã go-live. Nó cố ý dừng khi `20261106090000_vat_tu_pair_scope_and_import_review` còn chờ, để không ai migrate công nợ vật tư mà bỏ qua các bước dọn của go-live.

Script [deploy-erp-3001-du-an-dt-hd-tt.ps1](deploy-erp-3001-du-an-dt-hd-tt.ps1) làm các bước dưới đây theo thứ tự. Chạy trên admin-pc: `powershell -ExecutionPolicy Bypass -File .\deploy-erp-3001-du-an-dt-hd-tt.ps1`.
- Bước 1.4 (số liệu nền theo công trình) vẫn làm tay trước khi import.
- Script dừng nếu DB còn chờ migration nào khác `20261117160000_du_an_dt_hd_tt`, và hỏi gõ `DEPLOY` trước khi dừng app.
- Script sao lưu **sau** khi dừng app, nên bản sao lưu khớp đúng trạng thái trước migrate.
- Bản mới không lên thì script tự quay về image cũ.

1. Ghi tên image hiện tại để có thể quay lại:
   ```powershell
   docker inspect -f "{{.Config.Image}}" ngoquyen-erp-3001
   docker tag "<image>:latest" "<image>:truoc-du-an-dt-hd-tt"
   ```
2. Build sẵn image mới, như bước 7.1 của go-live runbook.
3. Sao lưu:
   ```powershell
   $stamp = Get-Date -Format "yyyyMMdd-HHmm"
   docker exec docker-postgres-1 pg_dump -U nqerp -Fc -d ngoquyyen_erp -f "/tmp/truoc-du-an-dt-hd-tt-$stamp.dump"
   docker cp "docker-postgres-1:/tmp/truoc-du-an-dt-hd-tt-$stamp.dump" "<thư mục sao lưu>"
   ```
4. Ghi số liệu nền: chạy `baseline.sql` (mục 5) và lưu kết quả.
5. Dừng app: `docker stop ngoquyen-erp-3001`.
6. Migrate:
   - `npx prisma migrate deploy` chỉ áp `20261117160000_du_an_dt_hd_tt`.
   - Migration này chỉ thêm 7 bảng và các cột null (`supersededByRunId`, `sourceInvoiceLineId`, 4 tỷ lệ Phần III), không sửa dòng nào.
   - Chạy `npx prisma migrate status` trước và sau.
   - Không chạy lệnh nào ghi dữ liệu trước bước 2.
7. Chạy build mới: `docker compose -f docker/docker-compose.erp-3001.yml up -d --no-build`.
8. Smoke test: `/api/health` trả `ok`; đăng nhập admin; tab "Đối chiếu DT-HĐ-TT" của MNTC-GD1 mở được (chưa có dữ liệu, báo cáo trống).

## 2. Cài đặt và NCC

1. `/du-an/<id MNTC-GD1>/cai-dat`: lưu VAT và bốn tỷ lệ Phần III **theo file**.
   - Bản 17/11 của file: VAT 0,08; chi phí chung 0,073; nhà tạm 0,011; việc không xác định KL 0,025; thu nhập chịu thuế tính trước 0,055.
   - Nếu màn duyệt báo lỗi "Lưu Cài đặt…", lưu đúng số màn duyệt đưa ra.
2. Tạo NCC chưa có ở Dữ liệu nền tảng, ghi kèm MST:
   - Công ty TNHH TM và XD Chương Dương, MST 0200904161;
   - Công ty TNHH Phát triển TM LPP, MST 0202329848.

   Hai công ty này xuất HĐ thay Sobek. Trên file đội, mỗi công ty có dòng HĐ-TT riêng, không thuộc đầu mối nào.

## 3. Import qua màn duyệt

1. `/admin/import`: chọn loại "Dự án xây dựng – Đối chiếu DT-HĐ-TT", tải bản sao file lên.
   - Nhìn lại ô loại file ngay trước khi bấm tải lên: ô này tự về "Bảng cân đối vật tư" khi trang tải lại.
   - Nếu run mới ghi adapter khác `du-an-dt-hd-tt`, đừng ghi run đó; tải lại.
2. Mục 1: chọn công trình MNTC-GD1.
3. Mục 2: gắn từng NCC của file với NCC trong ERP.
   - NCC đã có MST tự gắn. NCC chưa có MST phải chọn tay.
   - Gắn theo bảng ở mục 6 (đã đối chiếu số hóa đơn với sổ công nợ trên bản sao).
   - Cột "Điền MST = có": khi ghi, ERP điền MST của file vào NCC đó. Đây là dữ liệu nền, hoàn tác không gỡ.
4. Bấm "Lưu & tính lại". Đọc từng mục cần xác nhận rồi mới tick:
   - `cells`: các ô ngày / tiền không đọc được. Bản 17/11 có 24 khoản chi ở Chi Thực Tế dòng 112–145 không ghi ngày; chúng được nhập với ngày trống.
   - `replace-ptx`: số dòng và Σ HĐ của giao dịch cũ bị thay. Đối chiếu với `tx_p4_live` của số liệu nền. **Không** dùng số của bản sao (117 / 4.464.590.631,4) nếu production khác.
   - `dt-sync`: số thay đổi dự toán và chênh. Bản sao là 22 thay đổi, chênh 55.256.957; xem từng dòng ở mục 4 của màn duyệt.
5. Mục 5 "Kiểm" phải ghi "Tất cả khớp" (10 mục). Nếu có ✗, dừng lại và báo; không ghi.
6. Bấm "Ghi dữ liệu", rồi OK ở hộp xác nhận.

## 4. Kiểm sau import

- Chạy lại `baseline.sql`:
  - `ledger_transactions` phải giống hệt (số dòng và md5);
  - giao dịch dự án và dự toán của công trình khác phải không đổi.
- Chạy `after.sql`:
  - số giao dịch sinh từ sổ Hóa đơn = số dòng hóa đơn;
  - Σ HĐ giao dịch = Σ dòng hóa đơn;
  - dự toán sống = Phần III T của file.
- Ba màn DT-HĐ / DT-TT / HĐ-TT: tổng trên màn hình = file. Tất cả dòng đối soát đều ✓, kể cả dòng đối soát từng khối DT-HĐ.
- Xuất Excel ba báo cáo: tổng là số và bằng tổng trên màn hình.
- Số NCC có MST tăng đúng bằng số dòng "Điền MST = có" của màn duyệt. Trên bản sao: từ 8 lên 28.
- Các tab cũ của MNTC-GD1:
  - Giao dịch hiện băng "Công trình này có sổ Hóa đơn…", dòng sinh từ sổ là chỉ đọc, và tổng HĐ = Σ dòng hóa đơn.
  - Cân đối VT: "Đã lấy HĐ" = Σ dòng hóa đơn. "Thực tế đã nhập" là 0, vì giao dịch sinh từ sổ chỉ mang tiền HĐ; thực tế xem ở DT-TT và HĐ-TT.
  - Định mức hiện số lượng của hóa đơn mới.
  - Công nợ NCC: "Lấy hàng HĐ" chỉ cộng loại lấy hàng, nên thấp hơn Σ dòng hóa đơn đúng bằng phần máy móc + nhân công. Đây là cách tab vốn tính, không phải lỗi.

## 5. Quay lại (rollback)

Theo đúng thứ tự, dừng ở bước nào đủ thì thôi:

1. **Hoàn tác run** ở `/admin/import`, ngay trong build mới.
   - Hoàn tác gỡ sổ, gỡ giao dịch sinh ra, và khôi phục đúng tập giao dịch / dự toán đã bị thay. Trên bản sao, kết quả trùng md5 với số liệu nền.
   - Hoàn tác bị từ chối nếu ai đã sửa dòng do run ghi. Khi đó sửa lại hoặc khôi phục dump.
   - MST đã điền và NCC đã tạo ở bước 2 được giữ.
2. **Quay build** về image `:truoc-du-an-dt-hd-tt` **chỉ sau khi** đã hoàn tác run. Build cũ không biết cột `supersededByRunId`, nên các dòng bị thay sẽ "biến mất" khỏi màn hình cũ.
3. **Khôi phục dump** bước 1.3 nếu hai bước trên không được.

**Không bao giờ** gỡ migration hay xóa cột khi còn dòng có `supersededByRunId` khác null.

## 6. Bản phát hành 1: file của đội là gốc

- Đội vẫn nhập trên Excel. ERP chỉ hiện báo cáo từ dữ liệu import.
- Muốn sửa số: sửa file → hoàn tác run → import lại bản mới. Cách này chỉ dùng được khi chưa ai sửa dòng đã import trong ERP.
- Từ bản phát hành 2 (nhập trực tiếp trên ERP), import chỉ chạy một lần.

## 7. Bản phát hành 2: nhập trực tiếp trên ERP

Bản phát hành 2 thêm sáu màn nhập liệu: Hóa đơn, Thực tế nhập, Chi thực tế, Ánh xạ, Đầu mối, Mã nhóm. Deploy như mục 1, không có migration mới.

1. **Chốt ngày chuyển:** thống nhất với đội một ngày; từ ngày đó file "Cân đối vật tư" của công trình bị **đóng băng** (chỉ đọc, lưu bản cuối vào thư mục dự án).
2. **Import lần cuối** bản file đã đóng băng theo mục 3 (hoàn tác run cũ trước nếu file đã đổi so với lần import trước).
3. **Thông báo** cho đội và kế toán: từ ngày chuyển, mọi hóa đơn / thực tế / khoản chi nhập trên ERP; gửi kèm [hướng dẫn sử dụng](../../../docs/user-guide/doi-chieu-dt-hd-tt.md). NCC mới phải nhờ admin tạo.
4. **Không import lại** công trình này nữa. Ngay khi có một dòng nhập hoặc sửa trên màn hình, hoàn tác run import bị từ chối (đã kiểm trên bản sao) — sửa tiếp trên màn hình.
5. Kiểm sau ngày chuyển: nhập một dòng mỗi sổ, gán một tên mới, xem ba báo cáo và tab Giao dịch / Cân đối VT như mục 4.

Công trình chưa từng import mà còn giao dịch HĐ cũ: màn Hóa đơn từ chối thêm dòng cho tới khi import file của công trình đó (tránh cộng HĐ hai lần ở các tab cũ).

### Bảng gắn NCC (MNTC-GD1, đã kiểm trên bản sao 17/11)

| NCC trong file (MST) | NCC trong ERP | Căn cứ |
|---|---|---|
| Bê tông và XD Hải Phòng (0200758915) | Công ty TNHH Bê Tông Hải Phòng | HĐ 89 / 169 / 232 nằm ở NCC này trong sổ công nợ (không phải Bê tông Tân Lộc) |
| XD và Vật tư Quang Minh (0202159096) | Công ty TNHH XD&VT Quang Minh | trùng tên |
| TM XD Quang Minh Hải Phòng (0201770961) | Quang Minh (chống thấm) | HĐ 999 nằm ở NCC này |
| TM Vật tư Kim Khí TT (0201132341) | Thương Hiệu Trần | HĐ 146; quyết định 10/11 "Kim Khí = Thương Hiệu Trần (chú Hiếu)" |
| Sobek Việt Nam (0201864585) | Sơn Sobek | trùng tên |
| Chương Dương (0200904161), LPP (0202329848) | NCC mới (bước 2.2) | chưa có trong ERP |
| Đại Ngàn, Nhôm Kính HK, Hùng Chi, Việt Đức, Anh Thư, Đá Việt Hà, Đất Việt Phát, Phương Minh, Phương Vũ, Hoàng Yến, Kế Hằng, Đông Yên, Điện cơ | NCC trùng tên rút gọn | gợi ý đầu tiên của màn duyệt |
| Nam Hương, Lộc Tài HT, Tiến Phát, Tiến Đạt, Thanh Tùng, Gia Hưng Thịnh, Phúc An Khang, Văn Toán | tự gắn theo MST / tên | — |

### SQL kiểm

`baseline.sql` (chạy trước và sau, kết quả phải giống nhau, trừ hai dòng `tx_p4_live` / `est_p4_live`):

```sql
select 'ledger_transactions', count(*), md5(string_agg(l::text, '|' order by l.id)) from ledger_transactions l;
select 'tx_other_projects', count(*), md5(string_agg(concat_ws(',', id, "projectId", date, "itemName", qty, "amountHd", "amountTt", "deletedAt"), '|' order by id)) from project_transactions where "projectId" <> <id>;
select 'est_other_projects', count(*), md5(string_agg(concat_ws(',', id, "projectId", "itemName", qty, "totalVnd", "deletedAt"), '|' order by id)) from project_estimates where "projectId" <> <id>;
select 'tx_p4_live', count(*), sum("amountHd"), md5(string_agg(concat_ws(',', id, date, "itemName", qty, "amountHd", "amountTt"), '|' order by id)) from project_transactions where "projectId" = <id> and "deletedAt" is null;
select 'est_p4_live', count(*), sum("totalVnd"), md5(string_agg(concat_ws(',', id, "itemName", qty, "totalVnd"), '|' order by id)) from project_estimates where "projectId" = <id> and "deletedAt" is null;
```

`after.sql`: số dòng và tổng của `project_invoice_lines`, `project_actual_receipts`, `project_cash_payments`, `project_counterparties` cho công trình; số giao dịch có `sourceInvoiceLineId`; số dòng có `supersededByRunId = <run>`. Bản dùng trên bản sao nằm trong [dry-run-result.md](dry-run-result.md).

Chạy SQL theo cách của go-live runbook mục 0.3: chép tệp vào container và dùng `psql -f`. Không dùng `-c` từ PowerShell.
