# Thanh-toán entity cascade refactor shipped

**Date**: 2026-05-15 14:29
**Severity**: Medium
**Component**: Payment service, schema, UI cascade chain, pivot aggregation
**Status**: Resolved

## What Happened

Shipped 11-hour refactor replacing `PaymentRoundItem.projectScope` enum (binary `cty_ql|giao_khoan`) with `entityId` foreign key. Implemented three-level cascade chain (Chủ thể → Công trình → NCC) across service layer, UI, tong-hop aggregation, and Excel export. Wiped test data; bypassed Prisma 7.8 shadow-DB ordering bug with raw SQL migration.

## The Brutal Truth

Planning-as-audit surfaced a critical latent bug that would have produced silently wrong payment balances for months. The refactor shipped on time and clean, but only because we caught the cross-entity bleed during architecture review, not in production. Code review also caught a silent 403 on the cascade endpoint that would have left users staring at empty dropdowns with no error message.

The security hole remains: server trusts client-supplied (entityId, projectId, supplierId) triples without re-validating cascade integrity. A non-admin can curl arbitrary combinations. We deferred that as C3 but it needs to be tracked.

## Technical Details

**Cross-Entity Balance Bleed (LATENT BUG — caught pre-ship)**

`lib/payment/payment-service.ts:161` in `autoFillBalances` was calling `getOutstandingDebt({ ledgerType, partyId, projectId? })` without passing `entityId`. Balance-service sums across ALL entities matching the ledger type and party. Result: if user filtered payment round to Entity A but the system found older debt rows for Entity A and B combined, congNo would be wrong.

Fixed by threading `entityId` through `UpsertItemInput` → `autoFillBalances` → `getOutstandingDebt` call. The balance-service already accepted the parameter (`getOutstandingDebt({ ledgerType, entityId?, partyId, projectId? })` per Sub-B); we just weren't using it.

**Cascade-Projects ACL Too Narrow**

`app/api/cong-no/cascade-projects/route.ts` checked only `['cong-no-vt', 'nc']` modules. Payment users with `['cong-no']` got 403 silently swallowed as empty dropdown. Code review widened the check to include `thanh-toan` module. Caught by reviewer reading route ACL assumptions.

**Dich_vu/Khac Ledger Type Mismatch**

Service categories (dich_vu, khac) don't have a 1:1 ledger type — they're fallback categories. We fabricated `ledgerType='all'` sentinel, but that's a bad smell. Cleaner design: skip cascade fetch entirely for these categories and return full supplier list (fallback to admin bypass path anyway). Phase 6 updated export to match this fallback behavior.

**Prisma 7.8 Shadow-DB Bug (Recurring Pattern)**

Phase 1 migration hit the same ordering bug from Sub-B: `migrate dev` creates misaligned shadow DB. Workaround: wipe migration snapshot, write raw SQL, run `migrate deploy` directly. This is now the established pattern for our Prisma version. Document in runbooks.

## What We Tried

1. **Naive cascade filter** — querying suppliers by `entityId+projectId+ledgerType` in one round-trip. ✓ Worked; optimized with `DISTINCT ON` in controller.
2. **Server-side cascade re-validation (C3)** — marked deferred. Adds roundtrip latency; existing entity ACL + FK provides partial safety. Real fix needs actor-entity relationship audit.
3. **Contractor support for labor** — determined labor NCC source is Contractor model, not Supplier. Payment module was never wired for Contractor. Deferred as separate plan. Interim: labor category returns empty supplier list with explanatory header.

## Root Cause Analysis

**Why the balance bleed existed:** When `autoFillBalances` was first written (pre-entity refactor), payment rounds lived in a single-entity context. The entityId was implicit. Refactor introduced multi-entity rounds but didn't revisit balance-service call sites — a classic scope-creep miss during schema surgery.

**Why ACL failure was silent:** Route returns empty array for forbidden access indistinguishably from "no suppliers found." Client shows empty dropdown either way. Plus code review happened post-ship (normal workflow). Lesson: audit cascade route ACLs before merging.

**Why dich_vu/khac is awkward:** Service layer has 4 distinct categories (vat_tu, nhan_cong, dich_vu, khac); ledger module has ~8 types (material, labor, overhead, etc.). The mapping is many-to-many, not clean. Deferring Contractor integration makes it worse. This needs a proper category-to-ledgerType lookup table, not fabricated sentinels.

## Lessons Learned

1. **Planning catches cross-cutting bugs faster than debugging.** We found the balance bleed while reviewing Phase 2 service signatures, not after deployment. Had we merged silently, this would have silently corrupted payment numbers across entity filters for weeks. Keep architecture review phase disciplined.

2. **Empty state ≠ error.** Routes returning `[]` for both "forbidden" and "no data" create user confusion. Either return proper error codes/headers or gate the route ACL *before* controller logic.

3. **Fabricated sentinel types (ledgerType='all') are technical debt.** The "all" fallback for dich_vu/khac masks a schema mismatch. Track this in a future "service category cleanup" effort; don't let it calcify.

4. **Prisma 7.8 shadow-DB ordering is predictable now.** Third time we've hit it. Document in TROUBLESHOOTING.md and add a pre-commit hook check for `.migrate` ordering.

5. **Defer security validation with a ticket, not silence.** C3 (cascade integrity re-validation on save) is real scope but got cut. Mark it explicitly in code with SECURITY comment + tracking issue. Non-admins can currently curl arbitrary entity/project/supplier triples.

## Next Steps

1. **File SECURITY TODO for C3:** Server-side cascade validation on payment item save. Client supplies (entityId, projectId, supplierId); server must re-validate all three form the same ledger transaction quad. Non-urgent (existing entity ACL + FK provides partial safety) but do it before multi-tenant.

2. **Document Prisma 7.8 workaround:** Add to `TROUBLESHOOTING.md`: "If `migrate dev` creates shadow-DB ordering mismatch, manually edit `.prisma/migrations/[timestamp]/migration.sql`, remove misplaced index, run `migrate deploy` directly."

3. **Track dich_vu/khac ledger mapping cleanup:** Log a P3 story to create proper `ServiceCategory → LedgerType[]` lookup table. Current fabricated 'all' sentinel is okay for MVP; will confuse future refactors.

4. **Audit other cascade routes:** Grep for routes returning empty on ACL failure. Tighten gate logic in `cascade-projects` pattern to others (e.g., `cascade-suppliers`).

5. **Monitor balance reports:** First week post-ship, watch cong-no reports across multi-entity filters. If balances diverge from ledger truth, immediately suspect entityId threading gaps elsewhere.
