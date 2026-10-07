import { describe, it, expect, beforeEach, vi } from "vitest";

const mockDb = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));

import {
  querySummary,
  queryMonthlyByParty,
  queryWindowByParty,
  calendarMonthWindow,
  queryCurrentBalance,
  queryDebtMatrix,
} from "@/lib/ledger/ledger-aggregations";

beforeEach(() => vi.resetAllMocks());

describe("querySummary", () => {
  it("maps a raw row into a SummaryRow with Decimal fields", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        entity_id: 1,
        party_id: 2,
        project_id: null,
        opening_tt: 100,
        opening_hd: 90,
        lay_hang_tt: 50,
        lay_hang_hd: 40,
        thanh_toan_tt: 30,
        thanh_toan_hd: 20,
        dieu_chinh_tt: 0,
        dieu_chinh_hd: 0,
        balance_tt: 120,
        balance_hd: 110,
      },
    ]);
    const [row] = await querySummary("material", { entityId: 1 });
    expect(row.entityId).toBe(1);
    expect(row.partyId).toBe(2);
    expect(row.projectId).toBeNull();
    expect(row.balanceTt.toNumber()).toBe(120);
  });
});

describe("queryMonthlyByParty", () => {
  it("derives closing balances from opening + lay - tra", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { party_id: 7, open_tt: 100, open_hd: 100, lay_tt: 60, lay_hd: 60, tra_tt: 25, tra_hd: 25 },
    ]);
    const [row] = await queryMonthlyByParty("material", 2026, 5, 1);
    expect(row.partyId).toBe(7);
    expect(row.closingTt.toNumber()).toBe(135);
    expect(row.closingHd.toNumber()).toBe(135);
  });
});

describe("queryCurrentBalance", () => {
  it("sums opening balance and transaction balance", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([{ balance_tt: 200, balance_hd: 180 }])
      .mockResolvedValueOnce([{ balance_tt: 50, balance_hd: 40 }]);
    const bal = await queryCurrentBalance("material", 1, 2, null);
    expect(bal.tt.toNumber()).toBe(250);
    expect(bal.hd.toNumber()).toBe(220);
  });

  it("treats a missing opening balance row as zero", async () => {
    mockDb.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ balance_tt: 50, balance_hd: 40 }]);
    const bal = await queryCurrentBalance("material", 1, 2, null);
    expect(bal.tt.toNumber()).toBe(50);
  });
});

describe("queryDebtMatrix", () => {
  it("groups rows by party and sums per-entity cells into totals", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      {
        entity_id: 1,
        party_id: 9,
        open_tt: 10, open_hd: 10,
        lay_tt: 5, lay_hd: 5,
        tra_tt: 2, tra_hd: 2,
        close_tt: 13, close_hd: 13,
      },
      {
        entity_id: 2,
        party_id: 9,
        open_tt: 20, open_hd: 20,
        lay_tt: 0, lay_hd: 0,
        tra_tt: 4, tra_hd: 4,
        close_tt: 16, close_hd: 16,
      },
    ]);
    const matrix = await queryDebtMatrix("material", {});
    expect(matrix).toHaveLength(1);
    expect(Object.keys(matrix[0].cells).sort()).toEqual(["1", "2"]);
    expect(matrix[0].totals.openTt).toBe(30);
    expect(matrix[0].totals.closeTt).toBe(29);
  });
});

describe("thue_hd classification in SQL", () => {
  /** Gộp toàn bộ chuỗi SQL của lần gọi $queryRaw gần nhất (kể cả fragment lồng). */
  const sqlOf = () => {
    const [strings, ...values] = mockDb.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const flatten = (v: unknown): string =>
      v && typeof v === "object" && "strings" in (v as object)
        ? (v as { strings: string[]; values: unknown[] }).strings
            .map((s, i) => s + (i < (v as { values: unknown[] }).values.length ? flatten((v as { values: unknown[] }).values[i]) : ""))
            .join("")
        : "?";
    return strings.map((s, i) => s + (i < values.length ? flatten(values[i]) : "")).join("");
  };

  it("querySummary counts thue_hd inside the lay hang bucket", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await querySummary("material", {});
    expect(sqlOf()).toContain("'thue_hd'");
  });

  it("queryMonthlyByParty and queryDebtMatrix use the shared increase/decrease CASE", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryMonthlyByParty("material", 2026, 5, 1);
    expect(sqlOf()).toContain("'thue_hd'");
    mockDb.$queryRaw.mockClear();
    await queryDebtMatrix("material", {});
    expect(sqlOf()).toContain("'thue_hd'");
    expect(sqlOf()).toContain("'dieu_chinh'");
  });
});

describe("window semantics", () => {
  /** Mọi tham số bind của lần gọi $queryRaw đầu tiên (kể cả trong fragment lồng). */
  const paramsOf = (): unknown[] => {
    const [, ...values] = mockDb.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const out: unknown[] = [];
    const walk = (v: unknown) => {
      if (v && typeof v === "object" && "strings" in (v as object)) {
        for (const inner of (v as { values: unknown[] }).values) walk(inner);
      } else out.push(v);
    };
    values.forEach(walk);
    return out;
  };
  const sqlText = () => {
    const [strings] = mockDb.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    return strings.join("?");
  };
  const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("calendarMonthWindow trả ngày đầu và ngày cuối tháng UTC, kể cả tháng 2 nhuận", () => {
    const w = calendarMonthWindow(2028, 2);
    expect([w.from.toISOString(), w.to.toISOString()]).toEqual([
      "2028-02-01T00:00:00.000Z",
      "2028-02-29T00:00:00.000Z",
    ]);
    expect(() => calendarMonthWindow(2026, 13)).toThrow();
  });

  it("queryWindowByParty dùng cận trên loại trừ = to + 1 ngày và cận dưới from", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryWindowByParty("material", { from: D("2026-05-27"), to: D("2026-06-26"), entityId: 1 });
    const times = paramsOf().filter((p): p is Date => p instanceof Date).map((p) => p.toISOString());
    expect(times).toContain("2026-05-27T00:00:00.000Z"); // from
    expect(times).toContain("2026-06-27T00:00:00.000Z"); // to + 1 ngày, loại trừ
    expect(times).not.toContain("2026-06-26T00:00:00.000Z");
    const sql = sqlText();
    expect(sql).toContain("date < ");
    expect(sql).not.toContain("date <=");
  });

  it("from/to null ⇒ truyền null (không giới hạn), số dư đầu kỳ chỉ còn số dư ban đầu", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryWindowByParty("material", { from: null, to: null, entityId: 1 });
    expect(paramsOf().some((p) => p instanceof Date)).toBe(false);
    expect(sqlText()).toContain("IS NOT NULL");
  });

  it("queryMonthlyByParty là cửa sổ tháng (cuối tháng + 1 ngày = ngày 1 tháng sau)", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryMonthlyByParty("material", 2026, 5, 1);
    const times = paramsOf().filter((p): p is Date => p instanceof Date).map((p) => p.toISOString());
    expect(times).toContain("2026-05-01T00:00:00.000Z");
    expect(times).toContain("2026-06-01T00:00:00.000Z");
  });

  it("queryWindowByParty tính cuối kỳ = đầu kỳ + tăng − giảm", async () => {
    mockDb.$queryRaw.mockResolvedValue([
      { party_id: 3, open_tt: 310605120, open_hd: 0, lay_tt: 44400000, lay_hd: 0, tra_tt: 100500000, tra_hd: 0 },
    ]);
    const [row] = await queryWindowByParty("material", { from: D("2026-04-27"), to: D("2026-05-26"), entityId: 1 });
    expect(row.closingTt.toNumber()).toBe(254505120);
  });

  it("queryDebtMatrix truyền from và to + 1 ngày, đầu kỳ cộng Σ có dấu trước from", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryDebtMatrix("material", { from: D("2026-05-27"), to: D("2026-06-26") });
    const times = paramsOf().filter((p): p is Date => p instanceof Date).map((p) => p.toISOString());
    expect(times).toContain("2026-05-27T00:00:00.000Z");
    expect(times).toContain("2026-06-27T00:00:00.000Z");
    expect(sqlText()).toContain("open_tx_tt");
  });

  it("queryDebtMatrix không truyền cửa sổ ⇒ không có tham số ngày", async () => {
    mockDb.$queryRaw.mockResolvedValue([]);
    await queryDebtMatrix("material", {});
    expect(paramsOf().some((p) => p instanceof Date)).toBe(false);
  });
});
