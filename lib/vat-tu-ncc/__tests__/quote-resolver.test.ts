import { describe, it, expect } from "vitest";
import { resolveQuotePrice, type QuoteLike } from "../quote-resolver";

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
