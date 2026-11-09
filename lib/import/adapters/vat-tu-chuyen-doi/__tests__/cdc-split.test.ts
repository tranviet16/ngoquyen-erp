import { describe, expect, it } from "vitest";
import { splitCdcBalance } from "../cdc-split";

const sorted = (list: { projectKey: string; tt: number; hd: number }[]) =>
  list.map(({ projectKey, tt, hd }) => ({ projectKey, tt, hd })).sort((a, b) => a.projectKey.localeCompare(b.projectKey));

describe("splitCdcBalance", () => {
  it("Nam Hương CDC 153.936.700 / 27.734.400 → Tân Lộc CDC 109.336.700 / 0 và ĐVP-CDC 44.600.000 / 27.734.400", () => {
    const r = splitCdcBalance(
      { tt: 153_936_700, hd: 27_734_400 },
      [
        { projectKey: "tan-loc", label: "Tân lộc CDC", debtTt: 109_336_700, debtHd: 0 },
        { projectKey: "dvp", label: "ĐVP -CDC", debtTt: 44_600_000, debtHd: 27_734_400 },
      ],
      null,
    );
    expect(r.reason).toBeNull();
    expect(r.unresolved).toBe(false);
    expect(r.diff).toEqual({ tt: 0, hd: 0 });
    expect(sorted(r.allocations)).toEqual([
      { projectKey: "dvp", tt: 44_600_000, hd: 27_734_400 },
      { projectKey: "tan-loc", tt: 109_336_700, hd: 0 },
    ]);
  });

  it("gộp nhiều nhãn CSV về cùng công trình (\"ĐVP -CDC\" và \"ĐVP CDC\")", () => {
    const r = splitCdcBalance(
      { tt: 30_000_000, hd: 0 },
      [
        { projectKey: "dvp", label: "ĐVP -CDC", debtTt: 20_000_000, debtHd: 0 },
        { projectKey: "dvp", label: "ĐVP CDC", debtTt: 10_000_000, debtHd: 0 },
      ],
      null,
    );
    expect(r.allocations).toEqual([{ projectKey: "dvp", labels: ["ĐVP -CDC", "ĐVP CDC"], tt: 30_000_000, hd: 0 }]);
  });

  it("chênh trong dung sai ±1 đồng cộng vào đích đầu tiên, tổng tách đúng bằng Số Dư", () => {
    const r = splitCdcBalance({ tt: 100.5, hd: 0 }, [{ projectKey: "a", label: "A CDC", debtTt: 100, debtHd: 0 }], null);
    expect(r.reason).toBeNull();
    expect(r.allocations[0].tt).toBe(100.5);
  });

  it("tổng tách lệch Số Dư → cần quyết định; chưa chọn thì không phân bổ phần chênh", () => {
    const r = splitCdcBalance(
      { tt: 433_854_400, hd: 0 },
      [{ projectKey: "tan-loc", label: "Tân lộc CDC", debtTt: 433_854_400, debtHd: 273 }],
      null,
    );
    expect(r.reason).toBe("mismatch");
    expect(r.unresolved).toBe(true);
    expect(r.diff).toEqual({ tt: 0, hd: -273 });
  });

  it("đã chọn công trình nhận phần chênh → phần chênh dồn vào công trình đó", () => {
    const r = splitCdcBalance(
      { tt: 433_854_400, hd: 0 },
      [{ projectKey: "tan-loc", label: "Tân lộc CDC", debtTt: 433_854_400, debtHd: 273 }],
      "tan-loc",
    );
    expect(r.unresolved).toBe(false);
    expect(sorted(r.allocations)).toEqual([{ projectKey: "tan-loc", tt: 433_854_400, hd: 0 }]);
  });

  it("CSV không có dòng CDC → toàn bộ dồn vào công trình được chọn", () => {
    const missing = splitCdcBalance({ tt: 16_570_000, hd: 0 }, [], null);
    expect(missing.reason).toBe("missing-csv");
    expect(missing.unresolved).toBe(true);
    const chosen = splitCdcBalance({ tt: 16_570_000, hd: 0 }, [], "dvp");
    expect(sorted(chosen.allocations)).toEqual([{ projectKey: "dvp", tt: 16_570_000, hd: 0 }]);
  });
});
