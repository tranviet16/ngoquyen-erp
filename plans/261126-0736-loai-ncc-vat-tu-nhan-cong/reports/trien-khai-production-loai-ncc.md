# Triển khai "Loại NCC" lên production — 26/11/2026

Kết quả: production trên VIETPC chạy `ngoquyen-erp-vietpc:c7dbf1c` (merge của PR #40) từ 16:16 (giờ Bangkok). Migration `20261126090000_supplier_kind` đã áp. Số liệu sổ trước và sau triển khai giống hệt.

Người dùng chọn (26/11): triển khai **ngay**, người dùng **tự đổi** NCC #67–#69 trên giao diện, sửa `.env.test` sang cổng 5435.

Repo công khai: chỉ ghi `NCC #id`, mã băm và số dòng; không ghi số tiền, tên hay giá trị biến môi trường.

## Kiểm tra chỉ-đọc trước khi triển khai

Chạy trong phiên `default_transaction_read_only=on`:

| Kiểm tra | Kết quả |
|---|---|
| Migration `supplier_kind` đã áp? | Chưa (62 migration) |
| Module `cong-no-vt`, `thanh-toan.ke-hoach`, `thanh-toan.tong-hop`, `master-data` | `ready`; `cong-no-nc` vẫn `development` |
| NCC #67, #68 | Không xoá; 0 dòng sổ vật tư, mỗi NCC 2 số dư đầu kỳ |
| NCC #69 | Không xoá; chưa có số liệu |
| Kỳ đối chiếu #696–#699 | Đã ký, có snapshot |
| Sổ công nợ nhân công (`labor`) | 0 dòng |
| Đợt thanh toán | 0 đợt, mọi trạng thái |
| Đối tác sổ vật tư không có dòng `suppliers` | 0 |

Vì không có đợt thanh toán nào, hai rủi ro ghi trong báo cáo nghiệm thu không áp dụng trên production: đợt đã duyệt bị kẹt vì dòng nhân công thiếu công trình, và trừ công nợ hai lần cho khoản đã nhập tay. Câu hỏi cho kế toán về khoản nhập tay được đóng.

## Các bước (mỗi bước có cổng chặn; hỏng là dừng)

1. **Build** `ngoquyen-erp-vietpc:c7dbf1c` từ worktree sạch ngoài OneDrive (`ngoquyen-prod-build`), giữ lại image cũ `6863630` để rollback.
   - Worktree này còn bản CRLF của các migration cũ (checkout trước khi có `.gitattributes`). Đã checkout lại `prisma/migrations` từ git. Mọi tệp migration ở cả hai checkout đều trùng byte với `c7dbf1c`.
2. **Backup ngay trước migrate:** `erp-prod-truoc-loai-ncc-20261126-0915.dump`.
   - 7.248.293 byte, `pg_restore --list` đọc được 108 bảng.
   - SHA-256 `534CE7BB4F12FE1DEBA6F5153D101334BC6CF6AF19A42B83AF0A62BA61058D65`, tệp `.sha256` để cạnh bản dump.
3. **Dấu vân tay chỉ-đọc:** số dòng và md5 của `ledger_transactions`, `ledger_opening_balances`, `supplier_reconciliations`, snapshot #696–#699, `suppliers`, số đợt thanh toán.
4. **`prisma migrate status`:** đúng một migration chờ là `20261126090000_supplier_kind`; không có migration bị sửa, lỗi hay lệch.
5. **`prisma migrate deploy`**, rồi `status` báo "Database schema is up to date!".
   - Chạy từ checkout chính (tệp migration LF, trùng byte với `c7dbf1c`).
   - Biến môi trường production đọc một lần từ tệp env, được người dùng cho phép; không in ra.
6. **`docker compose -p ngoquyen-prod … up -d --no-build`** với `RELEASE_TAG=c7dbf1c`.
   - `/api/health` trả `{"status":"ok","db":"ok"}`.
   - Container chạy, 0 lần khởi động lại.

## Kiểm tra sau triển khai

| Kiểm tra | Kết quả |
|---|---|
| Dấu vân tay sau triển khai so với trước | Giống hệt (9/9 dòng) |
| `suppliers.kind` | 55 NCC đều `vat_tu`; có CHECK `suppliers_kind_check` |
| Migration | 63 |
| `/login` | 200 |
| `/cong-no-vt/tong-hop`, `/master-data/suppliers`, `/thanh-toan/ke-hoach` khi chưa đăng nhập | 307 (chuyển về đăng nhập) |
| Log app 10 phút đầu | Không có dòng lỗi |

## Rollback (chưa cần dùng)

- **App:** `docker compose -p ngoquyen-prod -f docker/docker-compose.erp-vietpc.yml up -d --no-build` với `RELEASE_TAG=6863630`. Cột `kind` chỉ được thêm vào, bản cũ bỏ qua nó, nên không cần gỡ cột.
- **Loại NCC:** đổi lại "Vật tư" trên giao diện.
- **CSDL:** chỉ khôi phục bản dump ở bước 2 khi dữ liệu hỏng thật, vì sẽ mất mọi thứ nhập sau 16:15.

## Đổi loại NCC #67–#69 (người dùng làm trên giao diện, khoảng 16:22)

| Kiểm tra chỉ-đọc sau khi đổi | Kết quả |
|---|---|
| `suppliers.kind` | NCC #67, #68, #69 là `nhan_cong`; 52 NCC còn lại là `vat_tu` |
| Audit log | 3 dòng `update` bảng `Supplier` (#67, #68, #69), gắn người dùng vai trò admin, `kind` sau = `nhan_cong` |
| Dấu vân tay `ledger_transactions`, `ledger_opening_balances`, `supplier_reconciliations`, snapshot #696–#699, số đợt thanh toán | Giống hệt trước triển khai |
| Dòng `suppliers` trong dấu vân tay | Khác: xem ghi chú dưới |
| `/api/health`, log app | ok, không có dòng lỗi |

**Ghi chú về `suppliers`:** người dùng đổi loại qua nút **Sửa**. Form Sửa gửi chuỗi rỗng cho ô trống, nên `taxCode`, `phone`, `address` của ba NCC đổi từ `NULL` sang `''`. Tên không đổi. Đây là hành vi có từ trước của form NCC: giá trị mặc định là `?? ""` và `supplierSchema` lưu nguyên chuỗi. Không phải do thay đổi này gây ra.

Mọi chỗ đọc ba trường này coi `''` như trống, nên không có gì hiển thị hay khớp khác đi:
- thẻ NCC ở `/vat-tu-ncc`;
- tìm kiếm chung;
- dòng tiêu đề bảng đối chiếu (`view.supplierTaxCode ? … : ""`);
- khớp MST khi import DT-HĐ-TT (`COALESCE(TRIM("taxCode"), '') = ''`, `normalizeMst`).

Dữ liệu để nguyên. Việc sửa form và schema để chuẩn hoá chuỗi rỗng thành `NULL` là việc riêng.
