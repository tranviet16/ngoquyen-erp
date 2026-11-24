import { describe, it, expect } from "vitest";
import { parseIsoDateUtc } from "@/lib/ledger/business-date";
import {
  validatePeriodBounds,
  suggestNextPeriod,
  nextDay26,
  standardPeriodContaining,
  latestMarkerOf,
  monthlySlices,
  type PeriodMarker,
} from "../period-bounds";

const d = parseIsoDateUtc;
const iso = (x: Date) => x.toISOString().slice(0, 10);
const range = (from: string, to: string) => ({ from: d(from), to: d(to) });
const marker = (id: number, from: string, to: string, signed: boolean): PeriodMarker => ({
  id,
  from: d(from),
  to: d(to),
  signed,
});

describe("validatePeriodBounds — kỳ chốt theo tháng 27→26", () => {
  it("kỳ đầu lẻ 01/4→26/4 ngay sau mốc số dư 31/3 hợp lệ", () => {
    expect(
      validatePeriodBounds(range("2026-04-01", "2026-04-26"), { markers: [], openingAsOf: d("2026-03-31") }),
    ).toBeNull();
  });

  it("kỳ phải đúng một tháng 27→26", () => {
    const ctx = { markers: [], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toBeNull();
    // Dài quá một tháng (gộp kỳ), kết thúc lệch ngày 26, bắt đầu lệch ngày 27.
    expect(validatePeriodBounds(range("2026-04-27", "2026-06-26"), ctx)).toMatch(/theo tháng/);
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-20"), ctx)).toMatch(/theo tháng/);
    expect(validatePeriodBounds(range("2026-05-01", "2026-05-26"), ctx)).toMatch(/27\/04\/2026 – 26\/05\/2026/);
  });

  it("có thể tắt bắt buộc theo tháng (ký marker cũ lệch tháng)", () => {
    const ctx = { markers: [marker(1, "2026-04-01", "2026-04-27", false)], openingAsOf: d("2026-03-31") };
    expect(validatePeriodBounds(range("2026-04-01", "2026-04-27"), ctx, 1, { requireMonthly: false })).toBeNull();
    expect(validatePeriodBounds(range("2026-04-01", "2026-04-27"), ctx, 1)).toMatch(/theo tháng/);
  });

  it("mốc số dư 27/4 → from tối thiểu 28/4 (kỳ lẻ 28/4→26/5)", () => {
    const ctx = { markers: [], openingAsOf: d("2026-04-27") };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toMatch(/từ 28\/04\/2026/);
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx)).toBeNull();
  });

  it("kỳ k chưa ký vẫn chốt được kỳ k+1 và chốt lại đúng biên kỳ k", () => {
    const ctx = { markers: [marker(1, "2026-03-27", "2026-04-26", false)], openingAsOf: d("2026-03-26") };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toBeNull();
    expect(validatePeriodBounds(range("2026-03-27", "2026-04-26"), ctx)).toBeNull();
  });

  it("chồng lệch marker chưa ký (marker cũ lệch tháng) bị từ chối", () => {
    const ctx = { markers: [marker(1, "2026-04-01", "2026-04-20", false)], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-03-27", "2026-04-26"), ctx)).toMatch(/chồng lấn kỳ chưa ký/);
  });

  it("sau ký 27/4→26/5: kỳ sau phải bắt đầu 27/05/2026", () => {
    const ctx = {
      markers: [marker(1, "2026-03-27", "2026-04-26", true), marker(2, "2026-04-27", "2026-05-26", true)],
      openingAsOf: d("2026-03-26"),
    };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toMatch(/chồng lấn kỳ đã ký/);
    expect(validatePeriodBounds(range("2026-06-27", "2026-07-26"), ctx)).toMatch(/phải bắt đầu 27\/05\/2026/);
    expect(validatePeriodBounds(range("2026-05-27", "2026-06-26"), ctx)).toBeNull();
  });

  it("sau marker cũ lệch tháng (vd. kết thúc 15/5): kỳ lẻ 16/5→26/5 rồi tiếp theo tháng", () => {
    const ctx = { markers: [marker(1, "2026-04-27", "2026-05-15", true)], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-05-16", "2026-05-26"), ctx)).toBeNull();
    expect(validatePeriodBounds(range("2026-05-16", "2026-06-26"), ctx)).toMatch(/theo tháng/);
  });

  it("chốt lại đúng biên kỳ đã ký bị từ chối", () => {
    const ctx = { markers: [marker(1, "2026-04-27", "2026-05-26", true)], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toMatch(/đã ký/);
  });

  it("from > to bị từ chối", () => {
    expect(validatePeriodBounds(range("2026-05-27", "2026-05-01"), { markers: [], openingAsOf: null })).toMatch(
      /Từ ngày phải/,
    );
  });

  it("marker đã có (selfId) phải liền kề marker liền trước, không cần liền kề marker sau", () => {
    const ctx = {
      markers: [
        marker(1, "2026-03-27", "2026-04-26", true),
        marker(2, "2026-04-27", "2026-05-26", false),
        marker(3, "2026-05-27", "2026-06-26", false),
      ],
      openingAsOf: d("2026-03-26"),
    };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx, 2)).toBeNull();
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx, 2)).toMatch(/theo tháng/);
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-27"), ctx, 2)).toMatch(/theo tháng/);
  });
});

describe("nextDay26 / standardPeriodContaining", () => {
  it.each([
    ["2026-04-28", "2026-05-26"],
    ["2026-05-27", "2026-06-26"],
    ["2026-05-26", "2026-05-26"],
    ["2026-04-01", "2026-04-26"],
    ["2026-12-27", "2027-01-26"],
  ])("nextDay26(%s) = %s", (from, expected) => {
    expect(iso(nextDay26(d(from)))).toBe(expected);
  });

  it("kỳ chuẩn chứa một ngày", () => {
    const a = standardPeriodContaining(d("2026-10-06"));
    expect([iso(a.from), iso(a.to)]).toEqual(["2026-09-27", "2026-10-26"]);
    const b = standardPeriodContaining(d("2026-12-28"));
    expect([iso(b.from), iso(b.to)]).toEqual(["2026-12-27", "2027-01-26"]);
    const c = standardPeriodContaining(d("2026-01-05"));
    expect([iso(c.from), iso(c.to)]).toEqual(["2025-12-27", "2026-01-26"]);
  });
});

describe("monthlySlices", () => {
  const slices = (from: string, to: string) => monthlySlices(d(from), d(to)).map((m) => [iso(m.from), iso(m.to)]);

  it("kỳ đúng một tháng → một phần", () => {
    expect(slices("2026-10-27", "2026-11-26")).toEqual([["2026-10-27", "2026-11-26"]]);
  });

  it("kỳ chuyển đổi 01/01 → 26/10 → tháng lẻ đầu 01/01–26/01 rồi từng tháng 27→26", () => {
    const s = slices("2026-01-01", "2026-10-26");
    expect(s).toHaveLength(10);
    expect(s[0]).toEqual(["2026-01-01", "2026-01-26"]);
    expect(s[1]).toEqual(["2026-01-27", "2026-02-26"]);
    expect(s[9]).toEqual(["2026-09-27", "2026-10-26"]);
  });

  it("kỳ kết thúc lệch ngày 26 → tháng cuối lẻ", () => {
    expect(slices("2026-04-27", "2026-06-10")).toEqual([
      ["2026-04-27", "2026-05-26"],
      ["2026-05-27", "2026-06-10"],
    ]);
  });
});

describe("suggestNextPeriod", () => {
  it("chưa có marker: phiếu sớm nhất 29/3, mốc số dư 28/3 → 29/3→26/4", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: null,
      openingAsOf: d("2026-03-28"),
      earliestOpenDeliveryDate: d("2026-03-29"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-03-29", "2026-04-26"]);
  });

  it("chưa có marker, phiếu sớm nhất muộn hơn mốc số dư → kỳ tháng chứa phiếu (từ ngày 27)", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: null,
      openingAsOf: d("2026-03-26"),
      earliestOpenDeliveryDate: d("2026-04-05"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-03-27", "2026-04-26"]);
  });

  it("có marker: bắt đầu ngay sau marker dù phiếu sớm nhất muộn hơn (giữ liền kề)", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: d("2026-05-26"),
      openingAsOf: d("2026-03-31"),
      earliestOpenDeliveryDate: d("2026-06-05"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-05-27", "2026-06-26"]);
  });

  it("marker 01/4→26/4 → gợi ý 27/4→26/5", () => {
    const r = suggestNextPeriod({ latestMarkerTo: d("2026-04-26"), openingAsOf: null, earliestOpenDeliveryDate: null })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-27", "2026-05-26"]);
  });

  it("không có căn cứ → null", () => {
    expect(suggestNextPeriod({ latestMarkerTo: null, openingAsOf: null, earliestOpenDeliveryDate: null })).toBeNull();
  });

  it("latestMarkerOf chọn periodTo muộn nhất", () => {
    const m = latestMarkerOf([marker(1, "2026-04-27", "2026-05-26", true), marker(2, "2026-04-01", "2026-04-26", false)]);
    expect(m?.id).toBe(1);
  });
});
