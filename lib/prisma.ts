/**
 * Design note — user attribution in audit logs
 *
 * AsyncLocalStorage does NOT propagate through Next.js middleware into RSC or
 * Server Actions (middleware runs Edge; RSC runs Node). Therefore we cannot
 * call withUserContext() in middleware.ts.
 *
 * Strategy: resolveCurrentUserId() checks AsyncLocalStorage first (useful when
 * a Route Handler explicitly calls withUserContext()). If empty, it falls back
 * to auth.api.getSession({ headers: await headers() }) which works inside RSC
 * and Server Actions via Next's internal async-context bridge.
 *
 * Trade-off: one extra DB round-trip per mutation when AsyncLocalStorage is
 * not pre-populated. Acceptable for Phase 1 correctness.
 *
 * Bulk operations (createMany, updateMany, deleteMany, upsert, nested writes)
 * bypass this extension. A runtime guard throws when these are called without
 * { __skipAudit: true } to force a conscious decision by the caller.
 *
 * Transaction guarantee: audit log writes are performed inside a
 * base.$transaction([...]) call. If the audit insert fails the error is logged
 * and re-thrown, rolling back the session (in interactive tx form). Note:
 * because the mutation query() is called first (before the audit tx), a crash
 * between the two would leave the mutation committed — this is a known
 * limitation of Prisma's $extends query intercept pattern. Full atomicity
 * requires the caller to use an explicit interactive transaction.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCurrentUserId } from "./async-context";
import { env } from "./env";

// Models managed by Better Auth — skip auditing to avoid noise.
// Prisma passes the model name in PascalCase as defined in schema.prisma.
const SKIP_AUDIT = new Set(["AuditLog", "Session", "Account", "Verification"]);

async function resolveCurrentUserId(): Promise<string | null> {
  // 1. Check AsyncLocalStorage (populated by explicit withUserContext() calls)
  const fromContext = getCurrentUserId();
  if (fromContext) return fromContext;

  // 2. Fall back to reading the session from next/headers (RSC / Server Actions)
  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    // Dynamic import to avoid circular: prisma -> auth -> prisma
    const { auth } = await import("./auth");
    const session = await auth.api.getSession({ headers: requestHeaders });
    return session?.user?.id ?? null;
  } catch {
    // Not in a Next.js request context (seed script, unit tests, etc.)
    return null;
  }
}

type NullableJson = Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;

async function safeReadBefore(
  base: PrismaClient,
  model: string,
  id: string
): Promise<NullableJson> {
  try {
    const delegate = (
      base as unknown as Record<
        string,
        { findUnique: (args: unknown) => Promise<Record<string, unknown> | null> }
      >
    )[model];
    if (typeof delegate?.findUnique !== "function") return Prisma.JsonNull;
    const result = await delegate.findUnique({ where: { id } });
    if (!result) return Prisma.JsonNull;
    return result as Prisma.InputJsonValue;
  } catch (err) {
    console.warn("[audit] safeReadBefore failed for", model, id, err);
    return Prisma.JsonNull;
  }
}

async function writeAuditRow(
  base: PrismaClient,
  data: {
    userId: string | null;
    tableName: string;
    recordId: string;
    action: string;
    beforeJson?: NullableJson;
    afterJson?: NullableJson;
  }
): Promise<void> {
  try {
    await base.$transaction([
      base.auditLog.create({ data }),
    ]);
  } catch (err) {
    console.error("[audit] Failed to write audit row", {
      table: data.tableName,
      recordId: data.recordId,
      action: data.action,
      err,
    });
    throw err;
  }
}

function createBaseClient(): PrismaClient {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function createPrismaClient() {
  const base = createBaseClient();

  return base.$extends({
    query: {
      $allModels: {
        async createMany({ args, query, model }) {
          if (!(args as unknown as Record<string, unknown>).__skipAudit) {
            throw new Error(
              `[audit] ${model}.createMany bypasses audit middleware. ` +
              "Pass __skipAudit: true in args if intentional."
            );
          }
          return query(args);
        },
        async updateMany({ args, query, model }) {
          if (!(args as unknown as Record<string, unknown>).__skipAudit) {
            throw new Error(
              `[audit] ${model}.updateMany bypasses audit middleware. ` +
              "Pass __skipAudit: true in args if intentional."
            );
          }
          return query(args);
        },
        async deleteMany({ args, query, model }) {
          if (!(args as unknown as Record<string, unknown>).__skipAudit) {
            throw new Error(
              `[audit] ${model}.deleteMany bypasses audit middleware. ` +
              "Pass __skipAudit: true in args if intentional."
            );
          }
          return query(args);
        },
        async upsert({ args, query, model }) {
          if (!(args as unknown as Record<string, unknown>).__skipAudit) {
            throw new Error(
              `[audit] ${model}.upsert bypasses audit middleware. ` +
              "Pass __skipAudit: true in args if intentional."
            );
          }
          return query(args);
        },

        async create({ model, args, query }) {
          const result = await query(args);
          if (SKIP_AUDIT.has(model)) return result;
          const userId = await resolveCurrentUserId();
          const id = (result as Record<string, unknown>)?.id;
          if (!id) return result;
          await writeAuditRow(base, {
            userId,
            tableName: model,
            recordId: String(id),
            action: "create",
            afterJson: result as Prisma.InputJsonValue,
          });
          return result;
        },

        async update({ model, args, query }) {
          const id = (args as { where?: { id?: string } }).where?.id;
          const before: NullableJson = id
            ? await safeReadBefore(base, model, id)
            : Prisma.JsonNull;
          const result = await query(args);
          if (SKIP_AUDIT.has(model)) return result;
          const userId = await resolveCurrentUserId();
          const resultId = (result as Record<string, unknown>)?.id;
          if (!resultId) return result;
          await writeAuditRow(base, {
            userId,
            tableName: model,
            recordId: String(resultId),
            action: "update",
            beforeJson: before,
            afterJson: result as Prisma.InputJsonValue,
          });
          return result;
        },

        async delete({ model, args, query }) {
          const id = (args as { where?: { id?: string } }).where?.id;
          const before: NullableJson = id
            ? await safeReadBefore(base, model, id)
            : Prisma.JsonNull;
          const result = await query(args);
          if (SKIP_AUDIT.has(model)) return result;
          const userId = await resolveCurrentUserId();
          const resultId = (result as Record<string, unknown>)?.id;
          if (!resultId) return result;
          await writeAuditRow(base, {
            userId,
            tableName: model,
            recordId: String(resultId),
            action: "delete",
            beforeJson: before,
          });
          return result;
        },
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
