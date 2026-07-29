import { describe, it, expect } from "vitest";
import { periodRange, periodLabel } from "../period";
import { deliverySchema } from "../schemas";

describe("periodRange — kỳ cố định 27 tháng trước → 26 tháng đích", () => {
  it.each([
    [2026, 5, "2026-04-27", "2026-05-26"],
    [2026, 6, "2026-05-27", "2026-06-26"],
    [2026, 1, "2025-12-27", "2026-01-26"], // cuộn năm lùi
    [2026, 12, "2026-11-27", "2026-12-26"],
    [2027, 1, "2026-12-27", "2027-01-26"],
    [2026, 3, "2026-02-27", "2026-03-26"], // tháng 2 không nhuận
  ])("kỳ %i/%i = [%s .. %s]", (year, month, from, to) => {
    const p = periodRange(year, month);
    expect(p.from.toISOString().slice(0, 10)).toBe(from);
    expect(p.to.toISOString().slice(0, 10)).toBe(to);
  });

  it("hai kỳ liền kề không trùng, không hở ngày biên", () => {
    const p5 = periodRange(2026, 5);
    const p6 = periodRange(2026, 6);
    const oneDay = 24 * 60 * 60 * 1000;
    expect(p6.from.getTime() - p5.to.getTime()).toBe(oneDay);
  });

  it("từ chối kỳ không hợp lệ", () => {
    expect(() => periodRange(2026, 0)).toThrow();
    expect(() => periodRange(2026, 13)).toThrow();
    expect(() => periodRange(2026.5, 6)).toThrow();
  });

  it("periodLabel định dạng dd/mm/yyyy", () => {
    const p = periodRange(2026, 6);
    expect(periodLabel(p.from, p.to)).toBe("27/05/2026 – 26/06/2026");
  });
});

describe("deliverySchema — đơn giá tùy chọn", () => {
  const base = {
    supplierId: 1,
    date: "2026-05-04",
    itemId: 2,
    qty: 8000,
    unit: "viên",
  };

  it("chấp nhận phiếu không giá (CB vật tư nhập KL trước)", () => {
    const parsed = deliverySchema.parse(base);
    expect(parsed.unitPrice).toBeUndefined();
    expect(parsed.totalAmount).toBeUndefined();
  });

  it("chấp nhận phiếu có giá", () => {
    const parsed = deliverySchema.parse({ ...base, unitPrice: 1850, totalAmount: 14_800_000 });
    expect(parsed.unitPrice).toBe(1850);
  });

  it("từ chối giá âm", () => {
    expect(() => deliverySchema.parse({ ...base, unitPrice: -1 })).toThrow();
  });
});
