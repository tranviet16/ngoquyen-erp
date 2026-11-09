# Báo cáo Phase 8a — Script kiểm kê / dọn, runbook go-live, tài liệu

Ngày: 2026-11-06. Phạm vi: phần không phải hồi quy của phase 8 (không chạy `pnpm test`, không chạy thử, không go-live). Trạng thái: **xong, có điểm cần người dùng xác nhận**. Chưa commit.

## 1. Tệp

Tạo:
- `scripts/vat-tu-cutover-inventory.sql`: chỉ đọc (`BEGIN … REPEATABLE READ, READ ONLY` … `ROLLBACK`). Gồm:
  - mục 1 là điều kiện migrate, sau dọn phải toàn 0;
  - mục 2–10 liệt kê sổ, số dư, phiếu, báo giá, kỳ, đợt thanh toán theo nguồn (import / đợt thanh toán / phiếu / tay), tách ≤ và > 26/10, gồm cả dòng xoá mềm, có danh sách id;
  - mục 11 là cảnh báo; mục 12 đối chiếu id pilot;
  - mục 13 ghi `/tmp/cutover/candidates.csv` theo đúng khuôn `approved.csv`.
- `scripts/vat-tu-cutover-cleanup.sql`: một transaction. Thứ tự:
  1. kiểm schema cũ và `runner_email`;
  2. `LOCK TABLE`;
  3. điều kiện độc lập định nghĩa một lần (`vt_pred_*`);
  4. nạp `approved.csv` bằng `\copy`;
  5. kiểm danh sách duyệt **trùng khít** điều kiện (liệt kê id thiếu / thừa);
  6. kiểm mồ côi (event → phiếu bị xoá, dòng đợt thanh toán chưa duyệt riêng, đợt `vat_tu` còn mở, lệch Chủ thể);
  7. `DELETE … RETURNING` / `UPDATE "projectId"` vào `vt_result`;
  8. so số đã xử lý = số duyệt = số theo điều kiện;
  9. kiểm lại điều kiện migrate;
  10. ghi 1 dòng `audit_logs`;
  11. xuất `/tmp/cutover/cleanup-result.csv` (JSON đủ dòng);
  12. **mặc định ROLLBACK**.
- `reports/go-live-runbook.md`: Phần A chạy thử trên `ngoquyyen_erp_dryrun` với app dev qua `DATABASE_URL`; Phần B 13 bước với lệnh PowerShell / Docker cụ thể; bảng rollback; phụ lục số kỳ vọng, SQL kiểm sau import, khôi phục từ CSV, danh sách chi tiết "(theo kế hoạch)".

Sửa (chỉ phần liên quan; mọi tệp ≤ 800 dòng):
- `docs/system-architecture.md` (417 dòng): mục Vật tư NCC có phạm vi cặp, CHECK, Chủ thể, khoá NCC, guard mốc, marker, dòng lũy kế 26/12/2025, giao diện, import và vòng đời run, adapter (thay dòng backlog `:231`). Sửa thêm câu sai "admin không bỏ qua trạng thái đang phát triển"; code hiện tại cho admin đi thẳng, và runbook đóng module dựa vào điều này.
- `docs/codebase-summary.md` (611 dòng): route tổng hợp, `closeRound` theo cặp (`:214`), mục Import, chốt kỳ / đối chiếu theo cặp (`:263`), migration, bảng model.
- `docs/project-changelog.md`: mục `[2026-11-06]`.
- `docs/code-standards.md`: mục mới "Ghi dữ liệu nghiệp vụ": khoá rồi mới kiểm; adapter fail-fast, có review, một transaction; server action trả `{ ok, … }`.
- `docs/user-guide/{ke-toan,can-bo-vat-tu,admin}.md`: nhập theo công trình, chốt và ký theo cặp, mốc 26/10 và "Kỳ chuyển đổi (khóa)", `/cong-no-vt/tong-hop-cong-trinh`, cột Chủ thể, import cả thư mục, đóng / mở module.

## 2. Kiểm chứng

- **SQL chưa chạy trên DB nào.** Docker Desktop tắt (`docker ps` không kết nối được).
- Đã kiểm cú pháp bằng parser thật của PostgreSQL (`pglast` 8.7 / libpg_query, ngữ pháp PG17), trong venv tạm ở scratchpad:
  - inventory: 22 câu lệnh;
  - cleanup: 42 câu lệnh và 7 thân `DO` (parse dạng PL/pgSQL).
  - Meta-command psql (`\copy`, `\if`, `\o`, `\pset`) chỉ được rà bằng mắt.
- 38 định danh `"camelCase"` trong hai script đều có trong `prisma/schema.prisma` ở HEAD (schema cũ). Script không dùng cột mà migration mới thêm.
- Mọi liên kết và đường dẫn repo mới thêm trong tài liệu đều tồn tại. Các liên kết hỏng còn lại có từ trước (ảnh `../screenshots/*`, `components/sidebar.tsx`, `lib/export/report-service.ts`) và không được sửa.
- Mọi khẳng định trong tài liệu đã đối chiếu với code hiện có. Riêng adapter `vat-tu-chuyen-doi` (phase 7 đang làm, chưa có tệp adapter) được ghi "(theo kế hoạch)".

## 3. Quyết định / lệch so với spec

1. **Điều kiện xoá sổ không loại dòng import.** Spec lấy ví dụ `"importRunId" IS NULL`, nhưng dòng vật tư ≤ 26/10 của các adapter cũ đã gỡ (`cong-no-vat-tu`…) không có công trình. Nếu giữ thì CHECK của migration sẽ chặn. Gán công trình cho chúng thì vi phạm I3 và bị guard độc quyền chặn. Vì vậy điều kiện là `material AND date ≤ 26/10`, với mọi nguồn. Runbook (mục 0.4) yêu cầu người dùng xác nhận.
2. **Xoá mọi phiếu ngày ≤ 26/10.** Quy tắc suy từ D6: file theo dõi đưa vào toàn bộ lịch sử, giữ phiếu cũ sẽ trùng. Cần người dùng xác nhận ở bước 5.
3. Dòng **đã xoá mềm mà thiếu công trình** (> 26/10) bị xoá, không gán. Lý do: CHECK kiểm cả dòng xoá mềm.
4. Báo giá: chỉ xoá note `PILOT%`. Báo giá thật được giữ.
5. Dòng sổ sinh từ đợt thanh toán phải đổi action thành `delete_payment_linked` bằng tay. Đây là cách hiện thực "người dùng duyệt riêng".
6. COMMIT bằng `-v xac_nhan_commit=on` thay vì sửa tệp. Mặc định vẫn là ROLLBACK, và cuối tệp có chú thích rõ.
7. Kết quả `DELETE … RETURNING` ghi ra **một** CSV `target, action, id, row_data(JSON)`, nạp lại được bằng `\copy` + `jsonb_populate_record` (runbook P3).
8. Script dọn dừng (RAISE) nếu còn đợt `vat_tu` mở, hoặc nếu công trình được gán khác Chủ thể của dòng.
9. `lib/import/README.md` có trong danh sách tài liệu của phase 8, nhưng nằm dưới `lib/` (ngoài quyền sửa) nên không đụng. Phase 5 đã cập nhật tệp này. Còn một chỗ sai nhỏ: tệp ghi `adapter-review-components.ts`, tệp thật là `.tsx`.
10. Runbook bổ sung các điểm red-team chưa nêu:
    - build image trước rồi mới dừng app, để downtime ngắn;
    - gắn tag image cũ để rollback app;
    - `prisma migrate resolve --rolled-back` khi migrate lỗi;
    - kiểm `audit_logs` sau giờ sao lưu trước khi khôi phục;
    - bước 12 (chốt kỳ ERP) làm mất khả năng hoàn tác import của cặp đó;
    - yêu cầu toàn bộ người dùng ngừng dùng ERP trong cửa sổ go-live.

## 4. Việc còn lại của phase 8

- Chạy `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` sau khi phase 7 xong.
- Chạy thử (Phần A), ghi `reports/dry-run-result.md`. Lần chạy đầu cũng là lần đầu hai script chạy trên PostgreSQL thật.
- Go-live cùng người dùng; ghi `reports/go-live-result.md`.

## Câu hỏi chưa giải quyết

- Người dùng có đồng ý xoá cả dòng ≤ 26/10 do import cũ ghi, và xoá mọi phiếu ngày ≤ 26/10 (mục 3.1, 3.2)?
- Tệp env và cách đặt biến (`POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, `DATABASE_URL`) cho `docker compose -f docker/docker-compose.erp-3001.yml build` ở lần deploy trước là gì? Trên máy chỉ có `.env.local` / `.env.test`; runbook ghi "xác nhận khi chạy thử".
- Đợt `vat_tu` ở trạng thái `approved` mà chưa chi thì xử lý thế nào? Code không có đường hủy đợt `approved`, và import coi đợt mở là lỗi chặn.
