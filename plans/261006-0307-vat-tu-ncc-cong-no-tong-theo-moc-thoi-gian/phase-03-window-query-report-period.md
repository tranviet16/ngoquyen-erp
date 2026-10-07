---
phase: 3
title: "Truy vấn cửa sổ thời gian và mô-đun mốc báo cáo"
status: completed
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Truy vấn cửa sổ thời gian và mô-đun mốc báo cáo

## Goal

Mọi báo cáo công nợ vật tư tính trên cửa sổ `[from, to]` với một định nghĩa (Đầu kỳ = số dư ban đầu + Σ có dấu với `date < from`; Tăng/Giảm với `date >= from AND date < to + 1 ngày`; Cuối kỳ = Đầu kỳ + Tăng − Giảm), và một mô-đun thuần đổi preset thành cửa sổ UTC có kiểm tra đầu vào.

## Context

- `queryMonthlyByParty` (`lib/ledger/ledger-aggregations.ts:120`) cố định tháng; `queryDebtMatrix` (287) không lọc ngày; `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts`) chỉ có mốc cắt, dùng `new Date(year, month, 1)` giờ địa phương (dòng 112) → thống nhất UTC sau phase 1.
- `getMaterialDetailReport` nằm ở `lib/cong-no-vt/material-detail-report-service.ts:12`; `lib/cong-no-nc/balance-report-service.ts` dùng chung `queryDetailReport` (tham số mới tuỳ chọn, NC không đổi hành vi).
- `lib/acl/__tests__/module-service-boundaries.test.ts` so khớp đối tượng filter của một số service: cập nhật kỳ vọng nếu đổi.
- Không có tiện ích tuần ISO sẵn; `lib/van-hanh/period.ts` dùng giờ địa phương nên không tái dùng.

## Files to Create / Modify (sở hữu riêng của phase 3)

- Create `lib/ledger/report-period.ts` (thuần): `ReportPeriodPreset = "all" | "year" | "quarter" | "month" | "week" | "ncc" | "custom"`; `resolveReportPeriod(sp, {defaultPreset, legacyMode: "month" | "cutoff", today}) → {preset, from: Date|null, to: Date|null, label, params} | {error}`; `isoWeekRange`, `isoWeekOf`, `weeksInIsoYear`; `windowSchema` (zod) kiểm `from/to` dạng `YYYY-MM-DD`, `from ≤ to`, tuần ≤ `weeksInIsoYear`, tháng 1–12, quý 1–4 (trả `error`, không ném). Preset `ncc` gọi `periodRange`. URL: `?period=&y=&q=&m=&w=&from=&to=`; URL cũ `year&month` → `legacyMode`; chỉ `year` → preset `year`.
- Create `lib/ledger/__tests__/report-period.test.ts`, `test/integration/cong-no-window.integration.test.ts`.
- Modify `lib/ledger/ledger-aggregations.ts`: `queryWindowByParty(ledgerType, {from, to, entityId})` (CTE `opening` thêm Σ có dấu với `(${from}::timestamp IS NULL OR date < ${from})`; CTE `period` với `(${from} IS NULL OR date >= ${from}) AND (${toExclusive} IS NULL OR date < ${toExclusive})`, `toExclusive = to + 1 ngày`); `queryMonthlyByParty` thành wrapper cửa sổ tháng UTC; `queryDebtMatrix` nhận `from?/to?` cùng ngữ nghĩa và điền `partyName` khi caller truyền map (hoặc để service điền, xem phase 4).
- Modify `lib/ledger/ledger-service.ts`: `windowByParty`, `detailedDebtMatrix` truyền `from/to`.
- Modify `lib/cong-no-vt/balance-report-service.ts`: `DetailReportFilters` thêm `from?: Date; to?: Date`; `year/month` cũ quy về `to` UTC; cận trên exclusive; khi có `from`, CTE `ob` cộng Σ có dấu trước `from`.
- Modify `lib/cong-no-vt/material-ledger-service.ts`: `getMaterialWindowReport(window: {from: string|null; to: string|null}, entityId)` (guard `cong-no-vt`, parse bằng `windowSchema`), `getMaterialDebtMatrix` nhận `from/to` chuỗi ISO.
- Modify `lib/cong-no-vt/material-detail-report-service.ts`: truyền `from/to` (parse `windowSchema`).
- Modify `lib/export/templates/cong-no-monthly.ts`: `buildCongNoMonthlyExcel(ledgerType, window, entityId)`, nhãn kỳ tính phía server bằng `resolveReportPeriod`; `app/api/export/excel/route.ts` case `cong-no-monthly` parse `windowSchema`, fallback `year/month`, lỗi parse → 400 không lộ `detail`.
- Modify `lib/ledger/__tests__/ledger-aggregations.test.ts`, `lib/export/__tests__/cong-no-monthly.template.test.ts`, `lib/acl/__tests__/module-service-boundaries.test.ts` (nếu so khớp filter).

Quy ước kiểu: server action nhận `{from: string|null, to: string|null}` ISO; nội bộ `Date|null`.

## Tasks & Steps

1. `report-period.ts` + unit test: tuần 41/2026 = 05/10→11/10; tuần 53/2026 = 28/12/2026→03/01/2027; `isoWeekOf(2027-01-01)` = {2026, 53}; tuần 53/2027 → `error` (2027 có 52 tuần); Q2/2026; tháng 2/2028 → 29/02; `ncc` 6/2026 = 27/05→26/06; `ncc` tháng 13 → `error`; `all` = null/null; legacy `{year, month}` theo 2 chế độ; `{year}` → preset năm; custom đảo ngược → `error`; mọi `from/to` UTC 00:00.
2. `queryWindowByParty` + wrapper; `cong-no-luy-ke` parity xanh.
3. `queryDebtMatrix`, `queryDetailReport` nhận `from/to`, cận trên exclusive, cutoff UTC.
4. Server action cửa sổ VT; template Excel tháng; route parse.
5. Integration `cong-no-window` (fixture Nam Hương: ob 310.605.120 asOf 27/4; `lay_hang` 44.400.000 ngày 05/5; `thanh_toan` 100.000.000 ngày 20/5; `lay_hang` 30.460.000 ngày 05/6; `thue_hd` 1.000.000 ngày 26/6; thêm một `thanh_toan` 500.000 ngày 26/5 để kiểm cận trên): (a) 27/4→26/5: open 310.605.120, inc 44.400.000, dec 100.500.000, close 254.505.120; (b) 27/5→26/6: open 254.505.120, inc 31.460.000, close 285.965.120; (c) `all` close 285.965.120; (d) với T ∈ {26/5, 26/6}: `close(from bất kỳ, T)` = `queryCurrentBalance(asOf T)` = `queryDetailReport({to: T}).cuoiKyTt`; (e) 5 tuần ISO phủ tháng 5 cộng lại bằng cửa sổ tháng 5; (f) `queryMonthlyByParty(2026, 5)` = `queryWindowByParty(01/5→31/5)`; (g) `queryDebtMatrix({from, to}).totals` = tổng `queryWindowByParty`.

## Todo

- [x] `report-period.ts` + zod + unit test
- [x] `queryWindowByParty` + wrapper, parity xanh
- [x] `queryDebtMatrix`, `queryDetailReport` cửa sổ, cận trên exclusive
- [x] Server action cửa sổ, template Excel tháng, route parse
- [x] Integration 7 bất biến

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
```

## Risks

- Đổi cutoff lũy kế từ giờ địa phương sang UTC. Giảm thiểu: sau phase 1 dữ liệu thuần UTC 00:00 nên kết quả mới là đúng; ghi docs.
- Tham số null kiểu timestamp trong Prisma. Giảm thiểu: integration SQL thật ngay bước 2.
