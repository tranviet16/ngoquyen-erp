# Triển khai "Dự án đọc sổ công nợ vật tư" lên production — 27/11/2026

Kết quả: production trên VIETPC chạy `ngoquyen-erp-vietpc:ad3583f` (merge của PR #42) từ 09:49 (giờ Bangkok). Không có migration. Không đổi trạng thái module, vì `du-an`, `cong-no-vt` và `vat-tu-ncc` đã `ready` từ đợt cutover. Dữ liệu trước và sau triển khai giống hệt.

Người dùng chọn (27/11): "Triển khai và mở module".

Repo công khai: chỉ ghi mã công trình, mã băm và số dòng; không ghi số tiền, tên hay giá trị biến môi trường.

## Kiểm tra chỉ-đọc trước khi triển khai

Chạy trong phiên `default_transaction_read_only=on`, bằng `psql` trong container CSDL:

| Kiểm tra | Kết quả |
|---|---|
| Module | `du-an`, `cong-no-vt`, `vat-tu-ncc` là `ready`; `cong-no-nc` vẫn `development`. Không cần đổi. |
| Quyền mặc định theo vai trò | `can-bo-vat-tu`, `ke-toan`, `giam-doc`, `xem-bao-cao` có cả `du-an` và `cong-no-vt`. `chi-huy-cong-truong` có `du-an` nhưng không có `cong-no-vt`: thấy tổng công nợ từng NCC (như tab Hợp đồng), còn Giao Dịch chỉ có Sổ dự án kèm thông báo. Đúng quy tắc quyền đã chốt 26/11. |
| Người dùng | 3 tài khoản, đều vai trò admin, 1 đang hoạt động. Không có quyền riêng theo người dùng cho ba module này. |
| Công trình có sổ dự án | Chỉ #4 (279 dòng), và #4 cũng có 367 dòng sổ vật tư. Không công trình nào có công nợ NCC chỉ nằm trong sổ dự án, nên tab Công Nợ NCC không bị rỗng ở đâu. |
| Migration | Repo 63, đã áp 63, không có bản lỗi hay rollback. Không cần `migrate deploy`. |

## Các bước

1. **Backup:** `C:\Users\tranv\ngoquyen-prod-backups\erp-prod-20261127-0924.dump`, chạy bằng `scripts/backup-erp-vietpc.ps1`.
   - 7.250.015 byte, `pg_restore -l` đọc được.
   - SHA-256 bắt đầu `B7705B89A2C25238`, tệp `.sha256` để cạnh bản dump.
2. **Dấu vân tay chỉ-đọc:** số dòng và md5 của:
   - `ledger_transactions`, `ledger_opening_balances`, `project_transactions`, `supplier_delivery_daily`;
   - trạng thái module;
   - số migration.
3. **Build** `ngoquyen-erp-vietpc:ad3583f` từ worktree sạch ngoài OneDrive (`C:\Users\tranv\ngoquyen-prod-build`, detached ở `ad3583f`). Giữ image `c7dbf1c` để rollback.
4. **`docker compose -p ngoquyen-prod … up -d --no-build`** với `RELEASE_TAG=ad3583f`. Tệp env production được docker compose đọc sau khi người dùng cho phép; không in ra giá trị nào.

## Kiểm tra sau triển khai

| Kiểm tra | Kết quả |
|---|---|
| Container | `ngoquyen-erp-vietpc:ad3583f`, 0 lần khởi động lại |
| `/api/health` | `{"status":"ok","db":"ok"}` |
| `/login` | 200 |
| `/du-an/1/cong-no`, `/du-an/1/giao-dich` khi chưa đăng nhập | 307 (chuyển về đăng nhập) |
| Dấu vân tay sau triển khai so với trước | Giống hệt |
| Log app 5 phút đầu | Không có dòng lỗi |
| Công Nợ NCC so với `/cong-no-vt/chi-tiet` "Toàn bộ" lọc công trình, đăng nhập admin | #1 (11 NCC), #4 (26 NCC), #14 (6 NCC): hàng tổng và từng NCC khớp cả 8 số, không lệch |
| Giao Dịch | #1 "Sổ công nợ vật tư (490 dòng)", #14 109 dòng, #4 367 dòng kèm "Sổ dự án (279 dòng)". Mặc định mở sổ công nợ. Không có thông báo lỗi đọc sổ. |

## Rollback (chưa cần dùng)

- **App:** `docker compose -p ngoquyen-prod -f docker/docker-compose.erp-vietpc.yml up -d --no-build` với `RELEASE_TAG=c7dbf1c`, chạy từ worktree build. Đợt này không đổi schema hay dữ liệu, nên chỉ cần thay app.
- **CSDL:** không cần khôi phục. Bản dump ở bước 1 chỉ để dự phòng.

## Việc cho người vận hành

- Báo kế toán: số HĐ ở tab Công Nợ NCC của #4 giờ lấy từ sổ Công nợ vật tư, không còn từ sổ Hóa đơn, nên khác số trước đây (xem hướng dẫn kế toán, mục "Công nợ vật tư trong trang Dự án").
- Khi tạo tài khoản vai trò `chi-huy-cong-truong`: muốn họ xem từng dòng sổ ở Giao Dịch thì cấp thêm quyền đọc `cong-no-vt`.
