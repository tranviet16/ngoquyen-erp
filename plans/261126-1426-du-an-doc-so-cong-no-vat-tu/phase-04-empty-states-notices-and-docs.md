---
phase: 4
title: "Trạng thái rỗng, làm mới trang và tài liệu"
status: todo
priority: P2
effort: "3h"
dependencies: [2, 3]
---

# Phase 4: Trạng thái rỗng, làm mới trang và tài liệu

<!-- Red team: F15 - chạy sau phase 2–3 vì câu chữ mô tả nguồn mới -->

## Goal

Cân Đối VT, Định Mức và Dashboard nói rõ vì sao trống ở công trình chưa có dự toán / sổ dự án; hai tab mới luôn hiện số mới sau mọi cách ghi sổ VT; mọi câu trong UI và tài liệu mô tả nguồn số đều đúng.

## Hiện trạng (đã kiểm 26/11)

- `components/ui/empty-state.tsx` có sẵn.
- `components/du-an/book-note.tsx:18` (render ở `app/(app)/du-an/[id]/layout.tsx:73`): "Hóa đơn ở các tab này lấy từ sổ Hóa đơn" — sai cho Công Nợ NCC và Giao Dịch nguồn sổ VT.
- `docs/user-guide/ke-toan.md:174`: "Tab Công nợ trong trang Dự án vẫn lấy số từ giao dịch dự án" — sai.
- `docs/user-guide/doi-chieu-dt-hd-tt.md:212` (giao dịch HĐ sinh ở 4 tab cũ, gồm Công nợ NCC), `:454` (trích nguyên câu BookNote cũ), `:455-457` ("Công nợ NCC chỉ cộng giao dịch lấy hàng") — sai. <!-- Red team: F15 -->
- `lib/du-an/dashboard-service.ts:34` cộng `project_transactions`; #1, #14 hiện 0 không giải thích.
- Ghi sổ VT chỉ `revalidatePath` trang của module nguồn: `lib/cong-no-vt/material-ledger-service.ts:19,44-48`; `lib/vat-tu-ncc/delivery-service.ts:229-233`; `lib/vat-tu-ncc/locked-delivery-edit.ts:115`; `lib/payment/payment-ledger-sync.ts:84-86` (action thanh toán chỉ revalidate `/thanh-toan`). <!-- Red team: F14 -->

## Files

- Create: `components/du-an/project-book-empty-state.tsx` — "Tab này so dự toán với sổ dự án. Công trình chưa có dự toán / hạng mục nên chưa có số. Công nợ nhà cung cấp xem ở tab Công Nợ NCC, giao dịch vật tư ở Giao Dịch (Sổ công nợ vật tư)." kèm link.
- Modify: `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx`, `app/(app)/du-an/[id]/dinh-muc/page.tsx` — render khối trên phía trên client khi dữ liệu rỗng; không sửa file client lớn; người có quyền vẫn nhập được.
- Modify: `app/(app)/du-an/[id]/page.tsx` (Dashboard) — cùng thông báo khi công trình không dùng sổ đội, không có `project_transactions`, và `loadProjectLedger` trả ít nhất một NCC; công trình hoàn toàn mới (không sổ VT) không hiện. <!-- Red team: F15 -->
- Modify: `components/du-an/book-note.tsx` — "Cân Đối VT, Định Mức và Giao Dịch (Sổ dự án) lấy HĐ từ sổ Hóa đơn; Công Nợ NCC và Giao Dịch (Sổ công nợ vật tư) lấy từ sổ Công nợ vật tư."
- Modify (chỉ khi bước 1 thấy số cũ): tạo `lib/du-an/project-ledger/revalidate-project-ledger-views.ts` và gọi từ 4 nơi ghi sổ VT ở trên. <!-- Red team: F14 -->
- Modify: `docs/user-guide/ke-toan.md`, `docs/user-guide/doi-chieu-dt-hd-tt.md`, `docs/project-changelog.md`.

## Tasks & Steps

1. Kiểm làm mới trên dev cho cả Công Nợ NCC và Giao Dịch của #14, sau từng cách ghi: (a) thêm dòng ở Nhập liệu Công nợ vật tư; (b) chốt kỳ phiếu ngày ở Vật tư NCC; (c) xác nhận chi một đợt thanh toán có dòng NCC #14 nếu dev có đợt thử. Nếu thấy số cũ ở bất kỳ cách nào: viết helper `revalidatePath("/du-an/[id]", "layout")` theo `projectId` và gọi từ cả 4 nơi ghi; kiểm lại. Ghi kết quả vào `reports/`. <!-- Red team: F14 -->
2. Viết khối trạng thái rỗng và gắn vào 3 trang.
3. Sửa câu ở `book-note.tsx`.
4. Sửa hai hướng dẫn: nguồn mới của Công Nợ NCC (lũy kế, cộng Chủ thể, người xem dự án thấy tổng như tab Hợp đồng, từng dòng sổ cần quyền Công nợ vật tư), công tắc nguồn ở Giao Dịch, số #4 đổi so với trước, phiếu chưa chốt; ghi changelog.
5. `grep -rn "giao dịch dự án\|chỉ cộng giao dịch\|Hóa đơn ở các tab này" docs/user-guide components` để chắc không còn câu cũ.

## Verification

Trước mọi lệnh integration: xác nhận cổng `DATABASE_URL` là 5435, sai thì dừng. <!-- Red team: F6 -->

- `npx tsc --noEmit`, lint, `npx vitest run --project unit`
- Dev: #1 thấy trạng thái rỗng ở Cân Đối VT, Định Mức, Dashboard; #4 không thấy (có dữ liệu); công trình #20 (không sổ VT) không có thông báo Dashboard.

## Rủi ro

- Thông báo che ô nhập của người có quyền → đặt phía trên client, không thay client.
