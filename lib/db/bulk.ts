import { prisma } from "@/lib/prisma";

interface PrismaModelDelegate {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  update: (args: { where: { id: number }; data: Record<string, unknown> }) => Promise<unknown>;
}

/**
 * Generic bulk upsert: rows with truthy `id` are updated, rows without are created.
 * Runs inside a single interactive Prisma transaction — any failure rolls back the whole batch.
 *
 * Note: uses the interactive `$transaction(async (tx) => ...)` form because the audit
 * extension wraps create/update as async functions returning plain Promises, not PrismaPromises,
 * so the array-batch form `$transaction([...])` would reject them at the type level.
 */
export async function bulkUpsert<T extends { id?: number | null }>(
  model: (tx: unknown) => PrismaModelDelegate,
  rows: T[],
): Promise<unknown[]> {
  if (rows.length === 0) return [];
  return prisma.$transaction(async (tx) => {
    const delegate = model(tx);
    const out: unknown[] = [];
    for (const row of rows) {
      const { id, ...data } = row as T & { id?: number | null };
      if (id != null && id > 0) {
        out.push(await delegate.update({ where: { id }, data: data as Record<string, unknown> }));
      } else {
        out.push(await delegate.create({ data: data as Record<string, unknown> }));
      }
    }
    return out;
  });
}
