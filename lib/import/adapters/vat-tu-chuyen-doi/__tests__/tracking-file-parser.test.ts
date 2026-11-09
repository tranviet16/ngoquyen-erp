import { describe, expect, it } from "vitest";
import { parseTrackingFile } from "../tracking-file-parser";
import { excelDate, iso, workbookBuffer, type FixtureCell } from "./fixture-builders";

const HEADER7: FixtureCell[] = ["STT", "Ngày/tháng/năm", "Loại vật tư", "Khối\n lượng", "ĐVT", "Đơn giá", "Thành tiền"];
const HEADER6: FixtureCell[] = ["STT", "Ngày/tháng/năm", "Khối\n lượng", "ĐVT", "Đơn giá", "Thành tiền"];

function blockHead(project: string, item: string, title: string, header: FixtureCell[], debitCredit = false): FixtureCell[][] {
  const rows: FixtureCell[][] = [["CÔNG TY CP XÂY DỰNG NGÔ QUYỀN"], ["BẢNG ĐỐI CHIẾU CÔNG NỢ"], [`Công trình: ${project}`], [`Tên vật tư: ${item}`], [title], [], header];
  if (debitCredit) rows.push([null, null, null, null, null, null, "Nợ", "Có"]);
  return rows;
}

const signature: FixtureCell[][] = [["Kính đề nghị quý Công ty kiểm tra và ký xác nhận đối chiếu công nợ"], [], []];

/** Bê tông HP × Trại Chuối: khối 27/08→26/09 rồi khối 27/09→26/10 (Tổng nợ 509.563.111). */
function betongTraiChuoi(): Uint8Array {
  const doiChieu: FixtureCell[][] = [
    ...blockHead("Trại Chuối", "Bê tông", "Số công nợ bê tông từ ngày 27/08/2026 đến hết ngày 26/09/2026 như sau:", HEADER7, true),
    [null, "A", "Dư nợ mang sang: Hết 26/8/2026:", null, null, null, 434_992_111],
    [1, "31/08/2026", "BT M200", 11.5, "m3", 1_430_000, 16_445_000],
    [2, "14/09/20260", "Bơm bê tông", 59, "m3", 90_000, 5_310_000],
    [null, "B", "Cộng P/S", null, null, null, 21_755_000],
    [null, "C", "CK (28/08/2026)", null, null, null, 51_240_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, 405_507_111],
    ...signature,
    ...blockHead("Trại Chuối", "Bê tông", "Số công nợ bê tông từ ngày 27/09/2026 đến hết ngày 26/10/2026 như sau:", HEADER7, true),
    [null, "A", "Dư nợ mang sang: Hết 26/9/2026:", null, null, null, 405_507_111],
    [1, excelDate(2026, 9, 10), "BT M250", 8.5, "m3", 1_530_000, 13_005_000],
    [2, "21/10/2026", "BT M300", 9.4, "m3", 1_610_000, 15_134_000],
    [null, null, "Bù cước", 1, "ca", 500_000, 500_000],
    [4, "22/10/2026", "BT M300", 4.7, "m3", 1_610_000, 7_567_000],
    [5, "22/10/2026", "Bù cước", 1, "ca", 500_000, 500_000],
    [6, "23/10/2026", "BT M300", 18, "m3", 1_610_000, 28_980_000],
    [7, "24/10/2026", "BT M300", 36, "m3", 1_610_000, 57_960_000],
    [8, "25/10/2026", "BT M300", 36, "m3", 1_610_000, 57_960_000],
    [9, "26/10/2026", "BT M300", 27, "m3", 1_610_000, 43_470_000],
    [10, "27/10/2026", "BT M300", 18, "m3", 1_610_000, 28_980_000],
    [null, null, null, null, null, null, 0],
    [null, "B", "Cộng P/S", null, null, null, 254_056_000],
    [null, "C", "CK (05/10/2026)", null, null, null, 150_000_000],
    [null, "A+B-C", "Tổng nợ", null, null, null, 509_563_111],
    ...signature,
  ];
  const vatTuNgay: FixtureCell[][] = [
    ["CÔNG TY CP XÂY DỰNG NGÔ QUYỀN"], ["BẢNG THEO DÕI HÀNG NGÀY"], ["Công trình: Trại Chuối"], ["Tên vật tư: Bê tông"],
    ["Ngày chốt khối lượng của tháng: Từ ngày 27/9/2026 đến ngày 26/10/2026"], [],
    ["STT", "Ngày/tháng/năm", "Loại vật tư", "Khối\n lượng", "ĐVT", "Cán bộ vật tư", "Chỉ huy \ncông trường", "Kế toán\n phụ trách"],
    [1, excelDate(2026, 9, 10), "BT M250", 8.5, "m3", "Sơn", "Hùng", "Lan"],
    [2, "27/10/2026", "BT M300", 18, "m3", "Sơn", null, null],
  ];
  return workbookBuffer({ SGV: [[null]], "Vật tư ngày": vatTuNgay, "Vật tư tháng": [["bỏ qua"]], "Đối chiếu công nợ": doiChieu });
}

/** Máy xúc Lộc Tài × Trại Chuối: khối gộp "Trại Chuối + Dải cây xanh" có tiểu mục "Cộng <công trình>". */
function locTaiTraiChuoi(): Uint8Array {
  const doiChieu: FixtureCell[][] = [
    ...blockHead("Trại Chuối + Dải cây xanh", "Máy xúc", "Số công nợ máy xúc từ ngày 26/05/2026 đến hết ngày 26/06/2026 như sau:", HEADER6),
    ["A", null, "Dư nợ mang sang: Hết 26/5/2026", null, null, 21_610_188],
    [1, "22/6/2026", 1, "Ca", 2_600_000, 2_600_000],
    [null, "Cộng Trại Chuối", null, null, null, 2_600_000],
    [1, "19/6/2026", 0.5, "Ca", 3_300_000, 1_650_000],
    [2, "25/6/2026", 0.5, "Ca", 2_600_000, 1_300_000],
    [3, "26/6/2026", 2, "Ca", 3_000_000, 6_000_000],
    [null, "Cộng dải cây xanh", null, null, null, 8_950_000],
    ["B", "Cộng P/S", null, null, null, 2_600_000],
    ["A+B", "Tổng nợ", null, null, null, 24_210_188],
    ...signature,
    ...blockHead("Trại Chuối + Dải cây xanh", "Máy xúc", "Số công nợ máy xúc từ ngày 27/07/2026 đến hết ngày 26/08/2026 như sau:", HEADER6),
    ["A", null, "Dư nợ mang sang: Hết 26/6/2026", null, null, 24_210_188],
    [1, "29/07/2026", 1, "ca", 18_656_000, 18_656_000, "GTGT"],
    [2, "30/7/2026", 0.5, "ca", 2_800_000, 1_400_000],
    [null, null, 1, "ca", 2_800_000, 2_800_000],
    [4, excelDate(2026, 1, 8), 1, "ca", 2_800_000, 2_800_000],
    [5, "18/8/2026", 1160, "Md", 170_000, 197_200_000, "Cọc khoan nhồi D400mm"],
    ["B", "Cộng P/S", null, null, null, 204_200_000],
    ["A+B", "Tổng nợ", null, null, null, 228_410_188],
  ];
  return workbookBuffer({ "Đối chiếu công nợ": doiChieu });
}

/** Máy xúc Lộc Tài × DCX: khối cuối lặp nhãn 27/09→26/10 (đang mở) chứa ô ngày "10/11/2026". */
function locTaiDcxOpenBlock(): Uint8Array {
  const doiChieu: FixtureCell[][] = [
    ...blockHead("Trại Chuối + Dải cây xanh", "Máy xúc", "Số công nợ máy xúc từ ngày 27/09/2026 đến hết ngày 26/10/2026 như sau:", HEADER6),
    ["A", null, null, null, null, 53_700_000],
    [1, "21/10/2026", 1, "ca", 2_800_000, 2_800_000],
    ["B", "Cộng P/S", null, null, null, 2_800_000],
    ["A+B-C", "Tổng nợ", null, null, null, 56_500_000],
    ...signature,
    ...blockHead("Dải cây xanh", "Máy xúc", "Số công nợ máy xúc từ ngày 27/09/2026 đến hết ngày 26/10/2026 như sau:", HEADER6),
    ["A", null, null, null, null, 56_500_000],
    [1, "27/10/2026", 1, "ca", 2_800_000, 2_800_000],
    [2, excelDate(2026, 11, 10), 0.5, "ca", 2_800_000, 1_400_000],
    ["B", "Cộng P/S", null, null, null, 4_200_000],
    ["A+B-C", "Tổng nợ", null, null, null, 60_700_000],
  ];
  return workbookBuffer({ "Đối chiếu công nợ": doiChieu });
}

describe("parseTrackingFile — Bê tông HP × Trại Chuối", () => {
  const path = "Theo Dõi Vật Tư/Trại Chuối/Bê tông Hải Phòng.xlsx";
  const r = parseTrackingFile(betongTraiChuoi(), path);
  const last = r.blocks[1];

  it("NCC theo tên file, công trình theo thư mục; bỏ sheet SGV / Vật tư tháng", () => {
    expect(r).toMatchObject({ supplierHint: "Bê tông Hải Phòng", folder: "Trại Chuối" });
    expect(r.sheetsSkipped).toEqual(["SGV", "Vật tư tháng"]);
    expect(r.blockingErrors).toEqual([]);
    expect(r.dateDecisions).toEqual([]);
  });

  it("khối 27/09→26/10: neo Tổng nợ 509.563.111, chứa dòng 27/10 18 m³ × 1.610.000", () => {
    expect(`${iso(last.range.from)}→${iso(last.range.to)}`).toBe("2026-09-27→2026-10-26");
    expect(last).toMatchObject({ carryIn: 405_507_111, periodTotal: 254_056_000, payments: 150_000_000, totalDebt: 509_563_111, chainedToPrevious: true, open: false });
    const d2710 = r.deliveries.find((d) => d.container === 1 && iso(d.date) === "2026-10-27");
    expect(d2710).toMatchObject({ qty: 18, unit: "m3", unitPrice: 1_610_000, amount: 28_980_000, itemName: "BT M300" });
    expect(d2710?.project.mappingKey).toBe("project-folder:Trại Chuối");
  });

  it("ô ngày đảo (2026-09-10) giải theo biên khối thành 09/10; năm 5 chữ số được sửa", () => {
    expect(r.deliveries.filter((d) => d.container === 1).map((d) => iso(d.date))[0]).toBe("2026-10-09");
    expect(iso(r.deliveries.find((d) => d.itemName === "Bơm bê tông")?.date ?? null)).toBe("2026-09-14");
    expect(r.warnings.some((w) => w.code === "date-year-fixed")).toBe(true);
  });

  it("dòng tiếp nối (không STT, không ngày) lấy ngày dòng trên", () => {
    const cont = r.deliveries.filter((d) => d.itemName === "Bù cước");
    expect(cont.map((d) => iso(d.date))).toEqual(["2026-10-21", "2026-10-22"]);
  });

  it("Vật tư ngày: không giá, kèm CB vật tư / CHCT / KT; ô ngày đảo giải theo phiếu đối chiếu", () => {
    expect(r.dailyRows.map((d) => iso(d.date))).toEqual(["2026-10-09", "2026-10-27"]);
    expect(r.dailyRows[0]).toMatchObject({ source: "vat-tu-ngay", unitPrice: null, amount: null, cbVatTu: "Sơn", chiHuyCt: "Hùng", keToan: "Lan" });
  });
});

describe("parseTrackingFile — khối gộp Lộc Tài", () => {
  const r = parseTrackingFile(locTaiTraiChuoi(), "Theo Dõi Vật Tư/Trại Chuối/Máy xúc Lộc Tài HT.xlsx");
  const byDate = (d: string) => r.deliveries.find((x) => iso(x.date) === d);

  it("22/06 1 ca × 2.600.000 gán Trại Chuối; 19/06, 25/06, 26/06 gán Dải cây xanh qua tiểu mục", () => {
    expect(byDate("2026-06-22")).toMatchObject({ qty: 1, unitPrice: 2_600_000, project: { kind: "label", name: "Trại Chuối", mappingKey: "project-label:Trại Chuối" } });
    for (const d of ["2026-06-19", "2026-06-25", "2026-06-26"]) {
      expect(byDate(d)?.project).toEqual({ kind: "label", name: "dải cây xanh", mappingKey: "project-label:dải cây xanh" });
    }
    expect(r.blocks[0].projectMembers).toEqual(["Trại Chuối", "Dải cây xanh"]);
  });

  it("dòng GTGT 18.656.000 bị loại (liệt kê ở mục thông tin)", () => {
    expect(r.deliveries.some((d) => d.amount === 18_656_000)).toBe(false);
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: "gtgt-line", level: "info" }));
  });

  it("dòng tiếp nối lấy ngày dòng trên; tên vật tư lấy mô tả của dòng, thiếu thì lấy nhãn khối", () => {
    expect(r.deliveries.filter((d) => iso(d.date) === "2026-07-30").map((d) => d.qty)).toEqual([0.5, 1]);
    expect(byDate("2026-08-01")?.itemName).toBe("Máy xúc");
    expect(byDate("2026-08-18")?.itemName).toBe("Cọc khoan nhồi D400mm");
    expect(r.blocks[1]).toMatchObject({ chainedToPrevious: true, totalDebt: 228_410_188 });
  });
});

describe("parseTrackingFile — khối đang mở và lựa chọn ngày", () => {
  const path = "Theo Dõi Vật Tư/Dải Cây Xanh/Máy xúc Lộc Tài HT - DCX.xlsx";

  it('ô "10/11/2026" trong khối đang mở thành quyết định; truyền lựa chọn thì nhận ngày đã chọn', () => {
    const first = parseTrackingFile(locTaiDcxOpenBlock(), path);
    expect(first.blocks[1]).toMatchObject({ open: true, rangeSource: "chain" });
    expect(`${iso(first.blocks[1].range.from)}→${iso(first.blocks[1].range.to)}`).toBe("2026-10-27→2026-11-26");
    expect(first.dateDecisions).toHaveLength(1);
    const decision = first.dateDecisions[0];
    expect(decision).toMatchObject({ key: `date:${path}:Đối chiếu công nợ!B24`, reason: "open-block", chosen: null });
    expect(decision.candidates.map(iso)).toEqual(["2026-10-11", "2026-11-10"]);
    expect(first.deliveries.find((d) => d.dateDecisionKey === decision.key)?.date).toBeNull();

    const second = parseTrackingFile(locTaiDcxOpenBlock(), path, { dateChoices: { [decision.key]: "2026-11-10" } });
    expect(iso(second.dateDecisions[0].chosen)).toBe("2026-11-10");
    expect(iso(second.deliveries.find((d) => d.dateDecisionKey === decision.key)?.date ?? null)).toBe("2026-11-10");
  });
});
