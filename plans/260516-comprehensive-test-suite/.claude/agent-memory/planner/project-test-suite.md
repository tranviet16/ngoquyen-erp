---
name: project-test-suite
description: Non-obvious constraints for writing tests in the ngoquyyen-erp project
metadata:
  type: project
---

Testing this Next.js 16 / Prisma 7 ERP has three non-obvious constraints.

**Why:** These are easy to miss and cause silent test failures or false passes.

**How to apply:** When planning or reviewing test work here:
- `lib/prisma.ts` has an audit-log `$extends` extension: create/update/delete are intercepted; bulk ops (createMany/updateMany/deleteMany/upsert) THROW unless wrapped in `bypassAudit()`. Integration tests must use an un-extended `PrismaClient` or wrap bulk ops.
- Server Actions (`app/.../actions.ts`, 12 files) are encrypted closures — NOT unit-testable. Test the underlying `lib/` service; cover actions only via Playwright E2E.
- Test DB = `localhost:5433` = `docker-postgres-1` (db `ngoquyyen_erp`, user `nqerp`). `erp-postgres-1` is a different db — never use it.
- Established mock pattern (6 existing tests): `vi.mock("../../prisma", ...)` + `vi.mock("react", () => ({ cache: f => f }))`. New tests should follow it; see `lib/acl/__tests__/effective.test.ts`.
- Integration tests CANNOT use transaction-rollback isolation: the audit `$extends` opens its own `base.$transaction`, and services import `@/lib/prisma` at module scope (no `tx` param) — an outer test tx would nest and the pg adapter rejects nested transactions. Use `truncateAll()` between tests + run integration project serially (`pool:'forks'`, `fileParallelism:false`).
- Integration tests use the REAL extended `@/lib/prisma` (audit path exercised); assert audit rows where writes happen.
- Vitest test scripts: NEVER use `vitest run --env-file=` — `--env-file` is a Node flag, invalid for Vitest. Load `.env.test` via `dotenv` in `setupFiles`.
