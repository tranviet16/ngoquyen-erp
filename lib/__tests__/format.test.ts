import { describe, it, expect } from "vitest";
import { vndFormatter, numberFormatter } from "@/lib/format";

describe("vndFormatter", () => {
  it("returns an empty string for null / undefined", () => {
    expect(vndFormatter(null)).toBe("");
    expect(vndFormatter(undefined)).toBe("");
  });

  it("groups thousands with vi-VN separators and appends the đồng symbol", () => {
    const out = vndFormatter(1234567);
    expect(out).toContain("1.234.567");
    expect(out).toContain("₫");
  });

  it("formats zero", () => {
    expect(vndFormatter(0)).toContain("0");
  });

  it("drops the fractional part (maximumFractionDigits 0)", () => {
    expect(vndFormatter(1000.99)).not.toContain(",99");
  });
});

describe("numberFormatter", () => {
  it("returns an empty string for null / undefined", () => {
    expect(numberFormatter(null)).toBe("");
    expect(numberFormatter(undefined)).toBe("");
  });

  it("groups thousands without a currency symbol", () => {
    const out = numberFormatter(1234567);
    expect(out).toContain("1.234.567");
    expect(out).not.toContain("₫");
  });

  it("honours the decimals argument", () => {
    expect(numberFormatter(1.5, 2)).toBe("1,5");
    expect(numberFormatter(1.5, 0)).toBe("2");
  });
});
