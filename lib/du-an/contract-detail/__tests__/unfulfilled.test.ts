import { describe, it, expect } from "vitest";
import { buildUnfulfilled } from "@/lib/du-an/contract-detail/unfulfilled";

const performed = { layHang: "990", hoaDon: "720", chuyenTien: "670" };

describe("buildUnfulfilled", () => {
  it("V_tt chưa nhập thì cột TT ra missing; V_dt = 0 vẫn tính là đã nhập và ra số âm", () => {
    const t = buildUnfulfilled(
      { valueDt: { sum: "0", have: 1, total: 1 }, valueTt: { sum: "0", have: 0, total: 1 } },
      performed,
    );
    expect(t.layHang).toEqual({ dt: { kind: "amount", value: "-990" }, tt: { kind: "missing", have: 0, total: 1 } });
    expect(t.hoaDon.dt).toEqual({ kind: "amount", value: "-720" });
    expect(t.chuyenTien.tt).toEqual({ kind: "missing", have: 0, total: 1 });
  });

  it("nhóm 3 hợp đồng, 1 hợp đồng thiếu V_tt: cột TT missing 2/3 ở cả ba dòng, cột DT ra số", () => {
    const t = buildUnfulfilled(
      { valueDt: { sum: "3000", have: 3, total: 3 }, valueTt: { sum: "2500", have: 2, total: 3 } },
      performed,
    );
    for (const row of [t.layHang, t.hoaDon, t.chuyenTien]) {
      expect(row.tt).toEqual({ kind: "missing", have: 2, total: 3 });
    }
    expect(t.layHang.dt).toEqual({ kind: "amount", value: "2010" });
    expect(t.chuyenTien.dt).toEqual({ kind: "amount", value: "2330" });
  });

  it("đã thực hiện vượt giá trị thì giữ dấu âm; cộng chính xác số lẻ", () => {
    const t = buildUnfulfilled(
      { valueDt: { sum: "100.1", have: 1, total: 1 }, valueTt: { sum: "0.3", have: 1, total: 1 } },
      { layHang: "100.2", hoaDon: "0.1", chuyenTien: "0" },
    );
    expect(t.layHang.dt).toEqual({ kind: "amount", value: "-0.1" });
    expect(t.hoaDon.tt).toEqual({ kind: "amount", value: "0.2" });
  });
});
