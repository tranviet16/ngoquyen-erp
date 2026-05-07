import { Prisma } from "@prisma/client";

export type SerializedDecimal<T> = T extends Prisma.Decimal
  ? number
  : T extends Date
    ? Date
    : T extends null
      ? null
      : T extends undefined
        ? undefined
        : T extends Array<infer U>
          ? Array<SerializedDecimal<U>>
          : T extends object
            ? { [K in keyof T]: SerializedDecimal<T[K]> }
            : T;

/**
 * Recursively convert Prisma.Decimal to number so the value can cross the
 * RSC → Client Component boundary. Next.js rejects non-plain objects
 * (Decimal is a class instance, not a plain object).
 *
 * Use at the service boundary BEFORE returning data that will be passed
 * as a prop to a "use client" component.
 */
export function serializeDecimal<T>(value: T): SerializedDecimal<T> {
  if (value == null) return value as SerializedDecimal<T>;
  if (value instanceof Prisma.Decimal) {
    return value.toNumber() as SerializedDecimal<T>;
  }
  if (value instanceof Date) return value as SerializedDecimal<T>;
  if (Array.isArray(value)) {
    return value.map(serializeDecimal) as SerializedDecimal<T>;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeDecimal(v);
    }
    return out as SerializedDecimal<T>;
  }
  return value as SerializedDecimal<T>;
}
