# Phase 02 — Code Review (Master Data CRUD)

**Reviewer:** code-reviewer
**Date:** 2026-05-04
**Verdict:** APPROVE WITH FIXES — no CRITICAL blockers, but two HIGH issues should be fixed before Phase 3 builds on these tables.

---

## CRITICAL

None. RBAC actually called (not just imported), audited prisma client used everywhere, soft-delete filters present in every list query, build/typecheck pass.

---

## HIGH

### H1. Soft-delete vs `@unique` on `name`/`code` will collide
`Entity.name`, `Supplier.name`, `Contractor.name`, `Project.code`, `Item.code` are `String @unique` (not partial / not scoped to `deletedAt IS NULL`). Workflow: admin soft-deletes "Quang Minh" → user tries to recreate → `P2002 unique constraint failed` because the soft-deleted row still occupies the value. The "delete then re-add" use-case is broken on day one.

Fix options: (a) drop `@unique` and enforce uniqueness in the service among `deletedAt IS NULL` rows, (b) raw-SQL partial unique index `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`, or (c) on soft-delete, append a tombstone suffix to the unique column. Option (b) is cleanest with Postgres.

`ProjectCategory` has the same issue with `@@unique([projectId, code])`.

### H2. `Project.update` silently overwrites `contractValue` falsy → `null`
`project-service.ts:89`: `contractValue: data.contractValue ? data.contractValue : null`. The form input is `type="number"`, so user typing `"0"` (a legitimate value, e.g. zero contract value) becomes falsy and gets nulled. Same hazard for any number stored as string. Use `data.contractValue !== undefined && data.contractValue !== "" ? data.contractValue : null`. Also, `contractValue` is `Decimal?` in Prisma but typed as `string` in the Zod schema — Prisma accepts strings, but there is **zero numeric validation** (a user can type "abc" and the parse will succeed; Prisma will throw at runtime). Add `z.string().regex(/^\d+(\.\d+)?$/).optional()` or coerce to number.

---

## MEDIUM

### M1. `getSessionRole` duplicated in 5 service files
Identical 9-line helper copy-pasted (entity / supplier / contractor / project / item). DRY violation; if `auth.api.getSession` signature changes, 5 edits. Extract to `lib/master-data/_session.ts` or `lib/auth-helpers.ts`. Note: cannot live in a `"use server"` file alongside the schemas, but a plain module is fine.

### M2. RBAC granularity ignores `canbo_vt` / `chihuy_ct` per the role matrix
Current: create/update requires `ketoan` (level 80), delete requires `admin`. Phase-01 role hierarchy defines `canbo_vt` (40) and `chihuy_ct` (60) — both blocked from any master-data mutation. Per the SOP this is probably intentional for vendors/items, but `chihuy_ct` (chỉ huy công trình) being unable to add a project category seems wrong. Confirm with stakeholder; document in plan if intentional.

### M3. DataTable search hammers the server (no debounce)
`data-table.tsx:65` fires `router.push` on every keystroke inside `startTransition`. React's transition de-prioritizes render but does NOT debounce the network/server round-trip — every character types becomes one server request + one DB query. With Phase 2 dataset (37 rows) it's invisible; with thousands of items in Phase 4+ it will noticeably lag and load the DB. Add a 250–300ms debounce (e.g. `useDeferredValue` + `useEffect`, or a simple `setTimeout` ref).

### M4. `revalidatePath` after action, then `router.refresh()` on client = double refetch
e.g. `suppliers-client.tsx:42-44` calls `createSupplier` (which `revalidatePath`s server-side) then `router.refresh()`. The first one already invalidates the route cache; the explicit `router.refresh()` causes a second RSC round-trip. Pick one — usually `router.refresh()` alone is enough since dialogs need imperative refresh feedback; or rely on `revalidatePath` and just close the dialog.

### M5. Project decimal precision
`Decimal(18, 2)` is fine for VND (max 9.99 quadrillion VND), but the form stores it as a string and submits a string. No display formatting (no thousand separators) — acceptable for Phase 2 but flag for UX polish.

### M6. Seed `slugifyCode` collisions
`slugifyCode("Phương Minh", "DA")` and `slugifyCode("Phương Minh A", "DA")` both truncate to 12 chars after stripping non-alphanumerics → potential code collision producing silent "exists" misses. Low probability with current data, but the function is not collision-proof. Acceptable if we accept seed re-runs as the user's verification step.

### M7. `ProjectCategory` missing `createdAt/updatedAt`
Report acknowledges this matches spec, but spec was likely an oversight. Audit log records it as `update`/`create` events fine, but in-row timestamps are gone. Easy to add now, costly to backfill later.

---

## LOW

- **L1.** `seed-master.ts:174` hardcodes `unit = ""` for items (acknowledged in report). Items will violate `itemSchema` if edited via UI without filling unit — runtime error at update time. Either backfill a default `"-"` or make unit optional in schema.
- **L2.** `category-form.tsx` uses `<Input type="number">` but `sortOrder` defaults to `0` — works, but RHF + native number input has known coercion quirks. Use `z.coerce.number()` to be safe.
- **L3.** Type cast `data as unknown as Record<string, unknown>[]` in every client file — cosmetic, but `DataTable<T>` could accept `T[]` generically with `T extends { id: number | string }` to avoid the laundering.
- **L4.** `seed-master.ts:216` casts `prisma as unknown as {$disconnect}` — `$disconnect` exists on the extended client. Cast unnecessary.
- **L5.** No `getSession`-not-found path for service actions: if `headers()` throws (non-request context), `getSessionRole` returns `null`, `requireRole` throws "Forbidden". Correct behavior, but the error message is opaque to the UI. Map to a friendly 403 in client handlers.
- **L6.** All `*-client.tsx` files lack `try/catch` around server-action calls. A thrown `Forbidden` will surface as an unhandled promise rejection and an unhelpful red error overlay. Wrap with toast on failure.

---

## Positive Observations

- RBAC checks are real (every mutating action calls `requireRole`), not just imported.
- Audited `prisma` client used uniformly (verified: no raw `new PrismaClient()` in master-data; seed uses the extended client too, so seed writes 101 audit rows as the report claims).
- Soft-delete filter applied consistently in every list query and in `_count` aggregation on Project.
- File sizes all ≤ 165 lines; well under 200-line cap.
- Zod schemas live in a non-`"use server"` module — correct architecture; reused on both client (form resolver) and server (parse on action entry).
- Forms wire `react-hook-form` + `zodResolver` correctly with `z.input` / `z.infer` split for `default()` fields.
- Seed is genuinely idempotent — uses `findFirst` + `create` (not `upsert` which would trip the audit guard).
- All forms use `type="date"` for dates and Vietnamese labels throughout.

---

## Recommended Actions (in order)

1. **Fix H1**: add partial unique indexes via raw SQL migration, OR drop `@unique` and enforce in service.
2. **Fix H2**: tighten `contractValue` validation + correct null-coercion bug in update.
3. **Address M1, M3, M4** before Phase 3 wires more clients.
4. Confirm M2 with stakeholder; document the role matrix per resource in plan.
5. M7 — add timestamps to `ProjectCategory` while still in early development.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 2 master-data CRUD is well-structured, RBAC and audit are correctly applied, soft-delete filters consistent. Two HIGH issues (unique-vs-soft-delete collision, project update null-coercion bug) should be fixed before Phase 3 expands on these tables.
