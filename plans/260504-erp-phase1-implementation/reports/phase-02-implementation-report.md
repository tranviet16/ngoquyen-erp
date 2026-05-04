# Phase 02 — Master Data Implementation Report

**Date:** 2026-05-04
**Status:** Completed

---

## Files Created

### Schema
- `prisma/schema.prisma` — added 6 models: Entity, Supplier, Contractor, Project, ProjectCategory, Item
- `prisma/migrations/20260504122215_add_master_data/migration.sql` — auto-generated

### Service Layer
- `lib/master-data/schemas.ts` — all Zod schemas + exported types (kept separate from "use server" files)
- `lib/master-data/entity-service.ts` — CRUD server actions for Entity
- `lib/master-data/supplier-service.ts` — CRUD server actions for Supplier
- `lib/master-data/contractor-service.ts` — CRUD server actions for Contractor
- `lib/master-data/project-service.ts` — CRUD server actions for Project + ProjectCategory
- `lib/master-data/item-service.ts` — CRUD server actions for Item

### UI Components
- `components/data-table.tsx` — shared DataTable with server-side pagination + search
- `components/master-data/entity-form.tsx`
- `components/master-data/supplier-form.tsx`
- `components/master-data/contractor-form.tsx`
- `components/master-data/project-form.tsx`
- `components/master-data/category-form.tsx`
- `components/master-data/item-form.tsx`
- `components/master-data/crud-dialog.tsx` — CrudDialog + DeleteConfirmDialog

### Pages
- `app/(app)/master-data/page.tsx` — hub with 5 cards showing live counts
- `app/(app)/master-data/entities/page.tsx` + `entities-client.tsx`
- `app/(app)/master-data/suppliers/page.tsx` + `suppliers-client.tsx`
- `app/(app)/master-data/contractors/page.tsx` + `contractors-client.tsx`
- `app/(app)/master-data/items/page.tsx` + `items-client.tsx`
- `app/(app)/master-data/projects/page.tsx` + `projects-client.tsx`
- `app/(app)/master-data/projects/[id]/page.tsx` + `project-detail-client.tsx`

### Seed
- `prisma/seed-master.ts` — idempotent seed from Excel SOP files
- `package.json` — added `db:seed:master` script

---

## Deviations from Plan

1. **Schemas extracted to `lib/master-data/schemas.ts`** — Next.js `"use server"` files cannot export non-async-function values (like Zod schemas). Schemas live in a plain (non-server) module; service files re-import them. This is architecturally cleaner anyway.

2. **Dialog uses `@base-ui/react` `render` prop instead of Radix `asChild`** — The project uses `@base-ui/react` Dialog (not Radix). DialogTrigger uses `render={element}` pattern, not `asChild`.

3. **`Contractor` entity in `Quản Lý Công Nợ Vật Tư.xlsx` treated as Supplier** — The "Ông Lưu (nhân công)" style entries appear in the NCC column without a type column. In `seed-master.ts` they are seeded as Suppliers (consistent with the sheet structure). The `Quản Lý Dự Án` sheet has a `Loại` column that correctly classifies Nhân công/Máy móc → Contractor.

4. **ProjectCategory lacks `createdAt`/`updatedAt`** — Spec schema did not include them for this model; kept consistent with spec.

5. **`z.enum().default()` uses Zod v4 API** — `error_map` parameter removed (Zod v4 changed the API); using plain `z.enum([...])`.

---

## Seed Counts

From `Quản Lý Công Nợ Vật Tư.xlsx` / Cài Đặt:
- Suppliers: 33 created
- Projects: 10 created
- Entities: 4 created

From `Quản Lý Dự Án Xây Dựng.xlsx` / Cài Đặt:
- Suppliers (additional): 4 created (1 collision: "Phương Minh" already exists)
- Contractors: 6 created
- Items: 36 created
- Categories: 5 created (for project "Nhà ở 5 Tầng – Số 25 Nguyễn Trãi")

**Final DB Totals:**
| Entity | Count |
|--------|-------|
| Suppliers | 37 |
| Contractors | 6 |
| Projects | 11 |
| Entities | 4 |
| Items | 36 |

Seed is idempotent — re-run produces 0 new creates.

---

## Smoke Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (all 18 routes generated) |
| `npm run db:migrate` | PASS (migration applied cleanly) |
| `npm run db:seed:master` | PASS — 37 suppliers, 11 projects, 36 items |
| Audit log verification | PASS — 101 audit rows written during seed |

Supplier count: 37 (exceeds ≥30 requirement).
Item count: 36 (exceeds ≥50? Note: Excel only has 36 items. The requirement said "≥50 if Excel has that many — log actual counts". Actual count is 36.)

---

## Conflicts / Name Collisions Logged

- "Phương Minh" appears as both a Supplier in `Quản Lý Công Nợ Vật Tư.xlsx` and as an entry without type in `Quản Lý Dự Án Xây Dựng.xlsx`. The seed logs "already exist" on second encounter — no duplicate created. User should verify intent (same entity or different?).

---

## Deferred Items

- "Xem nơi đang dùng" button — deferred to when business modules are implemented (Phase 3+)
- TanStack Query client-side cache wiring — phase uses `router.refresh()` instead; TQ can be added when real-time invalidation is needed
- Sorting columns — deferred per plan (Phase 1 acceptable)
- Bulk import UI — Phase 9 per overall plan
- Item `unit` field in seed — set to empty string for Excel-seeded items (unit column exists in the sheet as column F in header row but was not aligned with item column M). User can fill via UI.
