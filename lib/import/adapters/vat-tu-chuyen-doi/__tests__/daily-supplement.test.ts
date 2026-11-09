import { describe, expect, it } from "vitest";
import { supplementFromDaily } from "../daily-supplement";
import { dedupeDeliveries } from "../delivery-dedupe";
import { IssueSink } from "../parse-issues";
import { day, delivery, iso } from "./fixture-builders";

const FILE = "Theo Dõi Vật Tư/Dải Cây Xanh/Vận Chuyển Gia Bảo - DCX.xlsx";
const common = {
  file: FILE,
  supplierHint: "Vận Chuyển Gia Bảo",
  project: { kind: "folder" as const, name: "Dải Cây Xanh", mappingKey: "project-folder:Dải Cây Xanh" },
  itemName: "Vận chuyển",
  unit: "m3",
};
const ref = (d: Date, qty: number) => delivery({ ...common, date: d, qty, unitPrice: 100_000, amount: qty * 100_000 });
const daily = (d: Date, qty: number, container = 0) =>
  delivery({ ...common, date: d, qty, unitPrice: null, amount: null, source: "vat-tu-ngay", sheet: "Vật tư ngày", container, cbVatTu: "Sơn" });

describe("supplementFromDaily — Vật tư ngày chỉ bổ sung phiếu còn thiếu", () => {
  it("dòng đã có trong đối chiếu (ngày, KL, ĐVT) không được nhập thêm", () => {
    const sink = new IssueSink();
    const refs = dedupeDeliveries([ref(day(2026, 10, 15), 18)]);
    expect(supplementFromDaily(refs, [daily(day(2026, 10, 15), 18)], { sink })).toEqual([]);
  });

  it("ngày không có phiếu đối chiếu → nhập phiếu không giá kèm CB vật tư", () => {
    const sink = new IssueSink();
    const refs = dedupeDeliveries([ref(day(2026, 10, 15), 18)]);
    const out = supplementFromDaily(refs, [daily(day(2026, 10, 16), 12)], { sink });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ source: "vat-tu-ngay", unitPrice: null, amount: null, cbVatTu: "Sơn" });
    expect(iso(out[0].date)).toBe("2026-10-16");
    expect(sink.warnings).toEqual([expect.objectContaining({ code: "daily-supplement", level: "info" })]);
  });

  it("khối lượng lệch trong ngày đã có phiếu đối chiếu → giữ theo đối chiếu, cảnh báo", () => {
    const sink = new IssueSink();
    const refs = dedupeDeliveries([ref(day(2026, 10, 27), 1)]);
    const out = supplementFromDaily(refs, [daily(day(2026, 10, 27), 0.5)], { sink });
    expect(out).toEqual([]);
    expect(sink.warnings).toEqual([expect.objectContaining({ code: "daily-conflict", level: "warning" })]);
  });

  it("so multiset: hai chuyến trong một mục Vật tư ngày, đối chiếu chỉ có một → bổ sung một khi ngày chưa có đối chiếu", () => {
    const sink = new IssueSink();
    const refs = dedupeDeliveries([ref(day(2026, 10, 15), 18)]);
    const rows = [daily(day(2026, 10, 15), 18), daily(day(2026, 10, 20), 6), daily(day(2026, 10, 20), 6), daily(day(2026, 10, 20), 6, 1)];
    const out = supplementFromDaily(refs, rows, { sink });
    expect(out.map((d) => `${iso(d.date)} ${d.qty}`)).toEqual(["2026-10-20 6", "2026-10-20 6"]);
  });
});
