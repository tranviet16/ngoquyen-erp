# Phase 04 — Bảng đối chiếu sinh tự động (snapshot dẫn xuất)

## Context links
- Brainstorm §Quyết định #4, #5, #6, #7
- Scout §1.3 (cấu trúc BẢNG ĐỐI CHIẾU), §3 gap #5, #6, #7, #8
- Phase 2 (period marker + `lay_hang` link deliveryId), Phase 3 (`thanh_toan` link paymentRoundItemId)

## Overview
Chuyển `SupplierReconciliation` từ "3 số gõ tay" thành **snapshot dẫn xuất**: chọn NCC + kỳ → hệ thống tính opening (= closing kỳ trước hoặc `LedgerOpeningBalance` nếu là kỳ đầu), liệt kê từng dòng `lay_hang` trong kỳ (chi tiết theo phiếu ngày), Σ P/S, Σ chuyển khoản trong kỳ → in bảng đối chiếu theo mẫu Excel + khối chữ ký. Cờ `signedBySupplier` → khóa mọi ghi `lay_hang/thanh_toan` có `date ∈ [periodFrom, periodTo]` cho NCC đó.

## Key Insights
- Opening không lưu trong `SupplierReconciliation` nữa — tính dẫn xuất tại query time để bảo đảm bất biến "closing kỳ k = opening kỳ k+1". Cột `openingBalance` giữ lại (nullable) để tương thích migration nhưng service KHÔNG đọc/ghi.
- `totalIn/totalPaid/closingBalance` cũng tính dẫn xuất; giữ cột như snapshot lịch sử (immutable sau `signedBySupplier=true`) để in lại đúng số đã ký ngay cả khi backfill event. **[VALIDATED]** 4 cột số tổng CHỈ được ghi bởi `signReconciliation` (denormalized cùng transaction ký, phục vụ list/sort); JSONB là nguồn in lại dòng chi tiết; mọi hiển thị kỳ CHƯA ký tính động từ `computeReconciliation`.
- Excel gộp nhiều công trình dưới 1 dòng "Chủ thể mua"; bảng in gộp `entityId × supplierId` tất cả `projectId` — group trong SQL theo `entityId, partyId` (không lọc project) để khớp mẫu; trong bảng chi tiết có tổng phụ theo `projectId` và theo `itemId` (Lộc Tài / Quang Minh).
- Signed-lock enforce ở 3 điểm: `createDelivery/updateDelivery` (Phase 1), `LedgerService.create/update` cho `lay_hang` (mới), và Phase 2 `commitPeriodClose`. Điểm chung: helper `assertPeriodOpen(supplierId, date)` gọi ở đầu mỗi write path.

## Requirements
1. Migration `reconciliation_derived_snapshot`:
   - `SupplierReconciliation.openingBalance/totalIn/totalPaid/closingBalance` → nullable (drop NOT NULL); giữ cột.
   - Thêm `signedSnapshotJson JSONB?` — chốt số + dòng chi tiết tại thời điểm ký (dùng để in lại nguyên trạng).
   - Thêm partial UNIQUE `(supplierId, periodFrom, periodTo) WHERE deletedAt IS NULL` để chặn trùng kỳ.
2. Service `lib/vat-tu-ncc/reconciliation-derive-service.ts` (MỚI):
   - `computeReconciliation(supplierId, periodFrom, periodTo)` → `{ opening, layHangRows, thanhToanRows, totalIn, totalPaid, closing, byProjectSubtotal, byItemSubtotal }`.
   - `opening` = `getMaterialCurrentBalance(entityId, supplierId, projectId=null_flat, asOf=periodFrom - 1 day)` gộp theo entity (loop qua entityIds có event trong kỳ).
   - `layHangRows` = `SELECT * FROM ledger_transactions WHERE ledgerType='material' AND transactionType='lay_hang' AND partyId=? AND date BETWEEN periodFrom AND periodTo AND deletedAt IS NULL ORDER BY date, id` với join `deliveries` để lấy `qty/unitPriceSnapshot`, join `items` để có tên VT, join `projects` để có tên CT.
   - `thanhToanRows` tương tự cho `thanh_toan`.
3. Server action `signReconciliation(reconciliationId)`:
   - Đọc `computeReconciliation`, snapshot vào `signedSnapshotJson`, cập nhật `openingBalance/totalIn/totalPaid/closingBalance` = số dẫn xuất tại thời điểm ký, set `signedBySupplier=true`, `signedDate=now()`.
4. Server action `unsignReconciliation` — admin-only; xóa snapshot, `signedBySupplier=false`. **[VALIDATED]** Guard: từ chối nếu tồn tại kỳ sau đã ký cùng NCC (`periodFrom > kỳ này` AND `signedBySupplier=true`) — chỉ gỡ được kỳ ký mới nhất, bảo toàn chuỗi carry-over.
5. Helper `assertPeriodOpen(supplierId, date)`:
   - `SELECT id FROM supplier_reconciliations WHERE supplierId=? AND signedBySupplier=true AND periodFrom<=date AND periodTo>=date AND deletedAt IS NULL LIMIT 1`.
   - Nếu có → throw "Kỳ [from..to] đã ký, ghi `dieu_chinh` kỳ sau."
   - Gọi ở: `createDelivery`, `updateDelivery`, `softDeleteDelivery`, `LedgerService.create` (khi `transactionType='lay_hang'` HOẶC `'thanh_toan'`), `commitPeriodClose`.
6. Route mới `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx` — in ra bảng đối chiếu theo mẫu Excel (dòng chi tiết + tổng phụ + khối chữ ký); export Excel dùng lại `ExcelExportButton` (template `doi-chieu`).
7. Cập nhật `doi-chieu-client.tsx`:
   - Nút "Tạo kỳ" thay bằng "Chốt & xem": tạo `SupplierReconciliation` (chưa ký), redirect sang trang chi tiết.
   - Bỏ 3 input `openingBalance/totalIn/totalPaid` khỏi form (không cho gõ tay).
   - Nút "NCC đã ký" → gọi `signReconciliation` sau khi user xác nhận.
8. `reconciliation-service.ts` (cũ): giữ `listReconciliations`; `create/update/softDelete` chỉ nhận `{supplierId, periodFrom, periodTo, note}` — bỏ tham số 3 số tổng. Kỳ đã ký từ chối update/soft-delete.

## Architecture
```
User → doi-chieu list → chọn "Tạo kỳ 6/2026" → server: SupplierReconciliation{periodFrom=2026-05-27, periodTo=2026-06-26, signedBySupplier=false}
                                                         └── computeReconciliation() (fresh mỗi lần view)
User → xem trang chi tiết → nút "NCC đã ký"
        └── signReconciliation → snapshot đông cứng vào columns + JSONB
                                → assertPeriodOpen() giờ chặn writes trong khoảng [from..to]
```

## Related code files
- `prisma/schema.prisma` (SupplierReconciliation ~548)
- `lib/vat-tu-ncc/reconciliation-service.ts` (rút gọn)
- `lib/vat-tu-ncc/reconciliation-derive-service.ts` (MỚI)
- `lib/vat-tu-ncc/period-lock.ts` (MỚI — `assertPeriodOpen`)
- `lib/vat-tu-ncc/delivery-service.ts` (gọi `assertPeriodOpen`)
- `lib/ledger/ledger-service.ts` (gọi `assertPeriodOpen` cho material `lay_hang/thanh_toan`; labor bỏ qua vì scope hiện tại)
- `lib/vat-tu-ncc/period-close-service.ts` (Phase 2) — gọi `assertPeriodOpen`
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/page.tsx` + `doi-chieu-client.tsx`
- `app/(app)/vat-tu-ncc/[supplierId]/doi-chieu/[reconciliationId]/page.tsx` (MỚI)

## Implementation Steps
1. Migration nullable + JSONB + unique partial.
2. `period-lock.ts` với `assertPeriodOpen` — query nhẹ, cache-friendly.
3. `reconciliation-derive-service.ts` — 3 raw SQL: opening (dùng `getBalancesBulk`/`getMaterialCurrentBalance` với `asOf`), lay_hang detail, thanh_toan detail.
4. Tính `opening` cho case gộp nhiều project: query `SELECT DISTINCT "entityId", COALESCE("projectId",0) FROM ledger_transactions WHERE partyId=? AND date BETWEEN... UNION opening balances` → tổng `outstanding` mỗi (entity, project) tại `periodFrom - 1`. Bằng cấu trúc, closing kỳ trước tính tương tự tại `periodTo`.
5. `signReconciliation` — snapshot, cập nhật columns; sau đó `assertPeriodOpen` sẽ block write.
6. Rút gọn `reconciliation-service.ts` — schema Zod cắt bỏ 3 số tổng; bảo tồn API list cho `page.tsx`.
7. Sửa `doi-chieu-client.tsx` — form giảm còn `{periodFrom, periodTo, note}`; nút "Ký" và "Bỏ ký (admin)".
8. Trang chi tiết `[reconciliationId]/page.tsx` — render:
   - Header pháp lý (đọc từ Entity + Supplier + list projects unique trong dữ liệu kỳ).
   - `A. Dư nợ mang sang`.
   - Bảng chi tiết `lay_hang` (STT, ngày, tên VT, KL, ĐVT, ĐG, Thành tiền) — tổng phụ theo project (như Lộc Tài) và theo itemId (như Quang Minh).
   - `B. Cộng P/S`, `C. Chuyển khoản`, `A+B-C = Tổng nợ`.
   - Khối chữ ký (3 chữ ký) theo mẫu Excel.
   - Print CSS.
8. Thêm ACL check cho `signReconciliation` = `edit`; `unsignReconciliation` = admin.

## Todo list
- [ ] Migration nullable + JSONB + unique partial
- [ ] `period-lock.ts` + gọi ở 5 điểm write
- [ ] `reconciliation-derive-service.ts` với 3 raw SQL
- [ ] `signReconciliation` / `unsignReconciliation`
- [ ] Rút gọn `reconciliation-service.ts` (bỏ 3 số gõ tay)
- [ ] Sửa `doi-chieu-client.tsx`
- [ ] Trang chi tiết `[reconciliationId]` với print CSS
- [ ] Integration test: 3 phiếu lay_hang + 1 thanh_toan + opening=1000 → opening/B/C/closing đúng số học
- [ ] Test signed-lock: ký kỳ → thử tạo delivery trong kỳ → reject; tạo delivery kỳ sau → OK
- [ ] Test parity: `computeReconciliation.closing.tt` = `getMaterialCurrentBalance(asOf=periodTo).tt`
- [ ] Test 2 kỳ liên tiếp: closing kỳ k = opening kỳ k+1

## Success Criteria
- Trang chi tiết in đúng mẫu Excel (số + layout — không cần pixel-perfect).
- Kỳ chưa ký: các số tự cập nhật khi có write mới trong khoảng.
- Kỳ đã ký: mọi write mới trong khoảng bị chặn; snapshot giữ nguyên khi in lại.
- `closing(k) === opening(k+1)` cho mọi cặp kỳ liền kề — kiểm bằng test tự động.
- Không còn UI cho gõ 3 số tổng.

## Risk Assessment
| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| `computeReconciliation` chậm nếu 1 NCC nhiều phiếu | Trung bình | Query từng loại 1 raw SQL, join nhẹ; nếu chậm, cache theo `(supplier, periodTo)` (không làm sớm — YAGNI) |
| Snapshot lệch sau khi ký do backfill event | Cao | Signed-lock chặn write; nếu admin `unsign`, xoá snapshot và bắt ký lại |
| Opening cho kỳ đầu (không có kỳ trước) | Trung bình | Dùng `LedgerOpeningBalance` (đã có) qua `getMaterialCurrentBalance(asOf=periodFrom-1)` — tự nhiên đúng |
| Multi-entity cho 1 NCC | Thấp | Group SUM theo entity; bảng in header list các entity nếu >1 (edge, ghi note) |
| Delete phiếu / delete ledger event thủ công trong kỳ đã ký | Cao | Signed-lock cũng chặn `softDeleteDelivery`; admin patch ledger đã có audit — cân nhắc thêm assert |

## Security Considerations
- `signReconciliation` = edit; `unsignReconciliation` = admin-only + audit log (`writeAuditLog` mẫu `code-standards.md:186`).
- `assertPeriodOpen` là guard nghiệp vụ, không phải ACL — vẫn cần ACL trước.
- Snapshot JSONB không chứa dữ liệu nhạy cảm; safe để log.

## Next steps
Phase 5: nhập opening + tái lập 2 kỳ Nam Hương để verify khớp Excel.
