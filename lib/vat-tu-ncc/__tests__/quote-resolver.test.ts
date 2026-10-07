import { describe, it, expect } from "vitest";
import { resolveQuotePrice, annotateQuoteHistory, type QuoteLike } from "../quote-resolver";

const q = (id: number, itemId: number, unitPrice: number, effectiveFrom: string): QuoteLike => ({
  id,
  itemId,
  unitPrice,
  effectiveFrom: new Date(effectiveFrom),
});

describe("resolveQuotePrice — mức giá hiệu lực tại ngày phiếu", () => {
  const quotes = [
    q(1, 10, 1900, "2026-04-01"),
    q(2, 10, 1850, "2026-04-24"), // giá đổi giữa kỳ
    q(3, 10, 1450, "2026-06-25"),
    q(4, 20, 490_000, "2026-05-01"), // vật tư khác
  ];

  it("chọn mức mới nhất có effectiveFrom <= ngày phiếu", () => {
    expect(resolveQuotePrice(quotes, 10, new Date("2026-04-10"))).toBe(1900);
    expect(resolveQuotePrice(quotes, 10, new Date("2026-05-13"))).toBe(1850);
    expect(resolveQuotePrice(quotes, 10, new Date("2026-06-25"))).toBe(1450); // đúng ngày hiệu lực
    expect(resolveQuotePrice(quotes, 10, new Date("2026-07-01"))).toBe(1450);
  });

  it("không lấy giá tương lai; không có mức hiệu lực → null (fallback giá lần nhập gần nhất)", () => {
    expect(resolveQuotePrice(quotes, 10, new Date("2026-03-31"))).toBeNull();
    expect(resolveQuotePrice(quotes, 99, new Date("2026-05-01"))).toBeNull();
  });

  it("không lẫn giá giữa các vật tư", () => {
    expect(resolveQuotePrice(quotes, 20, new Date("2026-05-13"))).toBe(490_000);
  });

  it("hai mức cùng ngày hiệu lực → bản nhập sau (id lớn hơn) thắng", () => {
    const dup = [...quotes, q(5, 10, 1800, "2026-04-24")];
    expect(resolveQuotePrice(dup, 10, new Date("2026-05-01"))).toBe(1800);
  });
});

describe("annotateQuoteHistory — giá trước, chênh lệch, nhãn", () => {
  it("Nam Hương: 1.900 (26/3) → 1.850 (24/4) là mới rồi giảm 50", () => {
    const r = annotateQuoteHistory([q(2, 10, 1850, "2026-04-24"), q(1, 10, 1900, "2026-03-26")]);
    expect(r.map((x) => [x.trend, x.prevPrice, x.diff])).toEqual([
      ["moi", null, null],
      ["giam", 1900, -50],
    ]);
  });

  it("Lộc Tài Ca: 2.600.000 → 3.300.000 tăng 700.000 → 3.000.000 giảm 300.000", () => {
    const r = annotateQuoteHistory([
      q(1, 5, 2_600_000, "2026-01-01"),
      q(2, 5, 3_300_000, "2026-02-01"),
      q(3, 5, 3_000_000, "2026-03-01"),
    ]);
    expect(r.map((x) => [x.trend, x.diff])).toEqual([
      ["moi", null],
      ["tang", 700_000],
      ["giam", -300_000],
    ]);
  });

  it("cùng giá là giữ nguyên; vật tư khác độc lập", () => {
    const r = annotateQuoteHistory([
      q(1, 10, 1850, "2026-04-01"),
      q(2, 10, 1850, "2026-05-01"),
      q(3, 20, 100, "2026-04-15"),
    ]);
    expect(r.find((x) => x.id === 2)?.trend).toBe("giu_nguyen");
    expect(r.find((x) => x.id === 2)?.diff).toBe(0);
    expect(r.find((x) => x.id === 3)).toMatchObject({ trend: "moi", prevPrice: null });
  });

  it("cùng effectiveFrom: id lớn hơn là mức sau", () => {
    const r = annotateQuoteHistory([q(9, 10, 2000, "2026-04-01"), q(4, 10, 1800, "2026-04-01")]);
    expect(r.map((x) => x.id)).toEqual([4, 9]);
    expect(r[1]).toMatchObject({ trend: "tang", prevPrice: 1800, diff: 200 });
  });
});
