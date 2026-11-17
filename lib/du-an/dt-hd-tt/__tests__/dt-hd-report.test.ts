import { describe, expect, it } from "vitest";
import { actualByCounterparty } from "../actual-per-counterparty";
import { buildBookIndex } from "../book-index";
import { buildDtHdReport } from "../dt-hd-report";
import { dtHdStatus } from "../dt-hd-status";
import { fixture } from "./report-fixture";

describe("actualByCounterparty", () => {
  it("lấy thực tế theo nguồn của từng đầu mối", () => {
    const inp = fixture();
    const a = actualByCounterparty(inp, buildBookIndex(inp));
    expect(a.get(11)).toBe(16_470_000); // Σ thực tế nhập gắn Đại Ngàn
    expect(a.get(12)).toBeCloseTo(70_200_000, 4); // HĐ 65.000.000 × 1,08
    expect(a.get(13)).toBe(9_000_000); // chốt tay
    expect(a.get(15)).toBe(3_000_000); // mục I sổ chi
    expect(a.get(16)).toBe(2_000_000); // mục II sổ chi
  });

  it("chưa chốt thực tế → null", () => {
    const inp = fixture();
    inp.counterparties[2].actualManualVnd = null;
    expect(actualByCounterparty(inp, buildBookIndex(inp)).get(13)).toBeNull();
  });
});

describe("dtHdStatus — quy tắc của file đội", () => {
  const s = (qtyDt: number, valueDt: number, qtyHd: number, valueHd: number, missingFactor = false) =>
    dtHdStatus({ qtyDt, valueDt, qtyHd, valueHd, missingFactor });
  it("áp đúng thứ tự và sai số 2 %", () => {
    expect(s(0, 10, 0, 0)).toBe("Chưa có HĐ");
    expect(s(0, 10, 0, 5)).toBe("Theo dõi theo giá trị");
    expect(s(0, 0, 0, 0)).toBe("");
    expect(s(100, 10, 0, 0)).toBe("Chưa có HĐ");
    expect(s(100, 10, 50, 5, true)).toBe("Chưa kết luận (thiếu hệ số)");
    expect(s(100, 10, 0, 5)).toBe("Theo dõi theo giá trị");
    expect(s(100, 10, 103, 5)).toBe("Vượt");
    expect(s(100, 10, 102, 5)).toBe("Đủ");
    expect(s(100, 10, 98, 5)).toBe("Đủ");
    expect(s(100, 10, 97, 5)).toBe("Còn thiếu");
  });
});

describe("buildDtHdReport", () => {
  const r = buildDtHdReport(fixture());
  const block = (name: string) => r.blocks.find((b) => b.name === name)!;

  it("khối Đại Ngàn: dòng thép trải 2 hạng mục, HĐ gán chéo sang nhóm BT tách ở cột O", () => {
    const b = block("Đại Ngàn");
    const thep = b.groups[0].lines[0];
    expect(thep.valueDt).toBe(22_500_000);
    expect(thep.qtyDt).toBe(1500);
    expect(thep.qtyHd).toBe(900);
    expect(thep.qtyShort).toBe(600);
    expect(thep.status).toBe("Còn thiếu");
    expect(b.invoiceTotal).toBe(14_500_000);
    expect(b.inOwnGroups).toBe(13_500_000);
    expect(b.crossAssigned).toBe(1_000_000);
    expect(b.tieOut.ok).toBe(false); // file: "⚠ Lệch" khi có HĐ gán chéo
    expect(b.actualExVat).toBeCloseTo(15_250_000, 4);
    expect(b.remainingVsActual).toBeCloseTo(750_000, 4);
  });

  it("khối Bê tông: dòng thiếu hệ số, HĐ chỉ gán tới nhóm của NCC khác cộng vào nhóm", () => {
    const b = block("Bê tông HP");
    const g = b.groups[0];
    expect(g.lines[0].status).toBe("Chưa kết luận (thiếu hệ số)");
    expect(g.lines[0].qtyHd).toBeNull();
    expect(g.groupOnly.map((i) => i.invoiceLineId)).toEqual([3]);
    expect(g.valueHd).toBe(66_000_000);
    expect(b.invoiceTotal).toBe(65_000_000);
  });

  it("đầu mối chỉ có HĐ ngoài dự toán vẫn có khối; nhóm không có NCC phụ trách vào 'Chưa có đầu mối'", () => {
    expect(block("Sobek").outsideDt).toBe(3_000_000);
    const none = block("Chưa có đầu mối");
    expect(none.groups.map((g) => g.code).sort()).toEqual(["MAY", "NC-XAY"]);
    expect(none.invoiceTotal).toBe(4_000_000);
    expect(none.tieOut.ok).toBe(true);
    expect(r.blocks.some((x) => x.name === "Vật tư phụ")).toBe(false);
  });

  it("Phần B và kiểm tổng: dòng chưa gán / ngoài DT vẫn được cộng", () => {
    expect(r.partB.map((p) => p.supplierName)).toEqual(["Chương Dương", "Sobek"]);
    expect(r.partBTotal).toBe(3_000_000);
    expect(r.grandCheck).toMatchObject({ expected: 86_500_000, actual: 86_500_000, ok: true });
  });
});
