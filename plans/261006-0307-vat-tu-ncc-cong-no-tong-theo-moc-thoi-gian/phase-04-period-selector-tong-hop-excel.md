---
phase: 4
title: "Bộ chọn mốc, trang tổng hợp, Excel Công Nợ"
status: completed
priority: P1
effort: "8h"
dependencies: [3]
---

# Phase 4: Bộ chọn mốc thời gian cho 3 trang vật tư, trang `/cong-no-vt/tong-hop`, Excel "Công Nợ"

## Goal

Kế toán và lãnh đạo chọn mốc thời gian bằng một bộ chọn thống nhất trên `cong-no-vt/{bao-cao-thang, chi-tiet, tong-hop}`, xem ma trận NCC × Chủ thể đúng mẫu sheet "Công Nợ" và xuất Excel cùng số; module nhân công không đổi.

## Context

- `components/ledger/debt-matrix.tsx` có sẵn (4 nhóm × TT/HĐ, sortable), chưa trang nào dùng; `components/cong-no-vt/debt-matrix.tsx` chỉ re-export.
- Sheet "Công Nợ": hàng NCC; mỗi Chủ thể 6 cột LH TT, Trả TT, Nợ TT, LH HĐ, Trả HĐ, Nợ HĐ; nhóm cuối TỔNG CÔNG TY; LH Excel = số dư ban đầu + lấy hàng → `LH = open + lay`, `Nợ = close`, `Nợ = LH − Trả`.
- `addSheet` chỉ hỗ trợ header phẳng; template mới dựng `aoa` + `!merges`.
- Firefox không hỗ trợ `<input type="week">` → select năm ISO + tuần.
- Quy ước lọc hiện có: đổi state trong filter, URL chỉ đổi khi bấm Xem/Áp dụng (`bao-cao-thang-filter.tsx`, `detail-report-filter.tsx`); không thêm hook URL.
- Redirect fallback Chủ thể ở `bao-cao-thang/page.tsx:31` ghi cứng `?year=&month=&entityId=` → phải giữ nguyên tham số mốc.
- Quyền export: người dùng chọn mở cho quyền đọc `cong-no-vt` (template mới không vào nhánh admin-only ở `route.ts:59`).
- `MonthlyReport` có 2 caller (VT, NC); `DetailReportFilter` có 2 caller: đổi prop theo kiểu cộng thêm để NC không sửa.

## Files to Create / Modify (sở hữu riêng của phase 4)

- Create `components/ledger/report-period-selector.tsx` (client, controlled `value/onChange`, `presets?`): select preset + control phụ (năm; Q1–Q4; `MonthYearPicker`; select năm ISO + tuần "T41 · 05/10–11/10"; `MonthYearPicker` cho "Kỳ chuẩn 27→26" nhãn "27/05–26/06"; hai `DateInput`); dòng nhãn biên đã tính; lỗi từ `windowSchema` hiển thị inline.
- Create `lib/ledger/debt-matrix-columns.ts` (thuần): `toCongNoSheetCell`, `CONG_NO_SHEET_COLUMNS`; test `lib/ledger/__tests__/debt-matrix-columns.test.ts`.
- Create `app/(app)/cong-no-vt/tong-hop/page.tsx` (server: `requireModuleAccess("cong-no-vt", read)`; `searchParams: Promise`; `resolveReportPeriod(sp, {defaultPreset: "all", legacyMode: "cutoff"})`; `getMaterialDebtMatrix({from, to, entityIds})`; điền `partyName` từ `prisma.supplier` và sắp theo tên; Chủ thể theo tên; header với nhãn kỳ, `ExcelExportButton template="cong-no-tong-hop"` truyền `{from, to, entityIds}` (không truyền nhãn), `PrintButton`) và `tong-hop-filter.tsx` (client: `ReportPeriodSelector` + multiselect Chủ thể + checkbox ẩn NCC = 0, nút Áp dụng ghi URL).
- Create `lib/export/templates/cong-no-tong-hop.ts` (`buildCongNoTongHopExcel({from, to, entityIds})`: nhãn kỳ tính bằng `resolveReportPeriod`; `aoa` 3 hàng header, `!merges` ngang 6 cột/nhóm và dọc ô "Nhà cung cấp", `z: "#,##0"`, hàng TỔNG) + `lib/export/__tests__/cong-no-tong-hop.template.test.ts`.
- Modify `components/ledger/debt-matrix.tsx`: 6 cột/nhóm theo `CONG_NO_SHEET_COLUMNS`, nhóm "TỔNG CÔNG TY", tooltip "LH gồm số dư đầu kỳ", prop `hideZero`, cột NCC sticky, sort key `${entityId}:${colKey}`.
- Modify `app/(app)/cong-no-vt/bao-cao-thang/page.tsx` + `bao-cao-thang-filter.tsx`: `resolveReportPeriod(sp, {defaultPreset: "month", legacyMode: "month"})`; `ReportPeriodSelector` thay `MonthYearPicker`; Chủ thể bắt buộc; redirect fallback giữ nguyên `params` mốc; gọi `getMaterialWindowReport`; Excel gửi `{from, to, entityId}`.
- Modify `components/ledger/monthly-report.tsx`: thêm prop `periodLabel?`; khi có thì dùng thay "Tháng m/yyyy" (NC không truyền, giữ nguyên).
- Modify `components/ledger/detail-report-filter.tsx`: thêm prop `periodSelector?: ReactNode` và `extraParams?` để VT nhúng `ReportPeriodSelector` thay 2 select Năm/Tháng; khi không truyền, hành vi cũ giữ nguyên cho NC. `app/(app)/cong-no-vt/chi-tiet/page.tsx`: `defaultPreset: "all", legacyMode: "cutoff"`, truyền `from/to`.
- Modify `app/api/export/excel/route.ts`: `moduleByTemplate["cong-no-tong-hop"] = "cong-no-vt"`; không thêm vào nhánh admin-only; parse `windowSchema` và `entityIds` (int[]); filename từ ngày đã parse `cong-no-tong-hop-{from|toan-bo}-{to|den-nay}.xlsx`; lỗi parse → 400 chung.
- Modify `app/(app)/cong-no-vt/page.tsx` (`navLinks` thêm "Tổng hợp NCC × Chủ thể"), `components/layout/breadcrumb.tsx` (nhãn `tong-hop` nếu thiếu).

Không chạm `app/(app)/cong-no-nc/*`.

## Tasks & Steps

1. `ReportPeriodSelector`; áp cho `bao-cao-thang` VT (preset Tháng) và kiểm URL cũ `?year=2026&month=5`, `?year=2026`.
2. Áp cho `chi-tiet` VT (preset Toàn bộ, legacy cutoff) qua prop cộng thêm; chạy trang NC để xác nhận không đổi.
3. `debt-matrix-columns.ts` + test (cell `{open 310.605.120, lay 44.400.000, tra 100.000.000, close 255.005.120}` → LH 355.005.120, Trả 100.000.000, Nợ 255.005.120; `Nợ = LH − Trả` cho TT và HĐ).
4. `DebtMatrix` 6 cột/nhóm; trang `tong-hop` + filter; điền `partyName`; nav, breadcrumb.
5. Template Excel + route + unit test (mock `queryDebtMatrix`, `prisma`; 2 NCC × 3 Chủ thể; `XLSX.read`: 4 nhóm merge ngang, B2 là Chủ thể đầu, nhóm cuối "TỔNG CÔNG TY", hàng TỔNG đúng; test quyền: người dùng read `cong-no-vt` không admin → 200).
6. Integration: mở rộng `cong-no-window` với Chủ thể thứ hai (`lay_hang` 1.000.000 cùng NCC): `getMaterialDebtMatrix({from 27/4, to 26/5})` ô Chủ thể 1 đúng số phase 3, `totals.closeTt` = 255.505.120, `partyName` = tên NCC.
7. `pnpm build`; mở Excel so với sheet "Công Nợ".

## Todo

- [x] `ReportPeriodSelector`, áp báo cáo tháng VT, redirect giữ params
- [x] Áp lũy kế VT bằng prop cộng thêm; NC không đổi
- [x] `debt-matrix-columns` + test
- [x] `DebtMatrix` 6 cột, trang `tong-hop`, `partyName`, nav
- [x] Template Excel, route quyền đọc, unit test
- [x] Integration ma trận, `pnpm build`

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
pnpm build
```

Thủ công: `/cong-no-vt/tong-hop?period=ncc&y=2026&m=5`, `/cong-no-vt/bao-cao-thang?year=2026&month=5`, `/cong-no-nc/chi-tiet` (không đổi); tải Excel tổng hợp bằng tài khoản không admin có quyền đọc `cong-no-vt`.

## Risks

- Ma trận rộng. Giảm thiểu: cột NCC sticky, multiselect Chủ thể, ẩn dòng 0.
- Thứ tự Chủ thể theo tên khác sheet. Giảm thiểu: ghi trong docs; đổi sang `id` nếu người dùng yêu cầu.
- "Kỳ chuẩn 27→26" là cửa sổ chung, không trùng kỳ linh hoạt của từng NCC. Giảm thiểu: nhãn "Kỳ chuẩn", tooltip giải thích; đối chiếu từng NCC xem ở tab Đối chiếu.
