import { describe, expect, it } from "vitest";
import { inferBlockRanges } from "../block-chain";
import { resolveBlockDate } from "../dirty-date";
import { day, iso, textCell } from "./fixture-builders";

const range = (r: { from: Date; to: Date } | null) => (r ? `${iso(r.from)}→${iso(r.to)}` : null);

describe("inferBlockRanges", () => {
  it("Xi măng Anh Thư: khối nhãn 26/4→26/5 chứa 27/07 được xếp lại theo chuỗi Tổng nợ", () => {
    const res = inferBlockRanges([
      { labelFrom: day(2026, 4, 1), labelTo: day(2026, 4, 26), carryIn: 22_230_000, totalDebt: 31_830_000 },
      { labelFrom: day(2026, 4, 26), labelTo: day(2026, 5, 26), carryIn: 31_830_000, totalDebt: 11_430_000 },
      { labelFrom: day(2026, 4, 26), labelTo: day(2026, 5, 26), carryIn: 11_430_000, totalDebt: 15_955_000 },
    ]);
    expect(res.map((r) => range(r.range))).toEqual([
      "2026-04-01→2026-04-26",
      "2026-04-27→2026-05-26",
      "2026-05-27→2026-06-26",
    ]);
    expect(res[2]).toMatchObject({ source: "chain", chained: true, labelIssue: "stale", open: false });
    // Ngày 27/07 chỉ có một ứng viên: nhận, kèm cảnh báo ngoài biên thực.
    const date = resolveBlockDate(textCell("27/07/2026"), { range: res[2].range!, open: false });
    expect(date).toMatchObject({ status: "resolved", outside: true });
  });

  it("Lộc Tài MN2: khối lặp nhãn 27/09→26/10 được nhận là khối đang mở 27/10→26/11", () => {
    const res = inferBlockRanges([
      { labelFrom: day(2026, 9, 27), labelTo: day(2026, 10, 26), carryIn: 0, totalDebt: 261_780_000 },
      { labelFrom: day(2026, 9, 27), labelTo: day(2026, 10, 26), carryIn: 261_780_000, totalDebt: 263_180_000 },
    ]);
    expect(res[0]).toMatchObject({ source: "label", open: false });
    expect(range(res[1].range)).toBe("2026-10-27→2026-11-26");
    expect(res[1]).toMatchObject({ chained: true, open: true, labelIssue: "stale" });
  });

  it("nhãn đảo ngược được sửa thành ngày 26 đầu tiên sau from", () => {
    const [single] = inferBlockRanges([
      { labelFrom: day(2026, 8, 27), labelTo: day(2026, 7, 26), carryIn: 92_870_000, totalDebt: 62_684_400 },
    ]);
    expect(range(single.range)).toBe("2026-08-27→2026-09-26");
    expect(single).toMatchObject({ source: "label-fixed", labelIssue: "reversed" });
  });

  it("Gạch NH MN: khối nối chuỗi có nhãn đảo ngược bắt đầu sau khối trước, kéo dài tới 26/09", () => {
    const res = inferBlockRanges([
      { labelFrom: day(2026, 6, 27), labelTo: day(2026, 7, 26), carryIn: 57_620_000, totalDebt: 92_870_000 },
      { labelFrom: day(2026, 8, 27), labelTo: day(2026, 7, 26), carryIn: 92_870_000, totalDebt: 62_684_400 },
    ]);
    expect(range(res[1].range)).toBe("2026-07-27→2026-09-26");
    expect(res[1]).toMatchObject({ source: "chain-label", labelIssue: "reversed" });
  });

  it("chuỗi đứt thì dùng nhãn; thiếu nhãn ở khối đầu thì không suy được biên", () => {
    const res = inferBlockRanges([
      { labelFrom: day(2026, 5, 1), labelTo: day(2026, 5, 26), carryIn: 0, totalDebt: 18_845_136 },
      { labelFrom: day(2026, 5, 26), labelTo: day(2026, 6, 26), carryIn: 18_846_136, totalDebt: 39_523_807 },
    ]);
    expect(res[1]).toMatchObject({ chained: false, source: "label" });
    expect(range(res[1].range)).toBe("2026-05-26→2026-06-26");
    expect(inferBlockRanges([{ labelFrom: null, labelTo: null, carryIn: null, totalDebt: null }])[0].range).toBeNull();
  });
});
