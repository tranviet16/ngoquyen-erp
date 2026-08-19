import { describe, it, expect } from "vitest";
import {
  epsilon,
  pctOrNull,
  bucketOf,
  emptySubtotal,
  addRowToSubtotal,
  tokenizeVtName,
  detectNameMismatch,
  type CanDoiRow,
} from "@/lib/du-an/can-doi-metrics";

function makeRow(over: Partial<CanDoiRow>): CanDoiRow {
  return {
    id: "e-1",
    kind: "estimate",
    estimateId: 1,
    categoryId: 1,
    itemCode: "X",
    itemName: "X",
    unit: "kg",
    bucket: "thieu",
    unitMismatch: false,
    nameMismatch: false,
    nameMismatchSamples: [],
    estimateQty: 0,
    estimateUnitPrice: 0,
    estimateTotalVnd: 0,
    estimateAdjustedTotalVnd: 0,
    qtyHd: 0,
    invoiceAmountVnd: 0,
    pctHdMoney: null,
    pctHdQty: null,
    avgPriceHd: null,
    remainingInvoiceVnd: 0,
    remainingIsOverride: false,
    qtyTt: 0,
    actualAmountVnd: 0,
    pctTtQty: null,
    avgPriceTt: null,
    priceDiffTtDt: null,
    priceDiffTtDtPct: null,
    priceImpactTt: null,
    qtyDiffTtHd: null,
    priceDiffTtHd: null,
    diffActualVsInvoiceVnd: 0,
    ...over,
  };
}

describe("epsilon", () => {
  it("floors at 1.000đ", () => {
    expect(epsilon(0)).toBe(1000);
    expect(epsilon(500)).toBe(1000);
    expect(epsilon(100_000)).toBe(1000);
  });
  it("scales at 0,5% for large estimates", () => {
    expect(epsilon(1_000_000)).toBe(5000);
    expect(epsilon(200_000_000)).toBe(1_000_000);
  });
});

describe("pctOrNull", () => {
  it("returns null on zero/negative denominator", () => {
    expect(pctOrNull(0, 0)).toBeNull();
    expect(pctOrNull(10, 0)).toBeNull();
    expect(pctOrNull(10, -5)).toBeNull();
  });
  it("divides otherwise", () => {
    expect(pctOrNull(50, 100)).toBe(0.5);
    expect(pctOrNull(150, 100)).toBe(1.5);
  });
});

describe("bucketOf", () => {
  const base = { kind: "estimate" as const, estimateTotalVnd: 100_000 };
  it("chua_lay: no invoice against a positive estimate", () => {
    expect(bucketOf({ ...base, invoiceAmountVnd: 0, remainingInvoiceVnd: 100_000 })).toBe("chua_lay");
  });
  it("du: remaining within ε (ε=1000 for 100k estimate)", () => {
    expect(bucketOf({ ...base, invoiceAmountVnd: 99_200, remainingInvoiceVnd: 800 })).toBe("du");
    expect(bucketOf({ ...base, invoiceAmountVnd: 100_900, remainingInvoiceVnd: -900 })).toBe("du");
  });
  it("thieu / vuot: remaining beyond ε", () => {
    expect(bucketOf({ ...base, invoiceAmountVnd: 98_000, remainingInvoiceVnd: 2_000 })).toBe("thieu");
    expect(bucketOf({ ...base, invoiceAmountVnd: 101_500, remainingInvoiceVnd: -1_500 })).toBe("vuot");
  });
  it("uses 0,5% ε for large rows (1 tỷ → ε = 5 triệu)", () => {
    const big = { kind: "estimate" as const, estimateTotalVnd: 1_000_000_000 };
    expect(bucketOf({ ...big, invoiceAmountVnd: 996_000_000, remainingInvoiceVnd: 4_000_000 })).toBe("du");
    expect(bucketOf({ ...big, invoiceAmountVnd: 994_000_000, remainingInvoiceVnd: 6_000_000 })).toBe("thieu");
  });
  it("manual override drives the bucket even when no invoice exists yet", () => {
    // user overrides remaining to 0 ("coi như đủ") on a row with 0 invoices
    expect(
      bucketOf({ ...base, invoiceAmountVnd: 0, remainingInvoiceVnd: 0, remainingIsOverride: true }),
    ).toBe("du");
    expect(
      bucketOf({ ...base, invoiceAmountVnd: 0, remainingInvoiceVnd: 50_000, remainingIsOverride: true }),
    ).toBe("thieu");
    // without an override the same row stays "chưa lấy"
    expect(bucketOf({ ...base, invoiceAmountVnd: 0, remainingInvoiceVnd: 100_000 })).toBe("chua_lay");
  });

  it("invoice-only rows are always ngoai_dt", () => {
    expect(
      bucketOf({ kind: "invoice-only", estimateTotalVnd: 0, invoiceAmountVnd: 5_000, remainingInvoiceVnd: -5_000 }),
    ).toBe("ngoai_dt");
  });
});

describe("tokenizeVtName / detectNameMismatch", () => {
  it("drops pure-numeric and short tokens", () => {
    const t = tokenizeVtName("Vữa XMPC30, cát vàng, đá 1x2 M300");
    expect(t.has("300")).toBe(false);
    expect(t.has("vua")).toBe(true);
    expect(t.has("cat")).toBe(true);
  });

  it("flags transaction names sharing no token with the estimate", () => {
    const r = detectNameMismatch("Cung cấp cọc ly tâm ứng suất trước D300 loại A", [
      "Đơn giá ép cọc D300A bằng máy tải", // chung "coc" → không flag
      "Hỗ trợ di chuyển máy", // không chung token → flag
      "Vận tải huy động và giải thể", // flag
    ]);
    expect(r.mismatch).toBe(true);
    expect(r.samples).toEqual(["Hỗ trợ di chuyển máy", "Vận tải huy động và giải thể"]);
  });

  it("flags BTTP commercial names under a vữa estimate (no shared non-numeric token)", () => {
    const r = detectNameMismatch("Vữa XMPC30, cát vàng, đá 1x2 M300 - Độ sụt 14 - 17cm", [
      "BTTP Mac 300",
    ]);
    expect(r.mismatch).toBe(true);
  });

  it("does not flag identical or overlapping names", () => {
    const r = detectNameMismatch("Đá 1x2", ["Đá 1x2", "Cước vc đá 1x2"]);
    expect(r.mismatch).toBe(false);
  });

  it("caps samples at 3", () => {
    const r = detectNameMismatch("Xi măng", ["aa bb", "cc dd", "ee ff", "gg hh"]);
    expect(r.samples).toHaveLength(3);
  });
});

describe("subtotal aggregation", () => {
  it("sums numerators/denominators and derives pct — never averages row percentages", () => {
    const sub = emptySubtotal();
    // 100% of 100k and 0% of 900k → subtotal must be 10%, not avg(100%, 0%) = 50%
    addRowToSubtotal(
      sub,
      makeRow({
        estimateAdjustedTotalVnd: 100_000,
        invoiceAmountVnd: 100_000,
        pctHdMoney: 1,
        bucket: "du",
      }),
    );
    addRowToSubtotal(
      sub,
      makeRow({
        id: "e-2",
        estimateAdjustedTotalVnd: 900_000,
        invoiceAmountVnd: 0,
        pctHdMoney: 0,
        remainingInvoiceVnd: 900_000,
        bucket: "chua_lay",
      }),
    );
    expect(sub.pctHdMoney).toBeCloseTo(0.1);
    expect(sub.rowCount).toBe(2);
    expect(sub.bucketCounts.du).toBe(1);
    expect(sub.bucketCounts.chua_lay).toBe(1);
  });

  it("remainingPositiveVnd clamps negatives, net remaining keeps them", () => {
    const sub = emptySubtotal();
    addRowToSubtotal(sub, makeRow({ remainingInvoiceVnd: 500_000 }));
    addRowToSubtotal(sub, makeRow({ id: "e-2", remainingInvoiceVnd: -200_000, bucket: "vuot" }));
    expect(sub.remainingInvoiceVnd).toBe(300_000);
    expect(sub.remainingPositiveVnd).toBe(500_000);
  });

  it("counts rows carrying actual amounts", () => {
    const sub = emptySubtotal();
    addRowToSubtotal(sub, makeRow({ actualAmountVnd: 1_000 }));
    addRowToSubtotal(sub, makeRow({ id: "e-2" }));
    expect(sub.ttRowCount).toBe(1);
  });
});
