/**
 * Parser tests for the "Bảng cân đối vật tư" adapter, run against the real
 * CSV export committed under SOP/. The sheet's own "Cộng ..." subtotal rows are
 * the ground truth: parse → validate must reconcile within the ±0.5% gate.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BangCanDoiVatTuAdapter,
  parseSheetNumber,
} from "@/lib/import/adapters/bang-can-doi-vat-tu.adapter";
import type { ParsedData } from "@/lib/import/adapters/adapter-types";

const CSV_PATH = join(
  process.cwd(),
  "SOP",
  "Bang cân đối vật tư.xlsx - Bảng vật tư theo dự toán.csv",
);

// Sheet ground truth (from the workbook's own subtotal rows)
const HM1 = {
  vl: { dt: 4_888_371_451, hd: 3_493_161_627 },
  cpc: { hd: 240_258_393 },
  nc: { dt: 2_134_640_427, hd: 416_607_407 },
  may: { dt: 488_984_514, hd: 153_530_094 },
  grand: { dt: 7_511_996_392, hd: 4_303_557_521 },
};
const HM2 = { vl: { dt: 338_795_783, hd: 161_033_110 } };
const HM3 = { vl: { dt: 522_280_053, hd: 0 } };

function sumBy(
  data: ParsedData,
  type: "estimate" | "transaction",
  key: string,
): number {
  const field = type === "estimate" ? "totalVnd" : "amountHd";
  return data.rows
    .filter((r) => r.data._type === type && `${r.data.hm}-${r.data.sectionCode}` === key)
    .reduce((acc, r) => acc + Number(r.data[field] ?? 0), 0);
}

function expectWithin(actual: number, expected: number, tolerance = 0.005) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
    Math.max(Math.abs(expected) * tolerance, 1000),
  );
}

describe("parseSheetNumber", () => {
  it("parses VN-formatted numbers", () => {
    expect(parseSheetNumber("  2,265 ")).toBe(2265);
    expect(parseSheetNumber("1,231.481")).toBeCloseTo(1231.481);
    expect(parseSheetNumber("676.25")).toBeCloseTo(676.25);
    expect(parseSheetNumber("  4,888,371,451 ")).toBe(4888371451);
  });
  it("parses parenthesised negatives", () => {
    expect(parseSheetNumber("  (10,266)")).toBe(-10266);
    expect(parseSheetNumber("(1.5)")).toBeCloseTo(-1.5);
  });
  it("rejects text, dashes, and #REF!", () => {
    expect(parseSheetNumber(" Xong ")).toBeNull();
    expect(parseSheetNumber("  -   ")).toBeNull();
    expect(parseSheetNumber("#REF!")).toBeNull();
    expect(parseSheetNumber("còn lấy")).toBeNull();
    expect(parseSheetNumber("")).toBeNull();
    expect(parseSheetNumber(null)).toBeNull();
  });
});

describe("BangCanDoiVatTuAdapter (real CSV)", () => {
  let data: ParsedData;

  beforeAll(async () => {
    const buffer = readFileSync(CSV_PATH);
    data = await BangCanDoiVatTuAdapter.parse(buffer);
  });

  it("detects all 3 HM blocks", () => {
    const blocks = data.meta.hmBlocks as { slug: string; label: string }[];
    expect(blocks.map((b) => b.slug)).toEqual(["HM1", "HM2", "HM3"]);
    expect(blocks[1].label).toContain("Cấp điện");
    expect(blocks[2].label).toContain("Cấp thoát nước");
  });

  it("passes the subtotal reconciliation gate", () => {
    const result = BangCanDoiVatTuAdapter.validate(data);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("reconciles HM1 section sums against the sheet", () => {
    expectWithin(sumBy(data, "estimate", "HM1-VL"), HM1.vl.dt);
    expectWithin(sumBy(data, "transaction", "HM1-VL"), HM1.vl.hd);
    expectWithin(sumBy(data, "transaction", "HM1-CPC"), HM1.cpc.hd);
    expectWithin(sumBy(data, "estimate", "HM1-NC"), HM1.nc.dt);
    expectWithin(sumBy(data, "transaction", "HM1-NC"), HM1.nc.hd);
    expectWithin(sumBy(data, "estimate", "HM1-MAY"), HM1.may.dt);
    expectWithin(sumBy(data, "transaction", "HM1-MAY"), HM1.may.hd);
  });

  it("reconciles HM1 grand totals", () => {
    const est = ["VL", "NC", "MAY", "CPC"]
      .map((s) => sumBy(data, "estimate", `HM1-${s}`))
      .reduce((a, b) => a + b, 0);
    const txn = ["VL", "NC", "MAY", "CPC"]
      .map((s) => sumBy(data, "transaction", `HM1-${s}`))
      .reduce((a, b) => a + b, 0);
    expectWithin(est, HM1.grand.dt);
    expectWithin(txn, HM1.grand.hd);
  });

  it("reconciles HM2 and HM3", () => {
    expectWithin(sumBy(data, "estimate", "HM2-VL"), HM2.vl.dt);
    expectWithin(sumBy(data, "transaction", "HM2-VL"), HM2.vl.hd);
    expectWithin(sumBy(data, "estimate", "HM3-VL"), HM3.vl.dt);
    expect(sumBy(data, "transaction", "HM3-VL")).toBe(0);
  });

  it("synthesizes one aggregate NC transaction (sheet has subtotal but no detail rows)", () => {
    const ncTxns = data.rows.filter(
      (r) => r.data._type === "transaction" && `${r.data.hm}-${r.data.sectionCode}` === "HM1-NC",
    );
    expect(ncTxns).toHaveLength(1);
    expect(Number(ncTxns[0].data.amountHd)).toBe(HM1.nc.hd);
    expect(String(ncTxns[0].data.note)).toContain("Tổng hợp");
  });

  it("emits exactly one chi_phi_chung transaction", () => {
    const cpc = data.rows.filter(
      (r) => r.data._type === "transaction" && r.data.transactionType === "chi_phi_chung",
    );
    expect(cpc).toHaveLength(1);
    expect(Number(cpc[0].data.amountHd)).toBe(HM1.cpc.hd);
    expect(cpc[0].data.qty).toBe(1);
    expect(cpc[0].data.unit).toBe("gói");
  });

  it("attaches invoice sub-lines to the parent estimate's itemCode", () => {
    // "Gạch đặc không nung": one estimate + invoice lines 120 / 138 / 185 on the same code
    const est = data.rows.find(
      (r) => r.data._type === "estimate" && String(r.data.itemName).includes("Gạch đặc không nung"),
    );
    expect(est).toBeDefined();
    const txns = data.rows.filter(
      (r) => r.data._type === "transaction" && r.data.itemCode === est!.data.itemCode,
    );
    expect(txns.map((t) => t.data.invoiceNo).sort()).toEqual(["120", "138", "185"]);
  });

  it("keeps invoice sub-line commercial names and units", () => {
    const sub = data.rows.find(
      (r) => r.data._type === "transaction" && String(r.data.itemName).includes("mã 38017"),
    );
    expect(sub).toBeDefined();
    expect(sub!.data.unit).toBe("Hộp");
    // linked to the ceramic 600x600 estimate
    const est = data.rows.find(
      (r) => r.data._type === "estimate" && r.data.itemCode === sub!.data.itemCode,
    );
    expect(String(est!.data.itemName)).toContain("600x600");
  });

  it("gives orphan invoice lines (Phần hoá đơn có) their own codes", () => {
    const orphan = data.rows.find(
      (r) => r.data._type === "transaction" && String(r.data.itemName).includes("Khớp nối trơn 16"),
    );
    expect(orphan).toBeDefined();
    // no estimate shares its code — it must not inherit the last estimate's code
    const est = data.rows.find(
      (r) => r.data._type === "estimate" && r.data.itemCode === orphan!.data.itemCode,
    );
    expect(est).toBeUndefined();
  });

  it("normalizes invoice numbers", () => {
    const composite = data.rows.find((r) => r.data.invoiceNo === "7+9");
    expect(composite).toBeDefined();
    const numeric = data.rows.find(
      (r) => r.data._type === "transaction" && String(r.data.itemName).includes("Thép tròn D<=10mm"),
    );
    expect(numeric!.data.invoiceNo).toBe("1650");
  });

  it("ignores trailing scratch rows (bang vat tu / Giá thành / #REF!)", () => {
    const stray = data.rows.filter((r) => Number(r.data.amountHd ?? 0) > 4_000_000_000);
    expect(stray).toEqual([]);
  });

  it("emits qtyHd = qty on every transaction row (adapter rows are invoice records)", () => {
    const txns = data.rows.filter((r) => r.data._type === "transaction");
    expect(txns.length).toBeGreaterThan(0);
    for (const t of txns) {
      expect(t.data.qtyHd).toBe(t.data.qty);
    }
  });

  it("does not import the 'Còn phải nhập' columns", () => {
    for (const r of data.rows) {
      expect(r.data.remaining).toBeUndefined();
    }
  });
});
