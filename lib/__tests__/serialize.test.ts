import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { serializeDecimals } from "@/lib/serialize";

describe("serializeDecimals", () => {
  it("converts a top-level Prisma.Decimal to a plain number", () => {
    expect(serializeDecimals(new Prisma.Decimal("123.45"))).toBe(123.45);
  });

  it("passes through null, undefined and primitives untouched", () => {
    expect(serializeDecimals(null)).toBeNull();
    expect(serializeDecimals(undefined)).toBeUndefined();
    expect(serializeDecimals("hello")).toBe("hello");
    expect(serializeDecimals(42)).toBe(42);
  });

  it("preserves Date instances", () => {
    const d = new Date("2026-05-16T00:00:00Z");
    expect(serializeDecimals(d)).toBe(d);
  });

  it("recurses into arrays", () => {
    const out = serializeDecimals([new Prisma.Decimal("1.5"), new Prisma.Decimal("2.5")]);
    expect(out).toEqual([1.5, 2.5]);
  });

  it("recurses into nested objects", () => {
    const out = serializeDecimals({
      id: 1,
      amount: new Prisma.Decimal("999.99"),
      nested: { sub: new Prisma.Decimal("0.01") },
    });
    expect(out).toEqual({ id: 1, amount: 999.99, nested: { sub: 0.01 } });
  });
});
