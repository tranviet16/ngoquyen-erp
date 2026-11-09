---
phase: 3
title: "Cửa vào theo công trình, master data Chủ thể"
status: pending
priority: P1
effort: "12h"
dependencies: [2]
---

# Phase 3: Cửa vào theo công trình

<!-- Updated: Red Team 2026-11-06 — bỏ cây route lồng, dùng ?projectId= trên trang NCC; quyền cong-no-vt cho số nợ; kiểm kỳ đúng cặp; khóa đổi Chủ thể khi đã có dữ liệu -->
<!-- Updated: Validation Session 1 - tab Dự án giữ nguồn project_transactions, chỉ thêm liên kết -->

## Goal

Kế toán làm việc theo nếp Excel (công trình → NCC → các sheet): nhập phiếu, xem tháng, chốt kỳ, đối chiếu, thanh toán cho từng NCC × công trình. Lỗi khóa kỳ hiện trên UI. Chủ thể của công trình chỉnh được ở master data, nhưng bị khóa khi công trình đã có dữ liệu vật tư.

## Thiết kế route

- Thêm 2 trang danh sách: `/vat-tu-ncc/cong-trinh` và `/vat-tu-ncc/cong-trinh/[projectId]`. Liên kết từ đây dẫn sang trang NCC hiện có với tham số `?projectId=X`, ví dụ `/vat-tu-ncc/[supplierId]/ngay?projectId=X`.
- Không tạo cây route lồng. Trang `page.tsx` đọc được `searchParams`; tab ở layout giữ tham số bằng client component dùng `useSearchParams`. `revalidatePath` theo NCC hiện có vẫn áp dụng, vì tham số query không đổi path.
- Các tab bắt buộc theo cặp (`chot-ky`, `doi-chieu`, `doi-chieu/[reconciliationId]`, `thanh-toan`, `kiem-tra-khop`): thiếu `projectId` thì hiện **bộ chọn công trình** của NCC. `ngay` và `thang` không có tham số thì xem mọi công trình; form tạo phiếu bắt buộc chọn công trình. `bao-gia` giữ theo NCC.

## Files to Create / Modify

Tạo:
- `app/(app)/vat-tu-ncc/cong-trinh/page.tsx`: danh sách công trình có hoạt động vật tư (phiếu hoặc sổ).
- `app/(app)/vat-tu-ncc/cong-trinh/[projectId]/page.tsx`: các NCC của công trình, gồm số phiếu, kỳ gần nhất (chuyển đổi / chưa ký / đã ký) và liên kết. Cột nợ TT/HĐ (từ `queryDetailReport({ledgerType:"material", projectIds:[id], to: hôm nay})`) **chỉ hiện khi người dùng có quyền đọc `cong-no-vt`**, giống cách layout NCC ẩn tab Thanh toán (`app/(app)/vat-tu-ncc/[supplierId]/layout.tsx:17-19,42`).
- `lib/vat-tu-ncc/project-overview-service.ts` ("use server", guard `vat-tu-ncc`): `listProjectsWithMaterial()`, `listPairsOfProject(projectId, {includeDebt})`, `listSupplierProjects(supplierId)`.
- `components/vat-tu-ncc/pair-project-picker.tsx` (client): bộ chọn công trình và thanh ngữ cảnh "NCC × Công trình", giữ `?projectId` khi đổi tab.

Sửa:
- `app/(app)/vat-tu-ncc/page.tsx`: thêm mục "Theo công trình".
- `app/(app)/vat-tu-ncc/[supplierId]/layout.tsx`: tab tĩnh (`:9-15`, `:65-77`) chuyển thành thanh ngữ cảnh giữ `?projectId`.
- `app/(app)/vat-tu-ncc/[supplierId]/{ngay,thang}/page.tsx` và `thang/thang-grid.tsx`: lọc theo `projectId` khi có.
- `app/(app)/vat-tu-ncc/[supplierId]/{chot-ky,doi-chieu,kiem-tra-khop,thanh-toan}/page.tsx` cùng client tương ứng: thiếu `projectId` thì hiện bộ chọn; có thì truyền vào action.
  - `thanh-toan` giữ guard đọc `cong-no-vt` như hiện tại (`thanh-toan/page.tsx:24`), và dùng `pairBalanceAsOf`.
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/{page,sign-button}.tsx`: kiểm `recon.supplierId === supplierId` **và** `recon.projectId === projectId` (theo mẫu hiện có ở `page.tsx:51`); sai thì 404. Marker chuyển đổi hiện nhãn "Kỳ chuyển đổi (khóa)" và ẩn nút gỡ ký.
- `components/vat-tu-ncc/delivery-grid.tsx`: bọc try/catch và hiện `toast.error` ở tạo, sửa, xóa (`:160-171`); prop `lockedProjectId` khi trang có `projectId`.
- `components/vat-tu-ncc/{delivery-form,reconciliation-form}.tsx` và client chốt kỳ: công trình bắt buộc; có `projectId` thì khóa sẵn.
- `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx`: bắt buộc chọn công trình khi loại là `vat_tu`; Chủ thể tự điền theo công trình.
- `lib/master-data/schemas.ts`, `lib/master-data/project-service.ts` (`:101`, `:109-125`), `app/(app)/master-data/projects/{page,projects-client}.tsx`: thêm cột "Chủ thể" (select).
  - Server **từ chối đổi** `entityId` khi công trình đã có sổ vật tư, phiếu, số dư ban đầu vật tư hoặc kỳ đối chiếu. Lý do: chốt kỳ lấy Chủ thể từ công trình (`period-close-service.ts:295`), còn báo cáo nhóm theo Chủ thể lưu trên dòng (`balance-report-service.ts:155`); đổi giữa chừng sẽ tách một cặp thành hai nhóm.
  - Gán lần đầu (đang NULL) thì luôn được.
- `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx`: giữ nguồn `project_transactions`, chỉ thêm liên kết "Công nợ vật tư theo sổ cái" sang `/vat-tu-ncc/cong-trinh/[id]` (quyết định validate).

## Tasks & Steps

1. Viết service tổng quan và hai trang danh sách, có kiểm quyền `cong-no-vt` cho cột nợ.
2. Viết `pair-project-picker` và thanh ngữ cảnh ở layout.
3. Sửa các trang tab: lọc theo `projectId`, hiện bộ chọn khi thiếu, kiểm kỳ đúng cặp.
4. Sửa lưới phiếu (toast, khóa công trình) và các form.
5. Thêm cột Chủ thể ở master data kèm khóa đổi; buộc chọn công trình ở đợt thanh toán vật tư.
6. Thêm liên kết ở tab Dự án.

## Tests

- `test/integration/vat-tu-ncc-cong-trinh.integration.test.ts` (tạo):
  - Số dư từng cặp trên trang công trình bằng `queryDetailReport`.
  - `listDeliveries(s, {projectId: X})` chỉ trả phiếu của X.
  - Vật tư tháng theo cặp chỉ gồm phiếu của cặp.
  - Người dùng không có quyền `cong-no-vt` thì `listPairsOfProject` không trả số nợ.
  - Đổi `entityId` của công trình đã có phiếu bị từ chối; gán lần đầu thì được.
- `lib/master-data/__tests__/patch-actions.test.ts`: thêm ca `entityId`.
- `e2e/vat-tu-ncc-cong-trinh.spec.ts` (tạo):
  - Đi công trình → NCC → Chốt kỳ, thấy công trình đã chọn sẵn.
  - Mở trang chi tiết đối chiếu với `projectId` sai thì 404.
  - Ghi phiếu vào kỳ đã khóa thì thấy toast lỗi.
- `test/unit/module-release-entrypoints.test.ts` xanh. Lưu ý: test này chỉ quét `lib/**`, không quét page; quyền của page được kiểm bằng e2e và integration ở trên.

## Ownership & Rollback

- Sở hữu: `app/(app)/vat-tu-ncc/**`, `components/vat-tu-ncc/**`, `lib/vat-tu-ncc/project-overview-service.ts`, master-data project, `round-detail-client.tsx`, `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx`.
- Chạy sau phase 2, cùng luồng.
- Rollback: git revert phần UI (không đụng schema).

## Verification

- `npx tsc --noEmit`, `pnpm lint`
- `npx vitest run --project integration test/integration/vat-tu-ncc-cong-trinh.integration.test.ts`
- `npx playwright test e2e/vat-tu-ncc-cong-trinh.spec.ts`
