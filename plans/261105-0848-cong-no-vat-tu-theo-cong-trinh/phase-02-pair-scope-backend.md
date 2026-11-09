---
phase: 2
title: "Phạm vi cặp trên mọi đường ghi"
status: pending
priority: P1
effort: "16h"
dependencies: [1]
---

# Phase 2: Phạm vi cặp (NCC × công trình) trên mọi đường ghi

<!-- Updated: Red Team 2026-11-06 — bỏ chế độ marker cũ; suy Chủ thể từ công trình; guard mốc chuyển đổi toàn cục; liệt kê nơi gọi không định kiểu; chỉ sửa tiến -->

## Goal

Đưa D1 vào lõi nghiệp vụ: chốt, ký, khóa của NCC A tại công trình X không ảnh hưởng A tại Y, và mọi đường ghi vật tư kiểm theo cặp. UI hiện có chỉ sửa đủ để chạy đúng; UX mới làm ở phase 3.

## Quy tắc

- **Khóa advisory giữ theo NCC.** `lockSuppliers` ở `lib/vat-tu-ncc/period-lock.ts:36` không đổi. Mọi kiểm tra và ghi cho một cặp đều chạy dưới khóa NCC theo quy ước "khóa rồi mới kiểm" (`period-lock.ts:7-11`).
- **Không còn marker không có công trình.** `SupplierReconciliation.projectId` bắt buộc từ phase 1, nên không cần nhánh "khóa toàn NCC".
- **Marker chuyển đổi** là marker có `importRunId` khác NULL. UI không gỡ ký, sửa hay xóa được nó; chỉ hoàn tác import (phase 5) mới xóa được.
- **Guard mốc chuyển đổi toàn cục.** Khi đã có run `vat-tu-chuyen-doi` ở trạng thái `committed`, mọi ghi vật tư có ngày ≤ mốc của run đó đều bị từ chối, với mọi cặp, kể cả cặp tạo sau go-live. Áp dụng cho phiếu ngày, sổ vật tư tay, số dư ban đầu, đồng bộ đợt thanh toán. Ngoại lệ: `dieu_chinh` vẫn được ghi nhưng phải mang ngày > mốc, đúng chính sách hiện có "chênh lệch đi qua kỳ sau". Ghi từ chính run import không đi qua guard này. Hàm `getMaterialCutoverDate(db)` đọc mốc từ `reviewJson` của run đã commit; không có run thì trả `null` (test và môi trường dev không bị ảnh hưởng).
- **Chủ thể suy từ công trình.** Với ghi vật tư và dòng đợt `vat_tu`, server đặt `entityId = Project.entityId`, theo cách `period-close-service.ts:205,295` đang làm. Công trình chưa có Chủ thể thì báo lỗi `missing_entity` ("Công trình chưa gán Chủ thể — gán ở Master data > Công trình"). Không có kiểm tra thứ hai.
- Sổ vật tư, phiếu, dòng đợt `vat_tu` mới hoặc sửa, kỳ, số dư ban đầu vật tư đều bắt buộc có `projectId`.
- Đổi chữ ký hàm **không có giá trị mặc định**, rồi rà thêm các nơi gọi không định kiểu ở bảng dưới, vì `tsc` không bắt được chúng.

## Files to Create / Modify

| Tệp | Thay đổi |
|---|---|
| `lib/vat-tu-ncc/period-lock.ts` | `findSignedPeriodCovering(s, p, date)`, `assertPeriodOpen(s, p, date)` (gồm guard mốc toàn cục), `loadPeriodBoundsContext(s, p)`, `assertPeriodBounds(s, p, range)`, `suggestRangeForPair(s, p)`, `assertPairOpeningEditable(s, p)`, `isCutoverMarker(recon)`, `getMaterialCutoverDate(db)`. `lockSuppliers` giữ nguyên. |
| `lib/vat-tu-ncc/period-bounds.ts` | Không đổi (hàm thuần). |
| `lib/vat-tu-ncc/reconciliation-compute.ts` (tạo, không "use server") | Chuyển `computeReconciliation` và `headerNames` từ `reconciliation-derive-service.ts` (`:104-209`, `:264-277`) sang đây, với `(supplierId, projectId, from, to, db)`. Thêm `freezeReconciliationSnapshot(db, reconId)`. `ReconPaymentRow`/`ReconTaxRow` có `projectId`. |
| `lib/vat-tu-ncc/supplier-balance.ts` | Thêm `pairBalanceAsOf(s, p, asOf, db)`. |
| `lib/vat-tu-ncc/reconciliation-derive-service.ts` | Dùng module compute. List / xem / ký / gỡ ký theo cặp; gỡ ký chỉ xét kỳ sau của cùng cặp; từ chối marker chuyển đổi. |
| `lib/vat-tu-ncc/reconciliation-service.ts` | CRUD kỳ theo cặp; kiểm trùng theo cặp (`:67-71`); từ chối sửa hoặc xóa marker chuyển đổi. |
| `lib/vat-tu-ncc/period-close-service.ts` | `previewPeriodClose(s, p, range?)`, `commitPeriodClose(s, p, range, prices)`; lọc phiếu theo `projectId` (`:94-99`, `:253-256`). **`existingRecon` tìm theo (NCC, công trình, biên)** (`:314-321`). Marker tạo với `projectId`. |
| `lib/vat-tu-ncc/delivery-service.ts` | `projectId` bắt buộc; khi sửa thì kiểm cả (cặp cũ, ngày cũ) và (cặp mới, ngày mới). `listDeliveries(s, {projectId?})`, `listDeliveriesMonthly(s, {projectId?})`. Bản tháng truy vấn bảng có `GROUP BY`, vì view tháng không có `projectId`. |
| `lib/vat-tu-ncc/period-recon-check-service.ts` | Lọc theo cặp; phiếu nằm trong marker chuyển đổi được gắn cờ "lịch sử Excel — không cần event", không tính là lệch. |
| `lib/vat-tu-ncc/schemas.ts` | `projectId` bắt buộc ở schema phiếu và schema kỳ. |
| `lib/ledger/ledger-service.ts` | Nhánh material: bắt buộc `projectId`, suy `entityId` từ công trình, `assertMaterialPeriodOpen(type, partyId, projectId, date)` ở create / update / softDelete / upsertFromDelivery (`:138`, `:191-193`, `:245`, `:276`, `:320`). Khóa số dư ban đầu theo cặp (`:87-99`), gom về **một** hàm dùng chung với `material-ledger-service.ts:244`. Nhánh labor không đổi. |
| `lib/cong-no-vt/material-ledger-service.ts`, `lib/cong-no-vt/schemas.ts` | `projectId` bắt buộc cho sổ vật tư (`schemas.ts:24`); patch và bulk truyền cặp; `bulkUpsert` từ chối dòng vật tư thiếu công trình bằng lỗi tiếng Việt. |
| `lib/payment/payment-ledger-sync.ts` | `assertPeriodOpen(s, p, date)` (`:39`); dòng `vat_tu` thiếu công trình thì lỗi rõ ràng. |
| `lib/payment/payment-service.ts` | `upsertItem` (`:220`): dòng `vat_tu` bắt buộc `projectId`, `entityId` suy từ công trình. Các bước duyệt / từ chối / làm mới / đóng (`:409`, `:472`, `:495`, `:534`) với dòng cũ thiếu công trình thì báo lỗi rõ thay vì 23514; dòng cũ đã đóng không bị đụng tới. |

**Nơi gọi không định kiểu** (`tsc` không bắt được) phải sửa trong phase này:
- `components/ledger-grid/transaction-grid.tsx:163-189` và `components/ledger-grid/opening-grid.tsx:106-111`: dòng tạm tạo với `projectId: null` qua `bulkUpsert`. Thêm prop `requireProject` (chỉ vật tư; nhân công không đổi) để buộc chọn công trình trước khi lưu dòng. Dùng ở `app/(app)/cong-no-vt/{nhap-lieu,so-du-ban-dau}/page.tsx`.
- `components/cong-no-vt/transaction-form-dialog.tsx` và `components/ledger/{transaction-grid,transaction-form-dialog,opening-balance-client}.tsx`: rà bằng `grep` từ hai trang trên để xác định component nào còn được dùng; component còn dùng thì thêm `requireProject`.
- `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx:36-60`: truy vấn trực tiếp mọi kỳ ký của NCC và nợ toàn NCC. Đổi sang theo cặp (phase 3 hoàn thiện bộ chọn công trình).
- Các nơi gọi `supplierBalanceAsOf`, gồm `thanh-toan/page.tsx:40`.

## Tasks & Steps

1. Đổi chữ ký trong `period-lock.ts` và thêm guard mốc toàn cục; chạy `npx tsc --noEmit` để liệt kê nơi gọi có kiểu (~9 tệp: `lib/cong-no-vt/material-ledger-service.ts`, `lib/ledger/ledger-service.ts`, `lib/payment/payment-ledger-sync.ts`, `lib/vat-tu-ncc/{delivery-service,period-close-service,period-lock,reconciliation-derive-service,reconciliation-service}.ts`, test lock).
2. Tách `reconciliation-compute.ts`.
3. Sửa từng service; suy Chủ thể từ công trình.
4. Sửa payment.
5. Sửa nơi gọi không định kiểu theo danh sách trên, và chạy `grep -rn "projectId: null" components app` để rà sót.
6. Viết test.

## Tests

- Tạo `test/integration/vat-tu-ncc-khoa-theo-cap.integration.test.ts`. Dữ liệu: NCC A, hai công trình X và Y cùng Chủ thể; phiếu 18 m³ × 1.610.000 ở X, phiếu 0,5 ca × 2.800.000 ở Y. Các ca:
  - (a) Chốt và ký A×X kỳ 27/09→26/10. Phiếu A×X ngày 15/10 bị từ chối; phiếu A×Y ngày 15/10 vẫn được.
  - (b) Chốt A×Y cùng kỳ thì **tạo marker riêng cho A×Y**: khẳng định có hai marker, mỗi cặp một.
  - (c) Snapshot A×X chỉ có dòng của X; dư mang sang chỉ tính X.
  - (d) Số dư ban đầu A×X chỉ đọc, A×Y sửa được.
  - (e) Đợt thanh toán: dòng `vat_tu` thiếu công trình bị từ chối; đóng đợt rơi vào kỳ ký của X bị từ chối, của Y thì qua.
  - (f) Công trình chưa có Chủ thể: ghi vật tư lỗi `missing_entity`.
  - (g) Gỡ ký marker có `importRunId` bị từ chối.
  - (h) Có run chuyển đổi `committed` với mốc 26/10: ghi phiếu ngày 20/10 ở một cặp **mới** bị từ chối; `dieu_chinh` ngày 30/10 vẫn được.
- Thay `lib/vat-tu-ncc/__tests__/period-lock-supplier-ids.test.ts` bằng `period-lock-pairs.test.ts`.
- Cập nhật `lib/vat-tu-ncc/__tests__/period.test.ts` (schema phiếu) và `lib/cong-no-vt/__tests__/schemas.test.ts` (schema sổ) cho `projectId` bắt buộc.
- Cập nhật fixture có công trình trong `test/integration/{vat-tu-ncc-chot-ky-linh-hoat,vat-tu-ncc-pilot,vat-tu-ncc-thanh-toan,ledger-business-date,payment-service,cong-no-luy-ke,cong-no-thue-hd,cong-no-window}.integration.test.ts` và `lib/payment/__tests__/payment-service.test.ts`.
- `lib/vat-tu-ncc/__tests__/period-bounds.test.ts` giữ nguyên.

## Ownership & Rollback

- Sở hữu: `lib/vat-tu-ncc/*` (trừ `project-overview-service.ts` của phase 3), `lib/ledger/ledger-service.ts`, `lib/payment/{payment-ledger-sync,payment-service}.ts`, `lib/cong-no-vt/{material-ledger-service,schemas}.ts`, `components/ledger-grid/*`, các component sổ liệt kê ở trên, cùng các test liệt kê.
- Sửa ở mức chạy đúng trong `app/(app)/vat-tu-ncc/[supplierId]/thanh-toan/page.tsx`; phase 3 làm tiếp sau, cùng luồng.
- **Chỉ sửa tiến.** Sau migrate phase 1, code cũ không chạy được với dữ liệu mới (kỳ thiếu công trình bị DB từ chối). Muốn quay lại thì khôi phục DB cùng build cũ.

## Verification

- `npx tsc --noEmit`
- `npx vitest run --project unit lib/vat-tu-ncc lib/ledger lib/payment lib/cong-no-vt`
- `npx vitest run --project integration test/integration/vat-tu-ncc-khoa-theo-cap.integration.test.ts` và các file integration đã cập nhật
