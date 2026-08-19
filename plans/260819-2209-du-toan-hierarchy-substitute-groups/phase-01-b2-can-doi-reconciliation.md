# Phase 01 — B2 đối chiếu tên DT↔HĐ/TT trong can-doi

## Context links

- Brainstorm §B2: `plans/reports/brainstorm-260819-du-toan-hierarchy-substitute-groups.md`
- Service hiện tại: `lib/du-an/can-doi-service.ts` (305 dòng), pure helpers `lib/du-an/can-doi-metrics.ts` (163 dòng)
- Client: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (684 dòng) — pattern OverrideCell (dòng 85–169)
- `normVtName`: `lib/import/adapters/du-toan-tong-hop-vt.adapter.ts:56`

## Overview

Thêm khả năng mở rộng dòng dự toán trong cân đối để xem giao dịch member, chip "tên khác DT" cảnh báo lệch tên, và nút "Gán vào dự toán…" trên dòng "Ngoài DT" để reassign cụm txn cùng `(categoryId, itemCode)` sang mã của một dự toán đích.

## Key insights

- Không đổi schema. `project_transactions` đã có `categoryId, itemCode, itemName, invoiceNo, qty/qtyHd, unit, amountHd, amountTt, date` — đủ để trả về member rows.
- `ARRAY_AGG(DISTINCT pt."itemName")` bổ sung vào query estimate hiện tại chỉ tốn thêm 1 cột output; không đổi cost query.
- Token intersection: `tokens(normVtName(estimateName)) ∩ tokens(normVtName(txName)) === ∅` → chip "tên khác DT". Không similarity, không TF-IDF.
- `normVtName` đang nằm trong adapter — import từ adapter vào service `du-an` là code smell. Extract sang `lib/text/norm-vt-name.ts`, adapter re-export để tránh phá test hiện tại.

## Requirements

- FR1: Cân đối, mode HĐ: chevron trên mỗi dòng estimate → hàng con hiện các giao dịch (date, tên thương mại, số HĐ, SL, ĐVT, amount HD/TT). Eager fetch với query hiện có.
- FR2: Chip "tên khác DT" khi có ≥1 member txn với `normVtName(itemName)` không share token nào với estimate's `normVtName(itemName)`. Tooltip: liệt kê max 3 tên lệch.
- FR3: Dòng "Ngoài DT" hiện nút "Gán vào dự toán…" → dialog có input search (client-side filter theo `code + itemCode + itemName` đã normalize), list gợi ý là estimates cùng project. Chọn → confirm.
- FR4: Server action `reassignTransactionCluster(projectId, fromCategoryId, fromItemCode, toEstimateId)`:
  - Guard: `requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId } })`.
  - Xác thực `toEstimateId` thuộc `projectId`.
  - Bulk `updateMany` toàn bộ `project_transactions` match `(projectId, categoryId=fromCategoryId, itemCode=fromItemCode, deletedAt=null)` → set `categoryId, itemCode, itemName` theo estimate đích; append `note` với prefix `"gán từ <oldCategoryCode>/<oldItemCode>"` (dùng `$queryRaw` để concat vì Prisma updateMany không hỗ trợ string concat).
  - `revalidatePath` `/du-an/${projectId}/can-doi-vat-tu`, `/giao-dich`, `/dinh-muc`.
- NFR: không thêm N+1 (query member txns có thể thực hiện qua 1 IN-list query khi user expand hàng loạt — với hiện trạng ≤400 estimates, ổn).

## Architecture

Data flow:

```
DB → listCanDoiVatTu (existing SQL + tx_names ARRAY_AGG)
   → post-process: nameMismatch = tokensIntersect(estName, txNames) === false (pure)
   → CanDoiRow.txNames, nameMismatch xuất ra client
Client expand chevron → useTransition → server action listMemberTransactions(estimateId)
   → trả rows đã sort by date desc
Orphan row → picker dialog → reassignTransactionCluster()
```

Pure helpers (thêm vào `can-doi-metrics.ts`):

```ts
export function tokenize(s: string): Set<string> { /* normVtName + split space + filter len>=2 */ }
export function hasTokenIntersection(a: string, b: string): boolean
export function detectNameMismatch(estName: string, txNames: string[]): { mismatch: boolean; samples: string[] }
```

Service additions (`can-doi-service.ts`):

- Sửa `EstimateAggRow`: thêm `tx_names: string[] | null`; SQL thêm `ARRAY_AGG(DISTINCT pt."itemName") FILTER (WHERE pt.id IS NOT NULL) AS tx_names`.
- Trong loop map: gọi `detectNameMismatch(r.itemName, r.tx_names ?? [])`, gán vào row.
- Hàm mới `listMemberTransactions(projectId, estimateId)`: lookup estimate → guard → return txns theo `(projectId, categoryId, itemCode)` sort date desc.

New file `lib/du-an/txn-cluster-service.ts`:

```ts
"use server";
export async function reassignTransactionCluster(
  projectId: number, fromCategoryId: number, fromItemCode: string, toEstimateId: number
): Promise<{ moved: number }>
```

## Related code files

- Modify: `lib/du-an/can-doi-service.ts`, `lib/du-an/can-doi-metrics.ts` (thêm pure helpers)
- Modify: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (chevron, chip, picker dialog UI)
- Create: `lib/du-an/txn-cluster-service.ts`
- Create: `lib/text/norm-vt-name.ts` (extract)
- Modify: `lib/import/adapters/du-toan-tong-hop-vt.adapter.ts` (re-export từ `lib/text/norm-vt-name.ts`)
- Test: `lib/du-an/__tests__/can-doi-metrics.test.ts` (thêm cases token intersection)
- Test: `lib/du-an/__tests__/txn-cluster-service.test.ts` (mới — cần real DB per project convention)

## Implementation steps

1. Extract `normVtName` → `lib/text/norm-vt-name.ts`. Adapter re-export. Chạy test adapter → phải xanh.
2. Thêm pure helpers `tokenize / hasTokenIntersection / detectNameMismatch` vào `can-doi-metrics.ts`. Viết tests.
3. Mở rộng SQL `EstimateAggRow` với `tx_names`. Thêm `txNames`, `nameMismatch`, `nameMismatchSamples` vào `CanDoiRow`.
4. Viết `listMemberTransactions(projectId, estimateId)` trong `can-doi-service.ts` (guard read, return `{ id, date, itemName, invoiceNo, qty, qtyHd, unit, amountHd, amountTt }[]`).
5. Viết `reassignTransactionCluster` trong `txn-cluster-service.ts` mới. Note-append qua `$executeRaw` (`UPDATE ... SET note = CONCAT_WS(' | ', 'gán từ <old>', note)`). Guard edit-level.
6. UI: thêm state `expanded: Set<string>` trong client, chevron cell ở đầu row, khi expand call `listMemberTransactions` qua `useTransition` cache trong `useState<Map<string, MemberRows>>`.
7. Chip "tên khác DT": render bên cạnh `itemName`, tooltip liệt kê `nameMismatchSamples[0..2]`.
8. Picker dialog cho orphan row: reuse `CrudDialog` shell + `<input type="search">` + list scroll (max height); render `code · itemCode · itemName` mỗi option; click → confirm → gọi `reassignTransactionCluster` qua transition → toast + `router.refresh()`.

## Todo list

- [ ] Extract `normVtName` (grep verify không còn import từ adapter path ngoài adapter chính)
- [ ] Pure helpers + tests
- [ ] SQL cột `tx_names` + service map
- [ ] `listMemberTransactions`
- [ ] `reassignTransactionCluster` + note-append raw SQL
- [ ] Client: expand chevron + member table subrow
- [ ] Client: chip "tên khác DT"
- [ ] Client: orphan picker dialog
- [ ] Tests: metrics + service (real DB)
- [ ] Manual walkthrough on MNTC-GD1 (id=4)

## Success criteria

- Cân đối mode HĐ: mỗi dòng dự toán expandable; dòng "Gạch không nung" hiện member "Gạch 600x600 mã 38017" và có chip "tên khác DT".
- Dòng "Ngoài DT" chọn → gán → sau refresh dòng biến mất, %HĐ dòng đích tăng đúng bằng `amountHd` cụm chuyển sang.
- `pnpm test lib/du-an` xanh.

## Risk assessment

- **HIGH** — Note-append qua `$executeRaw` dễ SQL-inject nếu `oldCategoryCode` chưa validate. Mitigation: `Prisma.sql` template + escape, giá trị lấy từ ProjectCategory.code (không phải user input tự do). Test edge case `code` có dấu nháy đơn.
- **MED** — Query `ARRAY_AGG DISTINCT` trên `pt."itemName"` với projects nhiều txns (~1000+) có thể chậm. Mitigation: giữ `FILTER (WHERE pt.id IS NOT NULL)`; benchmark trên MNTC-GD1 trước merge.
- **LOW** — Extract `normVtName` phá import path adapter. Mitigation: re-export shim, chạy full test adapter.

## Security considerations

- `reassignTransactionCluster` PHẢI check edit-level trên `projectId`, verify `toEstimateId.projectId === projectId` trước bulk update — user không được chuyển txn sang dự án khác.
- `listMemberTransactions` guard read-level (không leak txns cross-project).
- Note-append: escape parameter qua Prisma template literal, không string interpolation.

## Next steps

Phase 02 (category-tree helper + du-toan-dieu-chinh) — không phụ thuộc data từ Phase 01, có thể chạy song song về logic nhưng cùng repo → merge tuần tự để tránh conflict `norm-vt-name` extract.
