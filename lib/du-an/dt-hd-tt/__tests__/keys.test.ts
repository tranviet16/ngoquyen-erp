import { describe, expect, it } from "vitest";
import { dtLineKeyOf, groupEstimatesByKey, itemKeyOf, kindOfCategoryCode, normUnit } from "../keys";

describe("normUnit", () => {
  it("cho m² và m2 cùng khóa, m³ và m3 cùng khóa", () => {
    expect(normUnit("m²")).toBe("m2");
    expect(normUnit("m2")).toBe("m2");
    expect(normUnit("m^2")).toBe("m2");
    expect(normUnit("m³")).toBe("m3");
    expect(normUnit("M3")).toBe("m3");
    expect(normUnit("khối")).toBe("m3");
  });

  it("không bao giờ gộp m² với m³ hay với m", () => {
    expect(normUnit("m²")).not.toBe(normUnit("m³"));
    expect(normUnit("m²")).not.toBe(normUnit("m"));
    expect(normUnit("mét")).toBe("m");
  });

  it("chuẩn hóa tấn, kg và ĐVT không có trong bảng", () => {
    expect(normUnit("Tấn")).toBe("tan");
    expect(normUnit("T")).toBe("tan");
    expect(normUnit(" Kg ")).toBe("kg");
    expect(normUnit("viên")).toBe("vien");
    expect(normUnit(null)).toBe("");
  });
});

describe("itemKeyOf / dtLineKeyOf", () => {
  it("bỏ dấu, gộp biến thể chính tả có cùng chữ", () => {
    expect(itemKeyOf("Ống nhựa báo hộ dây dẫn PVC D20", "m")).toBe(itemKeyOf("Ống nhựa bảo hộ dây dẫn PVC D20", "m"));
  });

  it("phân biệt theo ĐVT và loại", () => {
    expect(itemKeyOf("Bê tông M250", "m3")).not.toBe(itemKeyOf("Bê tông M250", "m2"));
    const name = "Bê tông bọt chống nóng mái M75";
    expect(dtLineKeyOf(name, "m3", "VL")).not.toBe(dtLineKeyOf(name, "m3", "NC"));
  });
});

describe("kindOfCategoryCode", () => {
  it("đọc hậu tố mã hạng mục", () => {
    expect(kindOfCategoryCode("HM1-VL")).toBe("VL");
    expect(kindOfCategoryCode("HM1-NC")).toBe("NC");
    expect(kindOfCategoryCode("HM1-MAY")).toBe("MTC");
    expect(kindOfCategoryCode("HM1-CPC")).toBeNull();
  });
});

describe("groupEstimatesByKey", () => {
  const row = (id: number, categoryId: number, categoryCode: string, itemName: string, qty: number, totalVnd: number) => ({
    id, categoryId, categoryCode, itemCode: `C${id}`, itemName, unit: "m3", qty, totalVnd,
  });

  it("cộng các hạng mục cùng khóa và chọn dòng giá trị lớn nhất làm dòng chính", () => {
    const lines = groupEstimatesByKey([
      row(1, 1, "HM1-VL", "Cát vàng", 10, 5_600_000),
      row(2, 5, "HM3-VL", "Cát vàng", 20, 11_200_000),
      row(3, 2, "HM1-NC", "Cát vàng", 1, 100),
      row(4, 6, "HM1-CPC", "Chi phí chung", 1, 1),
    ]);
    expect(lines.size).toBe(2);
    const vl = lines.get(dtLineKeyOf("Cát vàng", "m3", "VL"))!;
    expect(vl.qty.toNumber()).toBe(30);
    expect(vl.value.toNumber()).toBe(16_800_000);
    expect(vl.unitPrice?.toNumber()).toBe(560_000);
    expect(vl.estimateIds).toEqual([1, 2]);
    expect(vl.primary).toEqual({ estimateId: 2, categoryId: 5, itemCode: "C2" });
  });

  it("để đơn giá null khi KL = 0 (dòng tính theo %)", () => {
    const lines = groupEstimatesByKey([row(9, 1, "HM1-VL", "Vật liệu khác", 0, 64_294_538)]);
    expect([...lines.values()][0].unitPrice).toBeNull();
  });
});
