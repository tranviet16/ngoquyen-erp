---
phase: 1
title: "Chuẩn hoá ngày sổ cái"
status: completed
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Chuẩn hoá ngày sổ cái về ngày nghiệp vụ Asia/Bangkok tại UTC 00:00

## Goal

Mọi `ledger_transactions.date` (và `supplier_delivery_daily.date`) là UTC 00:00 của ngày nghiệp vụ Asia/Bangkok, mọi nguồn ghi mới tuân quy ước đó, và mọi so sánh cửa sổ dùng cận trên exclusive, để không dòng nào rơi khỏi kỳ hay thoát khoá kỳ ký.

## Context (bằng chứng red-team)

- Phiếu ngày và chốt kỳ ghi `new Date("YYYY-MM-DD")` = UTC 00:00 (`lib/vat-tu-ncc/delivery-service.ts`, `period.ts`).
- Đợt thanh toán đóng ghi `date = closedAt = new Date()` (`lib/payment/payment-service.ts:591`, `lib/payment/payment-ledger-sync.ts:34`): có giờ; đóng lúc 20:00 ngày 26/5 Bangkok = 13:00 UTC 26/5 > `periodTo` 26/5 00:00 → rơi khỏi kỳ và thoát `assertPeriodOpen` (`period-lock.ts:24`).
- Import Excel `parseExcelDate` (`lib/import/adapters/excel-utils.ts:15`) tạo `new Date(y, m−1, d)` theo giờ địa phương máy chủ; với TZ Asia/Bangkok = 17:00 UTC hôm trước; dòng ngày 1 tháng rơi về tháng trước khi so sánh UTC.
- `balance-report-service.ts:105-114` dùng `new Date(year, month, 1)` giờ địa phương và cận trên exclusive có chủ ý; phase 3 sẽ thống nhất cách này cho mọi truy vấn.

## Files to Create / Modify

- Create `lib/ledger/business-date.ts` (thuần): `toBusinessDateUtc(instant: Date, tz = "Asia/Bangkok"): Date` (dùng `Intl.DateTimeFormat` với `timeZone` để lấy y/m/d rồi `Date.UTC`), `isUtcMidnight(d)`, `parseIsoDateUtc("YYYY-MM-DD")`; unit test `lib/ledger/__tests__/business-date.test.ts` (02:00 27/5 Bangkok → 2026-05-27T00:00Z; 23:30 26/5 Bangkok → 2026-05-26T00:00Z; ngày đầu năm; DST không áp dụng cho Bangkok nhưng test một múi giờ có DST để hàm tổng quát).
- Modify `lib/payment/payment-ledger-sync.ts`: `date: toBusinessDateUtc(closedAt)`; `assertPeriodOpen` nhận ngày đã chuẩn hoá.
- Modify `lib/import/adapters/excel-utils.ts`: `parseExcelDate` trả `Date.UTC(y, m−1, d)`; nhánh số serial Excel và `new Date(s)` cũng chuẩn về UTC 00:00 qua `toBusinessDateUtc`. Kiểm `lib/import/adapters/__tests__` hiện có (nếu có) và cập nhật kỳ vọng.
- Modify `lib/vat-tu-ncc/period-lock.ts`: `findSignedPeriodCovering` so sánh theo `toBusinessDateUtc(date)` để chống dữ liệu cũ còn sót giờ.
- Create `prisma/migrations/<timestamp>_normalize_ledger_dates_to_business_day/migration.sql`: 
  ```sql
  UPDATE ledger_transactions
  SET "date" = (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date::timestamp
  WHERE "date" <> date_trunc('day', "date");
  UPDATE supplier_delivery_daily
  SET "date" = (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date::timestamp
  WHERE "date" <> date_trunc('day', "date");
  ```
  (cột là `TIMESTAMP(3)` không múi giờ; biểu thức trên hiểu giá trị lưu là UTC, chuyển sang Bangkok, lấy ngày.) Không đụng `invoiceDate`, `asOfDate` (không tham gia cửa sổ) trừ khi kiểm tra cho thấy cũng lệch; ghi nhận trong báo cáo phase.
- Create `scripts/audit-ledger-dates.ts` (tsx): in số dòng `date <> date_trunc('day', date)` theo bảng và theo nguồn (`paymentRoundItemId`, `importRunId`, `deliveryId`), chạy trước và sau migration.
- Modify `docs/operations/*` runbook sao lưu nếu có (đọc trước); nếu không có, ghi bước sao lưu vào báo cáo phase.

## Tasks & Steps

1. Viết `business-date.ts` + test.
2. Sửa 2 nguồn ghi (đợt thanh toán, import) và khoá kỳ; chạy `pnpm test` + integration `payment-service.integration.test.ts`, `import-engine.integration.test.ts`.
3. Chạy `scripts/audit-ledger-dates.ts` trên dev và ghi số lượng dòng lệch vào báo cáo phase (nếu có quyền truy cập, chạy cả trên bản sao production để ước lượng).
4. **Sao lưu DB trước khi migrate** (`pg_dump` theo runbook vận hành); tạo migration dữ liệu; `pnpm db:migrate` trên dev và test DB; chạy audit lần hai, kỳ vọng 0.
5. Integration test mới `test/integration/ledger-business-date.integration.test.ts`: đóng đợt thanh toán với `closedAt` giả lập 2026-05-26T19:00:00Z (02:00 27/5 Bangkok) → event `thanh_toan` có `date` = 2026-05-27T00:00Z; `assertPeriodOpen` với kỳ ký 28/4→26/5 cho phép 27/5 và từ chối 26/5 kể cả khi truyền `2026-05-26T13:00:00Z`.

## Todo

- [x] `business-date.ts` + unit test
- [x] Sửa `payment-ledger-sync`, `excel-utils`, `period-lock`
- [x] Script audit, chạy trước migration
- [x] Sao lưu DB, migration dữ liệu, audit sau = 0
- [x] Integration test ngày nghiệp vụ

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
pnpm exec tsx scripts/audit-ledger-dates.ts
```

## Risks

- Migration dữ liệu không đảo được nếu sai múi giờ. Giảm thiểu: sao lưu bắt buộc, audit trước/sau, chạy trên dev và test trước production.
- Dữ liệu production có thể chưa có dòng lệch (chỉ có phiếu ngày). Khi đó migration là no-op nhưng nguồn ghi vẫn phải sửa.
