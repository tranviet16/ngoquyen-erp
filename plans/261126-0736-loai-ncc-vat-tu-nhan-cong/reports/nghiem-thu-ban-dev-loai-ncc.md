# Nghiệm thu "Loại NCC" trên bản dev — 26/11/2026

Kết quả: **33/33 kiểm tra khớp** trên `ngoquyen-dev-pg` (127.0.0.1:5434). Bản dev đã được khôi phục về trạng thái "đã migrate, mọi NCC là vật tư, không có dữ liệu thử". Production (5433 / 3001) không bị chạm.

Repo công khai: chỉ ghi `NCC #id`, chỉ ghi "khớp / không khớp", không ghi số tiền hay tên.

## Cách làm

- Backup `pg_dump -Fc` bản dev **trước migrate** và **sau migrate**, ra thư mục backup dev ngoài repo (`ngoquyen-dev-backups`, tệp `dev-truoc-loai-ncc-20261126-151611.dump` và `dev-sau-migrate-loai-ncc-20261126-152226.dump`). Cả hai đọc lại được bằng `pg_restore --list` (108 bảng dữ liệu).
- `npx prisma migrate deploy`: áp `20261126090000_supplier_kind`; `migrate status` báo không còn migration chờ. 50 NCC đều `vat_tu`, có CHECK `suppliers_kind_check`.
- Đối chiếu bằng script cục bộ `scripts/check-loai-ncc-dev-acceptance.ts` (bị `.gitignore` bỏ qua theo quy ước `scripts/check-*`). Script gọi đúng các hàm số liệu mà bốn màn và ba file Excel dùng: `queryDebtMatrix`, `queryDetailReport` + `buildProjectPivot`, `queryWindowByParty` (lọc như `getMaterialWindowReport`), `buildCongNoTongHopExcel`, `buildCongNoCongTrinhExcel`, `buildCongNoMonthlyExcel`. Hai cửa sổ: Toàn bộ và năm 2026; ba Chủ thể có dữ liệu vật tư.
- Đổi loại NCC #67, #68, #69 sang nhân công bằng client Prisma có audit, gắn một admin đang hoạt động — cùng đường ghi với nút Sửa / sửa trên lưới (`updateSupplier` / `patchSupplier` gọi `prisma.supplier.update`).
- Sau khi kiểm: khôi phục backup sau migrate (`pg_restore --clean --if-exists --single-transaction`), kiểm lại: 50 NCC `vat_tu`, 0 dòng đợt thanh toán, 0 dòng sổ sinh từ đợt, migration còn ghi nhận.

## Kết quả

| Kiểm tra (Bước của phase 4) | Kết quả |
|---|---|
| NCC #67–#69 là vật tư trước khi đổi | khớp |
| Tổng "Tất cả" của 4 nguồn + 3 Excel, 2 cửa sổ, không đổi sau khi đổi loại (bước 5) | khớp |
| Vật tư + Nhân công = Tất cả: ma trận, chi tiết, theo công trình, báo cáo tháng — 2 cửa sổ (bước 5) | khớp (8/8) |
| Vật tư + Nhân công = Tất cả: Excel tổng hợp, theo công trình, báo cáo tháng — 2 cửa sổ | khớp (6/6) |
| Lọc "Nhân công" chỉ ra NCC #67, #68; NCC #69 không có số liệu nên không có dòng | khớp ở cả 4 nguồn, 2 cửa sổ |
| `md5(signedSnapshotJson)` của kỳ #696–#699 không đổi | khớp |
| Không có dòng mới trong `ledger_transactions` / `ledger_opening_balances` | khớp |
| Audit log có 3 dòng sửa `suppliers` | khớp |
| Tự điền công nợ dòng nhân công NCC #67 = số dư sổ vật tư của cặp (cặp chỉ có số dư đầu kỳ, không đọc sổ labor) (bước 6) | khớp |
| Đóng đợt thử ghi đúng một dòng `thanh_toan` sổ vật tư cho dòng nhân công NCC #67; đồng bộ lại không ghi thêm (bước 6) | khớp |
| Khôi phục backup: mọi NCC về vật tư, không còn dữ liệu thử (bước 7) | khớp |

Ghi chú về Excel tổng hợp: ô của file này là số thực JS cộng dồn theo thứ tự dòng, nên đổi tập dòng (lọc loại) làm sai số làm tròn đổi theo. Chênh lớn nhất giữa "Vật tư + Nhân công" và "Tất cả" là 2·10⁻⁷ đ (Toàn bộ) và 10⁻⁶ đ (năm 2026), ô định dạng `#,##0` nên không thấy. Lần chạy đầu so khớp tuyệt đối nên báo "không khớp"; đã đổi sang ngưỡng < 0,01 đ và in độ lớn chênh. Hai file còn lại chênh 0.

## Kiểm tra tự động

- `npx tsc --noEmit`: xanh.
- `eslint` bỏ qua `.claude/**`: không lỗi. `npm run lint` nguyên trạng báo ~7.456 lỗi, tất cả trong bản sao worktree cũ không theo dõi ở `.claude/worktrees/` (cấu hình ESLint chưa bỏ qua `.claude/`), không có lỗi nào ở file của repo.
- `npm test`: 177 file / 1814 test xanh. `npm run test:integration` trên CSDL tạm cổng 5435: 31 file / 194 test xanh.
- `.env.test` đang trỏ `DATABASE_URL` vào cổng **5433** — trên VIETPC đó là CSDL production. Lần chạy này không dùng file đó: CSDL test tạm được dựng riêng ở 5435 và `DATABASE_URL` được truyền qua biến môi trường.

## Chưa làm

- Chưa bấm qua giao diện (bước 4 và 6 ghi "trên giao diện"): cần admin đăng nhập bản dev. Số liệu và đường ghi đã kiểm như trên; phần còn lại là thao tác UI (ô Loại trên lưới / form, bộ lọc Loại NCC, ô chọn NCC trong đợt thanh toán).

## Trước khi triển khai production (ngoài phạm vi plan, cần người dùng đồng ý)

1. Đếm chỉ-đọc trên production: dòng `nhan_cong` có `projectId IS NULL` trong đợt chưa đóng, theo trạng thái đợt. Đợt đã ở **Đã duyệt** mà có dòng như vậy thì không đóng được và không còn đường sửa trên UI — cần gán công trình bằng dữ liệu trước khi bật.
2. Hỏi kế toán: các khoản trả nhân công cho NCC trước đây (đợt đóng không ghi sổ) đã được nhập tay vào sổ vật tư chưa. Từ bản này, đóng đợt có dòng nhân công sẽ ghi trừ công nợ ở sổ vật tư; đợt cũ đã nhập tay thì có thể trừ hai lần.
3. Dòng `nhan_cong` tạo trước bản này giữ công nợ / lũy kế tự điền từ sổ labor (đang trống, nên là 0). Đợt còn nháp: bấm **Cập nhật số dư**.
4. Backup production, `prisma migrate deploy`, đổi loại NCC #67–#69, theo `docs/operations/deploy.md`.

## Câu hỏi còn mở

- Production có dòng `nhan_cong` thiếu công trình trong đợt chưa đóng không (mục 1)?
- Có khoản trả nhân công nào đã nhập tay vào sổ vật tư không (mục 2)?
- Có sửa `.env.test` để trỏ cổng 5435 không (hiện trỏ 5433 = production trên VIETPC)?
