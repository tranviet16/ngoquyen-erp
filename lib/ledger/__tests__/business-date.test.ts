import { describe, it, expect } from "vitest";
import { toBusinessDateUtc, isUtcMidnight, parseIsoDateUtc, toBusinessDateFromInput } from "../business-date";

const iso = (d: Date) => d.toISOString();

describe("toBusinessDateUtc", () => {
  it("02:00 27/5 Bangkok (19:00Z 26/5) -> 2026-05-27T00:00Z", () => {
    expect(iso(toBusinessDateUtc(new Date("2026-05-26T19:00:00Z")))).toBe("2026-05-27T00:00:00.000Z");
  });

  it("23:30 26/5 Bangkok (16:30Z) -> 2026-05-26T00:00Z", () => {
    expect(iso(toBusinessDateUtc(new Date("2026-05-26T16:30:00Z")))).toBe("2026-05-26T00:00:00.000Z");
  });

  it("biên 17:00Z là nửa đêm Bangkok", () => {
    expect(iso(toBusinessDateUtc(new Date("2026-05-26T16:59:59.999Z")))).toBe("2026-05-26T00:00:00.000Z");
    expect(iso(toBusinessDateUtc(new Date("2026-05-26T17:00:00Z")))).toBe("2026-05-27T00:00:00.000Z");
  });

  it("nửa đêm giờ địa phương Bangkok của import (17:00Z hôm trước) -> đúng ngày Excel", () => {
    expect(iso(toBusinessDateUtc(new Date("2026-05-31T17:00:00Z")))).toBe("2026-06-01T00:00:00.000Z");
  });

  it("qua ranh giới năm", () => {
    expect(iso(toBusinessDateUtc(new Date("2026-12-31T20:00:00Z")))).toBe("2027-01-01T00:00:00.000Z");
    expect(iso(toBusinessDateUtc(new Date("2026-01-01T00:00:00Z")))).toBe("2026-01-01T00:00:00.000Z");
  });

  it("idempotent trên giá trị đã chuẩn hoá", () => {
    const d = new Date("2026-05-27T00:00:00Z");
    expect(iso(toBusinessDateUtc(d))).toBe(iso(d));
  });

  it("tổng quát theo múi giờ có DST (America/New_York)", () => {
    // Mùa đông EST (UTC-5): 02:00Z 15/1 = 21:00 14/1
    expect(iso(toBusinessDateUtc(new Date("2026-01-15T02:00:00Z"), "America/New_York"))).toBe(
      "2026-01-14T00:00:00.000Z",
    );
    // Mùa hè EDT (UTC-4): 03:30Z 15/7 = 23:30 14/7; 04:30Z = 00:30 15/7
    expect(iso(toBusinessDateUtc(new Date("2026-07-15T03:30:00Z"), "America/New_York"))).toBe(
      "2026-07-14T00:00:00.000Z",
    );
    expect(iso(toBusinessDateUtc(new Date("2026-07-15T04:30:00Z"), "America/New_York"))).toBe(
      "2026-07-15T00:00:00.000Z",
    );
  });

  it("ném lỗi với Date không hợp lệ", () => {
    expect(() => toBusinessDateUtc(new Date("x"))).toThrow();
  });
});

describe("isUtcMidnight", () => {
  it("nhận UTC 00:00, từ chối có giờ hoặc mili giây", () => {
    expect(isUtcMidnight(new Date("2026-05-27T00:00:00.000Z"))).toBe(true);
    expect(isUtcMidnight(new Date("2026-05-27T00:00:00.001Z"))).toBe(false);
    expect(isUtcMidnight(new Date("2026-05-26T17:00:00Z"))).toBe(false);
    expect(isUtcMidnight(new Date("x"))).toBe(false);
  });
});

describe("parseIsoDateUtc", () => {
  it("parse YYYY-MM-DD thành UTC 00:00", () => {
    expect(iso(parseIsoDateUtc("2026-05-27"))).toBe("2026-05-27T00:00:00.000Z");
  });

  it("từ chối sai định dạng và ngày không tồn tại", () => {
    expect(() => parseIsoDateUtc("27/05/2026")).toThrow();
    expect(() => parseIsoDateUtc("2026-02-30")).toThrow();
    expect(() => parseIsoDateUtc("2026-13-01")).toThrow();
  });
});

describe("toBusinessDateFromInput", () => {
  it("YYYY-MM-DD giữ nguyên ngày ở UTC 00:00", () => {
    expect(iso(toBusinessDateFromInput("2026-05-27"))).toBe("2026-05-27T00:00:00.000Z");
  });

  it("timestamp có giờ quy về ngày Asia/Bangkok", () => {
    expect(iso(toBusinessDateFromInput("2026-05-26T19:00:00Z"))).toBe("2026-05-27T00:00:00.000Z");
    expect(iso(toBusinessDateFromInput("2026-05-27T10:00:00Z"))).toBe("2026-05-27T00:00:00.000Z");
  });

  it("chuỗi sai ném lỗi", () => {
    expect(() => toBusinessDateFromInput("not-a-date")).toThrow();
    expect(() => toBusinessDateFromInput("2026-02-30")).toThrow();
  });
});
