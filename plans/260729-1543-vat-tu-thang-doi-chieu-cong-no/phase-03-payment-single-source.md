# Phase 03 — Thanh toán một nguồn: PaymentRound → ledger.thanh_toan

## Context links
- Brainstorm §Quyết định #3
- Scout §2.2 (PaymentRound không ghi ledger), §3 gap #3
- `lib/payment/payment-service.ts:498-534` (`bulkApproveAsRequested`), `:447-473` (`approveItem`), `:575-588` (`closeRound`)
- `lib/ledger/ledger-service.ts:70-103` (`LedgerService.create`)

## Overview
**[VALIDATED 2026-07-29]** Khi PaymentRound chuyển sang **`closed` (đã chi thật)** — không phải lúc approved — hệ thống tự sinh 1 `thanh_toan` event vào ledger cho mỗi `PaymentRoundItem` có `soDuyet > 0` thuộc `category='vat_tu'` (CHỈ vật tư; `nhan_cong` để giai đoạn sau). Khớp đúng nghĩa dòng C của Excel (tiền đã chuyển). Ngoài đợt: nhập tay ở `cong-no-vt/nhap-lieu` vẫn giữ nguyên.

## Key Insights
- Idempotency key = `paymentRoundItemId`. Thêm cột `LedgerTransaction.paymentRoundItemId Int? UNIQUE` (partial `WHERE IS NOT NULL`).
- Trigger duy nhất là thời điểm `closeRound` (approved → closed). Approve KHÔNG tạo event — số dư chỉ giảm khi đã chi.
- Hook 1 chỗ duy nhất: helper `syncClosedRoundToLedger(roundId, tx)` gọi trong transaction của `closeRound` (`payment-service.ts:575-588`) sau khi update status.
- `date` của event = thời điểm close (`closedAt`/now); `amountTt = soDuyet`; VAT=0; `entityId/partyId/projectId` sao từ `PaymentRoundItem`.
- Category `nhan_cong`/`dich_vu`/`khac` bỏ qua ở phase này (`nhan_cong` mở rộng sau khi vật tư chạy ổn — decision validate).

## Requirements
1. Migration `link_ledger_to_payment_item`: thêm `LedgerTransaction.paymentRoundItemId Int?` + FK `ON DELETE SET NULL` + partial UNIQUE.
2. Helper mới `lib/payment/payment-ledger-sync.ts`:
   - `syncClosedRoundToLedger(roundId, tx)` — chạy trong Prisma transaction của `closeRound`; đọc items có `soDuyet > 0` VÀ `category='vat_tu'`; upsert `LedgerTransaction` theo `paymentRoundItemId`; `ledgerType='material'`, `transactionType='thanh_toan'`, `date` = thời điểm close.
3. Gọi `syncClosedRoundToLedger` DUY NHẤT trong `closeRound` (`:575-588`) — chuyển closeRound sang `$transaction` nếu chưa, hook sau update status='closed'.
4. Không hook vào approve path (`approveItem`/`bulkApproveAsRequested`/`maybeAutoApproveRound`) — approve chưa phải đã chi.
5. Không hook `rejectItem` / `rejectRound` (round vẫn ở submitted/rejected, chưa approve → chưa có event).
6. Ngoài đợt: `cong-no-vt/nhap-lieu` giữ nguyên; row ledger nhập tay có `paymentRoundItemId=NULL`.

## Architecture
```
PaymentRoundItem.approvedAt=?, soDuyet>0
    └── maybeAutoApproveRound / bulkApproveAsRequested
            └── syncApprovedRoundToLedger(roundId, tx)
                   for each item where category ∈ {vat_tu, nhan_cong} && soDuyet>0:
                     upsert LedgerTransaction {
                       paymentRoundItemId=item.id  ← idempotency
                       ledgerType = material|labor
                       transactionType = 'thanh_toan'
                       date = round.approvedAt
                       entityId, partyId=supplierId, projectId
                       amountTt = item.soDuyet, vatPctTt=0, computed totals
                       status = 'approved'
                       content = `Đợt ${month}-${sequence} #${item.id}`
                     }
```

## Related code files
- `prisma/schema.prisma` (LedgerTransaction: thêm `paymentRoundItemId`)
- `lib/payment/payment-service.ts` — hook `syncApprovedRoundToLedger` vào `maybeAutoApproveRound` và `bulkApproveAsRequested`
- `lib/payment/payment-ledger-sync.ts` (MỚI)
- `lib/ledger/ledger-service.ts` — thêm helper `upsertFromPaymentItem` HOẶC gọi trực tiếp Prisma trong sync file (chọn: gọi trực tiếp trong sync file để tránh mở rộng LedgerService không cần thiết — YAGNI)

## Implementation Steps
1. Migration `link_ledger_to_payment_item` + `prisma generate`.
2. Viết `payment-ledger-sync.ts` với 2 hàm, dùng `Prisma.Decimal` cho toàn bộ số học.
3. Sửa `maybeAutoApproveRound`: sau `prisma.paymentRound.update({status:'approved'})`, chuyển toàn khối vào `prisma.$transaction`, thêm `await syncApprovedRoundToLedger(roundId, tx)`.
4. Sửa `bulkApproveAsRequested`: bên trong `$transaction` đã có, thêm `await syncApprovedRoundToLedger(roundId, tx)` sau khi update items.
5. Cần đảm bảo `approvedAt` sẵn sàng — cả 2 path đều set `approvedAt` trước sync; date event lấy từ đó.
6. Sync chỉ tạo/không sửa nếu event đã tồn tại và `deletedAt IS NULL`; nếu `soDuyet` thay đổi (hiện tại không xảy ra sau approve — code chặn), vẫn upsert đúng.
7. Không cần đổi `payment-ledger` UI; số dư `cong-no-vt` sẽ tự cập nhật vì đọc từ ledger.

## Todo list
- [ ] Migration + generate
- [ ] `payment-ledger-sync.ts` (`syncClosedRoundToLedger`)
- [ ] Hook vào `closeRound` (đảm bảo trong transaction)
- [ ] Test unit sync: 3 items (2 vat_tu, 1 nhan_cong) → 2 event material, nhan_cong/dich_vu bỏ qua
- [ ] Test unit idempotency: gọi sync 2 lần → 2 event duy nhất
- [ ] Integration test: create round → approve (CHƯA có event) → close → assert event + `getMaterialCurrentBalance` giảm đúng soDuyet
- [ ] Regression: `payment-service.test.ts` vẫn pass

## Success Criteria
- Round `approved` nhưng chưa `closed` → KHÔNG có event `thanh_toan`.
- Sau `closeRound`: mỗi item `vat_tu` với `soDuyet>0` tương ứng 1 row `ledger_transactions.thanh_toan` với `paymentRoundItemId` đúng.
- `getMaterialCurrentBalance(entity, supplier, project)` trước close − `Σ soDuyet vat_tu item` = sau close.
- Không có event cho item `nhan_cong`/`dich_vu`/`khac`.
- Không hồi quy test trong `lib/payment/__tests__/`.

## Risk Assessment
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Sync chạy ngoài transaction → partial state | Cao | Bắt buộc chạy trong `$transaction` client hiện có; refactor `maybeAutoApproveRound` để dùng tx |
| `soDuyet` khác `soDeNghi` → khớp Excel? | Thấp | Excel = số thực chuyển; dùng `soDuyet` (số duyệt) là đúng SOP |
| Hai lần approve (không xảy ra vì status guard) | Thấp | Upsert theo `paymentRoundItemId` UNIQUE — an toàn |
| Multi-item cùng supplier/project cùng ngày → duplicate visual | Thấp | Đây là 2 event khác nhau (khác `paymentRoundItemId`); đúng nghiệp vụ |

## Security Considerations
- Không đổi ACL — hook chạy dưới quyền của người approve (đã kiểm `canApprove`).
- Sự kiện ledger được ghi ở `status='approved'` — không thể sửa qua `cong-no-vt/nhap-lieu` mà không có admin (giữ đối xứng với StateObligation JournalEntry read-only).
- Xem xét thêm guard trong `updateMaterialTransaction`: chặn edit khi `paymentRoundItemId IS NOT NULL` (hoặc chỉ admin) — ghi rõ trong Phase 5 checklist.

## Next steps
Phase 4 dùng luồng này: mọi thanh toán TT của NCC trong kỳ = SUM `thanh_toan` (bao gồm sync từ PaymentRound + manual nhap-lieu ngoài đợt).
