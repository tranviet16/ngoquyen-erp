---
title: "Phase 4: Nghiệm thu trên bản dev và tài liệu"
status: todo
priority: P2
effort: "0.5d"
dependencies: [2, 3]
---

# Phase 4: Nghiệm thu trên bản dev và tài liệu

## Overview

Chạy migration trên bản dev, đổi loại ba NCC nhân công, đối chiếu số trước / sau trên mọi màn đã sửa, rồi cập nhật hướng dẫn sử dụng. Không chạm production.

## Môi trường

- CSDL dev: `ngoquyen-dev-pg` (127.0.0.1:5434), file env ở `C:\Users\tranv\.ngoquyen-dev\`. Server dev qua `scripts/serve-local-build.mjs` (cổng 3002 / 3003). Theo `docs/operations/deploy.md`.
- **Không dùng** 5433 / 3001: đó là production.
- Integration test dùng CSDL tạm ở cổng 5435, chạy từ PowerShell.

## Files

- Modify: `docs/user-guide/admin.md` (Danh mục NCC: trường Loại và cách đổi)
- Modify: `docs/user-guide/ke-toan.md` mục 3.7, 3.8 và báo cáo tháng / chi tiết (bộ lọc Loại NCC)
- Modify: `docs/user-guide/can-bo-vat-tu.md` (nếu mô tả màn công nợ vật tư) và phần Thanh toán của hướng dẫn liên quan (dòng nhân công)
- Modify: `docs/project-changelog.md`
- Không ghi tên NCC hay số tiền vào bất kỳ file nào trong repo.

## Implementation Steps

1. Backup bản dev (`pg_dump -Fc`) ra thư mục ngoài repo, ghi đường dẫn vào báo cáo phase.
2. Áp migration bằng `npx prisma migrate deploy` với `DATABASE_URL` của bản dev; `npx prisma migrate status` báo không còn migration chờ.
3. Ghi số **trước khi đổi loại** (loai bỏ trống) trên bốn màn công nợ vật tư, cùng kỳ "Toàn bộ" và kỳ năm hiện tại: tổng TT / HĐ từng màn. Ghi `md5(signedSnapshotJson::text)` của kỳ đối chiếu #696–#699.
4. Trên giao diện, admin đổi NCC #67, #68, #69 sang "Nhân công".
5. Kiểm tra:
   - tổng "Tất cả" bằng số ở bước 3;
   - tổng "Vật tư" + "Nhân công" bằng "Tất cả" ở cả bốn màn và ba file Excel;
   - lọc "Nhân công" chỉ ra NCC #67, #68 (NCC #69 không có số liệu, ẩn khi bật "ẩn dòng 0");
   - hash `signedSnapshotJson` của #696–#699 không đổi; không có dòng mới trong `ledger_transactions` hay `ledger_opening_balances`;
   - audit log có ba dòng sửa `suppliers`.
6. Thanh toán (trên bản dev, đợt thử): thêm dòng `nhan_cong` cho NCC #67 ở công trình có số dư, công nợ tự điền bằng số dư sổ vật tư; duyệt + đóng đợt và thấy đúng một dòng `thanh_toan` trong sổ vật tư; ô chọn NCC của dòng `vat_tu` không còn hiện NCC #67, #68. <!-- Updated: Validation Session 1 - đóng đợt ghi sổ dòng nhân công đã chốt --> Sau đó khôi phục bản dev từ backup ở bước 1 để dọn dữ liệu thử.
7. Đổi ngược #67–#69 về "Vật tư" (hoặc khôi phục backup) và xác nhận mọi màn như bước 3.
8. Cập nhật hướng dẫn sử dụng và changelog.
9. Chạy lại toàn bộ: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:integration`.

## Todo

- [x] Backup + migrate bản dev
- [x] Ghi số trước khi đổi
- [x] Đổi loại + đối chiếu bốn màn và Excel
- [x] Thử thanh toán nhân công, khôi phục bản dev
- [x] Hướng dẫn sử dụng + changelog
- [x] Bộ kiểm tra đầy đủ xanh

## Success Criteria

- Mọi kiểm tra ở bước 5–7 đạt, kết quả ghi vào `reports/` của plan (chỉ `NCC #id`, chỉ ghi "khớp / không khớp", không ghi số tiền).
- Hướng dẫn sử dụng mô tả trường Loại, bộ lọc Loại và dòng thanh toán nhân công.

## Ngoài phạm vi (bước sau, cần người dùng đồng ý)

- Triển khai production theo `docs/operations/deploy.md`: backup production, `prisma migrate deploy`, đổi loại NCC #67–#69 trên production, đếm chỉ-đọc dòng `nhan_cong` thiếu công trình trước khi bật.
