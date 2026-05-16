/**
 * Integration-test DB lifecycle.
 *
 * DESTRUCTIVE: `truncateAll()` wipes every application table. It is guarded to
 * only run against a database whose name ends in `_test`, so it can never touch
 * the dev DB. `.env.test` points DATABASE_URL at `ngoquyyen_erp_test`.
 *
 * There is intentionally NO transaction-rollback isolation helper. The audit
 * `$extends` extension (lib/prisma.ts) wraps every write in its own
 * `base.$transaction([...])`; running a service inside an outer test-owned
 * transaction would nest transactions, which the pg adapter rejects. Services
 * also import `@/lib/prisma` at module scope and never accept a `tx` param.
 * Isolation is therefore: `truncateAll()` between tests + the `integration`
 * Vitest project runs serially (pool: forks, fileParallelism: false).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_URL ?? "";

if (!/_test(\?|$)/.test(url)) {
  throw new Error(
    `test-db.ts refuses to run: DATABASE_URL must target a *_test database, got: ${url || "(unset)"}`,
  );
}

/** Un-extended client — no audit extension, used only for truncation. */
const pool = new Pool({ connectionString: url });
const rawClient = new PrismaClient({ adapter: new PrismaPg(pool) });

/** Empties every application table (incl. audit_logs) for a clean slate. */
export async function truncateAll(): Promise<void> {
  const rows = await rawClient.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await rawClient.$executeRawUnsafe(
    `TRUNCATE ${tables} RESTART IDENTITY CASCADE`,
  );
}

/** Closes the raw connection — call in a global afterAll if needed. */
export async function closeTestDb(): Promise<void> {
  await rawClient.$disconnect();
  await pool.end();
}
