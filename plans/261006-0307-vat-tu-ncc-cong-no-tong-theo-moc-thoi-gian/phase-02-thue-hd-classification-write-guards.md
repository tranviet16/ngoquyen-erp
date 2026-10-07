---
phase: 2
title: "Mô-đun phân loại giao dịch, loại thuế hoá đơn, vá quyền ghi"
status: completed
priority: P1
effort: "6h"
dependencies: [1]
---

# Phase 2: Mô-đun phân loại giao dịch, loại thuế hoá đơn (`thue_hd`), vá quyền ghi sổ cái

## Goal

Quy tắc "tăng nợ / giảm nợ" nằm ở một mô-đun hằng + fragment SQL; `thue_hd` tăng nợ ở cột TT và tách dòng trong đối chiếu; các lỗ hổng ghi sổ cái phát hiện ở red-team được đóng trong cùng file.

## Context

- Mẫu Bê tông Hải Phòng kỳ 26/4→26/5: dòng `C = Thuế HĐ: 00000232 ngày 29/5/2026 = 11.448.000` ở cột Nợ; ngày hoá đơn ngoài kỳ nhưng ghi vào kỳ → `date` (ngày ghi sổ) tách `invoiceDate`.
- Quyết định người dùng: loại riêng, vẫn vào công nợ, chỉ cột TT (HĐ = 0 mặc định, nhập tay được).
- Chỗ phân loại chép tay: `lib/ledger/ledger-aggregations.ts` (`querySummary` 54–59 FILTER; `queryMonthlyByParty` 162–177 CASE tách `dieu_chinh`; `queryDebtMatrix` 307–310 FILTER và bỏ sót `dieu_chinh`), `lib/cong-no-vt/balance-report-service.ts` 134–149, `lib/ledger/balance-service.ts` 143–148. Các CASE "`thanh_toan` âm, còn lại dương" (`ledger-aggregations.ts` 141–151, 255–256; `reconciliation-derive-service.ts:95`; `lib/tai-chinh/*`) đã đúng với `thue_hd`, không sửa.
- Lỗ hổng: `patchMaterialTransaction(id, patch, client = prisma, authorized = false)` export từ file `"use server"` (`material-ledger-service.ts:67-75`); `softDeleteMaterialTransaction(s)` không chặn dòng có `paymentRoundItemId`/`deliveryId`; `setMaterialOpeningBalance` không khoá khi NCC đã có kỳ ký.
- Import adapter `lib/import/adapters/cong-no-vat-tu.adapter.ts:29` có enum riêng; parser `cong-no-vat-tu.parse.ts:15-19` dùng chung với nhân công.

## Quy tắc phân loại

| Loại | Nợ | Nhóm báo cáo | Khoá kỳ ký |
|---|---|---|---|
| `lay_hang` | + | Lấy hàng / Phát sinh | có |
| `thue_hd` | + | Lấy hàng / Phát sinh (gộp cột); tách dòng "D. Thuế hoá đơn" trong đối chiếu | có |
| `thanh_toan` | − | Trả / Đã trả | có |
| `dieu_chinh` | ± | dương → Phát sinh, âm → Đã trả | không (lối thoát) |

## Files to Create / Modify (sở hữu riêng của phase 2)

- Create `lib/ledger/transaction-classification.ts` (thuần): `TRANSACTION_TYPES` (as const), `TRANSACTION_TYPE_LABELS`, `DEBT_INCREASE_TYPES = ["lay_hang","thue_hd"]`, `PERIOD_LOCKED_TYPES = ["lay_hang","thue_hd","thanh_toan"]`, `AUTO_GENERATED_GUARD` (dòng có `paymentRoundItemId`/`deliveryId` không sửa tay), fragment `increaseSql(col)`, `decreaseSql(col)`, `typeInSql(types)` với `col` whitelist `"totalTt" | "totalHd"` (ném lỗi runtime nếu khác). Không hàm TS phân loại (không có caller).
- Create `lib/ledger/__tests__/transaction-classification.test.ts` (fragment chứa `'thue_hd'`; `decreaseSql` không chứa; whitelist).
- Create `test/integration/cong-no-thue-hd.integration.test.ts`.
- Modify `lib/ledger/ledger-types.ts`: `TransactionType = (typeof TRANSACTION_TYPES)[number]`; `LedgerTransactionFilter.transactionTypes?`.
- Modify `lib/ledger/ledger-service.ts`: `assertMaterialPeriodOpen` dùng `PERIOD_LOCKED_TYPES`; `list` nhận `transactionTypes`; `update`/`softDelete` từ chối dòng tự sinh (`paymentRoundItemId`/`deliveryId` khác null) trừ khi gọi từ `upsertFromDelivery`/đồng bộ đợt (tham số nội bộ không export, không phải server action vì class không phải action); `setOpeningBalance`/`deleteOpeningBalance` ledgerType material từ chối khi NCC có kỳ ký (`findSignedPeriodCovering` bất kỳ → helper `supplierHasSignedPeriod`).
- Modify `lib/ledger/ledger-aggregations.ts`: `querySummary` FILTER lấy hàng → `typeInSql(DEBT_INCREASE_TYPES)` (gộp thuế vào `layHang*`, không thêm cột); `queryMonthlyByParty` CTE `period` → `increaseSql/decreaseSql`; `queryDebtMatrix` → `increaseSql/decreaseSql` (sửa luôn bỏ sót `dieu_chinh`).
- Modify `lib/ledger/balance-service.ts`: FILTER → `typeInSql(DEBT_INCREASE_TYPES)`, giữ loại `dieu_chinh`, cập nhật comment đầu file.
- Modify `lib/cong-no-vt/balance-report-service.ts`: CASE 134–149 → fragment.
- Modify `lib/cong-no-vt/schemas.ts`: `transactionType: z.enum(TRANSACTION_TYPES)`; `superRefine`: `thue_hd` bắt buộc `invoiceNo`; `amountHd` mặc định "0". `lib/cong-no-nc/schemas.ts` **không đổi** (nhân công không nhận `thue_hd`).
- Modify `lib/cong-no-vt/material-ledger-service.ts`: tách `patchMaterialTransactionInternal(client, id, patch)` không export; action `patchMaterialTransaction(id, patch)` chỉ còn 2 tham số; `bulkUpsertMaterialTransactions` gọi hàm nội bộ; guard admin dòng 118 dùng `PERIOD_LOCKED_TYPES`; `softDeleteMaterialTransaction(s)`/`patch` từ chối dòng tự sinh; `REVALIDATE_PATHS` thêm `"/cong-no-vt/tong-hop"`; sau ghi gọi `revalidatePath(`/vat-tu-ncc/${partyId}`, "layout")` (literal, phủ tab thanh toán và đối chiếu kể cả trang con).
- Modify `lib/vat-tu-ncc/reconciliation-derive-service.ts`: export `supplierBalanceAsOf` (phase 6 dùng); `ReconComputed` thêm `taxRows: ReconTaxRow[]` (`id, date, amount, invoiceNo, invoiceDate, content, projectLabel`) và `totalTax`; nhánh `thue_hd` trong vòng phân loại; `closing = opening + totalIn + totalTax − totalPaid + totalAdjust`; `signReconciliation` ghi `totalIn` = B, JSON chứa `taxRows/totalTax`; `getReconciliationView` mặc định `taxRows ?? []`, `totalTax ?? 0`; `listReconciliationsDerived` trả `otherAmount = closing − opening − totalIn + totalPaid`.
- Modify `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx` (khối "D. Thuế hoá đơn" sau C; dòng tổng "A + B − C + D ± Điều chỉnh") và `doi-chieu-client.tsx` (cột "Thuế/ĐC").
- Modify `components/ledger-grid/transaction-grid.tsx` (`TX_TYPES` 69–73 từ `TRANSACTION_TYPE_LABELS`, prop `allowedTypes?` mặc định tất cả), `components/ledger/transaction-form-dialog.tsx` (27–29), `components/ledger/transaction-grid.tsx` (73–75, 142). `app/(app)/cong-no-nc/nhap-lieu/page.tsx` truyền `allowedTypes` không có `thue_hd` (một dòng; schema NC đã từ chối ở server).
- Modify `lib/import/adapters/cong-no-vat-tu.adapter.ts:29` enum thêm `thue_hd`; `cong-no-vat-tu.parse.ts` `normalizeTxType(val, allowTax)`: kiểm "trả" trước, rồi "thuế"/"thue"/"tax" → `thue_hd` chỉ khi `allowTax` (adapter nhân công truyền false).
- Modify `lib/ledger/__tests__/ledger-aggregations.test.ts` (mock cho CASE mới), `lib/export/__tests__/doi-chieu.template.test.ts` nếu header đổi (không đổi: thuế đã gộp vào Lấy hàng).

## Tasks & Steps

1. Mô-đun phân loại + unit test.
2. Type, zod (chỉ VT), nhãn, `allowedTypes`, trang NC truyền prop.
3. Thay SQL ở 3 truy vấn + lũy kế + số dư; chạy `cong-no-luy-ke` và pilot integration (phải xanh).
4. Đối chiếu: `taxRows/totalTax`, snapshot, 2 màn, export `supplierBalanceAsOf`.
5. Vá quyền ghi: bỏ `authorized`, guard dòng tự sinh, khoá số dư ban đầu khi có kỳ ký, guard kỳ ký cho `thue_hd`; thêm test unit `test/unit/module-release-entrypoints.test.ts` vẫn xanh.
6. Import adapter + parser.
7. Integration `cong-no-thue-hd` (fixture Bê tông Hải Phòng, **một Chủ thể, một công trình** cho mọi dòng để các hạt gộp so sánh được): opening 315.648.111 asOf 26/4; `lay_hang` 27/4: 20.880.000 + 2.900.000; `thue_hd` `date` 26/5, `invoiceNo` "00000232", `invoiceDate` 29/5, `amountTt` 11.448.000, `amountHd` 0. Khẳng định: `computeReconciliation(27/4→26/5)` `totalIn` 23.780.000, `totalTax` 11.448.000, `closing` 350.876.111; `querySummary.balanceTt`, `queryCurrentBalance(entity, supplier, project)`, `getOutstandingDebt`, `queryDebtMatrix.totals.closeTt` cùng 350.876.111; `queryDetailReport.phatSinhTt` 35.228.000; sau ký `totalIn` 23.780.000, `closingBalance` 350.876.111, JSON `totalTax` 11.448.000; ghi `thue_hd` ngày 10/5 sau ký bị từ chối; `thue_hd` thiếu `invoiceNo` bị zod từ chối; `patchMaterialTransaction` trên dòng có `paymentRoundItemId` bị từ chối; `setMaterialOpeningBalance` cho NCC có kỳ ký bị từ chối; nhân công tạo `thue_hd` bị từ chối.
8. Grep `dieu_chinh` toàn `lib components app` xác nhận không còn phân loại chép tay ngoài mô-đun và `lib/tai-chinh/*`.

## Todo

- [x] Mô-đun phân loại + unit test
- [x] Type, zod VT (superRefine), nhãn, `allowedTypes`
- [x] 3 truy vấn + lũy kế + số dư dùng fragment, parity xanh
- [x] Đối chiếu: thuế tách dòng, snapshot, export `supplierBalanceAsOf`
- [x] Vá `authorized`, guard dòng tự sinh, khoá số dư ban đầu
- [x] Import adapter + parser
- [x] Integration Bê tông Hải Phòng
- [x] Grep rà soát; `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
```

## Risks

- Sót chỗ phân loại → lệch số. Giảm thiểu: fragment chung, integration 5 đường, grep.
- Bỏ `authorized` làm vỡ caller nội bộ. Giảm thiểu: grep `patchMaterialTransaction(` (hiện: `bulkUpsertMaterialTransactions` và grid); `tsc` bắt hết.
- Rollback khi đã có `thue_hd`: FILTER cũ loại bỏ dòng → tổng giảm; phải đổi các dòng đó thành `dieu_chinh` dương trước khi revert.
