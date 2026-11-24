import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { dtLineKeyOf, type DtLine } from "@/lib/du-an/dt-hd-tt/keys";
import { planDtSync, type ErpEstimate } from "../dt-sync-plan";
import { classifyActualFormula } from "../formula-tags";
import { normalizeMst } from "../read-mapping-sheets";
import { parseDmyText, WorkbookReader } from "../workbook-cells";

describe("parseDmyText / normalizeMst", () => {
  it("đọc ngày dd/mm/yyyy kể cả lẫn trong số phiếu, từ chối ngày sai", () => {
    expect(parseDmyText("14/01/2026")?.toISOString()).toBe("2026-01-14T00:00:00.000Z");
    expect(parseDmyText("PC03 Đoàn; 14/01/2026 ")?.toISOString()).toBe("2026-01-14T00:00:00.000Z");
    expect(parseDmyText("31/02/2026")).toBeNull();
    expect(parseDmyText("15/08/206")).toBeNull();
  });
  it("đệm số 0 đầu MST bị Excel làm rơi", () => {
    expect(normalizeMst(200758915)).toBe("0200758915");
    expect(normalizeMst("0200758915")).toBe("0200758915");
    expect(normalizeMst("")).toBe("");
  });
});

describe("classifyActualFormula", () => {
  const ws = XLSX.utils.aoa_to_sheet([]);
  for (let r = 1; r <= 20; r++) ws[`L${r}`] = { t: "s", v: r % 2 === 0 ? "Đại ngàn" : "A Hiếu" };
  ws["!ref"] = "A1:L20";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Thực Tế Nhập");
  const reader = new WorkbookReader(wb);

  it("SUM + SUMIFS theo nhãn → thực tế nhập, đúng tập dòng", () => {
    const r = classifyActualFormula("SUM('Thực Tế Nhập'!$G$1:$G$3)+SUMIFS('Thực Tế Nhập'!$G$10:$G$14,'Thực Tế Nhập'!$L$10:$L$14,\"*ngàn*\")", reader);
    expect(r).toMatchObject({ basis: "receipts", receiptRows: [1, 2, 3, 10, 12, 14] });
  });
  it("HĐ × (1 + VAT) theo MST → invoices; SUMIFS sổ chi theo mục → payments", () => {
    expect(classifyActualFormula("(SUMIFS('Hóa Đơn'!$I$2:$I$1022,'Hóa Đơn'!$D$2:$D$1022,\"0200453462\"))*(1+$E$3)", reader)).toMatchObject({ basis: "invoices", invoiceMst: "0200453462" });
    expect(classifyActualFormula("SUMIFS('Chi Thực Tế'!$K$8:$K$153,'Chi Thực Tế'!$H$8:$H$153,\"II\")", reader)).toMatchObject({ basis: "payments", paymentSection: "II" });
  });
  it("dạng lạ → chốt tay", () => {
    expect(classifyActualFormula("SUM('Thực Tế Nhập'!$G$1:$G$3)-1500000", reader).basis).toBe("manual");
    expect(classifyActualFormula("=(292852072+6360336)", reader).basis).toBe("manual");
    expect(classifyActualFormula(undefined, reader).basis).toBe("manual");
  });
});

describe("planDtSync", () => {
  const D = (n: number) => new Prisma.Decimal(n);
  const file = (name: string, unit: string, kind: "VL" | "NC" | "MTC", qty: number, value: number, stt: string): DtLine => ({
    key: dtLineKeyOf(name, unit, kind), kind, itemName: name, unit, qty: D(qty), value: D(value), unitPrice: null,
    estimateIds: [], primary: { estimateId: 0, categoryId: 0, itemCode: stt },
  });
  const erp = (id: number, categoryId: number, code: string, name: string, unit: string, qty: number, total: number): ErpEstimate => ({
    id, categoryId, categoryCode: code, itemCode: `E${id}`, itemName: name, unit, qty, totalVnd: total, materialGroupId: 7, remainingInvoiceOverrideVnd: null,
  });
  const categories = [{ id: 1, code: "HM1-VL" }, { id: 2, code: "HM1-NC" }, { id: 3, code: "HM2-VL" }];

  it("giữ dòng bằng nhau, thay dòng khác số, nhận đổi tên, thêm và bỏ", () => {
    const plan = planDtSync(
      [
        file("Cát vàng", "m3", "VL", 10, 5_600_000, "4"),
        file("Thanh cái Cu", "hệ", "VL", 2, 200_000, "231"),
        file("Gạch không nung 6x10,5x22", "viên", "VL", 100, 148_000, "80"),
        file("Vật liệu khác", "%", "VL", 0, 64_294_538, "BS2"),
      ],
      [
        erp(1, 1, "HM1-VL", "Cát vàng", "m3", 4, 2_240_000),
        erp(2, 3, "HM2-VL", "Cát vàng", "m3", 6, 3_360_000),
        erp(3, 1, "HM1-VL", "Thanh cái Cu", "hệ", 3, 300_000),
        erp(4, 1, "HM1-VL", "Gạch đặc không nung", "viên", 100, 148_000),
        erp(5, 1, "HM1-VL", "Vữa M250", "m3", 3, 2_910_000),
        erp(6, 2, "HM1-NC", "Nhân công", "công", 1, 1),
      ],
      categories,
    );
    expect(plan.kept).toBe(1); // cát vàng 10 m³ = 4 + 6
    expect(plan.ops.map((o) => `${o.op}:${o.name}`).sort()).toEqual([
      "add:Vật liệu khác", "remove:Nhân công", "remove:Vữa M250", "rename:Gạch không nung 6x10,5x22", "replace:Thanh cái Cu",
    ]);
    expect(plan.supersedeEstimateIds).toEqual([3, 4, 5, 6]);
    const thanhCai = plan.insert.find((i) => i.itemName === "Thanh cái Cu")!;
    expect(thanhCai).toMatchObject({ categoryId: 1, itemCode: "E3", materialGroupId: 7 });
    expect(thanhCai.totalVnd.toNumber()).toBe(200_000);
    expect(plan.insert.find((i) => i.itemName.startsWith("Gạch"))).toMatchObject({ itemCode: "E4" });
    const added = plan.insert.find((i) => i.itemName === "Vật liệu khác")!;
    expect(added).toMatchObject({ categoryId: 1, itemCode: "DT-BS2" });
    expect(added.totalVnd.toNumber()).toBe(64_294_538);
  });
});
