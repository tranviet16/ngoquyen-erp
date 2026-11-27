---
phase: 1
title: "Lớp đọc sổ VT theo công trình"
status: todo
priority: P1
effort: "5h"
dependencies: []
---

# Phase 1: Lớp đọc sổ VT theo công trình

## Goal

Một lớp đọc duy nhất trả về dữ liệu sổ Công nợ vật tư của một công trình (công nợ từng NCC, tổng, phiếu chưa chốt, dòng sổ, số dòng), kiểm quyền theo tiền lệ tab Hợp đồng, kèm thông báo phiếu chưa chốt dùng chung, để phase 2 và 3 chỉ việc vẽ và chạy song song được.

## Hiện trạng (đã kiểm 26/11)

- `lib/du-an/contract-detail/ledger-source.ts:39` `loadLedgerRows`, `:84` `loadLedgerOpenings` (Prisma `findMany`), `:113` `loadPendingDeliveries` — theo một cặp NCC × công trình, không "use server". Bên dùng: `contract-detail-loader.ts:18`, `scripts/verify-contract-detail-tie-out.ts:16`, `test/integration/du-an-hop-dong-tie-out.integration.test.ts`, và danh sách "không use server" ở `test/unit/module-release-entrypoints.test.ts:182-189`. Không đổi chữ ký các hàm này.
- `lib/cong-no-vt/balance-report-service.ts:114` `queryDetailReport` trả `DetailRow` có `partyId`, `partyName`, 8 số chuỗi đã làm tròn theo Chủ thể × NCC × công trình; chỉ đọc `ledger_opening_balances` + `ledger_transactions` (`:140-185`). `projectIds: []` nghĩa là MỌI công trình (`:138`); `partyIds: []` nghĩa là không NCC nào (`:133-135`); mảng ép kiểu `::int[]` (`:151-152`) nên giá trị > 2147483647 làm Postgres báo lỗi.
- `lib/du-an/contract-detail/list-figures.ts:103` `sumReportRows`; `:88` `sumByEntityRounded` (chỉ dùng làm oracle trong test).
- Tiền lệ quyền: `contract-detail-loader.ts:5-7,111-118,155-178` — người đọc được dự án thấy các tổng công nợ từng NCC và số phiếu chưa chốt; danh sách từng dòng sổ cần thêm `canAccess(userId, "cong-no-vt", { minLevel: "read", scope: "module" })` (`lib/acl/effective.ts:125`, gồm cổng phát hành, admin bỏ qua). `test/integration/du-an-hop-dong-tie-out.integration.test.ts:239-247` khẳng định điều này.
- `lib/vat-tu-ncc/pair-scope.ts:123-127` `getMaterialCutoverDate` ném `MaterialScopeError` khi run chuyển đổi đã commit không có ngày.
- Dev: 47 dòng sổ có lẻ đồng; 1015/1028 dòng sổ VT không có `deliveryId` / `paymentRoundItemId`; #1 có 490 dòng sổ + 1 số dư đầu kỳ.

## Quyền xem (chốt 26/11, Validation Session 1)

<!-- Updated: Validation Session 1 - quyền xem giống tab Hợp đồng -->
Giống tab Hợp đồng: người có quyền đọc du-an của công trình thấy công nợ từng NCC, tổng và số phiếu chưa chốt; từng dòng sổ, số dư đầu kỳ chi tiết và số dòng sổ chỉ trả về khi có thêm quyền đọc `cong-no-vt`. <!-- Red team: F1 -->

## Files

- Modify: `lib/du-an/contract-detail/ledger-source.ts` — chỉ export phần dùng chung: vị từ "phiếu chưa có dòng sổ, sau mốc chuyển đổi, ngoài kỳ chuyển đổi" của `loadPendingDeliveries`. Hàm cũ giữ nguyên hành vi.
- Create: `lib/du-an/project-ledger/project-ledger-source.ts` — truy vấn thô theo công trình, dùng fragment `increaseSql` / `decreaseSql` của `lib/ledger/transaction-classification.ts` (không chép literal loại giao dịch):
  - `loadProjectLedgerRows(projectId)`: mọi dòng `ledgerType = 'material'`, chưa xóa, của công trình: `id, entityId, partyId, date, transactionType, invoiceNo, content, qty, itemName`, tăng / giảm TT và HĐ.
  - `countProjectLedgerRows(projectId)`: `COUNT(*)` cùng điều kiện. <!-- Red team: F3, F4 -->
  - `loadProjectLedgerOpenings(projectId)`: số dư đầu kỳ VT theo Chủ thể × NCC.
  - `loadPendingDeliveriesByProject(projectId)`: như `loadPendingDeliveries` nhưng GROUP BY `supplierId`; chỉ trả `count` và `unpricedCount`, không trả số tiền (dữ liệu của Vật tư NCC). <!-- Red team: F10 -->
- Create: `lib/du-an/project-ledger/supplier-balances.ts` — hàm thuần: gom `DetailRow[]` theo `partyId` bằng `sumReportRows`; thêm NCC chỉ có phiếu chưa chốt (không có dòng báo cáo) với 8 số bằng 0, tên lấy từ bảng `suppliers`; sắp theo tên; tổng = `sumReportRows` trên các dòng báo cáo của đúng tập NCC đang hiện (sau lọc). <!-- Red team: F8, F9 -->
- Create: `lib/du-an/project-ledger/project-ledger-loader.ts` — không "use server", không `server-only` (gói chưa cài):
  - `parseSupplierFilter(raw)`: nhận `string | string[] | undefined` (lấy phần tử đầu như `app/(app)/cong-no-vt/chi-tiet/page.tsx:28`), tách dấu phẩy, giữ số nguyên 1…2147483647, bỏ trùng; danh sách rỗng sau khi lọc = không lọc. <!-- Red team: F9 -->
  - `loadProjectLedgerSwitchInfo(projectId)`: nhẹ, cho tab Giao Dịch: `{ rowsVisible, rowCount? }`; `rowCount` chỉ có khi `rowsVisible`. <!-- Red team: F3 -->
  - `loadProjectLedger(projectId, { supplierIds?, withRows })`: `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`; chặn `projectId` không phải số nguyên dương; `queryDetailReport({ ledgerType: "material", projectIds: [projectId], partyIds?, showZero: true })` không cửa sổ ngày (lũy kế, như `contract-detail-loader.ts:163-165`); phiếu chưa chốt theo NCC; `rowsVisible = canAccess(userId, "cong-no-vt", read)`; nếu `withRows && rowsVisible` thì dòng sổ, số dư đầu kỳ (kèm `partyName`) và `rowCount`.
  - Kết quả `{ suppliers, totals, pending, rowsVisible, rows?, openings?, rowCount? }`, số tiền là chuỗi để qua RSC.
- Create: `components/du-an/pending-deliveries-notice.tsx` — "Có N phiếu ngày chưa chốt vào sổ (M chưa có giá)"; dùng ở phase 2 và 3. <!-- Red team: F4 -->
- Modify: `test/unit/module-release-entrypoints.test.ts` — thêm 3 file `lib/du-an/project-ledger/*.ts` vào danh sách không được "use server" (`:182-189`). <!-- Red team: F7 -->
- Create: `lib/du-an/project-ledger/__tests__/supplier-balances.test.ts`, `lib/du-an/project-ledger/__tests__/supplier-filter.test.ts`
- Create: `test/integration/du-an-so-cong-no-vt.integration.test.ts`

## Tasks & Steps

1. Đọc `node_modules/next/dist/docs/` phần server function / data fetching trước khi viết (AGENTS.md; hook của phiên lập kế hoạch chặn đọc thư mục này nên chưa kiểm).
2. Tách vị từ phiếu chưa chốt trong `ledger-source.ts` thành fragment export; `loadPendingDeliveries` dùng lại fragment; chạy lại tie-out test hợp đồng để chắc hành vi không đổi.
3. Viết `project-ledger-source.ts`, `supplier-balances.ts`, `project-ledger-loader.ts`, `pending-deliveries-notice.tsx`; sửa danh sách trong `module-release-entrypoints.test.ts`.
4. Unit test: gom nhiều Chủ thể cùng NCC; NCC chỉ có số dư đầu kỳ; NCC chỉ có phiếu chưa chốt; tổng khi lọc = Σ NCC đang hiện; `parseSupplierFilter` với mảng, giá trị âm, chữ, 2147483648, chuỗi rỗng.
5. Integration test trên Postgres tạm 127.0.0.1:5435. Seed: 2 công trình, 2 Chủ thể, 3 NCC; số dư đầu kỳ; đủ 4 loại giao dịch; `dieu_chinh` hai dấu; 0,5 đồng ở Chủ thể thứ hai; một dòng xóa mềm; một dòng công trình khác; phiếu ngày đã chốt, chưa chốt, trước mốc chuyển đổi; một NCC thứ tư chỉ có phiếu chưa chốt; một hợp đồng NCC (`docType 'contract'`, `partyKind 'ncc'`, `supplierId`); vài dòng `project_transactions` mang tên NCC. <!-- Red team: F8, F12 --> Khẳng định:
   - (a) 8 số mỗi NCC = `sumReportRows` của các dòng báo cáo NCC đó; lọc `supplierIds` thì tổng chỉ gồm NCC được lọc;
   - (b) `sumByEntityRounded(số dư đầu kỳ + dòng sổ đã nạp)` khớp (a) → danh sách dòng đủ; `rowCount` = số dòng đã nạp;
   - (c) thêm / xóa `project_transactions` không đổi kết quả loader;
   - (d) Còn nợ TT của NCC có hợp đồng khớp `loadContractListFigures`;
   - (e) số phiếu chưa chốt theo công trình = tổng `loadPendingDeliveries` theo cặp; NCC chỉ có phiếu chưa chốt có mặt trong danh sách; chốt một phiếu thì nó rời "chưa chốt" và vào số dư đúng một lần;
   - (f) người dùng KHÔNG phải admin: có du-an nhưng không có `cong-no-vt` → có `suppliers`, `totals`, `pending` (đúng như tab Hợp đồng) nhưng `rowsVisible: false`, không có `rows`, `openings`, `rowCount`; `cong-no-vt` chưa phát hành → như trên; không có quyền công trình → bị từ chối; `projectId` 0 / âm → bị từ chối, không trả dữ liệu công trình khác. <!-- Red team: F1 -->
6. Chạy kiểm như mục Verification.

## Verification

Trước mọi lệnh integration: in ra cổng trong `DATABASE_URL` của môi trường hiện tại; nếu không phải 5435 thì DỪNG. Không chạy integration từ worktree cắt trước commit f7ada4f mà không truyền `DATABASE_URL` tường minh (`test/helpers/test-db.ts:23` chỉ kiểm tên DB đuôi `_test`). <!-- Red team: F6 -->

- `npx tsc --noEmit`
- `npx vitest run --project unit` (toàn bộ, gồm `module-release-entrypoints` và `project-service-acl-contract`) <!-- Red team: F7 -->
- `npm run test:integration -- du-an-so-cong-no-vt du-an-hop-dong-tie-out` với `DATABASE_URL` trỏ 127.0.0.1:5435, chạy từ PowerShell

## Rủi ro

- Gọi `queryDetailReport` với `projectIds: []` trả mọi công trình → chặn ở loader, có test.
- Lộ dữ liệu qua server action → loader không "use server", có test cấu trúc.
