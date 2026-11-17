# Kết quả chạy thử bản phát hành 1 trên bản sao (17/11/2026)

**Kết luận:** import file đội vào MNTC-GD1 trên bản sao VIETPC khớp với file ở cả 10 mục kiểm. Ba báo cáo trên màn hình và file Excel xuất ra đều khớp với file. Hoàn tác trả về đúng số liệu nền, trùng md5. Lần chạy đầu tìm ra hai lỗi; cả hai đã được sửa, và lần import lại đã kiểm bản sửa. Production chưa bị đụng tới.

Runbook production: [production-runbook.md](production-runbook.md).

## Môi trường

- Bản sao VIETPC: dữ liệu ngày 09/11, container `ngoquyen-bansao-pg` / `ngoquyen-bansao-erp`, `localhost:3001`.
- Code: nhánh `feat/du-an-dt-hd-tt` merge vào nhánh bản sao, kèm hai bản sửa ở mục "Lỗi tìm thấy". Image `docker-erp-3001:ban-sao-du-an-dt-hd-tt-2`.
- File: bản sao của `Can Doi Vat Tu 2.xlsx` ngày 17/11, SHA-256 `af0e6ff1…7621`.
- Sao lưu trước khi migrate: `C:\Users\tranv\.ngoquyen-ban-sao\backups\bansao-truoc-du-an-dt-hd-tt-20261117.dump`.
- Migration `20261117160000_du_an_dt_hd_tt` áp được, không sửa dòng nào.

## Trình tự

1. Ghi số liệu nền (`baseline.sql`).
2. Lưu Cài đặt MNTC-GD1.
3. Tạo NCC Chương Dương và LPP.
4. Run #8: import và ghi.
5. Kiểm màn hình và file xuất. Tìm ra hai lỗi.
6. Hoàn tác run #8, so với số liệu nền.
7. Sửa hai lỗi, build lại image.
8. Run #10: import lại và ghi.
9. Kiểm lại: MST, đối soát khối, file xuất, các tab cũ.

Run #9 được tạo nhầm loại file ("Bảng cân đối vật tư"), đọc được 0 dòng. Run này chỉ ở bước xem trước, không được ghi.

Run #10 hiện vẫn **đã ghi** trên bản sao, để người dùng có thể xem màn hình.

## Màn duyệt

- 343 dòng dự toán, 279 dòng hóa đơn, 257 dòng thực tế nhập, 118 khoản chi, 42 đầu mối, 380 dòng ánh xạ.
- 28 NCC trong file:
  - 8 NCC tự gắn theo MST hoặc tên;
  - 18 NCC gắn tay theo bảng ở mục 6 của runbook;
  - Chương Dương và LPP gắn theo MST, sau khi đã tạo hai NCC này.
- Ba mục cần xác nhận:
  - `cells:v1:24`: 24 khoản chi ở Chi Thực Tế dòng 112–145 không có ngày, được nhập với ngày trống;
  - `replace-ptx:v1:4:117:4464590631.40`: thay 117 giao dịch cũ;
  - `dt-sync:v1:4:22:55256957`: 22 thay đổi dự toán.
- Tỷ lệ Phần III: lần xem trước đầu tiên bị chặn vì Cài đặt chưa đúng file. File dùng 7,3 / 1,1 / 2,5 / 5,5 %, không phải 7 / 1 / 3 / 6 % như phase 8 ghi. Đã lưu VAT 0,08 và 0,073 / 0,011 / 0,025 / 0,055.

### Mục 5 "Kiểm" (giống nhau ở run #8 và run #10)

| Mục | File | Tính lại |
|---|---:|---:|
| DT-TT tổng A (NCC) | 6.531.555.277 | 6.531.555.277 |
| DT-TT tổng B (nhân công) | 1.984.224.628 | 1.984.224.628 |
| DT-TT A + B | 8.515.779.905 | 8.515.779.905 |
| Phần III chi phí trực tiếp T | 8.428.489.474 | 8.428.489.474 |
| Phần III tổng dự toán Gxd | 10.650.193.786 | 10.650.193.786 |
| HĐ-TT tổng HĐ gồm VAT | 6.237.094.910 | 6.237.094.910 |
| HĐ-TT tổng thực nộp | 5.736.878.767 | 5.736.878.767 |
| HĐ-TT tổng thực tế | 6.652.018.280 | 6.652.018.280 |
| HĐ-TT tổng đã lấy về | 368.652.484 | 368.652.484 |
| DT-HĐ Σ HĐ trong nhóm + Phần B = sổ Hóa đơn | 5.737.591.704 | 5.737.591.704 |

## Số liệu DB (`baseline.sql` và `after.sql`)

| Mục | Trước import | Sau run #10 | Sau hoàn tác run #8 |
|---|---|---|---|
| `ledger_transactions` | 1040, md5 `cdaff11a…cfb0` | 1040, cùng md5 | 1040, cùng md5 |
| Giao dịch / dự toán của công trình khác | 0 / 0 | 0 / 0 | 0 / 0 |
| Giao dịch sống MNTC-GD1 | 117, Σ HĐ 4.464.590.631,40, md5 `bfc87484…` | 279, tất cả sinh từ sổ, Σ HĐ 5.737.591.704,43 | 117, cùng Σ, cùng md5 |
| Dự toán sống MNTC-GD1 | 362, Σ 8.373.232.517, md5 `55f5ba45…` | 361, Σ 8.428.489.474,67 | 362, cùng Σ, cùng md5 |
| Bị thay (`supersededByRunId`) | – | 117 giao dịch, 20 dự toán | 0 |
| Sổ của công trình | 0 | 279 dòng hóa đơn (Σ 5.737.591.704,43), 257 thực tế nhập, 118 khoản chi, 42 đầu mối | 0 |
| NCC có MST | 8 / 50 | 28 / 50 | (MST được giữ, xem bên dưới) |

- Σ HĐ của giao dịch sinh từ sổ bằng đúng Σ dòng hóa đơn, và số giao dịch bằng số dòng hóa đơn.
- Dự toán sống = Phần III T của file.
- Kết quả đầy đủ trong scratchpad của phiên (`p8-baseline-before.txt`, `p8-after-import.txt`, `p8-after-rollback.txt`, `p10-after-import.txt`, `p10-mst-after.txt`).

`after.sql` dùng trên bản sao (thay `4` bằng id công trình, `10` bằng số run):

```sql
select 'tx_p4_live', count(*), sum("amountHd"), count(*) filter (where "sourceInvoiceLineId" is not null) from project_transactions where "projectId" = 4 and "deletedAt" is null;
select 'tx_p4_superseded', count(*), sum("amountHd") from project_transactions where "projectId" = 4 and "supersededByRunId" = 10;
select 'est_p4_live', count(*), sum("totalVnd") from project_estimates where "projectId" = 4 and "deletedAt" is null;
select 'est_p4_superseded', count(*) from project_estimates where "projectId" = 4 and "supersededByRunId" = 10;
select 'invoice_lines', count(*), sum("amountVnd"), sum("vatVnd") from project_invoice_lines where "projectId" = 4 and "deletedAt" is null;
select 'receipts', count(*), sum("amountVnd") from project_actual_receipts where "projectId" = 4 and "deletedAt" is null;
select 'payments', count(*), sum("bankVnd" + "cashVnd") from project_cash_payments where "projectId" = 4 and "deletedAt" is null;
select 'counterparties', count(*) from project_counterparties where "projectId" = 4 and "deletedAt" is null;
select 'suppliers_mst_filled', count(*) from suppliers where "taxCode" is not null and "taxCode" <> '';
```

## Màn hình và file xuất

- **DT-HĐ:**
  - 29 khối, tất cả dòng đối soát khối đều ✓, và dòng kiểm tổng ✓;
  - file Excel: 873 dòng, 30 dòng "Khớp", 0 dòng "Lệch", các số là kiểu số.
- **DT-TT:**
  - tổng A, B, A + B và Phần III khớp file;
  - kiểm Phần I "✓ ở cả 47 dòng";
  - ghi chú "Thực tế nhập chưa gắn đầu mối 657.987.498".
- **HĐ-TT:**
  - 28 dòng NCC, hai dòng kiểm ✓;
  - 1 dòng "tạm = HĐ".
- Excel DT-TT và HĐ-TT: các tổng khớp với màn hình.

### In A4 ngang

Hộp thoại in của trình duyệt không chụp được. Vì vậy đã giả lập: áp đúng CSS `@media print` của app (A4 ngang, lề 8 mm, chế độ "Vừa ngang" + "Gọn") lên màn hình ở bề rộng 281 mm (~1.047 px), rồi đo.

Giả lập tìm ra bốn lỗi, có trước tính năng này, cả bốn đã sửa:
1. **Sidebar không bị ẩn khi in.** CSS in ẩn `[data-sidebar]`, nhưng sidebar hiện dùng `data-slot="sidebar"`. Nó chiếm 272 px bên trái trên mọi trang có nút in. Đã thêm `[data-slot="sidebar"]` vào danh sách ẩn.
2. **Chế độ tối:** chữ màu kem trên giấy trắng, vì trình duyệt không in nền. Đã thêm: khi in, `.dark` dùng bảng màu sáng.
3. **`main` là vùng cuộn** (`overflow: auto`, bị giới hạn chiều cao), nên khi in có thể bị cắt mất phần dưới. Đã đặt `overflow: visible` cho `main` khi in.
4. **Số bị ngắt giữa chừng** (390 ô ở DT-HĐ, ví dụ "115.644.189" trong cột 41 px). CSS in cho mọi ô ngắt ở bất kỳ đâu. Đã thêm class opt-in `print-nowrap` cho ô số của ba báo cáo.

HĐ-TT có 13 cột tiền: ở 100 %, cột tên NCC bị ép còn 1–2 ký tự. Khi in, báo cáo này giờ được thu nhỏ còn 80 %; file đội in sheet này ở 61 %.

Đổi tiêu đề cột I của HĐ-TT (màn hình và Excel) từ "Đã trả (H ?? G)" thành "Đã trả (H, chưa rà soát thì G)".

Kết quả giả lập sau khi sửa:

| Báo cáo | Bảng tràn khổ | Số bị ngắt | Số trang ước tính |
|---|---|---|---|
| DT-HĐ | 0 / 30 | 0 / 2.482 | ~17 |
| DT-TT | 0 / 3 | 0 / 1.034 | ~4 |
| HĐ-TT (80 %) | 0 / 1 | 0 / 284 | ~2; tên NCC tối đa 3 dòng |

Người dùng đã xem bản xem trước in A4 ngang thật của ba báo cáo trên bản sao (image `-3`) và xác nhận in đẹp (17/11).

## Các tab cũ của MNTC-GD1 (sau run #10)

- **Giao dịch:**
  - hiện băng "Công trình này có sổ Hóa đơn: 279 dòng giao dịch sinh từ sổ là chỉ đọc ở đây. Sửa ở sổ Hóa đơn";
  - HĐ 5.737.591.704, TT 0.
- **Cân đối VT:** tổng dự toán 8.428.489.475; "Đã lấy HĐ" 5.737.591.704 (68,1 %), bằng Σ dòng hóa đơn.
  - "Thực tế đã nhập" là 0, vì giao dịch sinh từ sổ chỉ mang tiền HĐ.
  - Thực tế của bản phát hành 1 nằm ở báo cáo DT-TT và HĐ-TT.
- **Định mức:** 361 hạng mục (= dự toán sống). Cột "TT SL" lấy số lượng của hóa đơn mới.
- **Công nợ NCC:** 28 NCC; "Lấy hàng HĐ" 5.270.589.388.
  - Tab này chỉ cộng giao dịch loại `lay_hang` / `giao_vat_lieu`. Nó bỏ `may_moc` (10 dòng, 330.885.650) và `nhan_cong` (3 dòng, 136.116.666).
  - Cộng lại: 5.270.589.388 + 330.885.650 + 136.116.666 = 5.737.591.704.
  - Cách cộng này có từ trước, không phải thay đổi của lần này.

## Lỗi tìm thấy và đã sửa

1. **Cột "Điền MST" không được ghi.**
   - Màn duyệt báo sẽ điền MST cho NCC, nhưng lúc ghi không điền gì.
   - Bản sửa: khi ghi, điền MST vào NCC đang trống MST. Không điền khi NCC đó được gắn với hai MST khác nhau, hoặc MST đã thuộc NCC khác. Cột "Điền MST" trên màn duyệt dùng đúng quy tắc này.
   - Kết quả run #10: 20 NCC được điền, từ 8 lên 28 NCC có MST.
   - Hoàn tác không gỡ MST; đây là dữ liệu nền.
2. **Đối soát từng khối DT-HĐ báo ✗ ở 14/29 khối, trong khi file có 31/31 "✓ Khớp sổ Hóa Đơn".**
   - Nguyên nhân: ERP so tổng HĐ của NCC với cộng nhóm của khối. Cộng nhóm có cả HĐ của NCC khác gán vào nhóm này, và thiếu HĐ ngoài dự toán.
   - Bản sửa, theo đúng file: tổng HĐ do NCC xuất = phần trong nhóm của khối + ngoài dự toán + phần ở nhóm của khối khác. HĐ của NCC khác nằm trong nhóm của khối được hiện riêng.
   - Có test trên file thật: mọi khối đều ✓.

Cả hai bản sửa có test đơn vị: 7 tệp, 51 test pass khi có file thật.

## Sự cố khác

Docker Desktop tự khởi động lại lúc 19:12, trong lúc đổi container. Container chạy lại trên image -2, dữ liệu còn nguyên.

## Chưa kiểm

- **Từ chối hoàn tác run cũ** khi đã có run mới thay giao dịch. Trình tự chạy thử này không tạo ra tình huống đó; test tích hợp của phase 2 đã kiểm.

Sau hai bản sửa đã chạy lại:
- bộ test đơn vị: 126 tệp, 1.237 test pass;
- hai tệp test tích hợp DT-HĐ-TT trên Postgres tạm, với file thật: 10 test pass.

Chưa chạy lại toàn bộ bộ test tích hợp.

## Câu hỏi còn mở

- Production có cùng 117 giao dịch / Σ HĐ 4.464.590.631,4 cho MNTC-GD1 không? Màn duyệt sẽ cho biết; runbook yêu cầu đối chiếu với số liệu nền của production.
- Có nên cho tab Công nợ NCC cộng cả máy móc và nhân công khi công trình có sổ Hóa đơn không? Hiện tab này vẫn theo quy tắc cũ.
