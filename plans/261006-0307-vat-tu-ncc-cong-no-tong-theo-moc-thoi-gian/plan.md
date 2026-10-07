---
title: "Công nợ vật tư NCC: thuế hoá đơn, báo cáo theo mốc thời gian, tổng hợp NCC × Chủ thể, báo giá, kỳ chốt linh hoạt"
description: "Chuẩn hoá ngày sổ cái, thêm loại giao dịch thuế hoá đơn, truy vấn theo cửa sổ thời gian với bộ chọn mốc dùng chung, trang tổng hợp NCC × Chủ thể xuất Excel, báo giá và tab thanh toán, biên kỳ chốt tuỳ chọn."
status: in-progress
priority: P1
effort: 37h
branch: main
tags: [feature, backend, frontend, database, ledger, vat-tu-ncc, cong-no-vt, reporting]
blockedBy: []
blocks: []
created: 2026-10-06
---

# Công nợ vật tư NCC: thuế hoá đơn, báo cáo theo mốc thời gian, tổng hợp NCC × Chủ thể, báo giá, kỳ chốt linh hoạt

## Overview

Hệ thống đã có phiếu vật tư ngày, báo giá theo ngày hiệu lực, chốt kỳ sinh sổ cái và bảng đối chiếu dẫn xuất (kế hoạch `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no`, đã hoàn thành). Kế hoạch này lấp các khoảng trống đã chốt với người dùng trong `plans/reports/brainstorm-261006-0953-vat-tu-ncc-bao-gia-cong-no-tong.md`, được tổng hợp từ ba bản nháp độc lập và sửa theo cổng red-team (xem hai mục cuối).

Phạm vi giao đủ, không cắt:

1. Loại giao dịch sổ cái `thue_hd` (thuế hoá đơn NCC) làm tăng nợ ở cột TT, tách dòng trong đối chiếu, được mọi truy vấn, grid, schema vật tư nhận.
2. Truy vấn sổ cái theo cửa sổ `[from, to]`; bộ chọn mốc thời gian dùng chung (Toàn bộ / Năm / Quý / Tháng / Tuần ISO / Kỳ chuẩn 27→26 / Tuỳ chọn) cho `cong-no-vt/{tong-hop, bao-cao-thang, chi-tiet}`; trang `/cong-no-vt/tong-hop` (NCC × Chủ thể, LH / Trả / Nợ cho TT và HĐ, nhóm TỔNG CÔNG TY) và xuất Excel theo mẫu sheet "Công Nợ", mở cho quyền đọc `cong-no-vt`.
3. Báo giá hiện giá trước, chênh lệch, nhãn Tăng / Giảm / Mới / Giữ nguyên, sửa dòng; gợi ý đơn giá theo báo giá khi nhập phiếu ngày; tab "Thanh toán" trong `/vat-tu-ncc/[supplierId]` ghi chuyển khoản và thuế hoá đơn.
4. Biên kỳ chốt `[from, to]` tuỳ chọn, mặc định 27→26, kỳ đầu từ phiếu sớm nhất chưa chốt (sau mốc số dư ban đầu), liền kề marker gần nhất, kỳ đã ký bất biến và mọi đường ghi được tuần tự hoá theo NCC.
5. Tiền đề kỹ thuật phát hiện ở red-team: chuẩn hoá ngày sổ cái về ngày nghiệp vụ Asia/Bangkok tại UTC 00:00 (có sao lưu DB), vì dòng đợt thanh toán đang lưu giờ đóng đợt và dòng import Excel lưu nửa đêm giờ địa phương.
6. Tài liệu người dùng, kiến trúc, pilot trên số liệu Excel mẫu.

## Bất biến (không tranh luận lại)

- Nguồn sự thật là `ledger_transactions` + `ledger_opening_balances`; số tổng tính động; chỉ kỳ đã ký mới đông cứng snapshot.
- Kỳ đã ký bất biến; chênh lệch đi qua `dieu_chinh` kỳ sau (admin vẫn được ghi `dieu_chinh`).
- Quy ước ngày sổ cái: `date` = ngày nghiệp vụ Asia/Bangkok lưu tại UTC 00:00; truy vấn so sánh `date >= from AND date < to + 1 ngày`.
- Không migration schema; có một migration dữ liệu (phase 1) chạy sau sao lưu.
- Module công nợ nhân công không đổi hành vi: thay đổi component dùng chung phải cộng thêm, schema nhân công không nhận `thue_hd`.
- Unit 698 và integration 41 giữ xanh; mỗi phase thêm test, dùng số liệu Excel trong `reports/debate-evidence-packet.md` mục 4.
- Next.js 16 và Prisma 7 theo repo; server action trong `lib/<module>/` guard đúng module (`test/unit/module-release-entrypoints.test.ts`); bảng mới dùng `components/sortable-table`; `revalidatePath` dùng đường dẫn literal.

## Tổng hợp tranh luận (3 ứng viên trong `reports/planner-debate-candidate-{1,2,3}.md`)

| Điểm | Ứng viên 1 (tối thiểu) | Ứng viên 2 (bất biến) | Ứng viên 3 (luồng người dùng) | Chọn |
|---|---|---|---|---|
| Phân loại `thue_hd` | Hằng + `Prisma.join`, sửa từng FILTER | Mô-đun fragment thay mọi CASE kể cả `tai-chinh`, kèm hàm TS | Mô-đun fragment, giữ CASE "ELSE dương" đã đúng | Mô-đun hằng + fragment SQL (không hàm TS không caller), chỉ sửa chỗ `= 'lay_hang'` và các CASE tách `dieu_chinh`; `lib/tai-chinh/*` giữ nguyên |
| Snapshot kỳ ký | `totalIn` gộp thuế | `totalIn` = B, thuế trong JSON, cột suy từ 4 cột | `totalIn` = B, thuế trong JSON | Ứng viên 2 |
| Truy vấn cửa sổ | Hàm theo NCC + wrapper | Một truy vấn hạt mịn, gộp TS | Hàm theo NCC + wrapper, matrix/detail thêm `from/to` | Ứng viên 1/3 + bộ test bất biến của ứng viên 2 |
| Mốc thời gian | `<input type="week">` | `<input type="week">` | Select năm ISO + tuần | Ứng viên 3; không hook URL riêng, áp dụng qua nút Xem/Áp dụng như hiện có |
| Ma trận | Component mới | Tái dùng `components/ledger/debt-matrix.tsx` | Tái dùng, 6 cột/nhóm | Ứng viên 3 |
| Excel tổng hợp | `groupHeader` trong exporter | Header phẳng | Template tự dựng `aoa` + `!merges` | Ứng viên 3 |
| Tab Thanh toán | Tái dùng action `cong-no-vt` | Như 1 | Service mới guard `vat-tu-ncc` | Ứng viên 1/2 + UX của 3; guard read-only phía server |
| Biên kỳ | Helper, đổi chữ ký | Helper, kiểm lúc ký, lock theo NCC | Helper, overload | Helper riêng, đổi chữ ký; sau red-team: liền kề marker gần nhất, lock theo NCC cho mọi đường ghi |
| Gợi ý giá | Client với quotes tải sẵn | Server action | Server action, fallback giá cũ | Ứng viên 1, không fallback giá phiếu cũ |

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Ngày sổ cái một quy ước; không dòng nào rơi khỏi cửa sổ hay thoát khoá kỳ | P1 |
| 2 | `thue_hd` tăng nợ đúng ở mọi báo cáo, đối chiếu, số dư; lỗ hổng `authorized` và sửa tay dòng tự sinh được đóng | P1 |
| 3 | Mô-đun mốc thời gian + bộ chọn dùng chung cho 3 trang VT; đẳng thức Đầu kỳ + Tăng − Giảm = Cuối kỳ và Cuối kỳ(đến T) = Lũy kế(T) có test | P1 |
| 4 | `/cong-no-vt/tong-hop` khớp sheet "Công Nợ", xuất Excel cùng số | P1 |
| 5 | Chốt kỳ biên tuỳ chọn, mọi đường ghi tuần tự theo NCC, ký kiểm tra đủ phiếu | P1 |
| 6 | Báo giá, gợi ý giá, tab Thanh toán | P2 |
| 7 | Tài liệu, pilot | P2 |

## Phases

| # | Phase | Status | Effort | Phụ thuộc |
|---|-------|--------|--------|-----------|
| 1 | [Chuẩn hoá ngày sổ cái](./phase-01-ledger-date-normalization.md) | Pending | 3h | — |
| 2 | [Mô-đun phân loại giao dịch, loại thuế hoá đơn, vá quyền ghi](./phase-02-thue-hd-classification-write-guards.md) | Pending | 6h | 1 |
| 3 | [Truy vấn cửa sổ thời gian và mô-đun mốc báo cáo](./phase-03-window-query-report-period.md) | Pending | 5h | 2 |
| 4 | [Bộ chọn mốc, trang tổng hợp, Excel "Công Nợ"](./phase-04-period-selector-tong-hop-excel.md) | Pending | 8h | 3 |
| 5 | [Biên kỳ chốt linh hoạt và khoá theo NCC](./phase-05-flexible-period-close-supplier-lock.md) | Pending | 7h | 2 (song song với 3, 4, 6) |
| 6 | [Báo giá, gợi ý đơn giá, tab Thanh toán](./phase-06-bao-gia-price-suggestion-thanh-toan-tab.md) | Pending | 5h | 2 (song song với 3, 4, 5) |
| 7 | [Tài liệu, hồi quy toàn bộ, pilot](./phase-07-docs-regression-pilot.md) | Pending | 3h | 1–6 |

Đường găng 1 → 2 → 3 → 4 → 7 = 25 giờ; phase 5 và 6 chạy nhánh riêng sau phase 2, không chung file với nhau hay với 3, 4 (bảng sở hữu file trong từng phase).

## Success Criteria

- [ ] Sau phase 1: `SELECT count(*) FROM ledger_transactions WHERE date <> date_trunc('day', date)` = 0 và không dòng nào lệch ngày nghiệp vụ; đợt thanh toán đóng lúc 02:00 Asia/Bangkok ngày 27/5 ghi `date` = 2026-05-27 UTC 00:00.
- [ ] `thue_hd` xuất hiện trong cột Lấy hàng / Phát sinh và làm tăng Nợ ở `/cong-no-vt`, `bao-cao-thang`, `chi-tiet`, `tong-hop`, bảng đối chiếu NCC và `getOutstandingDebt`; integration test Bê tông Hải Phòng cho closing 350.876.111 trên fixture cùng (Chủ thể, công trình).
- [ ] `patchMaterialTransaction` không còn tham số `authorized`; dòng có `paymentRoundItemId` hoặc `deliveryId` không sửa/xoá được qua action tay; số dư ban đầu của NCC có kỳ ký không sửa được.
- [ ] Bộ chọn mốc dùng chung; URL cũ `?year=&month=` và `?year=` vẫn chạy; preset Tháng cho đúng số báo cáo tháng hiện tại; Tuần theo ISO (tuần 53 chỉ ở năm có 53 tuần); test chứng minh Cuối kỳ(đến T) = Lũy kế(T) và tổng các tuần ISO trong tháng = tháng.
- [ ] `/cong-no-vt/tong-hop`: tên NCC hiển thị đúng, nhóm cột từng Chủ thể + TỔNG CÔNG TY với LH TT / Trả TT / Nợ TT / LH HĐ / Trả HĐ / Nợ HĐ, LH = Đầu kỳ + Phát sinh tăng; Excel 2 hàng header gộp ô, cùng số, mở cho quyền đọc `cong-no-vt`.
- [ ] Chốt kỳ nhận `[from, to]`; liền kề marker gần nhất; kỳ ký bất biến; ký từ chối khi còn phiếu trong kỳ chưa có event; mọi ghi sổ cái vật tư, phiếu ngày, số dư ban đầu, đồng bộ đợt thanh toán lấy khoá advisory theo NCC trong transaction; pilot Nam Hương 01/4→27/4 (310.605.120), 28/4→26/5 (255.005.120), 27/5→26/6 (285.465.120).
- [ ] Báo giá hiện giá trước và chênh lệch, sửa được; form tạo phiếu ngày tự điền đơn giá theo báo giá hiệu lực (không ghi đè khi sửa); tab Thanh toán ghi `thanh_toan` và `thue_hd` (TT, HĐ = 0 mặc định, thuế bắt buộc số hoá đơn ở schema server) xuất hiện đúng kỳ trong đối chiếu.
- [ ] `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build` xanh; tài liệu cập nhật.

## Dependencies

- Kế hoạch tiền đề `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no` (completed); runbook cũ `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/reports/nam-huong-pilot-runbook.md`.
- Bằng chứng: `reports/debate-evidence-packet.md`; brainstorm `plans/reports/brainstorm-261006-0953-vat-tu-ncc-bao-gia-cong-no-tong.md`.
- Red-team: `reports/red-team-{security-adversary,failure-mode-analyst,assumption-destroyer,scope-complexity-critic}.md`.

## Red Team Review

### Session — 2026-10-06
**Findings:** 37 thô, khử trùng còn 22 (19 accepted, 3 rejected)
**Severity breakdown:** 4 Critical, 11 High, 7 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Ngày sổ cái không thuần UTC 00:00 (đợt thanh toán ghi giờ đóng đợt `lib/payment/payment-service.ts:591`; import ghi nửa đêm giờ địa phương `lib/import/adapters/excel-utils.ts:15`) → dòng ngày cuối kỳ rơi khỏi cửa sổ và thoát khoá kỳ | Critical | Accept (người dùng chọn chuẩn hoá dữ liệu) | Phase 1 mới; phase 3 dùng cận trên exclusive |
| 2 | `patchMaterialTransaction(id, patch, client, authorized)` là server action export; client có thể truyền `authorized = true` bỏ kiểm quyền (`lib/cong-no-vt/material-ledger-service.ts:67-75`) | Critical | Accept | Phase 2 |
| 3 | Khoá kỳ ký là check-then-write ngoài transaction cho ghi sổ cái tay, phiếu ngày, đồng bộ đợt; ký đua với ghi `thue_hd` | Critical | Accept | Phase 5 |
| 4 | Quy tắc liền kề chỉ với kỳ đã ký → không chốt kỳ k+1 khi kỳ k chưa ký | Critical | Accept (liền kề marker gần nhất) | Phase 5 |
| 5 | Ký không kiểm tra mọi phiếu trong kỳ đã có event → phiếu bị khoá vĩnh viễn ngoài sổ | High | Accept | Phase 5 |
| 6 | Gợi ý kỳ đầu lấy phiếu lịch sử import không có event → đếm trùng nợ đã nằm trong số dư ban đầu | High | Accept (`from` ≥ asOfDate số dư ban đầu + 1) | Phase 5 |
| 7 | Dòng từ đợt thanh toán / phiếu ngày chỉ read-only ở UI | High | Accept (guard server) | Phase 2 |
| 8 | Số dư ban đầu không khoá sau khi có kỳ ký | High | Accept | Phase 2 |
| 9 | Đổi module nhân công trái non-goal (schema nhận `thue_hd`, 2 trang NC, action window NC) | High | Accept (cộng thêm, NC không đổi) | Phase 2, 3, 4 |
| 10 | `SummaryRow.thueHd*` và đổi header template `doi-chieu` trái quyết định "thuế vào cột Lấy hàng" | High | Accept (gộp vào `layHang`) | Phase 2 |
| 11 | Enum zod của 2 import adapter (`cong-no-vat-tu.adapter.ts:29`, `cong-no-nhan-cong.adapter.ts:29`) bị bỏ sót; parser kiểm "thuế" trước "trả" | High | Accept (chỉ adapter vật tư; "trả" trước) | Phase 2 |
| 12 | `from/to/label` không kiểm tra ở route và action; nhãn và tên file lấy từ client | High | Accept | Phase 3, 4 |
| 13 | `queryDebtMatrix` trả `partyName: ""`, trang tổng hợp hiện "NCC #id" | High | Accept | Phase 4 |
| 14 | "5 đường cùng 350.876.111" so sánh khác hạt gộp (per công trình vs toàn NCC) | High | Accept (fixture cùng Chủ thể, công trình; "Nợ hiện tại" dùng `supplierBalanceAsOf`) | Phase 2, 6 |
| 15 | Các hàm TS `classifyAmount/signedAmount` không có caller; rewrite CASE đã đúng | High | Accept (bỏ hàm TS, chỉ hằng + fragment) | Phase 2 |
| 16 | Hook URL mới đẩy URL mỗi lần đổi, trái quy ước Xem/Áp dụng; `suggestNextClosePeriod` trùng `previewPeriodClose`; schema form riêng không ràng buộc server; fallback giá phiếu cũ ngoài yêu cầu; tự điền giá ghi đè khi sửa | Medium | Accept | Phase 4, 5, 6 |
| 17 | `revalidatePath` mẫu `[supplierId]` không tới trang con, trái quy ước literal | Medium | Accept | Phase 2 |
| 18 | Layout NCC không có `userId`; gate tab bỏ qua rollout module | Medium | Accept | Phase 6 |
| 19 | Redirect fallback Chủ thể ở báo cáo tháng ghi cứng `?year=&month=`; tuần 53 ở năm 52 tuần; tháng xấu ném lỗi | Medium | Accept | Phase 3, 4 |
| 20 | Trích dẫn sai: `getMaterialDetailReport` ở `material-detail-report-service.ts`; số call site pilot; test `lib/acl/__tests__/module-service-boundaries.test.ts` so khớp filter | Medium | Accept | Phase 3, 5 |
| 21 | Importer ghi SQL thô không qua khoá kỳ (`cong-no-vat-tu.adapter.ts:189-200`) | High | Reject: importer là công cụ admin tải lịch sử, ngoài phạm vi; ghi backlog | — |
| 22 | Admin sửa `dieu_chinh` trong kỳ ký; runbook pilot trùng | Medium | Reject: `dieu_chinh` là lối thoát theo thiết kế; runbook cũ chỉ phủ Nam Hương kỳ cố định | — |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01 … phase-07 (viết lại toàn bộ sau phân xử)
- Decision deltas checked: 12 (phase mới chuẩn hoá ngày; cận trên exclusive; bỏ `thueHd*` cột; NC không đổi; bỏ hook URL; bỏ `suggestNextClosePeriod`; bỏ form schema riêng; bỏ fallback giá cũ; liền kề marker gần nhất; lock mọi đường ghi; export quyền đọc; thuế chỉ TT)
- Reconciled stale references: xem log ở mục Validation
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-10-06 (gộp với cổng red-team)
Hỏi 4 câu, người dùng trả lời:
1. Áp dụng toàn bộ phát hiện red-team đã chấp nhận → Có.
2. Ngày sổ cái → chuẩn hoá dữ liệu + sửa nguồn ghi, có sao lưu.
3. Thuế hoá đơn → chỉ cột TT (HĐ = 0, vẫn nhập tay được).
4. Quyền xuất Excel tổng hợp → mở cho quyền đọc `cong-no-vt`.

Quyết định của planner (ghi để người dùng phản đối nếu cần): khoá số dư ban đầu của NCC khi đã có kỳ ký; thứ tự Chủ thể trong ma trận theo tên; schema nhân công không nhận `thue_hd`.

<!-- slug: vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian -->

## Implementation Status — 2026-10-06

Đã triển khai đủ 7 phase (Sonnet: phase 1, 2, 3, 4, 6 và sửa lỗi review; Opus: phase 5, review, điều phối; Haiku: tài liệu phase 7). Chưa commit.

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | 0 lỗi |
| `npx vitest run --project unit` | 893/893 (trước: 795) |
| `npx eslint` trên mọi file thay đổi | sạch |
| `npx next build` | thành công |
| `npx vitest run --project integration` (DB test tạm, Postgres 16, `fsync` tắt) | 16/16 file, 75/75 test (gồm 6 file mới/sửa) |
| Migration `20261006110000_normalize_ledger_dates_to_business_day` | áp thành công trên DB test; `scripts/audit-ledger-dates.ts` = 0. Máy này không có DB dev/production (không container, volume, dịch vụ Postgres) nên chưa có dữ liệu thật để chuẩn hoá |

Code review sau triển khai: `reports/code-review-ledger-period-lock-sql-auth.md` — sửa findings 1–5 (gồm lỗ hổng `authorized` ở module nhân công, ghi đè sự kiện kỳ đã ký qua phiếu ngày, cận ngày bao gồm, thứ tự khoá, timeout transaction). Findings 6–7 chờ quyết định / backlog.

Ghi chú môi trường: trên Docker Desktop (Windows), DB test có `fsync` bật làm `TRUNCATE` chậm >10 s, gây timeout dây chuyền và deadlock giữa các file (lỗi có sẵn ở HEAD: `cong-no-luy-ke` 4/5 lỗi khi chạy toàn bộ). Đã ghi hướng dẫn vào `docs/code-standards.md`.

Còn lại phía người dùng: trên máy có DB thật — sao lưu (`scripts/backup-db.sh`) → `npx prisma migrate deploy` → `npx tsx scripts/audit-ledger-dates.ts` (kỳ vọng 0) → pilot theo `reports/pilot-excel-mau-runbook.md`; commit khi đồng ý.
