---
phase: 3
title: "Công tắc nguồn ở Giao Dịch"
status: todo
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 3: Công tắc nguồn ở Giao Dịch

## Goal

Tab Giao Dịch có hai nguồn, "Sổ công nợ vật tư" (chỉ xem) và "Sổ dự án" (`project_transactions`, giữ nguyên), không bao giờ cộng gộp; mọi công trình có hoạt động vật tư thấy đủ dòng sổ; lỗi đọc sổ không làm hỏng Sổ dự án.

## Hiện trạng (đã kiểm 26/11)

- `app/(app)/du-an/[id]/giao-dich/page.tsx:23-28` nạp `listTransactions` + `queryProjectById` và render `GiaoDichClient` (340 dòng, tạo / sửa / xóa / admin patch). Hôm nay trang không phụ thuộc sổ VT.
- `test/unit/module-release-entrypoints.test.ts:206` bắt trang này gọi `queryProjectById(projectId)`; `:212-221` bắt guard trang đứng trước mọi `await`.
- Trang khác trong module đã dùng `searchParams: Promise<Record<string, string | string[] | undefined>>` (`dt-hd-tt/anh-xa/page.tsx:22`).
- Không có `error.tsx` dưới `app/(app)`; lỗi rơi về `app/global-error.tsx`. Tiền lệ cô lập lỗi: `components/du-an/book-note.tsx:11-17`.
- `DataGrid` (glide) ảo hóa dòng; #1 có 490 dòng sổ + 1 số dư đầu kỳ.

## Quy tắc nguồn

<!-- Red team: F2, F3, F13 -->
- Trang luôn gọi guard và `queryProjectById(projectId)` như hôm nay.
- `loadProjectLedgerSwitchInfo(projectId)` bọc try/catch (`unstable_rethrow` như `book-note.tsx`); lỗi → coi như sổ VT không dùng được, hiện dòng "Không đọc được sổ Công nợ vật tư lúc này".
- `?nguon=so-cong-no` chỉ được dùng khi `rowsVisible`; nếu không thì về `so-du-an`. Giá trị lạ hoặc không có → mặc định: `so-cong-no` khi `rowsVisible && rowCount > 0`, ngược lại `so-du-an`. Lặp tham số → lấy phần tử đầu.
- Nguồn `so-du-an` không gọi `loadProjectLedger`.
- Nguồn `so-du-an` mà công trình không có dòng `project_transactions` → hiện thông báo: có sổ VT thì "Giao dịch vật tư của công trình nằm ở Sổ công nợ vật tư" (kèm nút nếu `rowsVisible`, hoặc "cần quyền đọc Công nợ vật tư; tổng công nợ xem ở tab Công Nợ NCC" nếu không).
- Số trên công tắc: "Sổ công nợ vật tư (n dòng)" với n = số dòng sổ, không tính số dư đầu kỳ; "Sổ dự án (m dòng)". <!-- Red team: F11 -->

## Files

- Modify: `app/(app)/du-an/[id]/giao-dich/page.tsx` — theo quy tắc trên; `loadProjectLedger(projectId, { withRows: true })` chỉ khi nguồn là `so-cong-no`.
- Create: `app/(app)/du-an/[id]/giao-dich/source-switch.tsx` — hai nút đổi URL; ẩn nút sổ VT khi `!rowsVisible`.
- Create: `app/(app)/du-an/[id]/giao-dich/ledger-rows-client.tsx` — DataGrid chỉ đọc: dải số dư đầu kỳ riêng phía trên lưới (không là dòng của lưới); cột Ngày, NCC, Loại (`TRANSACTION_TYPE_LABELS`), Vật tư, SL, Số HĐ, Tăng TT / Giảm TT / Tăng HĐ / Giảm HĐ, Nội dung; thẻ tổng lấy `totals` từ server; `PendingDeliveriesNotice`; link "Sửa ở Công nợ vật tư" (`/cong-no-vt/nhap-lieu`). <!-- Red team: F11 -->
- Không sửa: `giao-dich-client.tsx`, `lib/du-an/transaction-service.ts`.

## Tasks & Steps

1. Đọc `node_modules/next/dist/docs/` phần `page` / `searchParams` trước khi viết.
2. Viết page, công tắc, lưới sổ VT. Nguồn "Sổ dự án" render đúng `GiaoDichClient` như hôm nay.
3. Kiểm tay trên dev (đếm lại bằng SQL trước khi so): #1 lưới 490 dòng + dải 1 số dư đầu kỳ, công tắc ghi 490; #14 lưới 109 dòng; #4 nguồn sổ VT có đủ lấy hàng + thanh toán + thuế HĐ; #4 nguồn "Sổ dự án" vẫn 280 dòng, tổng HĐ không đổi; tạo, sửa, xóa một dòng sổ dự án trên công trình thử rồi hoàn lại.
4. Kiểm: người không có `cong-no-vt` mở Giao Dịch #1 → "Sổ dự án" với thông báo trỏ tab Công Nợ NCC; `?nguon=so-cong-no` thủ công → vẫn "Sổ dự án"; `?nguon=abc` → mặc định.
5. Kiểm cô lập lỗi: tạm làm `loadProjectLedgerSwitchInfo` ném lỗi (chỉ trên máy dev, không commit) → Sổ dự án vẫn tạo / sửa / xóa được.

## Verification

Trước mọi lệnh integration: xác nhận cổng `DATABASE_URL` là 5435, sai thì dừng. <!-- Red team: F6 -->

- `npx tsc --noEmit`, lint
- `npx vitest run --project unit` (toàn bộ, gồm `module-release-entrypoints`) <!-- Red team: F7 -->
- Integration phase 1 vẫn xanh
- Kết quả kiểm tay bước 3–5 ghi vào `reports/` (chỉ số dòng, không số tiền)

## Rủi ro

- Người dùng tưởng hai nguồn cộng được → công tắc ghi rõ nguồn, không có tổng chung.
- #4 mở mặc định ở sổ VT thay vì 280 dòng cũ → công tắc hiện số dòng cả hai; ghi ở hướng dẫn.
