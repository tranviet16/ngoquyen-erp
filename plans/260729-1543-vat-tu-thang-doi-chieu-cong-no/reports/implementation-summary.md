# Implementation summary — vật tư tháng → đối chiếu công nợ

Ngày: 2026-07-29 | Trạng thái: code hoàn tất, verify xanh, review 8/10 approve (2 High đã fix)

## Đã giao

**Migrations (đã áp dev + test DB):**
- `20260729160000_add_project_entity_and_delivery_pricing` — `projects.entityId` FK; `ledger_transactions.deliveryId` FK + `qty` + `unitPriceSnapshot`; partial unique `ledger_tx_delivery_id_unique`.
- `20260729161000_link_ledger_to_payment_item` — `ledger_transactions.paymentRoundItemId` FK + partial unique.
- `20260729162000_reconciliation_derived_snapshot` — 4 cột số tổng nullable, `signedSnapshotJson JSONB`, dedupe + partial unique kỳ/NCC.

**Services mới (`lib/vat-tu-ncc/`):** `period.ts` (kỳ 27→26), `period-lock.ts` (`assertPeriodOpen`), `period-close-service.ts` (preview/commit chốt kỳ, advisory lock, idempotent theo deliveryId), `reconciliation-derive-service.ts` (A/B/C dẫn xuất, ký→snapshot+khóa, gỡ ký chỉ kỳ mới nhất, admin), `period-recon-check-service.ts` (FULL OUTER JOIN phiếu↔event).
**Sửa:** `schemas.ts` (giá phiếu; reconciliationSchema chỉ còn kỳ+note), `delivery-service.ts` (ghi giá; period-lock 3 write path; soft-delete phiếu gỡ event đối ứng), `reconciliation-service.ts` (marker-only, kỳ ký bất biến), `lib/ledger/ledger-service.ts` (`upsertFromDelivery`; period-lock create/update/softDelete material), `lib/payment/payment-service.ts` (`closeRound` transaction + sync ledger), `lib/payment/payment-ledger-sync.ts` (MỚI — chỉ vat_tu, idempotent theo paymentRoundItemId, date=closedAt), `lib/cong-no-vt/material-ledger-service.ts` (admin patch cũng bị khóa kỳ ký).
**UI:** tab "Chốt kỳ" (bulk gắn giá + gợi ý giá kỳ trước + vi phạm), doi-chieu list dẫn xuất + trang chi tiết in theo mẫu Excel + nút ký/gỡ ký, tab "Kiểm tra khớp" (admin), grid phiếu ngày thêm cột Đơn giá/Thành tiền.

## Verify

- unit 698/698 · integration 41/41 · tsc ✅ · eslint ✅ · production build ✅.
- Pilot Nam Hương (integration test, số thật từ Excel): kỳ 5/2026 A=310.605.120, B=44.400.000, C=100.000.000 → 255.005.120; kỳ 6/2026 → 285.465.120; carry-over closing(k)=opening(k+1); parity `querySummary` = Tổng nợ; khóa kỳ ký (phiếu/thanh_toan/chốt lại đều bị chặn, dieu_chinh vẫn ghi được); idempotency chốt kỳ; payment sync chỉ vat_tu.

## Ngoài kế hoạch (báo cáo minh bạch)

1. **2 lỗi có sẵn ở HEAD**: `refreshAllItemBalances` + `bulkApproveAsRequested` dùng `updateMany` trần → audit-guard của `lib/prisma.ts` chặn (integration lifecycle test đỏ sẵn từ trước). Sửa theo pattern `bypassAudit` + `writeAuditLog` (mẫu `lib/tai-chinh/pr-sync-service.ts`).
2. **`.env` local** tạo mới (gitignored) — mirror `.env.example`, cần cho build/migrate local.
3. **2 test unit `closeRound`** cập nhật theo contract mới (đóng đợt = ghi ledger).

## Review findings đã xử lý

- H1: sign/unsign bọc `$transaction` + advisory lock `vat-tu-close:{supplierId}:{periodFrom}` (cùng khóa commitPeriodClose) + re-check trong tx.
- H2: `adminPatchMaterialTransaction` thêm `assertPeriodOpen`.
- M1 (ghi nhận, không sửa): NCC nhiều Chủ Thể → A là số gộp; đúng mẫu Excel, edge chấp nhận theo plan.
- M2 (ghi nhận): audit-log ngoài transaction là giới hạn có sẵn của `lib/prisma.ts`.

## Còn lại (phía người dùng)

- Chạy pilot tay theo `nam-huong-pilot-runbook.md` (tạo master data + nhập 2 kỳ) → ghi `nam-huong-pilot-result.md`.
- Lưu ý: file mới chưa git-tracked → contract test `module-release-entrypoints` chỉ quét được sau khi commit (đã verify tay: mọi server action mới đều có guard).
- Working tree đang có workstream song song (lib/acl/*, plan `260729-1545-admin-rollout-bypass`) — khi commit cần tách riêng phần của plan này.
