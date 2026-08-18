# Phase 4 — Tab `/du-an/[id]/can-doi-vat-tu`

## Context links

- Sibling tabs (pattern reference): `app/(app)/du-an/[id]/dinh-muc/page.tsx`, `app/(app)/du-an/[id]/giao-dich/`
- Guard pattern: `lib/acl/guards.ts` (`requireModuleAccess`) — used by dinh-muc; or `requireReleasedModuleRequest` from `lib/acl/released-module-request` — used by services. Follow the existing sibling pattern.
- Data source: view `vw_project_norm` (`prisma/migrations/20260504140000_add_project_views/migration.sql`) already joins estimate↔transaction on `(projectId, categoryId, itemCode)`.
- Service pattern: `lib/du-an/norm-service.ts` (raw view query, decimal normalization, flag computation).
- Override column: `ProjectEstimate.remainingInvoiceOverrideVnd` (added in Phase 1).
- Layout: `app/(app)/du-an/[id]/layout.tsx` (add tab link).

## Overview

- Date: 2026-08-18
- Description: New tab merging estimate-anchored rows (from `vw_project_norm`) with invoice-only transaction rows (anti-join: transactions whose `(categoryId, itemCode)` matches no estimate). Grid shows Dự toán / HĐ đã lấy / Thực tế / Chênh (TT−HĐ) / Còn-phải-lấy-HĐ (derived + override) per row, subtotals per (HM × section) category, "khác ĐVT" badge when an invoice sub-line's unit differs from the estimate's unit.
- Priority: P2
- Implementation status: done (2026-08-18)
- Review status: pending

## Key Insights

- **Row set** = estimate-anchored rows (one per `ProjectEstimate`) ∪ invoice-only rows. Merged in service, not in view — invoice-only rows are ad-hoc and don't fit the view's grain.
  - Estimate-anchored: `SELECT * FROM vw_project_norm WHERE "projectId" = $1`.
  - Invoice-only: `SELECT categoryId, itemCode, MAX(itemName) as itemName, MAX(unit) as unit, SUM(amountHd) as amountHd, SUM(amountTt) as amountTt, SUM(qty) as qty FROM project_transactions pt WHERE projectId=$1 AND deletedAt IS NULL AND NOT EXISTS (SELECT 1 FROM project_estimates pe WHERE pe.projectId=pt.projectId AND pe.categoryId=pt.categoryId AND pe.itemCode=pt.itemCode AND pe.deletedAt IS NULL) GROUP BY categoryId, itemCode`.
- **Còn-phải-lấy-HĐ** per row: if `remainingInvoiceOverrideVnd` IS NOT NULL → use it; else `estimate_total_vnd - actual_amount_hd` (from view). For invoice-only rows the derived value is `-actual_amount_hd` (no estimate) — allow override there too? **Decision:** invoice-only rows have no override slot (no `ProjectEstimate` row to hang it on) — show derived only, dashed style. This is intentional: overrides are estimate-anchored corrections.
- **Chênh TT−HĐ** per row: `actual_amount_tt - actual_amount_hd`. Zero at first (Tt=0), fills as users edit actuals.
- **"khác ĐVT" badge**: only meaningful on invoice sub-lines (parent estimate row has canonical unit; sub-lines may differ, e.g. m2 vs Hộp). Since we don't render sub-lines separately in this tab (they're aggregated into `actual_qty`/`actual_amount_hd`), the badge fires on the aggregated row when the aggregated-transactions' units contain more than one distinct value OR differ from the estimate's unit. Compute in service via a separate query: `SELECT categoryId, itemCode, ARRAY_AGG(DISTINCT unit) AS units FROM project_transactions ...`; badge if `units` has >1 element or `units[0] != estimate.unit`.
- **Subtotals** per `ProjectCategory` (HM×section) — computed client-side by grouping rows on `categoryId`. Show category label as section header. Amounts-first: sum `estimate_total_vnd`, `actual_amount_hd`, `actual_amount_tt`, `remainingInvoiceOverrideVnd ?? (estimate_total_vnd - actual_amount_hd)`.
- **Override edit**: server action `setInvoiceOverride(estimateId, valueVnd | null)` on `estimate-service.ts` (or new `override-service.ts`). Guard: `requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId } })`. Only updates `remainingInvoiceOverrideVnd`; nothing else on the estimate.
- **Same-row Thực-tế edit**: link "Sửa" opens the existing giao-dich edit form (there may be multiple transactions per estimate row when invoice sub-lines exist; the link goes to a filtered giao-dich list scoped by `(categoryId, itemCode)`). Do not fabricate a new edit modal in this tab — reuse giao-dich UI. Small link/button per row: `→ Xem giao dịch`.
- **Serialization**: view returns Prisma Decimals; use existing `lib/serialize.ts::serializeDecimals` (pattern from dinh-muc).

## Requirements

- New route `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx` (server component) + `can-doi-vat-tu-client.tsx` (client grid).
- New service function `listCanDoiVatTu(projectId)` in `lib/du-an/can-doi-service.ts`:
  - Returns `{ rows: CanDoiRow[], categories: {id, code, name}[] }`.
  - `CanDoiRow` = merged shape with `kind: 'estimate' | 'invoice-only'`, `estimateId?`, `categoryId`, `itemCode`, `itemName`, `unit`, `estimate_qty`, `estimate_total_vnd`, `actual_qty`, `actual_amount_hd`, `actual_amount_tt`, `remainingInvoiceOverrideVnd`, `unitBadge: boolean`.
  - Uses `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`.
- New server action `setInvoiceOverride(estimateId, valueVnd | null)` — writes `remainingInvoiceOverrideVnd`.
- Client grid: category-grouped, subtotals row per group, column headers Vietnamese, amount formatting via existing project helper.
- Link to layout: add "Cân đối vật tư" tab in `app/(app)/du-an/[id]/layout.tsx` between "Dự toán" and "Định mức" (or wherever fits the existing order).
- Do NOT alter estimate/transaction service public contracts.

## Architecture

- Data flow: page → `listCanDoiVatTu(projectId)` → (view query + anti-join query + units query) → merge in memory → client grid.
- The override write path is independent of the read path; after write, `revalidatePath('/du-an/${projectId}/can-doi-vat-tu')`.
- No new DB objects (view is reused; override column added in Phase 1).

## Related code files

- Create: `app/(app)/du-an/[id]/can-doi-vat-tu/page.tsx`
- Create: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx`
- Create: `lib/du-an/can-doi-service.ts` (list + override server action)
- Modify: `app/(app)/du-an/[id]/layout.tsx` (add tab link)
- Read (pattern reference): `app/(app)/du-an/[id]/dinh-muc/page.tsx`, `lib/du-an/norm-service.ts`
- Read: `lib/serialize.ts`

## Implementation Steps

1. Draft the service SQL: view query + anti-join query + units query. Test each query in psql against Phase-3-imported data.
2. Implement `listCanDoiVatTu(projectId)` — merge and shape rows; compute `unitBadge`.
3. Implement `setInvoiceOverride` server action with guard + revalidatePath.
4. Build page.tsx (mirror dinh-muc/page.tsx structure exactly — guard, service call, `serializeDecimals`, pass to client).
5. Build client grid: category grouping, subtotals row per group, inline number input for override (per estimate row only), link "Xem giao dịch" per row (query-string filter to giao-dich tab if it supports one; else plain link).
6. Add tab to layout.
7. Manual test in dev DB (post-Phase 3): open the tab, verify HM1 subtotals match, edit an override, verify persistence + subtotal recompute.
8. Add integration test if adjacent tabs have one; else defer.

## Todo list

- [ ] Write the 3 SQL queries; verify against imported data.
- [ ] Service + shaping + unit badge.
- [ ] Server action for override.
- [ ] Page + client grid + subtotals.
- [ ] Tab in layout.
- [ ] Manual walkthrough on dev DB.
- [ ] Typecheck.

## Success Criteria

- Tab renders category-grouped grid; subtotals match SQL rollups.
- HM1 grid shows estimate subtotal 7,511,996,392 / HĐ subtotal 4,303,557,521 (±0.5% after Phase 2/3 import).
- Editing an override persists and recomputes subtotal without page reload (server action + revalidatePath).
- Invoice-only rows (e.g. rows with `Số HĐ` and no estimate qty) appear inline with `-actual_amount_hd` in the Còn-phải-lấy-HĐ column.
- "khác ĐVT" badge fires on rows where transaction units differ from estimate unit.
- ACL: non-du-an-scoped users get 403; read-only users cannot edit override.

## Risk Assessment

- **Anti-join misses cross-phase rows (Med × Med):** rows whose `itemCode` matches an estimate in another HM's section would be miscategorized. Mitigation: the anti-join keys on `(projectId, categoryId, itemCode)` — categories are per HM×section, so cross-HM collisions require identical synthetic codes across HMs, which the seq scheme prevents.
- **Subtotal drift between grid and view (Low × Med):** if the grid recomputes subtotals from client rows but the view sums differently (e.g. rounding). Mitigation: subtotals in service (server-side), passed to client; do not recompute client-side.
- **Override applied to wrong row (Low × High):** editing UI must send the correct `estimateId`. Mitigation: server action verifies `estimateId → projectId` matches guarded `projectId`.
- **Performance (Low × Low):** 3 queries per page load, small project (<10k rows). Acceptable.

## Security Considerations

- Read: `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: project })` on the service.
- Write (override): `requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: project })` and server-side verification that `estimateId` belongs to the guarded project.
- No mass-assignment on the estimate — server action writes only `remainingInvoiceOverrideVnd`.

## Next steps

Phase 5 adds dashboard ΣHd and documents conventions.
