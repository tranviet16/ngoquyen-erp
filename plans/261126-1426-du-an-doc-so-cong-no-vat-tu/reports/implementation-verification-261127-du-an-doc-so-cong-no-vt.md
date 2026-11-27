# Kiểm tra triển khai — Dự án đọc sổ công nợ vật tư (27/11/2026)

Nhánh `feat/du-an-doc-so-cong-no-vt`, PR #42. Code của cả 4 phase đã viết xong, kiểm tự động đều xanh, CI của PR xanh. Đã kiểm tay trên giao diện dev (mục "Kiểm tay trên bản dev").

## Kiểm tự động

| Kiểm | Kết quả |
|---|---|
| `npx tsc --noEmit` | sạch |
| `eslint` trên mọi file đã sửa | sạch |
| `npx vitest run --project unit` | 180 file, 1835 test xanh (gồm `module-release-entrypoints`, `project-service-acl-contract`, 3 file test mới của `lib/du-an/project-ledger/`) |
| Integration toàn bộ trên Postgres tạm 127.0.0.1:5435 (`DATABASE_URL` truyền tường minh, in cổng trước khi chạy) | 32 file, 202 test xanh, gồm `du-an-so-cong-no-vt` (8 test, khẳng định a–f) và `du-an-hop-dong-tie-out` (sau khi tách vị từ phiếu chưa chốt) |
| `next build` | thành công |

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

## Kiểm tay trên bản dev (27/11, server bản build tại 127.0.0.1:3003, CSDL 5434, đăng nhập admin)

Trước khi ghi thử đã sao lưu CSDL dev: `C:\Users\tranv\.ngoquyen-dev\backups\dev-truoc-kiem-du-an-so-cong-no-20261127.dump`. Mọi dòng thử đã xóa sau khi kiểm; chỉ còn một bản ghi audit "tạo dòng thử" của sổ dự án #4 làm lịch sử.

- **Công Nợ NCC khớp báo cáo trên giao diện:** so trang `/du-an/{id}/cong-no` với `/cong-no-vt/chi-tiet?period=all&projectIds={id}` (chế độ "Toàn bộ"). #1 (11 NCC), #4 (26 NCC), #14 (6 NCC): hàng tổng và từng NCC khớp cả 8 số, không lệch.
- **Giao Dịch:** công tắc ghi "Sổ công nợ vật tư (490 dòng)" cho #1, 109 cho #14, 367 cho #4 kèm "Sổ dự án (280 dòng)". Lưới #1 hiện 490 dòng, dải số dư đầu kỳ có 1 dòng. Mặc định mở sổ công nợ. `?nguon=abc` và tham số lặp đều về mặc định. `?nguon=so-du-an` của #1 hiện thông báo "Sổ dự án của công trình chưa có giao dịch" kèm nút sang sổ công nợ.
- **Trạng thái rỗng:** #1 và #14 có thông báo ở Cân Đối VT, Định Mức và Dashboard. #4 không có ở cả ba. #20 (không có sổ VT) có ở Cân Đối VT và Định Mức nhưng không có ở Dashboard.
- **Link:** 7 link "Mở sổ NCC" / "Theo công trình" của #14 đều trả 200. `/du-an/0/cong-no`, `/du-an/1.5/giao-dich`, `/du-an/abc/cong-no` trả 404.
- **Làm mới trang sau khi ghi sổ:** mở Công Nợ NCC #14, điều hướng trong app sang Giao Dịch, chèn tạm một dòng thanh toán 1.000 đ, rồi điều hướng trong app quay lại. Giao Dịch thấy 110 dòng; Công Nợ NCC thấy Đã trả TT của NCC #5 và của tổng tăng đúng 1.000 đ. Cả hai lần điều hướng đều trong cùng một trang, không tải lại. Như vậy không cần `revalidate-project-ledger-views.ts`: các trang render động, không bị bộ nhớ đệm của router giữ số cũ, bất kể sổ được ghi theo đường nào.
- **Sổ dự án #4:** tạo một dòng qua hộp "Thêm giao dịch" thành công. Lưới lên 281 dòng, TT 1.000 đ, URL giữ `?nguon=so-du-an`. Thao tác sửa / xóa trên lưới canvas không điều khiển tự động ổn định được, nên chưa thao tác. Phần này dùng nguyên component và server action cũ, PR không đổi, và đã có integration test chạy qua (`du-an-dt-hd-tt-rollback`).
- **Cô lập lỗi:** chèn tạm một run chuyển đổi đã commit nhưng thiếu mốc ngày, để lần đọc sổ vật tư bị lỗi. Kết quả:
  - Giao Dịch của #14 và #4 hiện "Không đọc được sổ Công nợ vật tư lúc này", rơi về Sổ dự án và vẫn có nút "Thêm giao dịch".
  - Dashboard vẫn mở bình thường, chỉ mất thông báo.
  - Công Nợ NCC trả lỗi 500, như đã chọn ở mục review.

  Xóa run tạm thì mọi trang về bình thường.
- **Chưa kiểm trên giao diện:** người dùng không phải admin, vì bản dev chỉ có 3 tài khoản admin. Quy tắc quyền đã có integration test (f).

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

## Quyền mặc định và công trình chỉ có sổ dự án (đếm 27/11 trên bản dev, chỉ đọc)

Bản dev là bản chụp production ngày 24/11. Production không bị chạm.

- `role_permissions`: chỉ vai trò `giam-doc` có quyền mặc định cho ba module liên quan, và có cả ba (`du-an`, `cong-no-vt`, `vat-tu-ncc`, mức edit). Vai trò khác không có quyền mặc định nào cho các module này. Bản dev chỉ có 3 người dùng, đều là admin.
- `module_availability`: `du-an`, `cong-no-vt`, `vat-tu-ncc` đều đang `development`. Mở `du-an` thì nên mở `cong-no-vt` cùng lúc, như plan đã ghi.
- `project_transactions` chỉ có ở #4 (280 dòng, đều mang tên NCC), và #4 cũng có 367 dòng sổ vật tư. Không công trình nào có công nợ NCC chỉ nằm trong sổ dự án, nên không công trình nào bị Công Nợ NCC rỗng sau thay đổi này. Nên đếm lại trên production ngay trước khi mở module, vì dữ liệu sau 24/11 chưa có trong bản dev.
