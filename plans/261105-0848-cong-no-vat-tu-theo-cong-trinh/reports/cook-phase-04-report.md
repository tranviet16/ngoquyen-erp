# Báo cáo thực hiện Phase 4 — Trang tổng hợp theo công trình và Excel

Ngày: 2026-11-06. Trạng thái: **xong code + unit + lint + typecheck**; **integration chưa chạy** (Docker tắt, `localhost:5433` từ chối kết nối). Chưa commit/push.

## 1. Kết quả kiểm tra (lệnh chạy thật)

| Lệnh | Kết quả |
|---|---|
| `npx tsc --noEmit` | exit 0, **0 lỗi** toàn repo (kể cả vùng của agent khác tại thời điểm chạy) |
| `npx vitest run --project unit lib/cong-no-vt lib/export` | **9 file / 71 test pass** (gồm test route `cong-no-tong-hop` cũ, vẫn xanh sau khi route import template mới) |
| `npx vitest run --project unit` (toàn bộ) | **102 file / 1055 test pass** |
| `npx eslint <11 tệp đã tạo/sửa>` | exit 0, không cảnh báo |
| `npx vitest run --project integration test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts` | **KHÔNG CHẠY**: `docker ps` không kết nối được Docker Desktop; cổng 5433 của `ngoquyyen_erp_test` đóng. Không migrate/deploy DB nào. File đã typecheck và lint. |

## 2. Tệp tạo / sửa

Tạo:
- `lib/cong-no-vt/project-debt-pivot.ts` (thuần, không Prisma/Next): `buildProjectPivot(rows, groupBy)`, `pivotColumnMode(from)`, `pivotColumns(mode)`, `parseProjectDebtQuery(input)` (zod: cửa sổ ISO qua `windowSchema`, `groupBy` ∈ `ncc|cong-trinh`, `entityIds` số nguyên dương ≤ 200, bỏ trùng), hằng nhãn `PIVOT_GROUP_LABELS`, `PIVOT_SIDE_LABELS`, `UNASSIGNED_PROJECT_LABEL`.
- `lib/cong-no-vt/project-debt-summary-service.ts` (`"use server"`): `getProjectDebtSummary(input: unknown)` → `await requireReleasedModuleRequest("cong-no-vt")`, kiểm tham số, **một** lần `queryDetailReport` (lọc Chủ thể trong SQL, `showZero: false`), trả `{ pivot, mode }`.
- `app/(app)/cong-no-vt/tong-hop-cong-trinh/page.tsx`: guard `requireModuleAccess("cong-no-vt", read)`, mặc định **Năm hiện tại**, `?groupBy=` (mặc định `ncc`), `?entityIds=`; tham số sai → thông báo đỏ, không tải dữ liệu; nút Xuất Excel + In; dòng công thức theo chế độ.
- `app/(app)/cong-no-vt/tong-hop-cong-trinh/tong-hop-cong-trinh-client.tsx`: bộ lọc (dùng lại `ReportPeriodSelector`, `ControlledMultiSelect`, select "Nhóm theo"), chỉ ghi URL khi bấm **Áp dụng**.
- `app/(app)/cong-no-vt/tong-hop-cong-trinh/project-debt-pivot-table.tsx`: bảng 2 cấp, header 2 hàng (TT/HĐ gộp 4 cột), dùng `components/sortable-table` (cột tên cấp 1 sắp nhóm, cột tên cấp 2 sắp dòng con, cột số sắp cả hai), dòng TỔNG CỘNG, số âm màu đỏ, nhóm "(Chưa gán công trình)" in nghiêng.
- `lib/export/templates/cong-no-cong-trinh.ts`: cùng pivot, hàng tiêu đề (kỳ, chiều nhóm, tên Chủ thể nếu lọc) + header 2 hàng gộp ô (A2:A3, B2:B3, C2:F2 TT, G2:J2 HĐ), dòng nhóm → dòng con → TỔNG CỘNG, định dạng `#,##0`.
- Test: `lib/cong-no-vt/__tests__/project-debt-pivot.test.ts` (24 ca), `lib/export/__tests__/cong-no-cong-trinh.test.ts` (17 ca: header, merges, nhãn hai chế độ, dòng tổng, 2 chiều nhóm cùng tổng, 1 lần query; route: 200 cho non-admin có quyền đọc `cong-no-vt`, 401, 403, 400 chung chung, 500 không lộ chi tiết), `test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts` (7 ca).

Sửa:
- `app/api/export/excel/route.ts` (+17/−1): đăng ký `cong-no-cong-trinh` → quyền đọc `cong-no-vt` (không cần admin); kiểm `from/to/groupBy/entityIds` bằng `parseProjectDebtQuery`, lỗi trả 400 `"Tham số xuất không hợp lệ"`; tên file tính từ tham số đã kiểm; 500 không trả `detail` (giống `cong-no-tong-hop`).
- `app/(app)/cong-no-vt/page.tsx` (+1): liên kết "Tổng hợp theo công trình".

Không đụng `balance-report-service.ts` (SQL giữ nguyên), không đụng tệp nằm ngoài danh sách sở hữu.

## 3. Quyết định / lệch nhỏ so với spec

1. **Chế độ cột theo cận dưới, không theo tên preset**: `pivotColumnMode(from)` → `from = null` là chế độ lũy kế (Toàn bộ, và cả Tuỳ chọn chỉ có "Đến ngày"); còn lại là chế độ kỳ. Spec ghi `pivotColumns(preset)`; đổi thành `pivotColumns(mode)` vì "Tuỳ chọn" có thể không có cận dưới, khi đó số liệu đúng nghĩa lũy kế.
2. **Mỗi nút giữ 8 số (4 × TT/HĐ), không tách trường "chuyển sang" riêng**: khi không có `from`, `queryDetailReport` tính Đầu kỳ chỉ từ số dư ban đầu (ròng) và Phát sinh/Đã trả là lũy kế mọi dòng, nên chuyển sang / LH lũy kế / Đã trả lũy kế / Còn nợ chính là 4 số đó với nhãn khác. Một lần query cho mỗi request được giữ đúng.
3. **Chủ thể gộp vào dòng con**: dòng con là cặp NCC × công trình; nếu dữ liệu cũ có cùng cặp dưới hai Chủ thể thì được cộng vào một dòng (có test). Không thêm cột Chủ thể (ngoài phạm vi).
4. Số tiền chuyển từ chuỗi DetailRow sang `number` và **ném lỗi** nếu không phải số nguyên an toàn (thay vì làm tròn lặng lẽ).
5. Nhãn "Lũy kế chuyển đổi" chỉ hiện ở dòng công thức của trang (chế độ lũy kế); pivot không có cấp chi tiết dòng sổ, dòng sổ ngày 26/12/2025 do phase 7 ghi `content`.
6. `project-debt-pivot.ts` dài 221 dòng (phần lớn là kiểu + chú thích); giữ một tệp vì phần tách được (kiểm tham số) không có tệp sở hữu riêng.
7. Không đọc được `node_modules/next/dist/docs` (hook chặn); theo đúng mẫu trang hiện có (`searchParams: Promise<…>`, gọi server action từ server component như `chi-tiet`).

## 4. Integration test (chưa chạy) — dữ liệu và khẳng định

Fixture: Cty Quản Lý (Trại Chuối), Cty Xây Dựng (DCX). Nam Hương × Trại Chuối: lay_hang 500.000.000 + thanh_toan 440.131.580 ngày 26/12/2025 (ròng 59.868.420), 2026: +10tr (10/01), −5tr (20/01), +7tr (05/03); 2027: +1tr. Quang Minh × DCX: số dư ban đầu 159.360.000 (asOf 31/12/2025), +20tr (05/01), −30tr (10/02). Nam Hương × DCX: +3tr (01/04/2026). Mọi dòng có `projectId`, công trình có `entityId`.

Khẳng định: Năm 2026 Đầu kỳ NH×TC = 59.868.420; Kỳ chuẩn T1/2026 (cửa sổ lấy từ `resolveReportPeriod`, xác nhận 2025-12-27 → 2026-01-26) Đầu kỳ = 59.868.420, PS tăng = 10tr, PS giảm = 5tr (không gồm dòng 26/12); Còn nợ (lũy kế đến 31/12/2026) = Cuối kỳ (Năm 2026) ở mọi cặp, TT và HĐ; chuyển sang + LH − Đã trả = Còn nợ; Toàn bộ gồm dòng 2027; hai chiều nhóm cùng tổng; lọc Chủ thể chỉ còn công trình của Chủ thể đó; tham số sai bị từ chối.

Cần chạy khi có DB test: `npx vitest run --project integration test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts` (DB `_test` phải đã có migration `20261106090000_vat_tu_pair_scope_and_import_review`).

## 5. Câu hỏi còn mở

- Không có. (Chưa chạy `pnpm build`; để phase 8 chạy cùng toàn bộ thay đổi của các phase song song.)
