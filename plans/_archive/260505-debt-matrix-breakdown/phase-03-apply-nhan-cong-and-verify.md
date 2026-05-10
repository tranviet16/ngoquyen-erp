---
phase: 3
title: "Apply NCC ăn lương + verify data"
status: pending
priority: P2
effort: "1h"
dependencies: [2]
---

# Phase 3: Apply NCC ăn lương + verify data

## Overview
Áp dụng cùng matrix breakdown + filter cho `/cong-no-nc/chi-tiet` (NCC ăn lương). Verify số liệu của module Vật tư khớp Excel SOP sau re-import.

## Requirements
- **Functional:**
  - `/cong-no-nc/chi-tiet` reuse `<DebtMatrix>` + `<SupplierMultiSelect>` y hệt vật tư.
  - Server filter `partyIds` qua `getNhanCongDebtMatrix` (hoặc tên tương ứng).
  - Spot-check tối thiểu 2 NCC: tổng `lay_hang` + `thanh_toan` trong DB khớp Excel "Báo cáo công nợ" sheet.
- **Non-functional:** Không regression `/cong-no-nc` trang khác.

## Architecture
Component generic — chỉ cần truyền data đúng schema. `partyLabel` đổi sang "NCC ăn lương" hoặc giữ "NCC" tùy context.

## Related Code Files
- Modify: `app/(app)/cong-no-nc/chi-tiet/page.tsx`
- Modify: `lib/cong-no-nc/labor-ledger-service.ts` (hoặc tên thực tế — kiểm tra trong implementation)

## Implementation Steps
1. **Locate service**: `grep -rn "labor\|nhan-cong" lib/` để tìm tên service file của module nhân công.
2. **Verify ledgerType**: kiểm tra `LedgerService` instance dùng `"labor"` hay tên khác. Aggregation reuse nguyên `queryDebtMatrix` chỉ thay `ledgerType`.
3. **Update service action** giống vật tư: forward `partyIds` filter.
4. **Update page**: copy pattern từ `cong-no-vt/chi-tiet/page.tsx` (chỉ đổi import service + heading + partyLabel).
5. **Re-import + verify** (manual, dùng UI):
   - Vào `/admin/import` → upload `Quản Lý Công Nợ Vật Tư.xlsx`.
   - Kỳ vọng: 335 imported / 0 skipped (sau dedup-removal fix).
   - Mở `/cong-no-vt/chi-tiet`, filter 1 NCC mẫu (vd Quang Minh).
   - So tổng "Lấy hàng TT" + "Trả tiền TT" với tab "Báo cáo" Excel cho NCC đó.
   - Lặp với 1 NCC nữa (Nam Hương).
   - Nếu lệch → log số chính xác từ DB và Excel để debug riêng (KHÔNG bypass test).

## Success Criteria
- [ ] `/cong-no-nc/chi-tiet` render matrix 8 sub-cols + filter hoạt động giống `/cong-no-vt/chi-tiet`.
- [ ] Re-import vật tư: 335 / 0.
- [ ] 2 NCC mẫu: tổng "Lấy hàng" + "Trả tiền" khớp Excel (trong sai số 0 đồng).
- [ ] `/cong-no-nc` trang khác không bị regression.

## Risk Assessment
- **Risk**: Module NCC ăn lương có schema/transactionType khác (vd có loại `tam_ung`).
  **Mitigation**: Grep transaction types thực tế trong DB:
  ```sql
  SELECT DISTINCT "transactionType" FROM ledger_transactions WHERE "ledgerType" = 'labor';
  ```
  Nếu có loại khác `lay_hang|thanh_toan`, cần extend SQL query trong phase 1 (rollback phase 1 nếu cần). Lý tưởng: phát hiện sớm trước khi vào phase 3.
- **Risk**: Excel "Báo cáo" sheet đếm theo cách khác (vd inclusive/exclusive cuối kỳ).
  **Mitigation**: Nếu lệch, kiểm tra công thức Excel (xem cell formula trong tab) trước khi tạm kết luận DB sai.
