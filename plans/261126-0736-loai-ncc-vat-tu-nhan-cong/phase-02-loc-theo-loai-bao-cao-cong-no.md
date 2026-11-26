---
title: "Phase 2: Lọc theo loại ở báo cáo công nợ vật tư"
status: todo
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 2: Lọc theo loại ở báo cáo công nợ vật tư

## Overview

Bốn màn báo cáo công nợ vật tư và bản xuất Excel của chúng nhận thêm bộ lọc "Loại NCC" (Tất cả / Vật tư / Nhân công), qua tham số URL `loai`. Không có `loai` thì giữ nguyên hành vi hiện tại, và mặc định là "Tất cả". Tổng trên mỗi màn tính từ các dòng đã lọc, nên chọn một loại sẽ ra tổng riêng của loại đó. Không thêm dòng tổng phụ theo loại trên màn "Tất cả". <!-- Updated: Validation Session 1 - chỉ bộ lọc, mặc định Tất cả -->

## Hiện trạng (đã kiểm tra 26/11)

| Màn | Nguồn dữ liệu | Lọc theo NCC sẵn có? | Xuất Excel |
|---|---|---|---|
| `/cong-no-vt/tong-hop` | `getMaterialDebtMatrix` (`lib/cong-no-vt/material-ledger-service.ts:495`) | Có `partyIds` (SQL ở `lib/ledger/ledger-aggregations.ts:314-347`) | `cong-no-tong-hop` |
| `/cong-no-vt/tong-hop-cong-trinh` | `getProjectDebtSummary` → `queryDetailReport` (`lib/cong-no-vt/project-debt-summary-service.ts:35`) | Không | `cong-no-cong-trinh` (`lib/export/templates/cong-no-cong-trinh.ts:47`) |
| `/cong-no-vt/bao-cao-thang` | `getMaterialWindowReport` (`material-ledger-service.ts:464`), mỗi dòng một NCC | Không | `cong-no-monthly` (dùng chung với sổ `labor`) |
| `/cong-no-vt/chi-tiet` | `getMaterialDetailReport` → `queryDetailReport` | Không | Không |

- **Bẫy tập rỗng:** `ledger-aggregations.ts:318` coi `partyIds = []` là "không lọc". Nếu một loại chưa có NCC nào mà truyền thẳng `[]` xuống, màn hình sẽ hiện **toàn bộ**. Phải chặn trước khi gọi service.
- Lọc theo Chủ thể ở `/cong-no-vt/tong-hop/tong-hop-filter.tsx` là mẫu cho bộ lọc mới: state cục bộ, chỉ ghi URL khi bấm Áp dụng.
- `DetailReportFilters` (`lib/cong-no-vt/balance-report-service.ts:65`) có `entityIds`, `projectIds`, chưa có `partyIds`.

## Contract change: `DetailReportFilters.partyIds?: number[]` (tùy chọn)

7 nơi gọi `queryDetailReport`, đều tương thích vì trường mới là tùy chọn:
`lib/cong-no-nc/balance-report-service.ts:35`, `lib/cong-no-vt/material-detail-report-service.ts:23` và `:27`, `lib/cong-no-vt/project-debt-summary-service.ts:35`, `lib/du-an/contract-detail/contract-detail-loader.ts:165-166`, `lib/export/templates/cong-no-cong-trinh.ts:47`, `lib/vat-tu-ncc/project-overview-service.ts:207`. Chỉ hai nơi của phase này truyền giá trị.

## Files

- Create: `lib/master-data/supplier-kind-query.ts` (server: `supplierIdsOfKind`)
- Modify: `lib/cong-no-vt/balance-report-service.ts` (`partyIds` trong SQL)
- Modify: `lib/cong-no-vt/material-ledger-service.ts` (`getMaterialWindowReport` nhận `partyIds`)
- Modify: `lib/cong-no-vt/material-detail-report-service.ts`, `lib/cong-no-vt/project-debt-summary-service.ts`, `lib/cong-no-vt/project-debt-pivot.ts` (`parseProjectDebtQuery` nhận `loai`)
- Modify: các trang và bộ lọc dưới `app/(app)/cong-no-vt/{tong-hop,tong-hop-cong-trinh,bao-cao-thang,chi-tiet}/`
- Modify: `app/api/export/excel/route.ts`, `lib/export/templates/{cong-no-tong-hop,cong-no-cong-trinh,cong-no-monthly}.ts`
- Modify: `app/(app)/vat-tu-ncc/page.tsx` (nhãn "Nhân công" trên thẻ NCC)
- Create: `components/ledger/supplier-kind-select.tsx` (ô chọn dùng chung cho các bộ lọc)
- Tests: `lib/export/__tests__/cong-no-tong-hop.route.test.ts`, `cong-no-tong-hop.template.test.ts`, `cong-no-cong-trinh.test.ts`, `cong-no-monthly.template.test.ts`, và test mới cho `supplierIdsOfKind` + bẫy tập rỗng

## Implementation Steps

1. `supplierIdsOfKind(kind)`: trả id của **mọi** NCC thuộc loại đó, gồm cả NCC đã xóa mềm (báo cáo vẫn cộng công nợ của NCC đã xóa, giống cách trang Tổng hợp giữ Chủ thể đã xóa).
2. Một hàm dùng chung cho các trang: `resolveKindFilter(loai)` → `{ kind: null }` (tất cả), `{ kind, partyIds }`, hoặc `{ kind, empty: true }` khi loại chưa có NCC. Khi `empty`, trang và bản xuất Excel trả bảng rỗng, không gọi service.
3. `queryDetailReport`: thêm điều kiện `AND (${partyIdsArr}::int[] IS NULL OR "partyId" = ANY(${partyIdsArr}::int[]))` theo đúng mẫu của `ledger-aggregations.ts`. Áp vào mọi CTE / truy vấn con có đọc `ledger_transactions` và `ledger_opening_balances`, để số dư đầu kỳ cũng được lọc.
4. `getMaterialWindowReport`: lọc dòng theo `partyIds` (mỗi dòng là một NCC, lọc sau khi tính là đủ và không đổi số của từng dòng).
5. Mỗi trang đọc `loai` bằng `parseSupplierKind`, truyền xuống service, thêm ô chọn Loại vào bộ lọc, và đưa `loai` vào `params` của `ExcelExportButton`.
6. Route xuất Excel: đọc `loai` cho ba template. Với `cong-no-monthly`, chỉ áp khi `ledgerType` là `material`; với `labor` bỏ qua tham số.
7. Kiểm tra tổng ở từng màn (DebtMatrix, pivot công trình, báo cáo tháng, chi tiết) được tính từ dòng đã lọc, không lấy từ một truy vấn tổng riêng chưa lọc.
8. `/vat-tu-ncc`: thẻ NCC loại nhân công có nhãn "Nhân công".

## Todo

- [x] `supplierIdsOfKind` + `resolveKindFilter` + test tập rỗng
- [x] `partyIds` trong `queryDetailReport`
- [x] Tổng hợp (NCC × Chủ thể) + Excel
- [x] Tổng hợp theo công trình + Excel
- [x] Báo cáo tháng + Excel
- [x] Chi tiết
- [x] Nhãn loại ở `/vat-tu-ncc`

## Success Criteria

- Không có `loai`: kết quả từng màn và từng file Excel giống hệt trước khi sửa (test template hiện có vẫn xanh, không sửa kỳ vọng).
- Tổng của "Vật tư" cộng "Nhân công" bằng tổng "Tất cả" trên cả bốn màn.
- Loại chưa có NCC nào: bảng rỗng, tổng 0, có test.
- File Excel xuất ra khớp bộ lọc đang xem.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run test:integration` xanh.

## Risks

- Bỏ sót một truy vấn con trong `queryDetailReport` thì số dư đầu kỳ không lọc, tổng "Vật tư" + "Nhân công" lớn hơn "Tất cả". Tiêu chí cộng tổng ở trên bắt được lỗi này.
