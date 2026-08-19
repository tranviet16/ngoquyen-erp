# Phase 02 — Service metrics per-stream + suppression

## Context links

- Design §Metrics + §Service changes: `plans/reports/brainstorm-260819-can-doi-vat-tu-ux-analytics.md`.
- Service hôm nay: `lib/du-an/can-doi-service.ts:101-223`.
- Views: `prisma/migrations/20260504140000_add_project_views/migration.sql:12-52` (`vw_project_norm` conflated actual_qty; `vw_project_estimate_adjusted.adjusted_total_vnd`).

## Overview

Viết lại `listCanDoiVatTu` để trả về đủ số liệu cho 3 mode. Bypass `vw_project_norm.actual_qty` (conflated) — dùng `groupBy` per-stream với FILTER trên bảng gốc `project_transactions`. Neo estimate từ `project_estimates` + join `vw_project_estimate_adjusted` để lấy `adjusted_total_vnd`. Compute bucket / % / weighted price / suppression flags trên server. Không sửa view.

## Key insights

- `vw_project_norm.actual_qty = Σ qty` cho MỌI dòng transaction (không phân biệt HĐ / TT / cả hai). Sai cho mode-1 (dùng qtyHd) và mode-3 (2 stream riêng).
- FILTER dùng `<>0` (không `>0`) để aggregate cả điều chỉnh âm.
- Rollup %: cộng tử/mẫu riêng rồi chia, **không** avg pct từng dòng.
- Suppress khi: `unitMismatch` (đơn vị khác dự toán), `estimateQty = 0`, hoặc row loại aggregate/CPC (`sectionCode = 'CPC'` — nhận diện qua categoryCode có suffix `-CPC` hoặc trực tiếp qua `itemName='Chi phí chung'`; đơn giản: skip khi `unit='gói'` và transactionType='chi_phi_chung' — có sẵn trên transaction, không lộ tới estimate → dùng `unitMismatch` là đủ trong v1).
- ε = `Math.max(1_000, 0.005 * estimateTotalVnd)`. Hằng số + hàm `computeBucket` xuất ra khỏi service để phase 04 (export) và phase 03 (test/UI) chia sẻ (KISS: server tính, UI/xuất chỉ đọc kết quả).

## Requirements

- Query mới (single raw SQL): 
  ```
  SELECT pe.id AS estimate_id, pe."categoryId", pe."itemCode", pe."itemName", pe.unit,
         pe.qty AS est_qty, pe."unitPrice" AS est_unit_price, pe."totalVnd" AS est_total,
         vea.adjusted_total_vnd,
         COALESCE(SUM(pt.qty) FILTER (WHERE pt."amountTt" <> 0), 0) AS qty_tt,
         COALESCE(SUM(pt."amountTt") FILTER (WHERE pt."amountTt" <> 0), 0) AS amount_tt,
         COALESCE(SUM(COALESCE(pt."qtyHd", pt.qty)) FILTER (WHERE pt."amountHd" <> 0), 0) AS qty_hd,
         COALESCE(SUM(pt."amountHd") FILTER (WHERE pt."amountHd" <> 0), 0) AS amount_hd,
         pe."remainingInvoiceOverrideVnd" AS override_vnd,
         ARRAY_AGG(DISTINCT TRIM(pt.unit)) FILTER (WHERE pt."deletedAt" IS NULL) AS tx_units
  FROM project_estimates pe
  LEFT JOIN vw_project_estimate_adjusted vea ON vea.estimate_id = pe.id
  LEFT JOIN project_transactions pt ON pt."projectId"=pe."projectId" AND pt."categoryId"=pe."categoryId"
     AND pt."itemCode"=pe."itemCode" AND pt."deletedAt" IS NULL
  WHERE pe."projectId" = ${projectId} AND pe."deletedAt" IS NULL
  GROUP BY pe.id, vea.adjusted_total_vnd
  ORDER BY pe."categoryId", pe."itemCode"
  ```
- Orphan query giữ nguyên nhưng tách qty_hd / qty_tt cùng cách (COALESCE cho qtyHd).
- Extend `CanDoiRow`:
  - Giữ: `id, kind, estimateId, categoryId, itemCode, itemName, unit, unitMismatch, remainingIsOverride`.
  - Đổi: `estimateTotalVnd` (giữ = original), thêm `estimateAdjustedTotalVnd` (từ vea, fallback = original).
  - Thêm: `estimateQty, estimateUnitPrice, qtyHd, qtyTt, invoiceAmountVnd, actualAmountVnd, remainingInvoiceVnd, diffActualVsInvoiceVnd, pctHdMoney (number|null), pctHdQty (number|null), bucket ('chua_lay'|'thieu'|'du'|'vuot'|'ngoai_dt'), avgPriceHd (number|null), avgPriceTt (number|null), priceDiffTt (number|null), priceDiffPct (number|null), priceImpactTt (number|null)`.
- Extend `CanDoiSubtotal`: cộng thêm `estimateAdjustedTotalVnd, qtyHd, qtyTt, amountHd, amountTt`. Bucket count dạng `{ chua_lay, thieu, du, vuot, ngoai_dt }`.
- Extend `CanDoiData.total` giống subtotal. Thêm `worklist: WorklistItem[]` (Top-10 rows còn phải lấy HĐ > 0 sau override, sort desc).
- Extract helpers thuần túy trong cùng file (không tách file thừa):
  - `EPSILON_MIN = 1_000; EPSILON_PCT = 0.005;`
  - `epsilon(estTotal: number) => Math.max(EPSILON_MIN, estTotal * EPSILON_PCT)`
  - `bucketOf(row) => 'chua_lay'|...`
  - `pctOrNull(num, den) => den > 0 ? num/den : null`

## Architecture

```
Server (RSC):
  listCanDoiVatTu(projectId)
    → 4 queries (existing estimate query rewritten, orphan, units, categories)
    → rows[] with all metrics computed
    → groups[] + total + worklist
Client:
  Only formats numbers, applies filter/sort, renders cards.
```

## Related code files

- Modify: `lib/du-an/can-doi-service.ts` (rewrite `listCanDoiVatTu`, keep `setInvoiceOverride` untouched).
- Create: `lib/du-an/__tests__/can-doi-service.test.ts` — unit test cho `epsilon`, `bucketOf`, `pctOrNull`, aggregation invariants (mock rows).

## Implementation steps

1. Export const `EPSILON_MIN`, `EPSILON_PCT`, helpers `epsilon`, `bucketOf`, `pctOrNull` (named export ở top của file để test import).
2. Định nghĩa lại interfaces `CanDoiRow`, `CanDoiSubtotal`, `CanDoiGroup`, `CanDoiData`, `WorklistItem`.
3. Viết query estimate mới (raw SQL, single query thay 2 query cũ). Dùng `Prisma.sql` nếu cần join phức tạp.
4. Viết query orphan mới với FILTER + COALESCE(qtyHd, qty).
5. Loop parse ViewRow → tính: base denominator = adjusted_total_vnd ?? est_total; pctHdMoney, pctHdQty (chỉ khi units match && est_qty>0), avgPriceHd (amount_hd/qty_hd nếu qty_hd>0), avgPriceTt (amount_tt/qty_tt nếu qty_tt>0), priceDiff, priceImpactTt = (avgPriceTt - est_unit_price)*qty_tt khi unit match; bucket theo remaining vs ε; suppress → null.
6. Loop parse OrphanRow → bucket = 'ngoai_dt', pct = null, adjustedTotal = 0.
7. Group by category (giữ pattern `byCategory` cũ); subtotal cộng thẳng các số đã tính (never re-avg pct — mỗi dòng có pct riêng, subtotal có pct riêng tính từ tổng tử/mẫu).
8. Worklist: filter rows `remainingInvoiceVnd > 0`, sort desc, slice 10, map `{ estimateId|orphanId, categoryCode, itemCode, itemName, remainingInvoiceVnd }`.
9. Unit test: 
   - `epsilon(0)` = 1000; `epsilon(1_000_000)` = 5000; `epsilon(500)` = 1000.
   - `bucketOf`: remaining=800 est_total=100_000 → 'du' (ε=1000); remaining=2000 → 'thieu'; remaining=-1500 → 'vuot'; hd=0 & est>0 → 'chua_lay'.
   - `pctOrNull(0, 0)` = null; `pctOrNull(50, 100)` = 0.5.
   - Aggregation: cho 3 mock rows subtotal = sum từng field, pctHdMoney của subtotal = Σamount_hd / Σadjusted_total (không avg %).

## Todo list

- [ ] Interfaces mới + export helpers
- [ ] Raw SQL query estimate (join adjusted)
- [ ] Raw SQL query orphan (per-stream)
- [ ] Row mapping + suppression logic
- [ ] Subtotal + total accumulator
- [ ] Worklist top-10
- [ ] Unit test (5-6 test)
- [ ] `pnpm exec vitest run lib/du-an/__tests__/can-doi-service.test.ts` pass
- [ ] `pnpm exec tsc --noEmit` sạch (client hiện tại sẽ break — chỉnh tạm hoặc để phase 03 nhận)

## Success criteria

- Trên MNTC-GD1 dev: total.amountHd = tổng cũ (verify bằng snapshot: 4_303_557_521 ± rounding); total.amountTt = 0 (chưa nhập TT); total.qtyHd tính từ COALESCE(qtyHd, qty).
- Không có CO ⇒ adjustedTotalVnd = original totalVnd (fallback qua LEFT JOIN + view coi 0-CO là 0-impact).
- Bucket counts đúng: đa số 'thieu' hoặc 'chua_lay'; 'du' / 'vuot' hiếm.
- Worklist trả 10 dòng có `remainingInvoiceVnd > 0` lớn nhất.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Raw SQL join sai → double-count | Med | High | Cẩn thận `GROUP BY pe.id, vea.adjusted_total_vnd` (vea 1-1 với pe.id); test đối chiếu total với query cũ. |
| `ARRAY_AGG(DISTINCT ...) FILTER` postgres syntax lỗi | Low | Med | Test locally; nếu lỗi, tách query units riêng như cũ. |
| Suppression logic khiến subtotal khác từng dòng cộng lại | Med | Med | Subtotal cộng raw values (amount_hd, adjustedTotal); pct suppressed = null nhưng vẫn contribute qua numerator/denominator subtotal — không mismatch. |
| ε bucket rất nhỏ so với dự toán lớn → mọi dòng 'thieu' | Low | Low | Design ε = max(1000, 0,5%) chống noise; đã locked. |
| Contract test giữ shape cũ (nếu có) fail | Low | High | Grep `CanDoiRow` consumer trước — chỉ có `can-doi-vat-tu-client.tsx` dùng; sẽ break tại tsc → phase 03 fix ngay. |

## Security considerations

- Query raw đã có scope projectId trong WHERE — ACL guard giữ nguyên (`requireReleasedModuleRequest`).
- Không expose internal ID mới; worklist trả về estimateId đã public trong shape hiện có.

## Next steps

Client (phase 03) tiêu thụ shape mới. Đề nghị merge 02+03 chung PR để tsc không đỏ giữa chừng.
