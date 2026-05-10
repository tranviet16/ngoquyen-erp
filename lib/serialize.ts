import { Prisma } from "@prisma/client";

/**
 * Recursively converts Prisma.Decimal values to plain numbers so the result
 * can cross the Server -> Client Component boundary in Next.js (which only
 * accepts plain JSON-serializable values).
 *
 * Dates are preserved (Next.js serializes them via the Flight protocol).
 */
export function serializeDecimals<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return value.toNumber() as unknown as T;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => serializeDecimals(v)) as unknown as T;
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out[key] = serializeDecimals((value as Record<string, unknown>)[key]);
    }
    return out as T;
  }
  return value;
}
