---
phase: 7
title: "Tài liệu, hồi quy toàn bộ, pilot"
status: pending
priority: P2
effort: "3h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Tài liệu, hồi quy toàn bộ, pilot

## Goal

Tài liệu người dùng và kiến trúc phản ánh đúng hành vi mới; toàn bộ bộ kiểm tra xanh; pilot tay trên số liệu Excel mẫu được ghi lại.

## Files to Create / Modify

- Modify `docs/user-guide/ke-toan.md` (mục 3): quy ước ngày ghi sổ; loại Thuế hoá đơn (chỉ TT, bắt buộc số hoá đơn, ngày ghi sổ khác ngày HĐ); tab Thanh toán (cần quyền `cong-no-vt`); trang Tổng hợp NCC × Chủ thể, bộ chọn mốc (LH = Đầu kỳ + Lấy hàng, tuần ISO, "Kỳ chuẩn 27→26" là cửa sổ chung), xuất Excel (quyền đọc); chi-tiet theo cửa sổ; chốt kỳ biên tuỳ chọn, liền kề marker gần nhất, ký cần đủ phiếu, nhãn Excel "26/5→26/6" nhập là 27/5→26/6; số dư ban đầu khoá khi NCC có kỳ ký.
- Modify `docs/user-guide/can-bo-vat-tu.md` (mục 3–5): báo giá giá trước / chênh / sửa; gợi ý đơn giá khi tạo phiếu; chốt kỳ chọn từ/đến, gợi ý mặc định.
- Modify `docs/system-architecture.md` (khu vực vật tư NCC, dòng 154–172): quy ước ngày nghiệp vụ và migration dữ liệu; `thue_hd` và `lib/ledger/transaction-classification.ts`; định nghĩa cửa sổ (cận trên exclusive) và ba bất biến; `lib/ledger/report-period.ts`; `queryWindowByParty`; ngoại lệ `balance-service` (loại `dieu_chinh`); `period-bounds.ts`; khoá advisory theo NCC cho mọi đường ghi; snapshot `totalIn` = B, thuế trong JSON; lỗ hổng `authorized` đã đóng; backlog: importer ghi SQL thô chưa qua khoá kỳ.
- Modify `docs/project-changelog.md` nếu repo đang ghi changelog cho tính năng (đọc trước).
- Create `plans/261006-0307-vat-tu-ncc-cong-no-tong-theo-moc-thoi-gian/reports/pilot-excel-mau-runbook.md` (tham chiếu runbook cũ `plans/260729-1543-vat-tu-thang-doi-chieu-cong-no/reports/nam-huong-pilot-runbook.md` cho phần chung): (1) Nam Hương 3 kỳ 01/4→27/4, 28/4→26/5, 27/5→26/6 với số dư đầu 189.805.120 asOf 31/3; (2) Bê tông HP kỳ 27/4→26/5 với thuế HĐ 11.448.000 qua tab Thanh toán; (3) Lộc Tài kỳ 27/5→26/6 hai công trình với giá ca 3.300.000 / 2.600.000 / 3.000.000; (4) `/cong-no-vt/tong-hop` preset Toàn bộ, so cột Nợ với Tổng nợ từng bảng đối chiếu; (5) xuất Excel so với sheet "Công Nợ"; (6) ghi kết quả.

## Tasks & Steps

1. Đọc 3 tài liệu hiện có, cập nhật đúng mục, đối chiếu tên route/tab với code đã merge.
2. Chạy toàn bộ: `pnpm test`, `pnpm test:integration`, `npx tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm risk:verify`, `pnpm exec tsx scripts/audit-ledger-dates.ts` (kỳ vọng 0).
3. Viết runbook pilot; thực hiện trên DB dev nếu có quyền; ghi kết quả.

## Todo

- [x] 3 tài liệu cập nhật (+ changelog nếu có)
- [x] Hồi quy toàn bộ xanh, audit ngày = 0
- [ ] Runbook pilot + kết quả

## Verification

```bash
pnpm test
pnpm test:integration
npx tsc --noEmit
pnpm lint
pnpm build
pnpm risk:verify
```

Grep tên route và tab trong docs khớp code (`/cong-no-vt/tong-hop`, `/vat-tu-ncc/[supplierId]/thanh-toan`, "Thuế hoá đơn", "Kỳ chuẩn 27→26").

## Risks

- Tài liệu lệch code do đổi tên ở phase trước. Giảm thiểu: viết sau khi merge đủ 6 phase; grep đối chiếu.
