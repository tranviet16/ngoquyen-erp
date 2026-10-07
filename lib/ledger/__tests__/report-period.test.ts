import { describe, it, expect } from "vitest";
import {
  isoWeekOf,
  isoWeekRange,
  weeksInIsoYear,
  resolveReportPeriod,
  parseReportWindow,
  windowSchema,
  type ReportPeriodResult,
  type ResolvedReportPeriod,
} from "@/lib/ledger/report-period";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
const TODAY = d("2026-10-06");

const resolve = (sp: Record<string, string>, legacyMode: "month" | "cutoff" = "month", defaultPreset: "all" | "month" = "month") =>
  resolveReportPeriod(sp, { defaultPreset, legacyMode, today: TODAY });

function ok(r: ReportPeriodResult): ResolvedReportPeriod {
  if ("error" in r) throw new Error(`unexpected error: ${r.error}`);
  return r;
}

describe("ISO week helpers", () => {
  it("tuần 41/2026 = 05/10 → 11/10", () => {
    const r = isoWeekRange(2026, 41)!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-10-05", "2026-10-11"]);
  });

  it("tuần 53/2026 = 28/12/2026 → 03/01/2027", () => {
    const r = isoWeekRange(2026, 53)!;
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-12-28", "2027-01-03"]);
  });

  it("isoWeekOf(2027-01-01) thuộc tuần 53 của năm 2026", () => {
    expect(isoWeekOf(d("2027-01-01"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeekOf(d("2026-01-01"))).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf(d("2026-10-06"))).toEqual({ year: 2026, week: 41 });
  });

  it("weeksInIsoYear: 2026 có 53 tuần, 2027 có 52, 2020 (nhuận, 1/1 Thứ Tư) có 53", () => {
    expect(weeksInIsoYear(2026)).toBe(53);
    expect(weeksInIsoYear(2027)).toBe(52);
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2025)).toBe(52);
  });

  it("tuần 53/2027 không tồn tại → null", () => {
    expect(isoWeekRange(2027, 53)).toBeNull();
    expect(isoWeekRange(2026, 0)).toBeNull();
  });

  it("các tuần ISO liên tiếp phủ kín năm không hở không chồng", () => {
    for (const year of [2025, 2026, 2027]) {
      let prevEnd: Date | null = null;
      for (let w = 1; w <= weeksInIsoYear(year); w++) {
        const r = isoWeekRange(year, w)!;
        if (prevEnd) expect(r.from.getTime() - prevEnd.getTime()).toBe(86_400_000);
        prevEnd = r.to;
      }
    }
  });
});

describe("resolveReportPeriod — presets", () => {
  it("all = null/null", () => {
    const r = ok(resolve({ period: "all" }));
    expect(r.from).toBeNull();
    expect(r.to).toBeNull();
    expect(r.label).toBe("Toàn bộ");
  });

  it("year", () => {
    const r = ok(resolve({ period: "year", y: "2026" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("quarter Q2/2026 = 01/04 → 30/06", () => {
    const r = ok(resolve({ period: "quarter", y: "2026", q: "2" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-04-01", "2026-06-30"]);
    expect(r.params).toEqual({ period: "quarter", y: "2026", q: "2" });
  });

  it("quarter 5 → error", () => {
    expect(resolve({ period: "quarter", y: "2026", q: "5" })).toHaveProperty("error");
  });

  it("month 2/2028 → 29/02 (năm nhuận)", () => {
    const r = ok(resolve({ period: "month", y: "2028", m: "2" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2028-02-01", "2028-02-29"]);
  });

  it("month 13 hoặc 0 → error, không ném", () => {
    expect(resolve({ period: "month", y: "2026", m: "13" })).toHaveProperty("error");
    expect(resolve({ period: "month", y: "2026", m: "0" })).toHaveProperty("error");
    expect(resolve({ period: "month", y: "2026", m: "abc" })).toHaveProperty("error");
  });

  it("week 41/2026", () => {
    const r = ok(resolve({ period: "week", y: "2026", w: "41" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-10-05", "2026-10-11"]);
    expect(r.label).toContain("Tuần 41/2026");
  });

  it("week 53/2027 → error vì 2027 chỉ có 52 tuần", () => {
    expect(resolve({ period: "week", y: "2027", w: "53" })).toHaveProperty("error");
  });

  it("week mặc định theo today (tuần ISO hiện tại)", () => {
    const r = ok(resolve({ period: "week" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-10-05", "2026-10-11"]);
  });

  it("ncc 6/2026 = 27/05 → 26/06", () => {
    const r = ok(resolve({ period: "ncc", y: "2026", m: "6" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-05-27", "2026-06-26"]);
  });

  it("ncc tháng 13 → error", () => {
    expect(resolve({ period: "ncc", y: "2026", m: "13" })).toHaveProperty("error");
  });

  it("custom hợp lệ, một đầu để trống, và đảo ngược → error", () => {
    const r = ok(resolve({ period: "custom", from: "2026-05-27", to: "2026-06-26" }));
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-05-27", "2026-06-26"]);
    const open = ok(resolve({ period: "custom", to: "2026-06-26" }));
    expect(open.from).toBeNull();
    expect(iso(open.to)).toBe("2026-06-26");
    expect(resolve({ period: "custom", from: "2026-06-26", to: "2026-05-27" })).toHaveProperty("error");
    expect(resolve({ period: "custom", from: "2026-02-30", to: "2026-03-01" })).toHaveProperty("error");
  });

  it("period lạ hoặc năm ngoài khoảng → error", () => {
    expect(resolve({ period: "decade" })).toHaveProperty("error");
    expect(resolve({ period: "year", y: "1800" })).toHaveProperty("error");
  });

  it("mọi from/to đều là UTC 00:00", () => {
    const cases: Record<string, string>[] = [
      { period: "year", y: "2026" },
      { period: "quarter", y: "2026", q: "3" },
      { period: "month", y: "2026", m: "9" },
      { period: "week", y: "2026", w: "10" },
      { period: "ncc", y: "2026", m: "1" },
    ];
    for (const c of cases) {
      const r = ok(resolve(c));
      expect(r.from!.getTime() % 86_400_000).toBe(0);
      expect(r.to!.getTime() % 86_400_000).toBe(0);
    }
  });

  it("tổng các tuần ISO phủ tháng có đầu/cuối nằm trong tháng", () => {
    // Tháng 5/2026: 01/05 (Thứ Sáu, tuần 18) → 31/05 (Chủ Nhật, tuần 22).
    const first = isoWeekOf(d("2026-05-01"));
    const last = isoWeekOf(d("2026-05-31"));
    expect([first.week, last.week]).toEqual([18, 22]);
    expect(iso(isoWeekRange(2026, 18)!.from)).toBe("2026-04-27");
    expect(iso(isoWeekRange(2026, 22)!.to)).toBe("2026-05-31");
  });
});

describe("resolveReportPeriod — mặc định và URL cũ", () => {
  it("không tham số → defaultPreset với mốc hôm nay", () => {
    const m = ok(resolve({}, "month", "month"));
    expect([iso(m.from), iso(m.to)]).toEqual(["2026-10-01", "2026-10-31"]);
    const a = ok(resolve({}, "month", "all"));
    expect(a.preset).toBe("all");
  });

  it("?year=&month= chế độ month → cửa sổ tháng", () => {
    const r = ok(resolve({ year: "2026", month: "5" }, "month"));
    expect(r.preset).toBe("month");
    expect([iso(r.from), iso(r.to)]).toEqual(["2026-05-01", "2026-05-31"]);
  });

  it("?year=&month= chế độ cutoff → đến hết tháng, không đầu dưới", () => {
    const r = ok(resolve({ year: "2026", month: "5" }, "cutoff"));
    expect(r.from).toBeNull();
    expect(iso(r.to)).toBe("2026-05-31");
  });

  it("chỉ ?year= → preset năm ở cả hai chế độ", () => {
    for (const mode of ["month", "cutoff"] as const) {
      const r = ok(resolve({ year: "2026" }, mode));
      expect(r.preset).toBe("year");
      expect([iso(r.from), iso(r.to)]).toEqual(["2026-01-01", "2026-12-31"]);
    }
  });

  it("?month xấu ở URL cũ → error, không ném", () => {
    expect(resolve({ year: "2026", month: "13" }, "month")).toHaveProperty("error");
    expect(resolve({ year: "2026", month: "13" }, "cutoff")).toHaveProperty("error");
  });
});

describe("windowSchema / parseReportWindow", () => {
  it("nhận null hai đầu và ISO hợp lệ", () => {
    expect(windowSchema.safeParse({ from: null, to: null }).success).toBe(true);
    const w = parseReportWindow({ from: "2026-05-27", to: "2026-06-26" });
    expect("error" in w).toBe(false);
    if (!("error" in w)) expect([iso(w.from), iso(w.to)]).toEqual(["2026-05-27", "2026-06-26"]);
  });

  it("từ chối sai định dạng, ngày không tồn tại, from > to, thiếu khoá", () => {
    expect(parseReportWindow({ from: "27/05/2026", to: null })).toHaveProperty("error");
    expect(parseReportWindow({ from: "2026-02-30", to: null })).toHaveProperty("error");
    expect(parseReportWindow({ from: "2026-06-26", to: "2026-05-27" })).toHaveProperty("error");
    expect(parseReportWindow({ from: "2026-06-26" })).toHaveProperty("error");
    expect(parseReportWindow(null)).toHaveProperty("error");
  });
});
