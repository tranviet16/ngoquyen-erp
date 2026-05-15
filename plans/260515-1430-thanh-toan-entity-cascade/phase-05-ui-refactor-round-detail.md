# Phase 05 — UI refactor: round-detail-client (cascade Chủ thể → Công trình → NCC)

---
status: completed
priority: P2
effort: 3h
actualEffort: 3h
blockedBy: [phase-01, phase-02, phase-03, phase-04]
---

## Context Links
- File: `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:1-823`
- Page loader: `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx:1-52`
- Cascade reference (AbortController + dependent fetch): `app/(app)/cong-no-vt/...` (search via grep `cascade-projects` in app/)
- P3 endpoint: `GET /api/thanh-toan/cascade-suppliers`
- Admin-only toggle pattern reference: existing "Override" checkbox in `round-detail-client.tsx` (grep `isAdmin` / `override`) — mirror that gating style.

## Overview
- Priority: P2
- Status: completed
- Effort: 3h
- Blocked by: P1, P2, P3, P4

## Description
Rewrite `ItemRow` and `NewItemRow` to drive UI off `entityId` instead of `projectScope`. Reorder columns: `Loại | STT | Chủ thể | Công trình | NCC | ...`. Implement cascade chain:
1. User picks **category** → drives ledgerType for cascade-suppliers.
2. User picks **entityId** → reset projectId + supplierId; fetch projects for entity (use existing `/api/cong-no/cascade-projects?entityIds={id}&ledgerType={lt}`).
3. User picks **projectId** → reset supplierId; fetch suppliers for (entity, project, ledgerType).
4. User picks **supplierId** → enable save; on save, server auto-fills congNo/luyKe.

## Key insights
- Current column order at `round-detail-client.tsx:228-240` (header) and 459-642 (ItemRow): `Loại | STT | NCC | Phạm vi | Công trình | Công nợ | Luỹ kế | Cập nhật | Số đề nghị | Số duyệt | Ghi chú | Actions` (12 cols).
- New order: `Loại | STT | Chủ thể | Công trình | NCC | Công nợ | Luỹ kế | Cập nhật | Số đề nghị | Số duyệt | Ghi chú | Actions` (still 12 cols — Phạm vi replaced by Chủ thể, NCC moves after Công trình).
- Update `COL_COUNT = 12` (line 171) — stays the same.
- Update `tfoot colSpan` (line 276) — `colSpan={8}` stays the same since column count unchanged.
- `Item` interface (line 52-67): replace `projectScope: string` with `entityId: number; entity: { id: number; name: string }`.
- `pristine` ref (line 334-386): replace `projectScope` key with `entityId`.
- `upsertItemAction` call (line 391-402, 680-691): pass `entityId` instead of `projectScope`.
- Page loader must fetch `entities` list (deletedAt null) for the dropdown. Currently fetches `suppliers` and `projects` only (`page.tsx:21-30`).
- Cascade fetches are CLIENT-side (need state + AbortController). Pre-fetch `entities` server-side in page.tsx (small list).

## Requirements

**Functional**
- Page loader (`page.tsx`):
  - Fetch `entities: prisma.entity.findMany({ where: { deletedAt: null }, select: { id, name }, orderBy: { name: 'asc' } })`.
  - Pass to client as `entities: Entity[]`.
  - DROP `projects` and `suppliers` from initial server-side fetch (now cascade-fetched). **Keep `suppliers` ONLY** as fallback for dich_vu/khac display labels (lookup by id when rendering existing rows). Actually simpler: fetch full suppliers list (small N) for read-only display in non-editable rows.
  - Keep `projects` for read-only display of existing rows.
- Client state per row (ItemRow + NewItemRow):
  - `entityId: number | null`
  - `projectId: number | null`
  - `supplierId: number | null`
  - `category: PaymentCategory`
  - `availableProjects: Project[]` (fetched per entity)
  - `availableSuppliers: Supplier[]` (fetched per entity+project+category)
  - `loadingProjects: boolean`, `loadingSuppliers: boolean`
  - `abortRef: { projects?: AbortController; suppliers?: AbortController }`
  - `bypassCascade: boolean` (default `false`) — admin-only escape hatch (see below)
- Cascade triggers:
  - **category change** → if entity+project chosen, refetch suppliers (ledgerType changes).
  - **entity change** → reset project + supplier; fetch projects.
  - **project change** → reset supplier; fetch suppliers.
- Fetch helpers:
  - `fetchProjects(entityId, ledgerType)` → `/api/cong-no/cascade-projects?entityIds={id}&ledgerType={lt}`
  - `fetchSuppliers(entityId, projectId, ledgerType)` → `/api/thanh-toan/cascade-suppliers?...`
  - Map category→ledgerType: `vat_tu→material, nhan_cong→labor, dich_vu|khac→all`
- AbortController per fetch type to prevent stale overwrite.
- Validation on save: entityId required (non-null); supplierId required.
- Existing rows render entity name via `item.entity.name` (loaded by `getRound` include in P2).

**Empty-state UX (RESOLVED 2026-05-15)**
- When `availableSuppliers.length === 0` AND cascade fetch has completed (not loading), render under the supplier select:
  - Line 1 (always): `"Không có NCC khớp — kiểm tra Chủ thể/Công trình"` (muted text).
  - Line 2 (only when `category === 'nhan_cong'`): `"(nhan_cong: ledger labor dùng Contractor, payment chỉ link Supplier — chưa hỗ trợ)"` (muted, smaller).
- **Admin escape hatch — "Bỏ cascade" checkbox**:
  - State: `bypassCascade: boolean` per row (default `false`).
  - Render condition: `{isAdmin && <label><input type="checkbox" checked={bypassCascade} onChange={...} /> Bỏ cascade (full NCC)</label>}` — gated identically to existing Override checkbox pattern in this file (grep `isAdmin` in `round-detail-client.tsx`).
  - Effect: when `bypassCascade === true`, the row SKIPS the `/cascade-suppliers` fetch entirely and uses the full `suppliers` prop (already loaded server-side in page.tsx) as `availableSuppliers`. When toggled back to `false`, re-trigger cascade fetch using current (entity, project, ledgerType).
  - Persistence: NOT persisted server-side. Local UI state only. Save still posts the chosen `supplierId` via `upsertItemAction` — server enforces FK + actor checks regardless.
  - `isAdmin` source: pass from page.tsx (already computed there for actor permission checks — reuse same flag).
- Empty + non-admin → user sees helper text only; must change Chủ thể/Công trình to proceed. No silent fallback.

**Non-functional**
- File stays under 900 lines (currently 823) — acceptable; if creeps past 1000, extract `cascade-hooks.ts` helper.
- No double-fetch on initial render of existing row (pre-populate `availableProjects` + `availableSuppliers` from current selection so render shows the chosen labels; lazy-fetch on user change).
- Initial render uses `[item.project]` and `[item.supplier]` arrays as the dropdown options until user opens dropdown — KISS.

## Architecture / Data flow
```
NewItemRow init: entityId=null, projectId=null, supplierId=null, category='vat_tu'
  ↓ user picks entity (3)
[abort prior projects fetch] → fetch /cascade-projects?entityIds=3&ledgerType=material
  → availableProjects = [{id:12,name:'...'}, ...]; projectId stays null
  ↓ user picks project (12)
[abort prior suppliers fetch] → fetch /cascade-suppliers?entityId=3&projectId=12&ledgerType=material
  → availableSuppliers = [...]; supplierId stays null
  ↓ user picks supplier (45)
[Save enabled]
  ↓ user clicks "Thêm"
upsertItemAction({ roundId, entityId:3, projectId:12, supplierId:45, category:'vat_tu', soDeNghi:... })
  → server autoFillBalances(material, 3, 45, 12) → congNo/luyKe
  → insert row
```

## Related Code Files
**Modify**
- `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx` — add `entities` fetch, optionally drop project/supplier prefetch
- `app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx` — full ItemRow + NewItemRow rewrite

**Create** (optional, if file size exceeds 900 lines)
- `app/(app)/thanh-toan/ke-hoach/[id]/use-cascade-payment.ts` — extracted cascade hook

**Delete**: none

## Implementation Steps
1. **Page loader** (`page.tsx`):
   - Add to `Promise.all`: `prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } })`.
   - Pass `entities` to `<RoundDetailClient />`.
2. **Client types** (`round-detail-client.tsx:40-77`):
   - Add `interface Entity { id: number; name: string }`.
   - In `Item`: replace `projectScope: string` with `entityId: number; entity: { id: number; name: string }`.
   - In `Props`: add `entities: Entity[]`.
3. **Header reorder** (line 228-240):
   - Replace cols: `NCC | Phạm vi | Công trình` → `Chủ thể | Công trình | NCC`.
4. **ItemRow** (line 294-644):
   - State swap: `projectScope` → `entityId`.
   - Add cascade state: `availableProjects`, `availableSuppliers`, loading flags, abort refs.
   - Effect on category/entity/project change → fetch helpers.
   - Render: column 3 = entity select; column 4 = project select (dynamic); column 5 = supplier select (dynamic).
   - `pristine.current`: swap `projectScope` for `entityId`.
   - `save()`: `upsertItemAction({ ... entityId, ... })`.
5. **NewItemRow** (line 646-823):
   - Same state + cascade pattern.
   - `add()`: pass `entityId`; validate non-null.
6. **Fetch helpers** (top of file or extracted hook):
   ```ts
   function categoryToLedgerType(c: PaymentCategory): 'material'|'labor'|'all' {
     if (c === 'vat_tu') return 'material';
     if (c === 'nhan_cong') return 'labor';
     return 'all';
   }
   async function fetchProjects(entityId, lt, signal) { ... }
   async function fetchSuppliers(entityId, projectId, lt, signal) { ... }
   ```
7. tsc + manual smoke.

## Todo List
- [x] page.tsx fetch entities + pass isAdmin to client
- [x] Client types: add Entity, swap projectScope→entityId in Item, add `isAdmin: boolean` to Props
- [x] Header column order
- [x] ItemRow cascade state + handlers + render
- [x] NewItemRow cascade state + handlers + render
- [x] Fetch helpers + AbortController
- [x] Empty-state helper text (both lines, conditional on category)
- [x] Admin-only `bypassCascade` checkbox + skip-fetch branch using full suppliers prop
- [x] tsc clean
- [x] Manual smoke: pick entity → projects populate; pick project → suppliers populate; save → row appears with correct congNo
- [x] Manual smoke: category=nhan_cong → empty list + both helper lines visible; admin sees toggle; non-admin does not
- [x] Manual smoke (admin): toggle Bỏ cascade ON → full supplier list appears; toggle OFF → cascade fetch re-runs

## Success Criteria
- Column order: `Loại | STT | Chủ thể | Công trình | NCC | Công nợ | ...` rendered.
- Changing entity clears project + supplier and fetches new project list.
- Changing project clears supplier and fetches new supplier list.
- Changing category re-fetches suppliers (ledgerType changes).
- AbortController prevents stale dropdowns when user clicks fast.
- Save inserts row with correct `entityId`; congNo auto-fills using that entityId (verifiable: ledger row for different entity must NOT bleed in).
- No console errors.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Stale dropdown overwrite race | High | High | AbortController per fetch type, abort prior in-flight on new trigger |
| Initial render of existing row missing project/supplier label | Med | Med | Seed `availableProjects=[item.project]`, `availableSuppliers=[item.supplier]` until user opens dropdown |
| Labor category supplier dropdown empty (contractor vs supplier mismatch) | Confirmed (by design) | Med | Helper text (2 lines) + admin-only `bypassCascade` toggle → falls back to full suppliers prop. Non-admins must adjust Chủ thể/Công trình. |
| Admin abuses `bypassCascade` to pick mismatched supplier | Low | Low | Server still enforces FK on supplierId. Cross-entity bleed mitigated separately by P2 entityId fix. Acceptable for admin role. |
| File grows past 1000 lines | Med | Low | Extract `use-cascade-payment.ts` hook |
| React Fragment without key in dynamic loops | Low | Low | Use `<Fragment key={...}>` explicitly (Sub-B M1 lesson) |
| `pristine` ref drift if entity not in baseline | Low | Med | Mirror swap in pristine init + effect deps |

## Rollback
- Revert file via git.
- Endpoint stays (read-only, no harm).

## Security
- Server validates entityId, supplierId, projectId via FK and existing actor checks (`canCreate`, round.status='draft', etc.).
- Client cascade endpoints both require session.

## Open questions
(none — resolved 2026-05-15)

## Resolved
1. Labor (nhan_cong) NCC source → keep Supplier model; dropdown is empty by design for labor; surface via 2-line helper text.
2. Empty-state UX → helper text always shown; admin-only `bypassCascade` toggle falls back to full supplier list. Not persisted; local UI state only.

## Next
P6 tong-hop pivot rewrite.
