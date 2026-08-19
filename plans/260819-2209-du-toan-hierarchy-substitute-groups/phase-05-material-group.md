# Phase 05 — v2: ProjectMaterialGroup + rollup nhóm vật liệu thay thế

## Context links

- Brainstorm §B1 (4 quyết định đã chốt)
- Schema: `prisma/schema.prisma:378 ProjectEstimate`
- Service norm: `lib/du-an/norm-service.ts` — trả `NormRow[]` từ `vw_project_norm`
- Service can-doi: `lib/du-an/can-doi-service.ts` — trả `CanDoiData` (`CanDoiGroup[]`)
- Client norm: `app/(app)/du-an/[id]/dinh-muc/dinh-muc-client.tsx` (99 dòng, DataGrid read-only)
- Client can-doi: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (684 dòng, đã có mode "tt-dt")
- Migration reference: `prisma/migrations/20260819090000_add_transaction_qty_hd/`

## Overview

Introduce `ProjectMaterialGroup` (per-project scope) + optional `materialGroupId` trên `ProjectEstimate`. UI gộp nhiều dòng estimate (đặt trong tab **dinh-muc** — xem Unresolved #1 plan.md). Rollup layer TS-only: `vw_project_norm` và can-doi SQL KHÔNG đổi. Cờ định mức thành viên → mờ; cờ nhóm là số duy nhất. Suppression khi `normVtName(unit)` giữa thành viên khác nhau.

## Key insights

- Post-processing trong TS, không JOIN mới vào view. Rollup nhóm ngồi trên `NormRow[]` sẵn có.
- Nhóm layer là **thêm dòng cha**, member vẫn giữ dòng (không thu gọn) — user thấy cả 2 tầng.
- `normVtName(unit)` là tests **truy suppress qty/price**, KHÔNG dùng để auto-group.
- Group flag = tính lại trên `Σqty_member / Σestimate_qty_member` khi unit đồng nhất; nếu không, tính trên money (`Σamount_tt / Σestimate_total_vnd`).

## Requirements

### Schema

- FR-S1: Model `ProjectMaterialGroup { id, projectId (FK, indexed), name, note, deletedAt, createdAt, updatedAt }`. Unique `(projectId, name)` where `deletedAt IS NULL`.
- FR-S2: `ProjectEstimate.materialGroupId Int?` — FK to `ProjectMaterialGroup` `onDelete: SetNull`.
- FR-S3: Migration `20260820XXXXXX_add_project_material_group/migration.sql`: `CREATE TABLE`, `ALTER TABLE project_estimates ADD COLUMN materialGroupId ...`, index `(materialGroupId)`.

### Service

- FR-Sv1: `lib/du-an/material-group-service.ts` (`"use server"`) — CRUD:
  - `listGroups(projectId)` — read guard.
  - `createGroup(projectId, name, note?)` — create guard, enforce unique name per-project.
  - `renameGroup(id, projectId, name)` / `updateGroupNote(id, projectId, note)` — edit guard.
  - `deleteGroup(id, projectId)` — edit guard, soft delete (`deletedAt`); Prisma SetNull handles member unlink.
  - `assignEstimatesToGroup(projectId, groupId, estimateIds: number[])` — edit guard, verify all estimates belong to projectId, updateMany.
  - `unassignEstimates(projectId, estimateIds: number[])` — edit guard.
- FR-Sv2: Pure rollup `lib/du-an/material-group-rollup.ts`:
  - `rollupNormByGroup(rows: NormRow[]): { groupRows: GroupNormRow[]; memberIndex: Map<estimateId, groupId> }`
    - Group by `materialGroupId`; skip when null.
    - `unitConsistent = new Set(members.map(m => normVtName(m.unit))).size === 1`.
    - Compute: `est_qty_sum, actual_qty_sum, est_total_vnd_sum, actual_amount_tt_sum, used_pct`.
    - If `!unitConsistent`: `est_qty_sum = actual_qty_sum = null; used_pct = actual_amount_tt_sum / est_total_vnd_sum` (money-based).
    - Compute `flag` từ `used_pct` giống norm (giữ threshold từ settings).
  - `rollupCanDoiByGroup(canDoiRows: CanDoiRow[]): GroupCanDoiRow[]` — chỉ dùng cho mode `tt-dt`.
- FR-Sv3: `norm-service.listNorm` cần biết `materialGroupId` — thêm 1 subquery hoặc `prisma.projectEstimate.findMany` map estimate_id → groupId sau `$queryRaw`. KHÔNG sửa `vw_project_norm`.
- FR-Sv4: `can-doi-service.listCanDoiVatTu` tương tự — LEFT JOIN pe.materialGroupId trong SQL hiện có (chỉ thêm 1 cột `pe."materialGroupId" AS group_id`).

### UI

- FR-U1: Trong `dinh-muc-client`: multi-select rows (thêm cột checkbox), toolbar "Nhóm vật tư thay thế" → dialog nhập tên+note → gọi `createGroup + assignEstimatesToGroup`. "Bỏ nhóm" → confirm → `unassignEstimates`.
- FR-U2: Render dòng group HEADER phía trên các member (indent). Group flag hiển thị đầy đủ; member rows: dim opacity 60%, `text-muted-foreground`, flag hiển thị "(thuộc nhóm)" tag thay vì màu.
- FR-U3: Nếu `unitConsistent=false` cho một nhóm: group row hiện SL cột `—` với tooltip "Đơn vị khác nhau, chỉ tính theo tiền"; cột %SL/giá suppressed; cột %Tiền vẫn hiện.
- FR-U4: Trong `can-doi-vat-tu-client` mode `tt-dt`: thêm dòng "Nhóm: <tên nhóm>" trên các member. Không đổi mode HD / TT-HD (Q1 unresolved xác nhận).

## Architecture

Data flow (norm):

```
listNorm(projectId, settings)
  → $queryRaw vw_project_norm → NormRow[]
  → prisma.projectEstimate.findMany({projectId}) select {id, materialGroupId, unit}
  → augment NormRow[]: attach materialGroupId + unit (already present)
  → rollupNormByGroup(rows) → { groupRows, memberIndex }
  → client renders: group headers interleaved by section
```

Rollup contract:

```ts
export interface GroupNormRow {
  groupId: number;
  groupName: string;
  memberEstimateIds: number[];
  categoryId: number;         // = category của member đầu (yêu cầu: group MUST subset 1 category, hoặc null=cross)
  est_qty_sum: number | null; // null if unit inconsistent
  actual_qty_sum: number | null;
  est_total_vnd_sum: number;
  actual_amount_tt_sum: number;
  actual_amount_hd_sum: number;
  used_pct: number;           // money-based when unit inconsistent
  flag: "green" | "yellow" | "red";
  unitConsistent: boolean;
  unitLabel: string | null;   // hiển thị unit chung hoặc "hỗn hợp"
}
```

### DB constraint

Add CHECK/validation: group MUST subset a single categoryId? — Brainstorm cho phép nhóm trong cùng section; đề xuất Zod validate trong `assignEstimatesToGroup`: `new Set(estimates.map(e => e.categoryId)).size === 1`. Reject cross-category grouping (v3 nếu cần).

## Related code files

- Create: `prisma/migrations/20260820XXXXXX_add_project_material_group/migration.sql`
- Modify: `prisma/schema.prisma` (model + FK)
- Create: `lib/du-an/material-group-service.ts`
- Create: `lib/du-an/material-group-rollup.ts` (pure)
- Create: `lib/du-an/__tests__/material-group-rollup.test.ts`
- Modify: `lib/du-an/norm-service.ts` (augment NormRow + expose groupId)
- Modify: `lib/du-an/can-doi-service.ts` (SQL: `pe."materialGroupId"`, expose `groupId` trên CanDoiRow)
- Modify: `lib/du-an/can-doi-metrics.ts` (thêm type field `materialGroupId?: number | null` trên `CanDoiRow`)
- Modify: `app/(app)/du-an/[id]/dinh-muc/dinh-muc-client.tsx` (rebuild với grouped rows + multi-select + toolbar)
- Modify: `app/(app)/du-an/[id]/dinh-muc/page.tsx` (fetch groups)
- Modify: `app/(app)/du-an/[id]/can-doi-vat-tu/can-doi-vat-tu-client.tsx` (group header rows trong mode `tt-dt` only)

## Implementation steps

1. **Schema**: thêm model `ProjectMaterialGroup` + FK `materialGroupId` trong `schema.prisma`. `pnpm prisma format`.
2. **Migration**: `pnpm prisma migrate dev --name add_project_material_group --create-only` → review SQL → adjust CHECK constraint on unique name where deletedAt is null → apply.
3. **Rollup pure**: viết `material-group-rollup.ts` + tests (cases: (a) unit đồng nhất; (b) unit khác — suppress qty; (c) member deleted; (d) empty group).
4. **Service CRUD**: viết `material-group-service.ts` với guards, Zod validate cross-category.
5. **Augment `norm-service`**: gọi thêm `prisma.projectEstimate.findMany({...select: {id, materialGroupId}})`, merge vào `NormRow[]`. Test manual.
6. **Augment `can-doi-service`**: sửa SQL EstimateAggRow thêm `pe."materialGroupId" AS group_id`, map vào `CanDoiRow.materialGroupId`. Test regression.
7. **Client dinh-muc**: rebuild với multi-select + toolbar "Nhóm/Bỏ nhóm/Sửa note". Render group header rows. Muted member styling.
8. **Client can-doi mode tt-dt**: khi mode='tt-dt', interleave group header rows trên member. Modes 'hd', 'tt-hd' KHÔNG đổi.
9. **Manual walkthrough**: MNTC-GD1, nhóm 2 dòng "Cát mịn" + "Cát vàng" (giả định cùng categoryId HM1-VL) → verify cờ nhóm; đổi seed 1 member unit "kg" → verify suppression + money-only.

## Todo list

- [ ] Schema + migration
- [ ] `material-group-service.ts` CRUD + guards
- [ ] `material-group-rollup.ts` + tests
- [ ] Augment `norm-service` + `can-doi-service`
- [ ] Client dinh-muc rebuild (multi-select, group toolbar, muted members)
- [ ] Client can-doi mode tt-dt group header
- [ ] Manual walkthrough (2 dòng cát)
- [ ] Regression: modes HD/TT-HD của can-doi chưa vỡ

## Success criteria

- Migration `pnpm prisma migrate deploy` sạch trên DB backup.
- Nhóm 2 dòng cát → cờ nhóm hiện; cờ 2 dòng member mờ + tag "(thuộc nhóms)". Sửa qty 1 member → cờ nhóm update sau refresh.
- Nhóm cross-unit (m3 vs kg): cột SL/%SL/giá bq nhóm → `—` với tooltip "Đơn vị khác nhau"; cột tiền vẫn tính.
- Regression: mode HD của can-doi tính đúng như trước (không có group ảnh hưởng).
- `pnpm test lib/du-an` xanh.

## Risk assessment

- **HIGH** — Migration trên production data phải backup trước (`pg_dump project_estimates`). Rollback SQL: drop cột + drop table, member records mất group binding nhưng estimates OK.
- **HIGH** — Rollup có thể mismatch với settings threshold nếu client tính lại → phải dùng cùng `normYellowThreshold/normRedThreshold` từ settings (truyền qua rollup fn).
- **MED** — Nhóm cross-category (user gộp HM1-VL + HM2-VL) — Zod reject trong service, UX cần show error rõ.
- **MED** — Race condition: 2 user cùng gộp cùng estimate → cái sau overwrites `materialGroupId`. Chấp nhận (last-write-wins), không cần optimistic lock v2.
- **LOW** — Performance: `findMany({projectId})` cho 400 estimates + view query — không ảnh hưởng.

## Security considerations

- Tất cả service ops require project-scoped guard (read/create/edit).
- `assignEstimatesToGroup` verify từng estimate thuộc `projectId` trước khi update — chống cross-project group tampering.
- Unique `(projectId, name)` where `deletedAt IS NULL` — enforce ở DB, tránh 2 nhóm cùng tên trong project.

## Next steps

Phase 06: docs + changelog + full gates.
