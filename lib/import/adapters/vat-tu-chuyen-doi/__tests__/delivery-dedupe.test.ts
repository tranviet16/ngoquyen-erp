import { describe, expect, it } from "vitest";
import { dedupeDeliveries } from "../delivery-dedupe";
import { labelProject } from "../tracking-delivery-fields";
import { day, delivery, iso } from "./fixture-builders";

describe("dedupeDeliveries — bội số lớn nhất trong một khối / sheet", () => {
  it("Lộc Tài MN2: phiếu 27/10 lặp ở hai khối của cùng file → 1", () => {
    const base = {
      file: "Theo Dõi Vật Tư/Mầm Non TC2/Lộc Tài - MN2.xlsx",
      supplierHint: "Lộc Tài",
      project: { kind: "folder" as const, name: "Mầm Non TC2", mappingKey: "project-folder:Mầm Non TC2" },
      date: day(2026, 10, 27),
      itemName: "Máy xúc",
      qty: 0.5,
      unit: "ca",
      unitPrice: 2_800_000,
      amount: 1_400_000,
    };
    const out = dedupeDeliveries([
      delivery({ ...base, container: 0, ref: { file: base.file, sheet: "Đối chiếu công nợ", cell: "B16", raw: "27/10/2026" } }),
      delivery({ ...base, container: 1, ref: { file: base.file, sheet: "Đối chiếu công nợ", cell: "B49", raw: "27/10/2026" } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].ref.cell).toBe("B16");
    expect(out[0].duplicates.map((d) => d.cell)).toEqual(["B49"]);
    expect(out[0].afterCutover).toBe(true);
  });

  it("Nam Hương DCX: 5.400 viên × 1.350, hai dòng trong một khối → 2", () => {
    const row = { date: day(2026, 10, 27), qty: 5400, unitPrice: 1350, amount: 7_290_000, container: 1 };
    const out = dedupeDeliveries([delivery(row), delivery(row)]);
    expect(out).toHaveLength(2);
  });

  it("hai file Quang Minh Trại Chuối chồng nhau → giữ bội số lớn nhất trong một khối", () => {
    const fileA = "Theo Dõi Vật Tư/Trại Chuối/Quang Minh cát,gạch hết 30.4.26.xlsx";
    const fileB = "Theo Dõi Vật Tư/Trại Chuối/Quang Minh cát,gạch đến 26.5.26.xlsx";
    const trip = { supplierHint: "Quang Minh cát,gạch", date: day(2026, 4, 25), itemName: "Cát xây Việt Trì", qty: 4, unit: "m3", unitPrice: 460_000, amount: 1_840_000 };
    const out = dedupeDeliveries([
      delivery({ ...trip, file: fileA, container: 0 }),
      delivery({ ...trip, file: fileA, container: 0 }),
      delivery({ ...trip, file: fileB, container: 0 }),
      delivery({ ...trip, file: fileB, container: 1 }),
      delivery({ ...trip, file: fileB, container: 1, date: day(2026, 4, 28) }),
    ]);
    expect(out.map((d) => iso(d.date))).toEqual(["2026-04-25", "2026-04-25", "2026-04-28"]);
    expect(out.filter((d) => iso(d.date) === "2026-04-25").every((d) => d.file === fileA)).toBe(true);
  });

  it("phiếu Dải cây xanh trong khối gộp của file Trại Chuối trùng với file DCX → 1", () => {
    const shared = { supplierHint: "Máy xúc Lộc Tài HT", date: day(2026, 10, 27), itemName: "Máy xúc", qty: 1, unit: "ca", unitPrice: 2_800_000, amount: 2_800_000 };
    const out = dedupeDeliveries([
      delivery({ ...shared, file: "Theo Dõi Vật Tư/Trại Chuối/Máy xúc Lộc Tài HT.xlsx", project: labelProject("dải cây xanh") }),
      delivery({
        ...shared,
        file: "Theo Dõi Vật Tư/Dải Cây Xanh/Máy xúc Lộc Tài HT - DCX.xlsx",
        project: { kind: "folder", name: "Dải Cây Xanh", mappingKey: "project-folder:Dải Cây Xanh" },
      }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].duplicates).toHaveLength(1);
  });

  it("khóa cặp tùy chỉnh (id đã ánh xạ) và phiếu chờ quyết định ngày được giữ nguyên", () => {
    const a = delivery({ date: day(2026, 6, 1), supplierHint: "Quang Minh" });
    const b = delivery({ date: day(2026, 6, 1), supplierHint: "Cát xây Quang Minh", file: "x.xlsx" });
    expect(dedupeDeliveries([a, b])).toHaveLength(2);
    expect(dedupeDeliveries([a, b], { pairKeyOf: () => "supplier:1|project:2" })).toHaveLength(1);

    const pending = delivery({ date: null, dateDecisionKey: "date:a.xlsx:S!B2", dateCandidates: [day(2026, 10, 11), day(2026, 11, 10)] });
    const out = dedupeDeliveries([pending, pending]);
    expect(out).toHaveLength(2);
    expect(out[0].afterCutover).toBeNull();
  });
});
