---
phase: 2
title: "Công Nợ NCC đọc sổ VT"
status: todo
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Công Nợ NCC đọc sổ VT

## Goal

Tab Công Nợ NCC của mọi công trình hiện công nợ từng NCC lấy từ sổ Công nợ vật tư, bằng đúng báo cáo lũy kế, và bỏ công thức cũ.

## Hiện trạng (đã kiểm 26/11)

- `app/(app)/du-an/[id]/cong-no/page.tsx` gọi 3 server action của `lib/du-an/supplier-debt-service.ts` ("use server"), lọc theo chuỗi `?suppliers=` bằng `.split` (`:13,26-27`; mảng lặp tham số sẽ ném lỗi). Không có link nội bộ nào dựng `?suppliers=`.
- `supplier-debt-service.ts:50-51` chỉ tính `lay_hang, giao_vat_lieu` / `tra_tien, thanh_toan, tra_hang` trên `project_transactions`, gom theo chuỗi `partyName`.
- `cong-no-client.tsx` (166 dòng) import type từ service (`:11-15`); comment `:58` "tab này giữ nguồn cũ"; link `/vat-tu-ncc/cong-trinh/{id}` ở `:142-149` chưa kiểm quyền `vat-tu-ncc`. <!-- Red team: F5 -->
- `supplier-multi-select.tsx` chỉ được `cong-no-client.tsx:10,133` dùng.
- `app/(app)/vat-tu-ncc/[supplierId]/` không có `page.tsx` (chỉ layout + tab con); link đúng là `/vat-tu-ncc/{id}/ngay` (`app/(app)/vat-tu-ncc/page.tsx:54`), tab cặp nhận `?projectId=` (`[supplierId]/layout.tsx:72`). <!-- Red team: F5 -->
- `test/unit/module-release-entrypoints.test.ts:45,50,212-221` bắt page gọi `await requireModuleAccess("du-an", { … scope: { kind: "project", projectId } })` trước mọi `await` khác.
- `lib/du-an/__tests__/project-service-acl-contract.test.ts:15` liệt kê `supplier-debt-service.ts`.

## Files

- Modify: `app/(app)/du-an/[id]/cong-no/page.tsx` — giữ nguyên guard trang đầu tiên; đọc `?ncc=` bằng `parseSupplierFilter`; gọi `loadProjectLedger(projectId, { supplierIds, withRows: false })`; kiểm `canAccess` của `vat-tu-ncc` để hiện link. <!-- Red team: F7, F9 -->
- Modify: `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx` — viết lại: cột NCC, Đầu kỳ, Phát sinh, Đã trả, Còn nợ cho TT và HĐ, Phiếu chưa chốt; hàng tổng lấy từ server (khi lọc thì ghi "Tổng các NCC đang lọc"); chú thích nguồn "Sổ Công nợ vật tư, lũy kế toàn bộ, cộng mọi Chủ thể"; mỗi NCC có link "Mở sổ NCC" tới `/vat-tu-ncc/{id}/ngay?projectId={projectId}` và link chung "Theo công trình" tới `/vat-tu-ncc/cong-trinh/{projectId}`, cả hai chỉ khi có quyền `vat-tu-ncc`; `PendingDeliveriesNotice` (phase 1). <!-- Red team: F5 -->
- Modify: `app/(app)/du-an/[id]/cong-no/supplier-multi-select.tsx` — nhận `{ id, label }`.
- Delete: `lib/du-an/supplier-debt-service.ts`.
- Modify: `lib/du-an/__tests__/project-service-acl-contract.test.ts` — bỏ dòng `supplier-debt-service.ts`.

## Tasks & Steps

1. `grep -rn "supplier-debt-service\|SupplierDebtRow\|SupplierDebtSummary"` để chắc chỉ còn 3 file trên dùng; xóa service.
2. Viết page và client như trên. `?ncc=1,2`; tham số lạ bị bỏ; rỗng sau khi lọc = không lọc.
3. Kiểm tay trên dev (server dev 3002/3003, DB 5434): #1, #4, #14 so với `/cong-no-vt/chi-tiet` chế độ "Toàn bộ" lọc công trình, bật "hiện dòng 0", từng NCC (cộng các Chủ thể) và tổng, TT và HĐ.
4. Bấm thử mọi link "Mở sổ NCC" của #14: không có trang 404.
5. Đăng nhập người dùng thử không phải admin có du-an nhưng không có `cong-no-vt`: thấy bảng tổng (giống tab Hợp đồng), không có link Vật tư NCC nếu không có quyền đó.

## Verification

Trước mọi lệnh integration: xác nhận cổng `DATABASE_URL` là 5435, sai thì dừng. <!-- Red team: F6 -->

- `npx tsc --noEmit`, lint
- `npx vitest run --project unit` (toàn bộ, gồm guard thứ tự ở `module-release-entrypoints`) <!-- Red team: F7 -->
- Integration của phase 1 vẫn xanh
- Bảng so tay dev ghi vào `reports/` của plan (chỉ `NCC #id`, không ghi số tiền)

## Rủi ro

- #4 đổi số (từ HĐ sổ Hóa đơn sang TT + HĐ sổ công nợ) — chủ đầu tư chọn sổ công nợ (Validation Session 1), ghi ở phase 4.
