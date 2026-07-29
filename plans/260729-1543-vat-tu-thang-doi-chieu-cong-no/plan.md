---
title: "Tái hiện luồng vật tư tháng → đối chiếu công nợ theo NCC"
description: "Nối phiếu lấy hàng ngày → chốt kỳ 27→26 → sinh sự kiện ledger → bảng đối chiếu dẫn xuất, khớp 1:1 cong-no-vt cả số lẫn sự kiện."
status: completed
priority: P1
effort: 44h
branch: main
tags: [vat-tu-ncc, cong-no-vt, ledger, payment, reconciliation, single-source-of-truth]
created: 2026-07-29
---

## Nguồn tham chiếu
- Brainstorm chốt: `plans/reports/brainstorm-260729-vat-tu-thang-doi-chieu-final.md`
- Scout chi tiết: `plans/reports/brainstorm-260729-vat-tu-thang-doi-chieu-scout.md`
- 5 file Excel gốc: `SOP/theo-doi-vat-tu-thang/*.xlsx`

## Mục tiêu
Đưa 3 kho dữ liệu rời rạc (`SupplierDeliveryDaily`, `SupplierReconciliation`, `ledger_transactions`) về **một nguồn sự thật**: phiếu ngày (đã gắn giá) sinh `lay_hang` ledger; PaymentRound duyệt xong sinh `thanh_toan` ledger; đối chiếu là snapshot dẫn xuất, không cho gõ tay 3 số tổng.

## Quyết định đã chốt (không tranh luận lại)
Xem file brainstorm. Tóm tắt: (1) master = phiếu ngày → ledger; (2) kỳ 27 tháng trước → 26 tháng này cố định; (3) PaymentRound duyệt → ledger; (4) giá gắn lúc chốt kỳ; (5) `Project.entityId` FK; (6) TT only, VAT 0; (7) kỳ đã ký khóa, chênh lệch → `dieu_chinh`; (8) opening balance + Nam Hương pilot.

## Danh sách pha (tuần tự — mỗi pha khóa tiền đề của pha sau)

| # | File | Nội dung | Trạng thái | Effort |
|---|---|---|---|---|
| 1 | [phase-01-data-foundation.md](./phase-01-data-foundation.md) | Migration: `Project.entityId` FK, mở `unitPrice/totalAmount` phiếu ngày, thêm `LedgerTransaction.deliveryId` + `qty/unitPrice` snapshot | ✅ done | 6h |
| 2 | [phase-02-period-close.md](./phase-02-period-close.md) | Màn "Chốt kỳ 27→26" theo NCC: liệt kê phiếu, bulk gắn giá, sinh `lay_hang` idempotent | ✅ done | 12h |
| 3 | [phase-03-payment-single-source.md](./phase-03-payment-single-source.md) | PaymentRound **closed** → tự ghi `thanh_toan` ledger (vat_tu only, idempotent theo paymentRoundItemId) | ✅ done | 8h |
| 4 | [phase-04-derived-reconciliation.md](./phase-04-derived-reconciliation.md) | `SupplierReconciliation` chuyển thành snapshot dẫn xuất: opening từ closing kỳ trước, dòng chi tiết + tổng phụ theo công trình, ký → khóa kỳ | ✅ done | 10h |
| 5 | [phase-05-verification-pilot.md](./phase-05-verification-pilot.md) | Runbook Nam Hương + màn kiểm tra khớp + integration test pilot khớp 100% Excel (chạy tay theo runbook còn chờ) | ✅ done (code+test); pilot tay pending | 8h |

**Verify (2026-07-29):** unit 698/698 ✅ · integration 41/41 ✅ (pilot khớp chuỗi Excel 310.605.120 → 255.005.120 → 285.465.120) · tsc ✅ · eslint ✅ · migrations applied dev+test DB ✅.
**Ngoài kế hoạch:** sửa 2 vi phạm audit-guard có sẵn ở HEAD (`refreshAllItemBalances`, `bulkApproveAsRequested` dùng `updateMany` trần) bằng pattern `bypassAudit` + `writeAuditLog` — integration test lifecycle vốn đang đỏ ở HEAD, nay xanh.
**Code review (2026-07-29):** 8/10, approve. 2 finding High đã sửa: (H1) `signReconciliation`/`unsignReconciliation` bọc transaction + cùng advisory lock với `commitPeriodClose`, re-check cờ ký trong tx; (H2) `adminPatchMaterialTransaction` thêm `assertPeriodOpen` — kỳ đã ký bất biến với cả admin. Ghi nhận M1 (NCC nhiều Chủ Thể → A gộp; edge chấp nhận theo plan), M2 (audit-log non-atomicity có sẵn của lib/prisma). Pilot tay theo `reports/nam-huong-pilot-runbook.md` là bước còn lại phía người dùng.

## Tiêu chí thành công (toàn plan)
- 100% khớp Excel Nam Hương 2 kỳ pilot: A / B / C / Tổng nợ.
- `getMaterialCurrentBalance(entity, supplier, project, asOf=periodTo)` khớp `closingBalance` của reconciliation cùng mốc.
- Không còn màn cho gõ tay `openingBalance/totalIn/totalPaid` của kỳ sinh tự động.
- Closing kỳ k = Opening kỳ k+1 do hệ thống bảo đảm (bằng cách reconciliation opening đọc từ ledger, không lưu).
- PaymentRound `closed` → có `thanh_toan` tương ứng trong ledger (idempotent).

## Validation Summary

**Validated:** 2026-07-29
**Questions asked:** 4

### Confirmed Decisions
- Thời điểm ghi `thanh_toan` từ PaymentRound: **lúc round `closed` (đã chi thật)**, không phải lúc approved — khớp nghĩa dòng C của Excel.
- Phạm vi sync PaymentRound→ledger: **chỉ `vat_tu`** (material); `nhan_cong` để giai đoạn sau.
- Snapshot kỳ đã ký: **JSONB là nguồn in lại + 4 cột số tổng giữ làm denormalized** (ghi cùng transaction ký) — xác nhận như plan.
- Gỡ ký (unsign): **chỉ cho gỡ kỳ ký mới nhất** — từ chối nếu tồn tại kỳ sau đã ký, bảo toàn chuỗi carry-over.

### Action Items (sửa phase file trước khi implement)
- [ ] `phase-03`: chuyển hook `syncApprovedRoundToLedger` → gọi tại `closeRound` (approved→closed); date event = thời điểm close; đổi tên helper cho khớp (`syncClosedRoundToLedger`); success criteria/test đổi theo (round approved chưa closed → CHƯA có event).
- [ ] `phase-03`: cắt scope `nhan_cong` — chỉ xử lý `category='vat_tu'` → `ledgerType='material'`; bỏ test mix nhân công.
- [ ] `phase-04`: `unsignReconciliation` thêm guard "tồn tại kỳ sau đã ký cùng NCC → reject"; thêm test.
- [ ] `phase-04`: khẳng định trong Requirements — 4 cột số tổng chỉ được ghi bởi `signReconciliation` (denormalized), mọi hiển thị kỳ chưa ký tính động.

## Ràng buộc chung
- Không viết importer Excel đầy đủ (YAGNI). Dữ liệu lịch sử = nhập số dư đầu + tái lập vài kỳ tay.
- Kỳ đã ký (`signedBySupplier=true`) khóa: từ chối write phiếu và ledger `lay_hang` trong khoảng `[periodFrom, periodTo]` của NCC đó, chỉ nhận `dieu_chinh` kỳ sau.
- Mỗi phiếu ngày cần `projectId` để suy Chủ thể; kỳ chốt từ chối phiếu thiếu công trình (chặn ở bước sinh event, không cưỡng ép grid nhập ngày).
- VAT trên `lay_hang` sinh từ phiếu = 0 (chỉ ghi TT, HĐ để 0). Cột HĐ giữ nguyên cho tương lai.
- Đặt tên migration mô tả hành vi, không mã số plan/phase (`add_project_entity_and_delivery_pricing`, không `phase01_...`).
