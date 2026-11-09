---
phase: 8
title: "Hồi quy, tài liệu, chạy thử, go-live"
status: pending
priority: P1
effort: "7h + ~3h go-live cùng người dùng"
dependencies: [1, 2, 3, 4, 5, 6, 7]
---

# Phase 8: Hồi quy, tài liệu, chạy thử, go-live

<!-- Updated: Red Team 2026-11-06 — dọn và bù công trình trước migrate; đóng module bằng kỹ thuật; thứ tự dừng → migrate → chạy; chạy thử trên DB tên riêng; sao lưu có -U; script dọn có điều kiện độc lập và lưu kết quả; xuất lại CSV lúc đóng băng -->
<!-- Updated: Validation Session 1 - dữ liệu cũ không phải pilot: xóa dòng ≤ 26/10, gán công trình dòng > 26/10 bằng script có duyệt -->

## Goal

Toàn bộ kiểm tra xanh. Tài liệu đúng với hệ thống mới. Có một lần chạy thử trên bản sao DB thật mang tên riêng. Go-live đi theo runbook: đóng module, sao lưu, kiểm kê, dọn và bù công trình theo danh sách được duyệt, migrate, import qua sản phẩm, đối soát, đóng băng Excel.

## Files to Create / Modify

- Create `scripts/vat-tu-cutover-inventory.sql` (chỉ đọc). Liệt kê theo nguồn (import / phiếu / đợt thanh toán / tay), **gồm cả dòng đã xóa mềm**:
  - sổ vật tư và số dư ban đầu vật tư thiếu công trình, tách ≤ 26/10 và > 26/10;
  - phiếu ngày, báo giá, kỳ đối chiếu (mọi kỳ hiện có đều thiếu công trình);
  - dòng đợt `vat_tu` thiếu công trình, theo trạng thái đợt;
  - đợt `vat_tu` còn mở (`draft` / `submitted` / `approved`);
  - `thanh_toan` từ đợt đã đóng có ngày > 26/10;
  - dòng sổ vật tư ≤ 26/10 đang có (sẽ thay bằng Nhập Liệu).
- Create `scripts/vat-tu-cutover-cleanup.sql`. Toàn bộ chạy trong một transaction:
  - Nạp danh sách đã duyệt vào bảng tạm: id cần xóa, và cặp (id, `projectId`) cần gán công trình.
  - **Mỗi lệnh `DELETE` kèm điều kiện độc lập ngoài danh sách id**, ví dụ `ledgerType = 'material' AND date <= '2026-10-26' AND "importRunId" IS NULL`. Số dòng bị xóa phải bằng số id đã duyệt **và** bằng số dòng thỏa điều kiện; lệch thì `RAISE`.
  - Kiểm dòng mồ côi trước khi xóa: event có `deliveryId` trỏ tới phiếu sắp xóa, hoặc dòng sổ có `paymentRoundItemId` mà người dùng chưa duyệt. Có thì `RAISE`.
  - `DELETE … RETURNING` xuất ra một tệp CSV lưu cùng bản sao lưu. Ghi một dòng `audit_logs` (người chạy, số dòng mỗi bảng).
  - `UPDATE … SET "projectId"` cho các dòng > 26/10 theo danh sách gán.
  - Mặc định kết thúc bằng `ROLLBACK`; người dùng đổi thành `COMMIT` sau khi xem kết quả.
  - Đây là dọn và sửa dữ liệu, không phải nạp dữ liệu (quyết định validate: ngoại lệ được chấp nhận của D7).
- Create `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md`.
- Modify docs:
  - `docs/system-architecture.md` (phần Vật tư NCC, gồm dòng `:231` về adapter): phạm vi cặp, khóa NCC, guard mốc toàn cục, marker chuyển đổi, dòng lũy kế 26/12/2025, adapter `vat-tu-chuyen-doi`, vòng đời run import.
  - `docs/codebase-summary.md` (`:214`, `:263`), `docs/project-changelog.md`, `lib/import/README.md`.
  - `docs/code-standards.md`: adapter fail-fast, có review, ghi trong một transaction; khóa rồi mới kiểm.
  - `docs/user-guide/{ke-toan,can-bo-vat-tu,admin}.md`: nhập theo công trình, chốt và ký theo cặp, trang tổng hợp, import chuyển đổi.

## Tasks & Steps

1. Chạy đủ `pnpm test`, `pnpm test:integration` (Docker Desktop, DB test tắt `fsync`), `npx tsc --noEmit`, `pnpm lint`, `pnpm build`.
2. **Chạy thử**: khôi phục bản sao lưu DB thật vào một DB **tên riêng**, ví dụ `ngoquyyen_erp_dryrun`, trên container Postgres có sẵn. Chạy một app dev trỏ vào DB đó qua `DATABASE_URL` riêng. Không dùng `docker-compose.erp-3001.yml`, vì file này cố định DB thật `ngoquyyen_erp`. Chạy runbook bước 3–11 trên DB chạy thử. Chụp kết quả kiểm kê, dọn và đối soát vào `reports/dry-run-result.md`.
3. Viết tài liệu.
4. Go-live cùng người dùng theo runbook.

## Runbook go-live (dàn ý; bản đầy đủ trong `reports/go-live-runbook.md`)

1. **Điều kiện.** Build xanh; chạy thử đạt; Docker Desktop bật.
2. **Đóng module bằng kỹ thuật.** Chuyển `vat-tu-ncc`, `cong-no-vt`, `thanh-toan` sang trạng thái đang phát triển (cơ chế `released-module-request` trong `lib/acl`). Từ lúc này chỉ admin đang hoạt động vào được. Chốt giờ đóng băng các file Excel; xác nhận file theo dõi đã cập nhật tới giờ đó; **xuất lại CSV "Tổng công nợ"** đúng giờ đóng băng.
3. **Sao lưu.** `docker exec docker-postgres-1 pg_dump -U nqerp -Fc -d ngoquyyen_erp -f /tmp/backup-<ngày>.dump`, rồi `docker cp docker-postgres-1:/tmp/backup-<ngày>.dump .`. Lưu checksum, kiểm bằng `pg_restore -l`. `scripts/backup-db.sh` không chạy được trên Windows.
4. **Kiểm kê.** Chạy `scripts/vat-tu-cutover-inventory.sql`, xuất danh sách cho người dùng.
5. **Duyệt.** Người dùng duyệt:
   - xóa dữ liệu pilot 07/10 (2 kỳ Nam Hương đã ký, phiếu, báo giá, sổ cái, số dư theo `plans/261006-0307-…/reports/pilot-result.md`);
   - xóa mọi kỳ đối chiếu cũ;
   - xóa dòng sổ vật tư ≤ 26/10 không do import (Nhập Liệu thay thế);
   - gán công trình cho dòng > 26/10 thiếu công trình;
   - xử lý từng đợt `vat_tu` còn mở (đóng hoặc hủy qua UI trước bước 6).
6. **Dọn và bù công trình** (DB vẫn ở schema cũ, module đã đóng). Chạy `scripts/vat-tu-cutover-cleanup.sql` với danh sách đã duyệt, đổi sang `COMMIT` sau khi kết quả khớp. Chạy lại kiểm kê: mọi mục phải ra 0.
7. **Deploy.** Thứ tự: dừng container app → `npx prisma migrate deploy` (migration tự dừng nếu còn kỳ cũ hoặc dòng thiếu công trình) → khởi động build mới → smoke test đăng nhập.
8. **Danh mục.** Ở Master data > Công trình:
   - tạo "Tiên Lãng (Việt Úc)" (Lưu Minh Xuân), "Tiên Lãng (SH)" (Lê Văn Huyên), "Tân Lộc CDC", "ĐVP-CDC" (Chủ thể theo dòng CDC trong Số Dư, mặc định Công Ty Quản Lý);
   - gán Chủ thể cho **mọi** công trình sẽ được ánh xạ, kể cả đã xong (Quán Toan, 326 - Lô 34, Trụ sở 149 HBT, Phí khác…).
9. **Import.** `/admin/import` → "Chuyển đổi công nợ vật tư từ Excel (cả thư mục)" → chọn thư mục `Quản Lý Công Nợ`. Lần lượt: ánh xạ → Lưu & tính lại → tách CDC → duyệt cặp → chọn ngày mơ hồ → xem sau mốc, đợt thanh toán, neo → `ack` → Ghi.
10. **Đối soát.** V1–V4 đạt hoặc đã giải thích; ghi vào `reports/go-live-result.md`. Nếu sai: hoàn tác (được phép, vì chưa có kỳ ERP ký), sửa Excel hoặc ánh xạ, import lại.
11. **Kiểm tay.**
    - `/vat-tu-ncc/cong-trinh/<Trại Chuối>`: Bê tông HP có nợ 480.583.111 tại 26/10, cộng phiếu 27/10 chờ chốt.
    - `/cong-no-vt/tong-hop-cong-trinh`: Năm 2026, Kỳ chuẩn T1/2026 và Toàn bộ.
    - Danh sách đối chiếu có "Kỳ chuyển đổi (khóa)".
    - Ghi phiếu ngày 20/10 hiện lỗi khóa.
12. **Kiểm tiếp.** Chốt kỳ 27/10→26/11 cho Quang Minh × DCX. Không có thanh toán trong kỳ thì nợ phải bằng 159.360.000.
13. **Đóng băng Excel và mở lại hệ thống.** Đặt Excel chỉ đọc, lưu bản lưu trữ kèm checksum. Chuyển 3 module về trạng thái phát hành. Thông báo từ đây ERP là nguồn.

**Rollback vận hành:**
- Trước bước 13: hoàn tác import trong `/admin/import`, hoặc khôi phục bản sao lưu bước 3 cùng build cũ (chỉ sửa tiến sau migrate).
- **Sau bước 13 không khôi phục bản sao lưu**, vì sẽ xóa dữ liệu các module khác ghi sau giờ đó. Sai lệch sửa bằng `dieu_chinh`.

## Verification

- `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` đều xanh.
- `reports/dry-run-result.md`: kiểm kê sau dọn ra 0, migrate thành công, V1–V4 đạt hoặc có giải thích.
- Người dùng ký nhận `reports/go-live-result.md`.
