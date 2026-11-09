import { describe, expect, it } from "vitest";
import { dateCandidates, parseNlDate, resolveBlockDate, resolveNeighborDate } from "../dirty-date";
import { dateDecisionKey, settleDate } from "../date-settlement";
import { IssueSink } from "../parse-issues";
import { dateCell, day, iso, textCell } from "./fixture-builders";

const block = (from: Date, to: Date, open = false) => ({ range: { from, to }, open });

describe("dateCandidates", () => {
  it("ô ngày có ngày ≤ 12 sinh hai ứng viên (giữ nguyên và đảo ngày/tháng)", () => {
    const { candidates } = dateCandidates(dateCell(2026, 11, 4));
    expect(candidates.map(iso)).toEqual(["2026-04-11", "2026-11-04"]);
  });

  it("ô ngày có ngày > 12 chỉ có một ứng viên; ngày = tháng cũng chỉ một", () => {
    expect(dateCandidates(dateCell(2026, 4, 13)).candidates.map(iso)).toEqual(["2026-04-13"]);
    expect(dateCandidates(dateCell(2026, 10, 10)).candidates.map(iso)).toEqual(["2026-10-10"]);
  });

  it("ô chữ đọc d/m/yyyy, chữ không phải ngày thì không có ứng viên", () => {
    expect(dateCandidates(textCell("06/4/2026")).candidates.map(iso)).toEqual(["2026-04-06"]);
    expect(dateCandidates(textCell("3,4,5/4/2026")).candidates).toEqual([]);
  });
});

describe("resolveBlockDate", () => {
  it("ô ngày (2026, 11, 4) trong khối 01/04→27/04 → 11/04/2026", () => {
    const res = resolveBlockDate(dateCell(2026, 11, 4), block(day(2026, 4, 1), day(2026, 4, 27)));
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") expect(iso(res.date)).toBe("2026-04-11");
  });

  it('ô "08/12/2026" (ô ngày lưu 08/12) trong khối 27/07→26/08 → 12/08/2026', () => {
    const res = resolveBlockDate(dateCell(2026, 12, 8), block(day(2026, 7, 27), day(2026, 8, 26)));
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") expect(iso(res.date)).toBe("2026-08-12");
  });

  it("chữ 27/10/2026 giữ nguyên (sát biên khối 27/09→26/10, không cảnh báo)", () => {
    const res = resolveBlockDate(textCell("27/10/2026"), block(day(2026, 9, 27), day(2026, 10, 26)));
    expect(res).toMatchObject({ status: "resolved", outside: false });
    if (res.status === "resolved") expect(iso(res.date)).toBe("2026-10-27");
  });

  it("19/4/2025 trong khối 4/2026 → 19/04/2026, kèm sửa năm", () => {
    const res = resolveBlockDate(textCell("19/4/2025"), block(day(2026, 4, 1), day(2026, 4, 27)));
    expect(res.status).toBe("resolved");
    if (res.status === "resolved") {
      expect(iso(res.date)).toBe("2026-04-19");
      expect(res.yearFix).toMatchObject({ kind: "off-year", originalYear: "2025", usedYear: 2026 });
    }
  });

  it("14/09/20260 → 14/09/2026 và 26/10/206 → 26/10/2026", () => {
    const r1 = resolveBlockDate(textCell("14/09/20260"), block(day(2026, 8, 27), day(2026, 9, 26)));
    const r2 = resolveBlockDate(textCell("26/10/206"), block(day(2026, 9, 27), day(2026, 10, 26)));
    expect(r1.status === "resolved" && iso(r1.date)).toBe("2026-09-14");
    expect(r1.yearFix?.kind).toBe("five-digit-year");
    expect(r2.status === "resolved" && iso(r2.date)).toBe("2026-10-26");
    expect(r2.yearFix?.kind).toBe("short-year");
  });

  it('ô "10/11/2026" trong khối đang mở → quyết định ngày', () => {
    const res = resolveBlockDate(dateCell(2026, 11, 10), block(day(2026, 10, 27), day(2026, 11, 26), true));
    expect(res).toMatchObject({ status: "ambiguous", reason: "open-block" });
    expect(res.candidates.map(iso)).toEqual(["2026-10-11", "2026-11-10"]);
  });

  it("khối chạm mốc mà hai ứng viên nằm hai phía mốc → quyết định ngày", () => {
    const res = resolveBlockDate(dateCell(2026, 11, 10), block(day(2026, 9, 27), day(2026, 10, 26)));
    expect(res).toMatchObject({ status: "ambiguous", reason: "straddles-cutover" });
  });

  it("cả hai ứng viên nằm trong biên → quyết định ngày", () => {
    const res = resolveBlockDate(dateCell(2026, 5, 4), block(day(2026, 4, 1), day(2026, 6, 26)));
    expect(res).toMatchObject({ status: "ambiguous", reason: "both-in-range" });
  });

  it("chỉ một ứng viên nhưng ngoài biên → nhận kèm cờ ngoài khối, không chặn", () => {
    const res = resolveBlockDate(textCell("27/07/2026"), block(day(2026, 5, 27), day(2026, 6, 26)));
    expect(res).toMatchObject({ status: "resolved", outside: true });
    if (res.status === "resolved") expect(iso(res.date)).toBe("2026-07-27");
  });
});

describe("resolveNeighborDate (Vật tư ngày)", () => {
  it("chọn ứng viên nằm giữa dòng trước và dòng sau đã giải", () => {
    const res = resolveNeighborDate(dateCell(2026, 3, 10), day(2026, 9, 30), day(2026, 10, 13));
    expect(res.status === "resolved" && iso(res.date)).toBe("2026-10-03");
  });

  it("không phân định được → quyết định ngày", () => {
    const res = resolveNeighborDate(dateCell(2026, 5, 4), day(2026, 4, 1), day(2026, 5, 20));
    expect(res).toMatchObject({ status: "ambiguous", reason: "neighbors-ambiguous" });
  });
});

describe("settleDate", () => {
  const ref = { file: "a.xlsx", sheet: "Đối chiếu công nợ", cell: "B27", raw: "11/10/26" };
  const ambiguous = resolveBlockDate(dateCell(2026, 11, 10), block(day(2026, 10, 27), day(2026, 11, 26), true));

  it("ngày mơ hồ thành quyết định có khóa date:<file>:<sheet>!<ô>", () => {
    const sink = new IssueSink();
    const settled = settleDate(ambiguous, { sink, ref, choices: {}, context: "khối" });
    expect(settled.date).toBeNull();
    expect(settled.decisionKey).toBe("date:a.xlsx:Đối chiếu công nợ!B27");
    expect(sink.dateDecisions).toHaveLength(1);
    expect(sink.dateDecisions[0]).toMatchObject({ key: dateDecisionKey(ref), chosen: null });
  });

  it("áp lựa chọn người dùng truyền lại", () => {
    const sink = new IssueSink();
    const choices = { [dateDecisionKey(ref)]: "2026-11-10" };
    const settled = settleDate(ambiguous, { sink, ref, choices, context: "khối" });
    expect(iso(settled.date)).toBe("2026-11-10");
    expect(iso(sink.dateDecisions[0].chosen)).toBe("2026-11-10");
    expect(sink.blockingErrors).toHaveLength(0);
  });

  it("lựa chọn sai định dạng là lỗi chặn; ô không đọc được là lỗi chặn kèm vị trí", () => {
    const sink = new IssueSink();
    settleDate(ambiguous, { sink, ref, choices: { [dateDecisionKey(ref)]: "11/10/2026" }, context: "khối" });
    expect(sink.blockingErrors[0].code).toBe("date-choice-invalid");

    const sink2 = new IssueSink();
    const bad = resolveBlockDate(textCell("3,4,5/4/2026"), block(day(2026, 3, 26), day(2026, 4, 27)));
    const badRef = { ...ref, raw: "3,4,5/4/2026" };
    const settled = settleDate(bad, { sink: sink2, ref: badRef, choices: {}, context: "khối" });
    expect(settled.date).toBeNull();
    expect(sink2.blockingErrors[0]).toMatchObject({ code: "date-invalid", ref: badRef });
  });
});

describe("parseNlDate", () => {
  it("sửa năm 0206 theo năm chủ đạo, ô ngày giữ nguyên không đảo", () => {
    expect(parseNlDate(textCell("15/08/0206"), 2026)).toEqual({ date: day(2026, 8, 15), yearFixed: true });
    expect(parseNlDate(dateCell(2026, 1, 2), 2026)).toEqual({ date: day(2026, 1, 2), yearFixed: false });
    expect(parseNlDate(textCell("abc"), 2026)).toBeNull();
  });
});
