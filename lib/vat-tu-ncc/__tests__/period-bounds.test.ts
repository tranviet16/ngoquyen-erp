import { describe, it, expect } from "vitest";
import { parseIsoDateUtc } from "@/lib/ledger/business-date";
import {
  validatePeriodBounds,
  suggestNextPeriod,
  nextDay26,
  standardPeriodContaining,
  latestMarkerOf,
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

describe("validatePeriodBounds — biên kỳ chốt linh hoạt", () => {
  it("kỳ đầu 01/4→27/4 sau mốc số dư 31/3 hợp lệ", () => {
    expect(
      validatePeriodBounds(range("2026-04-01", "2026-04-27"), { markers: [], openingAsOf: d("2026-03-31") }),
    ).toBeNull();
  });

  it("mốc số dư 27/4 → from tối thiểu 28/4", () => {
    const ctx = { markers: [], openingAsOf: d("2026-04-27") };
    expect(validatePeriodBounds(range("2026-04-27", "2026-05-26"), ctx)).toMatch(/từ 28\/04\/2026/);
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx)).toBeNull();
  });

  it("kỳ k chưa ký vẫn chốt được kỳ k+1 và chốt lại đúng biên kỳ k", () => {
    const ctx = { markers: [marker(1, "2026-04-01", "2026-04-27", false)], openingAsOf: d("2026-03-31") };
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx)).toBeNull();
    expect(validatePeriodBounds(range("2026-04-01", "2026-04-27"), ctx)).toBeNull();
  });

  it("chồng lệch marker chưa ký bị từ chối", () => {
    const ctx = { markers: [marker(1, "2026-04-01", "2026-04-27", false)], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-04-01", "2026-04-30"), ctx)).toMatch(/chồng lấn kỳ chưa ký/);
    expect(validatePeriodBounds(range("2026-04-20", "2026-05-26"), ctx)).toMatch(/chồng lấn kỳ chưa ký/);
  });

  it("sau ký 28/4→26/5: 26/5→26/6 chồng lấn, 28/5→26/6 phải bắt đầu 27/05/2026, 27/5→26/6 hợp lệ", () => {
    const ctx = {
      markers: [marker(1, "2026-04-01", "2026-04-27", true), marker(2, "2026-04-28", "2026-05-26", true)],
      openingAsOf: d("2026-03-31"),
    };
    expect(validatePeriodBounds(range("2026-05-26", "2026-06-26"), ctx)).toMatch(/chồng lấn kỳ đã ký/);
    expect(validatePeriodBounds(range("2026-05-28", "2026-06-26"), ctx)).toMatch(/phải bắt đầu 27\/05\/2026/);
    expect(validatePeriodBounds(range("2026-05-27", "2026-06-26"), ctx)).toBeNull();
  });

  it("chốt lại đúng biên kỳ đã ký bị từ chối", () => {
    const ctx = { markers: [marker(1, "2026-04-28", "2026-05-26", true)], openingAsOf: null };
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx)).toMatch(/đã ký/);
  });

  it("from > to bị từ chối", () => {
    expect(validatePeriodBounds(range("2026-05-27", "2026-05-01"), { markers: [], openingAsOf: null })).toMatch(
      /Từ ngày phải/,
    );
  });

  it("marker đã có (selfId) phải liền kề marker liền trước, không cần liền kề marker sau", () => {
    const ctx = {
      markers: [
        marker(1, "2026-04-01", "2026-04-27", true),
        marker(2, "2026-04-28", "2026-05-26", false),
        marker(3, "2026-05-27", "2026-06-26", false),
      ],
      openingAsOf: d("2026-03-31"),
    };
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-26"), ctx, 2)).toBeNull();
    expect(validatePeriodBounds(range("2026-04-29", "2026-05-26"), ctx, 2)).toMatch(/28\/04\/2026/);
    expect(validatePeriodBounds(range("2026-04-28", "2026-05-27"), ctx, 2)).toMatch(/chồng lấn kỳ chưa ký/);
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

describe("suggestNextPeriod", () => {
  it("chưa có marker: phiếu sớm nhất 29/3, mốc số dư 28/3 → 29/3→26/4", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: null,
      openingAsOf: d("2026-03-28"),
      earliestOpenDeliveryDate: d("2026-03-29"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-03-29", "2026-04-26"]);
  });

  it("chưa có marker, phiếu sớm nhất muộn hơn mốc số dư → bắt đầu từ phiếu", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: null,
      openingAsOf: d("2026-03-28"),
      earliestOpenDeliveryDate: d("2026-04-05"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-05", "2026-04-26"]);
  });

  it("có marker: bắt đầu ngay sau marker dù phiếu sớm nhất muộn hơn (giữ liền kề)", () => {
    const r = suggestNextPeriod({
      latestMarkerTo: d("2026-05-26"),
      openingAsOf: d("2026-03-31"),
      earliestOpenDeliveryDate: d("2026-06-05"),
    })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-05-27", "2026-06-26"]);
  });

  it("marker 01/4→27/4 → gợi ý 28/4→26/5", () => {
    const r = suggestNextPeriod({ latestMarkerTo: d("2026-04-27"), openingAsOf: null, earliestOpenDeliveryDate: null })!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-28", "2026-05-26"]);
  });

  it("không có căn cứ → null", () => {
    expect(suggestNextPeriod({ latestMarkerTo: null, openingAsOf: null, earliestOpenDeliveryDate: null })).toBeNull();
  });

  it("latestMarkerOf chọn periodTo muộn nhất", () => {
    const m = latestMarkerOf([marker(1, "2026-04-28", "2026-05-26", true), marker(2, "2026-04-01", "2026-04-27", false)]);
    expect(m?.id).toBe(1);
  });
});
