---
phase: 6
title: "Chạy thử trên bản sao, tài liệu, runbook"
status: completed
priority: P2
effort: "3h"
dependencies: [5]
---

# Phase 6: Chạy thử trên bản sao, tài liệu, runbook

## Goal
Phase này giao ba thứ, và người làm không đụng vào production:
- bằng chứng cho từng tiêu chí AC1 đến AC9 trên bản sao `localhost:3001`, có một phần đối chiếu độc lập với nguồn ngoài hệ thống;
- hướng dẫn cho người dùng;
- runbook để chủ hệ thống tự triển khai lên production.

## Files to Create / Modify
- Create: `plans/261118-1016-danh-muc-hop-dong-du-an/reports/dry-run-ban-sao-danh-muc-hop-dong.md`
- Create: `plans/261118-1016-danh-muc-hop-dong-du-an/reports/go-live-runbook-danh-muc-hop-dong.md`
- Modify: tệp hướng dẫn module Dự án trong `docs/user-guide/` (tìm tên tệp lúc làm).
- Modify: `docs/system-architecture.md`, chỉ khi tài liệu này đang liệt kê bảng.

## Tasks & Steps
1. Dựng lại image 3001 theo cách đang dùng (worktree build + patch), gắn tag `ban-sao-hop-dong`, giữ image cũ. Container phải có volume `/data/uploads` từ Phase 1.
2. **Chụp dump sau migrate.** Trước khi nhập bất kỳ dữ liệu thử nào, chạy `pg_dump -Fc` ra `bansao-sau-migrate-hop-dong-20261118.dump`. Mọi lần dọn dữ liệu thử dùng dump **này**, không dùng dump của Phase 1.
3. **AC8.** Dòng hợp đồng kiểu import đã chèn ở Phase 1 phải hiện `valueVnd` ở ô "Giá trị theo DT", và `status` "Chờ ký".
4. **AC1, AC2: hợp đồng NCC.**
   - Tạo hợp đồng NCC ở dự án 1 và dự án 4. Ở mỗi dự án, so từng số trên màn hợp đồng với `/cong-no-vt` (công nợ lũy kế, lọc theo dự án đó).
   - **Đối chiếu độc lập:** chọn một cặp có file Excel gốc trong `Quản Lý Công Nợ/Theo Dõi Vật Tư/` (ví dụ Gạch Nam Hương × Trại Chuối). So tổng lấy hàng và tổng chuyển tiền, ghi chênh lệch và lý do nếu có.
   - Chụp màn hình.
5. **AC3: hợp đồng đội và CĐT.**
   - Điền `ownerInvestor` cho dự án thử; bản sao có 0/12 dự án đã có giá trị này.
   - Tạo hợp đồng đội và hợp đồng CĐT. Nhập thử: một giao dịch nhân công, một nghiệm thu có giá trị CĐT, một dòng `cdt_to_cty`, một dòng `cty_to_cdt`, một hóa đơn CĐT, và một hóa đơn điều chỉnh âm.
   - Kiểm các số; kiểm băng lệch `contractValue`.
6. **AC5.** Tạo hợp đồng thứ hai cùng NCC, kiểm băng gộp.
7. **AC6.** Thử scan với ba vai: admin, edit, read. "Xem" PDF trên Chrome và trên Edge. Thử tệp khoảng 24MB.
8. **Quyền sổ.** Tài khoản có `du-an` nhưng không có `cong-no-vt` chỉ thấy các tổng.
9. **AC2.** Chạy lại `scripts/check-contract-detail-tie-out.ts`, ghi kết quả "N/N".
10. **Dọn dữ liệu thử.** Khôi phục `bansao-sau-migrate-hop-dong-20261118.dump`, xóa tệp thử trong thư mục uploads của bản sao. Làm bước này **sau cùng**.
11. **Runbook production.** Chủ hệ thống tự chạy, theo thứ tự:
    1. Đếm `project_contracts` theo `docType` và theo `status`.
    2. `pg_dump -Fc`.
    3. Tạo thư mục uploads trên host, cấp quyền cho uid 1001, thêm vào lịch sao lưu cùng các bản dump.
    4. Cập nhật `docker-compose.prod.yml` (volume và `UPLOAD_DIR`), rồi recreate container.
    5. Ghi thử một tệp vào `/data/uploads`.
    6. `prisma migrate deploy`.
    7. Kiểm nhanh: tạo một hợp đồng, tải một scan khoảng 15MB, xem PDF.
    8. Theo dõi dung lượng thư mục uploads.

    Rollback: rollback build trước. Chỉ chạy `rollback-danh-muc-hop-dong.sql` khi thật cần, và phải xuất CSV trước. Ghi rõ ngoại lệ build cũ không đổi được `docType` của hợp đồng đã gắn đối tác.
12. **Hướng dẫn người dùng.** Viết phần "Hợp đồng dự án", gồm:
    - cách gắn đối tác;
    - ý nghĩa và nguồn của từng con số, kể cả việc loại thuế HĐ, chuyển tiền tính theo số HĐ, và phiếu chưa chốt kỳ;
    - quyền xem chi tiết sổ;
    - cách nhập sổ hóa đơn CĐT (có ký hiệu, có số âm);
    - cách tải, xóa và xóa vĩnh viễn scan.

## Verification
- Cổng xanh:
  - `pnpm prisma validate`
  - `pnpm exec tsc --noEmit`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:integration`
  - `pnpm risk:verify`
  - script tie-out trên bản sao
- Báo cáo dry-run có một dòng bằng chứng cho mỗi tiêu chí AC1 đến AC9, cộng kết quả đối chiếu độc lập với Excel.
