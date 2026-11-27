# Kiểm tra triển khai — Dự án đọc sổ công nợ vật tư (27/11/2026)

Nhánh `feat/du-an-doc-so-cong-no-vt`, chưa commit. Code của cả 4 phase đã viết xong. Kiểm tự động đều xanh. Phần kiểm tay trên giao diện dev chưa làm vì không có server dev chạy và cần tài khoản đăng nhập của chủ đầu tư.

## Kiểm tự động

| Kiểm | Kết quả |
|---|---|
| `npx tsc --noEmit` | sạch |
| `eslint` trên mọi file đã sửa | sạch |
| `npx vitest run --project unit` | 180 file, 1835 test xanh (gồm `module-release-entrypoints`, `project-service-acl-contract`, 3 file test mới của `lib/du-an/project-ledger/`) |
| Integration toàn bộ trên Postgres tạm 127.0.0.1:5435 (`DATABASE_URL` truyền tường minh, in cổng trước khi chạy) | 32 file, 202 test xanh, gồm `du-an-so-cong-no-vt` (8 test, khẳng định a–f) và `du-an-hop-dong-tie-out` (sau khi tách vị từ phiếu chưa chốt) |
| `next build` (biến môi trường giả, DB 5435) | xem mục cuối |

## Tie-out trên DB dev (5434, chỉ đọc)

`npx tsx scripts/verify-project-ledger-tie-out.ts`: với mọi công trình có sổ vật tư, so công nợ từng NCC và tổng của lớp mới với Σ dòng báo cáo lũy kế toàn bộ (gọi riêng, không lọc công trình), và so Σ (số dư đầu kỳ + dòng sổ của lưới) theo Chủ thể với từng NCC. Chỉ ghi mã và số dòng.

| Công trình | Số NCC | Dòng sổ VT | Số dư đầu kỳ | Phiếu chưa chốt | Dòng sổ dự án | Khớp |
|---|---|---|---|---|---|---|
| #1 | 11 | 490 | 1 | 0 | 0 | khớp |
| #2 | 2 | 4 | 0 | 0 | 0 | khớp |
| #3 | 3 | 3 | 0 | 0 | 0 | khớp |
| #4 | 26 | 367 | 0 | 0 | 280 | khớp |
| #14 | 6 | 109 | 0 | 0 | 0 | khớp |
| #15 | 21 | 12 | 18 | 0 | 0 | khớp |
| #16 | 14 | 9 | 11 | 0 | 0 | khớp |
| #17 | 1 | 6 | 0 | 0 | 0 | khớp |
| #18 | 7 | 12 | 1 | 0 | 0 | khớp |
| #19 | 7 | 14 | 0 | 0 | 0 | khớp |
| #21 | 1 | 2 | 0 | 0 | 0 | khớp |

11/11 công trình khớp đến từng đồng. Số dòng của #1 (490 + 1 số dư đầu kỳ), #14 (109) và #4 (280 dòng sổ dự án) đúng như plan. Theo quy tắc nguồn, cả ba công trình đều mặc định mở "Sổ công nợ vật tư" vì sổ có dòng; #4 vẫn chuyển sang "Sổ dự án (280 dòng)" được.

## Làm mới trang sau khi ghi sổ (phase 4 bước 1)

Chưa kiểm trên trình duyệt. Theo code: các trang Dự án đều render động theo phiên (đọc `headers()` / `searchParams`), `next.config.ts` không đặt `staleTimes`, và không có `use cache` / `unstable_cache` / `revalidate` trong `app/(app)/du-an`, `lib/du-an`, `lib/cong-no-vt`. Vì vậy mở tab sau khi ghi ở Nhập liệu, chốt phiếu hay đợt thanh toán sẽ render lại với số mới. Theo đúng plan (chỉ viết helper khi thấy số cũ), chưa thêm `revalidate-project-ledger-views.ts`.

## Lệch so với plan

- `loadProjectLedger` gọi `queryDetailReport` không truyền `partyIds`, rồi lọc NCC trong `buildSupplierBalances`. Lý do: bộ lọc NCC cần danh sách mọi NCC của công trình, và cách này tránh truy vấn thứ hai. Tổng khi lọc vẫn chỉ gồm NCC đang hiện (unit test + integration test a).
- Thêm `lib/du-an/project-ledger/transactions-source.ts` (hàm thuần cho quy tắc `?nguon=`, có unit test). Lý do: file `page.tsx` không export được hàm phụ.
- Thêm `scripts/verify-project-ledger-tie-out.ts` (chỉ đọc), theo mẫu `verify-contract-detail-tie-out.ts`, để đếm lại trước khi nghiệm thu.
- Công tắc nguồn chỉ render khi người xem đọc được dòng sổ. Nếu không, chỉ còn một nguồn nên công tắc không có ý nghĩa.

## Review độc lập

Reviewer (chỉ đọc) xác nhận đủ 6 yêu cầu: không ghi `project_transactions`, không cộng gộp, tổng tính ở server cho đúng tập NCC đang hiện, không lộ dòng sổ cho người thiếu quyền `cong-no-vt`, không vỡ ranh giới server/client, và #4 không hồi quy. Mục "SQL mới chưa chạy" của reviewer đã có lời đáp: integration trên 5435 và tie-out dev ở trên đã chạy trước đó. Các điểm nhỏ đã sửa:

- Mã công trình không phải số nguyên dương thì Công Nợ NCC và Giao Dịch trả 404, không còn lỗi của loader.
- Nhãn "(n dòng)" trên công tắc lấy đúng số dòng của lưới đang nạp.
- Thông báo Dashboard nói đúng điều kiện thật (sổ dự án trống), không còn khẳng định "chưa có dự toán".
- NCC đã xóa mềm khỏi danh mục vẫn hiện số nhưng có ghi chú và không có link "Mở sổ NCC" (trang đó trả 404). Có integration test.
- Bảng Công Nợ NCC rỗng chỉ sang Giao Dịch (Sổ dự án).
- `entry-write-guards.ts`: bỏ `cong-no` khỏi các tab được nuôi bởi giao dịch HĐ sinh từ sổ Hóa đơn, vì tab không còn đọc nguồn đó.

Giữ nguyên, có lý do: lỗi đọc phiếu chưa chốt (mốc chuyển đổi hỏng) vẫn làm lỗi cả tab, giống tab Hợp đồng. Nuốt lỗi sẽ làm số trông như đầy đủ trong khi còn phiếu chưa vào sổ.

## Chưa làm (cần chủ đầu tư hoặc server dev)

- Phase 2 bước 3–5, phase 3 bước 3–5, phase 4 kiểm dev: xem tay #1, #4, #14 trên giao diện; bấm "Mở sổ NCC" của #14; đăng nhập người dùng thử không phải admin; tạm làm `loadProjectLedgerSwitchInfo` ném lỗi để thử cô lập lỗi; tạo / sửa / xóa một dòng sổ dự án.
- Kiểm làm mới trang trên trình duyệt sau từng cách ghi sổ.
- Quyền mặc định `cong-no-vt` trong `role_permissions` trước khi mở module (rủi ro đã ghi ở plan).

## Câu hỏi còn mở

- Trên production có thể có công trình mà công nợ NCC chỉ nằm trong `project_transactions` (bản dev chỉ có #4). Với các công trình đó, Công Nợ NCC giờ hiện bảng rỗng kèm link sang Giao Dịch (Sổ dự án), theo đúng quyết định "nguồn HĐ = sổ công nợ vật tư cho mọi công trình". Nên đếm trên production trước khi mở module.
