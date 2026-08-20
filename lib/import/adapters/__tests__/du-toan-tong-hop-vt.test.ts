/**
 * Parser tests cho adapter "Dự toán — Tổng hợp VT", chạy trên file .xls thật trong SOP/.
 * Mốc đối chiếu: các dòng "TỔNG ..." của chính sheet + tổng NC/MÁY đã kiểm chứng
 * bằng tay khi nhập lại dự toán MNTC-GD1 (2026-08-19).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DuToanTongHopVtAdapter,
  normVtName,
} from "@/lib/import/adapters/du-toan-tong-hop-vt.adapter";
import type { ParsedData } from "@/lib/import/adapters/adapter-types";

const XLS_PATH = join(process.cwd(), "SOP", "1. Du toan xay dung MN Trai Chuoi.xls");

function sumGroup(data: ParsedData, groupKey: string): number {
  return data.rows
    .filter((r) => r.data.groupKey === groupKey)
    .reduce((a, r) => a + Number(r.data.totalVnd ?? 0), 0);
}

describe("normVtName", () => {
  it("phân biệt D<=10 với D>10", () => {
    expect(normVtName("Thép tròn D<=10mm")).not.toBe(normVtName("Thép tròn D>10mm"));
  });
  it("coi '200T' và '200 T' là một", () => {
    expect(normVtName("Máy ép cọc trước lực ép 200T")).toBe(
      normVtName("Máy ép cọc trước - lực ép : 200 T"),
    );
    expect(normVtName("Máy khoan bê tông cầm tay- công suất : 0,62kW")).toBe(
      normVtName("Máy khoan bê tông cầm tay - công suất : 0,62 kW"),
    );
  });
});

describe("DuToanTongHopVtAdapter (file thật)", () => {
  let data: ParsedData;

  beforeAll(async () => {
    data = await DuToanTongHopVtAdapter.parse(readFileSync(XLS_PATH));
  });

  it("qua gate đối chiếu tổng của sheet", () => {
    const result = DuToanTongHopVtAdapter.validate(data);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("không còn khối hạng mục nào chưa ánh xạ", () => {
    expect(data.meta.unknownBlocks).toEqual([]);
  });

  it("gộp NC + MÁY của mọi khối về HM1 đúng số đã kiểm chứng (Giá T.B)", () => {
    // Σ các dòng TỔNG NHÂN CÔNG / TỔNG MÁY (cột Thành tiền T.B) của 7 khối, sai số làm tròn ≤ 2đ
    expect(Math.round(sumGroup(data, "HM1-NC"))).toBe(2_134_640_459);
    expect(Math.round(sumGroup(data, "HM1-MAY"))).toBe(489_012_465);
  });

  it("tách VL theo hạng mục điện / nước (Giá T.B)", () => {
    expect(Math.round(sumGroup(data, "HM2-VL"))).toBe(340_062_844);
    // HM3 gồm cả "Chống thấm cổ ống bằng thanh trương nở hyperstop"
    expect(Math.round(sumGroup(data, "HM3-VL"))).toBe(579_984_469);
  });

  it("tách 'Nước (lít)' và 'Nước (m3)' thành 2 vật tư", () => {
    const nuoc = data.rows.filter(
      (r) => normVtName(String(r.data.name)) === "nuoc" && r.data.groupKey === "HM1-VL",
    );
    expect(nuoc.length).toBeGreaterThanOrEqual(1);
    const units = new Set(nuoc.map((r) => normVtName(String(r.data.unit))));
    expect(units.size).toBe(nuoc.length);
  });

  it("cộng gộp cùng vật tư qua nhiều khối (Cát vàng xuất hiện ở nhiều khối HM1)", () => {
    const catVang = data.rows.filter(
      (r) => normVtName(String(r.data.name)) === "cat vang" && r.data.groupKey === "HM1-VL",
    );
    expect(catVang).toHaveLength(1);
    expect(Number(catVang[0].data.qty)).toBeGreaterThan(10.5719); // > riêng khối Kết cấu
  });
});
