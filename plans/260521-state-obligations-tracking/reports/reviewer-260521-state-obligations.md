# Code Review — State Obligations Tracking ("Nghĩa vụ với Nhà nước")

Date: 2026-05-21
Reviewer: code-reviewer
Scope: 14 files (lib/tai-chinh/state-obligation-*, components/tai-chinh/obligation-*, app pages, seed, tests)

## Overall Assessment

Solid, well-structured module. JE-sync helpers are clean and the period report is correct.
The unit tests are meaningful (not just smoke tests). However there are **two CRITICAL
correctness bugs** that survive CI because the tests mock Prisma and never exercise the
real `@unique` constraint or real concurrency. Fix before shipping.

---

## CRITICAL

### C1 — `journalEntryId @unique` will throw P2002 when a soft-deleted JE is re-linked
`StateObligationTxn.journalEntryId` is `@unique` in the schema. The sync helpers never
*null out* the column on the txn side when a JE is dropped:

- `updateTxnWithSync` da_nop→phai_tra path: soft-deletes the JE but the JE row physically
  remains. The txn's `journalEntryId` is set to `null` — OK so far.
- BUT `deleteTxnWithSync` soft-deletes the txn yet **leaves `journalEntryId` pointing at the
  (now soft-deleted) JE**. The unique row still occupies that JE id.
- Real failure case: create da_nop (txn linked to JE #99) → soft-delete it → later create a
  *new* da_nop. `journalEntry.create` issues a fresh id, so this specific path is fine.

The actual P2002 hazard is different and concrete: `updateTxnWithSync` da_nop→da_nop with
`currentJournalEntryId == null` calls `journalEntry.create` then sets `journalEntryId`. If a
prior soft-deleted txn already holds that... no — ids are fresh. **Re-examine:** the unique
constraint is on the *txn* column, not the JE. Two different txns can never share a
`journalEntryId` because each `create` mints a new JE. So C1 as a P2002 is **not**
reproducible. Downgrade: see C1b.

**C1b (the real bug) — soft-deleted txns retain `journalEntryId`, breaking JE→txn
reconciliation.** After `deleteTxnWithSync`, the JE is soft-deleted but `txn.journalEntryId`
still references it. Any future code that walks `JournalEntry -> stateObligationTxn` relation
(or a report joining `refModule='state_obligation'` JEs back to live txns) will resolve a
soft-deleted txn as if active. Recommend: in `deleteTxnWithSync` also clear the link, OR
keep it (it is a historical record) but document that consumers MUST filter `deletedAt`.
Severity HIGH, not critical — keeping the link is defensible. **Net: no true critical here;
moved to H1.**

### C1 (CONFIRMED CRITICAL) — Orphaned JournalEntry on da_nop→phai_tra→da_nop round-trip
`updateTxnWithSync`:
1. da_nop with JE #50 linked.
2. Edit kind→phai_tra: JE #50 soft-deleted, `journalEntryId` set null. Correct.
3. Edit kind back→da_nop: `currentJournalEntryId` passed by the caller is read fresh from
   `current.journalEntryId` (now `null`), so a **new** JE #51 is created. JE #50 stays
   soft-deleted forever. No data corruption, but it is a permanent orphan and the original
   payment's audit trail (refNo, note edits) is silently abandoned. Acceptable as a product
   decision, but it is undocumented and the soft-deleted JE #50 still has `refId` pointing at
   the txn — so the txn now has TWO JEs claiming it via `refId` (one deleted, one live).
   Downstream `refId`-based lookups that don't filter `deletedAt` get ambiguous results.

   **This is the genuine critical:** any JournalEntry consumer that does
   `findFirst({ where: { refModule:'state_obligation', refId } })` without `deletedAt: null`
   gets a non-deterministic row. Fix: either hard-delete the JE on kind-change, or ensure
   every `refId` consumer filters `deletedAt`. Grep the codebase for `refModule` /`refId`
   consumers before shipping.

### C2 — Anti-double-counting is enforced only by a UI hint, not by data
The amber banner in `obligation-txn-grid-client.tsx` tells users not to re-enter da_nop
payments in the journal. But:
- `da_nop` JEs are created with `refModule="state_obligation"`.
- `dashboard-service.ts` cashflow SQL (`SUM("amountVnd") FILTER (WHERE entryType='chi')`)
  and `listJournalEntries` aggregate **do NOT exclude `refModule='state_obligation'` rows**.

This is actually CORRECT for cashflow (the payment *is* real cash out, should count once).
The double-count risk is the *opposite*: if a user also manually files the same payment in
Nhật ký, it counts twice — and nothing prevents that. The banner is the only guard.
**Recommendation:** acceptable for v1 IF the banner stays, but consider a soft validation
(warn on journal entries whose date+amount+account match an existing state_obligation JE).
Confirm with product whether `state_obligation` JEs should appear in the Nhật ký grid at all
— if they are editable there, a user edit would desync the JE from its txn (the txn is the
source of truth and would silently disagree). **This is the real exposure: JEs are editable
in two places with no lock.** Severity HIGH.

---

## HIGH

### H1 — `bulkUpsertObligationTypes` is NOT wrapped in a transaction
Unlike `bulkUpsertObligationTxns` (correctly uses `prisma.$transaction`), the *types* upsert
loops with individual `prisma.update`/`prisma.create` calls. A failing row mid-batch leaves
earlier rows committed and later rows not — partial write. The doc comment on the txn
function explicitly promises "a failing row rolls the whole batch back"; types should match.
Fix: wrap the loop in `prisma.$transaction(async (tx) => ...)`.

### H2 — JournalEntry editable from two surfaces → silent desync
The txn is declared "source of truth", but `da_nop` JEs land in the normal
`journal_entries` table and are fully editable via `nhat-ky` grid (`patchJournalEntry`,
`updateJournalEntry`). Editing the JE's amount/account there does NOT update the
`StateObligationTxn`. The report (built from txns) and the journal then disagree.
Recommendation: either (a) filter `refModule='state_obligation'` out of the editable
nhat-ky grid and render them read-only, or (b) make those JE mutations reject when
`refModule='state_obligation'`. Without this the "source of truth" invariant is unenforced.

### H3 — `softDeleteObligationTypes` does not cascade or block on existing txns
Soft-deleting a type leaves its `StateObligationTxn` rows live. The report's
`LEFT JOIN ... WHERE t."deletedAt" IS NULL` then drops those txns from the report entirely
(their parent type is filtered out) — so historical payments silently vanish from reports
while their JEs still affect cashflow. Either block deletion when live txns exist, or
soft-delete child txns + their JEs in the same transaction. Currently inconsistent with the
txn-level delete which DOES cascade to JEs.

---

## MEDIUM

### M1 — Inconsistent auth level: `softDelete*` requires `admin`, `bulkUpsert*` requires `edit`
Deleting needs `admin` but creating/updating needs only `edit`. That is a defensible policy,
but the `/tai-chinh` layout already gates the whole module at `minLevel: "admin"`
(`app/(app)/tai-chinh/layout.tsx`). So in practice **every** user who can reach these pages
is already an admin-level on tai-chinh; the `edit` vs `admin` distinction on mutations is
currently dead code. Not a bug, but confirm the layout's `admin` gate is intentional — it
means there is no read-only viewer for the entire finance module.

### M2 — List/report functions intentionally skip auth — but they are `"use server"` actions
`listObligationTypes`, `listObligationTxns`, `getObligationReport` are exported server
actions with no auth check. The comment says the layout guards them. True for page renders,
but **server actions are independently invocable** — any authenticated session can POST to
these action endpoints directly regardless of tai-chinh access. For list/report of
non-sensitive aggregate data this is low-risk, but it is a trust-boundary gap. Consider a
lightweight `hasRoleModuleAccess(role, "tai-chinh", "read")` check, or accept the risk
explicitly in the comment ("any logged-in user may read").

### M3 — `txnData` always sets `cashAccountId` null for `phai_tra`, but report/JE rely on kind
Fine as written. Minor: `updateTxnWithSync` da_nop→da_nop updates the JE with
`...data, refId: id` — `data` includes `note` but the JE's `description` is regenerated
from `typeName`/`refNo` each update. If the user manually edited the JE description in
nhat-ky (see H2), that edit is overwritten on the next txn edit. Symptom of H2.

### M4 — Date parsing accepts arbitrary strings
`new Date(String(row.date))` in `txnFields`/`typeData` — an unparseable string yields
`Invalid Date`, which Prisma rejects at write time with an opaque error. Boundary
validation: validate the date in the coercion helper and throw a Vietnamese-language error
consistent with the rest of the module (`Ngày không hợp lệ`).

### M5 — `bulkUpsertObligationTxns` does N type-name lookups inside the transaction
`typeNameOf(tx, f.typeId)` runs one `findUnique` per row, inside the interactive
transaction, lengthening transaction hold time. For bulk paste of many rows this extends
lock duration. Minor — batch-fetch type names once before the loop, or accept it for
expected small batch sizes.

---

## LOW

- **L1** — `getObligationReport` SQL `GROUP BY t.id` while selecting `t.name, t.code, ...`.
  Postgres allows this because `t.id` is the PK (functional dependency). Correct, but some
  linters/other engines flag it; harmless here.
- **L2** — `num()`/`dec()` swallow parse failures returning `0`. A typo in a pasted amount
  becomes a silent `0` instead of an error. Matches existing codebase pattern (journal
  service does similar), so consistent — but worth a product note.
- **L3** — `obligation-period-selector.tsx`: changing period kind resets `index` to `"1"`
  but does not clear a stale `index` from URL when switching to `year` (year ignores it).
  Cosmetic; `parseInt2` handles it.
- **L4** — Seed `findFirst({ where: { name } })` relies on `name` being unique; schema DOES
  enforce `@unique` on name, so a `findUnique` would be marginally clearer. Non-issue.
- **L5** — `revalidateObligation()` revalidates 4 paths on every mutation including unrelated
  `/tai-chinh`. Fine.

---

## Positive Observations

- `bulkUpsertObligationTxns` correctly uses one interactive `$transaction` so JE+txn writes
  are atomic — exactly right for the highest-risk path.
- `getObligationReport` uses parameterized `$queryRaw` tagged template — **no SQL injection**.
  All interpolated values (`start`, `end`) are Date objects bound as parameters.
- Period bounds are correct: UTC, end-exclusive, with `Math.min/max` clamping. Tests verify
  month/quarter/year boundaries explicitly.
- Soft-delete is consistently filtered (`deletedAt IS NULL`) in queries and the report SQL.
- Server→Client Decimal serialization handled (report emits strings; pages `Number()` for
  grids). No Decimal-over-the-wire bug.
- Tests are behavior-focused: they assert refId back-linking, kind-change JE soft-delete,
  and the balance formula — not just "function runs".

---

## Recommended Actions (priority order)

1. **C1** — Decide JE lifecycle on kind-change: hard-delete the abandoned JE, OR audit every
   `refModule`/`refId` consumer to confirm they filter `deletedAt: null`. Grep first.
2. **H2 / C2** — Lock down `state_obligation` JEs in the nhat-ky surface (read-only or reject
   mutation) to preserve the txn-as-source-of-truth invariant.
3. **H1** — Wrap `bulkUpsertObligationTypes` in `prisma.$transaction`.
4. **H3** — Make type soft-delete cascade to txns+JEs, or block when live txns exist.
5. **M2** — Add an explicit auth posture (check or documented decision) to the 3 list/report
   server actions.
6. **M4** — Validate dates at the coercion boundary.

## Metrics
- Type coverage: full (no `any` leaks; `as unknown as` only in test fakes — acceptable).
- Test coverage: 14 tests, JE-sync + report formula covered; **gaps:** no test for
  bulkUpsert partial-failure rollback, no test for type soft-delete cascade, no integration
  test exercising the real `@unique` constraint.
- SQL injection: none found.
- Lint: not run (review-only).

## Unresolved Questions
- Is the `/tai-chinh` layout `minLevel: "admin"` gate intentional? It eliminates any
  read-only finance viewer and makes the `edit`/`admin` split on mutations moot.
- Should `state_obligation` JEs be visible/editable in the Nhật ký grid at all?
- On da_nop→phai_tra kind change, is abandoning the original JE (vs un-deleting it on
  revert) the intended product behavior?
