# Phase 03 — Cascade endpoint: distinct suppliers by (entity, project, ledgerType)

---
status: completed
priority: P2
effort: 1h
actualEffort: 1h
blockedBy: [phase-01]
---

## Context Links
- Reference pattern: `app/api/cong-no/cascade-projects/route.ts:1-96`
- `LedgerTransaction` quad index: `prisma/schema.prisma:648` `@@index([ledgerType, entityId, partyId, projectId, date])`
- ACL helper: `lib/acl.ts` (used at `cascade-projects/route.ts:5,47-50`)

## Overview
- Priority: P2
- Status: completed
- Effort: 1h
- Blocked by: P1 (schema), P2 (no — endpoint is read-only against ledger)

## Description
New endpoint `GET /api/thanh-toan/cascade-suppliers` returning distinct suppliers that have ledger transactions for the given (entityId, projectId?, ledgerType) triple. Used by P5 UI to populate the NCC dropdown after user selects entity + project.

## Key insights
- Suppliers are NOT scoped per project in schema (`prisma/schema.prisma:221-236`) — the relationship is implicit via `LedgerTransaction.partyId`.
- `ledgerType` mapping:
  - `category=vat_tu` → `material`
  - `category=nhan_cong` → `labor`
  - `category=dich_vu` or `khac` → no ledger backing → endpoint returns ALL active suppliers (fallback).
- `projectId` optional: if user has not yet selected project, return distinct suppliers across all projects for that entity.
- ACL: payment module has no existing `requireModuleAccess` guard in current page.tsx (verified `app/(app)/thanh-toan/ke-hoach/[id]/page.tsx:1-52`). For consistency with cascade-projects, gate on session presence only (401) + future module key `thanh-toan.ke-hoach.read` is OPTIONAL.
  - **Decision**: session-only gate for now (matches existing module posture). Add module guard in separate plan if RBAC tightens.

## Requirements
**Functional**
- Query params:
  - `ledgerType: "material" | "labor" | "all"` (required)
  - `entityId: int` (required, > 0)
  - `projectId: int` (optional)
- Returns: `{ suppliers: [{ id, name }] }`
- For `ledgerType=all`: return `Supplier.findMany({ where: { deletedAt: null } })` (fallback for dich_vu/khac).
- For `ledgerType=material|labor`:
  ```sql
  SELECT DISTINCT s.id, s.name
  FROM ledger_transactions lt
  JOIN suppliers s ON s.id = lt."partyId"
  WHERE lt."ledgerType" = $1
    AND lt."entityId" = $2
    AND ($3::int IS NULL OR lt."projectId" = $3)
    AND lt."deletedAt" IS NULL
    AND s."deletedAt" IS NULL
  ORDER BY s.name;
  ```
- Note: for `ledgerType=labor`, `partyId` is `contractorId` (not supplier). **RESOLVED with user (2026-05-15)**: payment NCC dropdown stays bound to Supplier table — do NOT switch to Contractor. For `ledgerType=labor` the join on `suppliers.id = lt.partyId` yields empty set (by design, since labor ledger references contractors). Endpoint MUST short-circuit:
  - **When `ledgerType=labor`**: skip the SQL join entirely; return `{ suppliers: [] }` with HTTP 200 and response header `X-Empty-Reason: labor-uses-contractor` (optional, for client diagnostics). Client (P5) renders helper text explaining the limitation.
  - Rationale: payment module is supplier-scoped end-to-end (FK `PaymentRoundItem.supplierId → Supplier.id`); adding Contractor support is a separate feature, not in scope here.

**Non-functional**
- Single SQL roundtrip.
- `force-dynamic` (no caching).
- AbortController-safe (no server-side dedup needed; client handles).

## Architecture
```
GET /api/thanh-toan/cascade-suppliers?ledgerType=material&entityId=3&projectId=12
  → auth.api.getSession (401 if absent)
  → validate query params
  → if ledgerType=all → prisma.supplier.findMany
  → else → prisma.$queryRaw distinct join
  → JSON { suppliers: [{ id, name }] }
```

## Related Code Files
**Create**
- `app/api/thanh-toan/cascade-suppliers/route.ts`

**Modify**: none

**Delete**: none

## Implementation Steps
1. Create `app/api/thanh-toan/cascade-suppliers/route.ts`.
2. Copy structure from `app/api/cong-no/cascade-projects/route.ts`:
   - `export const dynamic = "force-dynamic"`
   - session check → 401
   - param parse + validation → 400
3. Branch on `ledgerType`:
   - `"all"` → `prisma.supplier.findMany({ where: { deletedAt: null }, select: { id, name }, orderBy: { name: 'asc' } })`
   - `"labor"` → short-circuit `return NextResponse.json({ suppliers: [] }, { headers: { 'X-Empty-Reason': 'labor-uses-contractor' } })`
   - `"material"` → raw SQL (see Requirements)
4. Return `NextResponse.json({ suppliers })`.

## Todo List
- [x] Create route file
- [x] Session guard + 401
- [x] Param validation (ledgerType, entityId positive int, projectId optional)
- [x] Branch: all vs material/labor
- [x] Raw SQL with `IS NULL OR =` for projectId
- [x] Manual test: curl with valid session cookie

## Success Criteria
- `curl /api/thanh-toan/cascade-suppliers?ledgerType=material&entityId=1` → 200 with `{ suppliers: [...] }`.
- Missing entityId → 400.
- No session → 401.
- For seeded entity+project pair with known ledger rows, returns exact distinct supplier set.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Labor category returns empty (contractor vs supplier) | Confirmed (by design) | Low | RESOLVED: short-circuit to `[]` + `X-Empty-Reason` header; P5 renders explicit helper text + admin "Bỏ cascade" toggle |
| Missing index causes slow query at scale | Low | Low | Existing quad index `(ledgerType, entityId, partyId, projectId, date)` covers WHERE clause |
| SQL injection via raw query | None | High | All params bound via $queryRaw template — safe |

## Rollback
- Delete route file. No data side-effects.

## Security
- Session check enforced.
- No write operations.
- Future enhancement: add `canAccess(userId, 'thanh-toan.ke-hoach.chi-tiet', { minLevel: 'read', scope: 'module' })` if/when payment module gets module-level RBAC.

## Open questions
(none — both resolved 2026-05-15)

## Resolved
1. Labor (nhan_cong) NCC source: **Supplier table** — Contractor switch out of scope. Endpoint short-circuits empty array for labor.
2. `entityIds` plural support: **No** (YAGNI).

## Next
P5 consumes endpoint in NewItemRow + ItemRow.
