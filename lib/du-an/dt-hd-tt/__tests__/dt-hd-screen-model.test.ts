/**
 * Mô hình màn DT-HĐ: cột tóm tắt BẰNG ĐÚNG trường của khối; số suy ra (Còn lại của Cộng khối, số đếm tình
 * trạng) ghim bằng số tính tay trên công trình mẫu; bộ lọc giữ tổng của nhóm và đếm "hiện n / m dòng";
 * trạng thái mở khối của `mo`; Phần B tách đúng hai danh sách; chữ dòng HĐ trùng bản in.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DtHdView } from "@/components/du-an/dt-hd-tt/dt-hd-view";
import { buildDtHdReport, type DtHdReport } from "../dt-hd-report";
import {
  blockTotals, buildScreenView, countStatuses, invoiceText, locCounts, openBlockKeys, splitPartB, statusSlug, summaryRow, SUMMARY_COLUMNS,
  toggleBlock,
} from "../dt-hd-screen-model";
import { DT_HD_OPEN_MAX } from "../screen-links";
import { fixture } from "./report-fixture";

const report = (): DtHdReport => buildDtHdReport(fixture());
const blockOf = (r: DtHdReport, name: string) => r.blocks.find((b) => b.name === name)!;
const counts = (s: { label: string; count: number }[]) => s.map((c) => `${c.label} ${c.count}`);

describe("summary row per đầu mối block", () => {
  it("has one row per block, in report order, and each column is exactly its block field", () => {
    const r = report();
    expect(r.blocks.map((b) => b.name)).toEqual(["Đại Ngàn", "Bê tông HP", "Sobek", "Chưa có đầu mối"]);
    for (const b of r.blocks) {
      const row = summaryRow(b);
      for (const c of SUMMARY_COLUMNS) expect(row.values[c.id], `${b.name} ${c.id}`).toBe(b[c.id]);
    }
    expect(SUMMARY_COLUMNS.map((c) => c.label)).toEqual([
      "Dự toán", "HĐ do NCC xuất", "Trong nhóm mình", "Ngoài DT", "Ở nhóm khối khác", "Thực tế chưa VAT", "Còn phải lấy HĐ",
    ]);
  });

  it("matches the hand-computed figures of the fixture", () => {
    const r = report();
    const dn = summaryRow(blockOf(r, "Đại Ngàn")).values;
    expect([dn.valueDt, dn.invoiceTotal, dn.inOwnGroups, dn.outsideDt, dn.crossAssigned]).toEqual([22_500_000, 14_500_000, 13_500_000, 0, 1_000_000]);
    expect(dn.actualExVat).toBeCloseTo(15_250_000, 4); // 16.470.000 ÷ 1,08
    expect(dn.remainingVsActual).toBeCloseTo(750_000, 4);
    const sobek = summaryRow(blockOf(r, "Sobek")).values;
    expect([sobek.valueDt, sobek.invoiceTotal, sobek.outsideDt]).toEqual([0, 3_000_000, 3_000_000]);
    expect(sobek.actualExVat).toBeCloseTo(8_333_333.33, 1); // 9.000.000 ÷ 1,08
    const none = summaryRow(blockOf(r, "Chưa có đầu mối"));
    expect(none.key).toBe("none");
    expect([none.values.valueDt, none.values.invoiceTotal, none.values.inOwnGroups, none.values.actualExVat, none.values.remainingVsActual]).toEqual([
      80_000_000, 4_000_000, 4_000_000, null, null,
    ]);
  });

  it("recomputes status counts from line statuses and hides zero counts", () => {
    const r = report();
    expect(counts(summaryRow(blockOf(r, "Đại Ngàn")).statuses)).toEqual(["Còn thiếu 1"]);
    expect(counts(summaryRow(blockOf(r, "Bê tông HP")).statuses)).toEqual(["Thiếu hệ số 1"]);
    expect(counts(summaryRow(blockOf(r, "Sobek")).statuses)).toEqual([]);
    expect(counts(summaryRow(blockOf(r, "Chưa có đầu mối")).statuses)).toEqual(["Còn thiếu 1", "Chưa có HĐ 1"]);
    expect(summaryRow(blockOf(r, "Chưa có đầu mối")).lineCount).toBe(2);
    expect(counts(countStatuses([]))).toEqual([]);
    expect(statusSlug("")).toBeNull();
    expect(statusSlug("Chưa kết luận (thiếu hệ số)")).toBe("thieu-he-so");
  });

  it("shows the tie-out only when it is broken", () => {
    const r = report();
    expect(r.blocks.every((b) => summaryRow(b).brokenTieOut === null)).toBe(true);
    const b = { ...r.blocks[0], tieOut: { ...r.blocks[0].tieOut, actual: r.blocks[0].tieOut.expected + 5, ok: false } };
    expect(summaryRow(b).brokenTieOut).toBe(b.tieOut);
  });

  it("Cộng khối: Còn lại = DT − HĐ trong các nhóm, as the print view computes it", () => {
    const r = report();
    expect(blockTotals(blockOf(r, "Đại Ngàn"))).toEqual({ valueDt: 22_500_000, groupsHd: 13_500_000, balance: 9_000_000 });
    expect(blockTotals(blockOf(r, "Bê tông HP"))).toEqual({ valueDt: 130_000_000, groupsHd: 66_000_000, balance: 64_000_000 });
    expect(blockTotals(blockOf(r, "Chưa có đầu mối"))).toEqual({ valueDt: 80_000_000, groupsHd: 4_000_000, balance: 76_000_000 });
    expect(blockTotals(blockOf(r, "Sobek"))).toEqual({ valueDt: 0, groupsHd: 0, balance: 0 });
  });
});

describe("filters", () => {
  it("without a filter shows every block, group and line", () => {
    const v = buildScreenView(report(), {});
    expect(v.filtering).toBe(false);
    expect(v.blocks).toHaveLength(4);
    expect([v.shownLines, v.totalLines]).toEqual([4, 4]);
    expect(locCounts(report())).toEqual({ "con-thieu": 2, vuot: 0, "chua-co-hd": 1, "thieu-he-so": 1 });
  });

  it("loc keeps only blocks, groups and lines with that status; groups keep their report totals", () => {
    const v = buildScreenView(report(), { loc: "con-thieu" });
    expect(v.filtering && v.linesFiltered).toBe(true);
    expect(v.blocks.map((b) => b.key)).toEqual([11, "none"]);
    const none = v.blocks[1];
    expect(none.groups.map((g) => g.label)).toEqual(["MAY — Máy"]);
    expect(none.groups[0].lines.map((l) => l.itemName)).toEqual(["Máy đào"]);
    expect([none.groups[0].group.valueDt, none.groups[0].group.valueHd, none.groups[0].group.balance]).toEqual([20_000_000, 4_000_000, 16_000_000]);
    expect([v.shownLines, v.totalLines]).toEqual([2, 4]);
    expect(buildScreenView(report(), { loc: "vuot" }).blocks).toEqual([]);
    expect(buildScreenView(report(), { loc: "thieu-he-so" }).blocks.map((b) => b.summary.name)).toEqual(["Bê tông HP"]);
  });

  it("dauMoi picks one block, none picks Chưa có đầu mối, and its groups stay whole", () => {
    const none = buildScreenView(report(), { dauMoi: "none" });
    expect(none.blocks.map((b) => b.summary.name)).toEqual(["Chưa có đầu mối"]);
    expect(none.blocks[0].groups.map((g) => g.label)).toEqual(["NC-XAY — Nhân công xây", "MAY — Máy"]);
    expect([none.filtering, none.linesFiltered, none.shownLines, none.totalLines]).toEqual([true, false, 2, 4]);
    expect(buildScreenView(report(), { dauMoi: 13 }).blocks.map((b) => [b.summary.name, b.shownLines])).toEqual([["Sobek", 0]]);
    expect(buildScreenView(report(), { dauMoi: 999 }).blocks).toEqual([]);
  });

  it("the name search ignores diacritics and matches the line, its group or its đầu mối", () => {
    const names = (q: string) => buildScreenView(report(), { q }).blocks.map((b) => [b.summary.name, b.groups.flatMap((g) => g.lines.map((l) => l.itemName))]);
    expect(names("thep")).toEqual([["Đại Ngàn", ["Thép tròn D10"]]]);
    expect(names("MAY DAO")).toEqual([["Chưa có đầu mối", ["Máy đào"]]]);
    expect(names("dai ngan")).toEqual([["Đại Ngàn", ["Thép tròn D10"]]]);
    expect(names("bt")).toEqual([["Bê tông HP", ["Bê tông M300"]]]);
    expect(names("   ")).toHaveLength(4);
    expect(buildScreenView(report(), { q: "thep", loc: "chua-co-hd" }).blocks).toEqual([]);
  });
});

describe("open blocks (mo)", () => {
  const plain = buildScreenView(report(), {});
  const filtered = buildScreenView(report(), { loc: "con-thieu" });

  it("defaults to closed, or to every matching block while filtering", () => {
    expect(openBlockKeys(undefined, plain)).toEqual([]);
    expect(openBlockKeys(undefined, filtered)).toEqual([11, "none"]);
    expect(openBlockKeys([12], filtered)).toEqual([12]);
    expect(openBlockKeys([], filtered)).toEqual([]);
  });

  it("toggles one block; closing the last drops mo unless filtering", () => {
    expect(toggleBlock(undefined, plain, 12)).toEqual([12]);
    expect(toggleBlock([12], plain, 12)).toBeUndefined();
    expect(toggleBlock(undefined, filtered, 11)).toEqual(["none"]);
    expect(toggleBlock(["none"], filtered, "none")).toEqual([]);
    expect(toggleBlock([], filtered, 11)).toEqual([11]);
  });

  it("keeps at most 30 open blocks, the most recent ones", () => {
    const many = Array.from({ length: DT_HD_OPEN_MAX }, (_, i) => i + 100);
    expect(toggleBlock(many, plain, 7)).toEqual([...many.slice(1), 7]);
  });
});

describe("Phần B and invoice rows", () => {
  it("splits Phần B into chưa gán and Ngoài DT, losing nothing", () => {
    const r = report();
    const { chuaGan, ngoaiDt } = splitPartB(r);
    expect(chuaGan.map((i) => i.itemName)).toEqual(["Sơn"]);
    expect(ngoaiDt.map((i) => i.itemName)).toEqual(["Sơn lót"]);
    const all = r.partB.flatMap((s) => s.lines.map((l) => l.invoiceLineId)).sort();
    expect([...chuaGan, ...ngoaiDt].map((i) => i.invoiceLineId).sort()).toEqual(all);
  });

  it("writes each invoice line as the print view does", () => {
    const r = report();
    const html = renderToStaticMarkup(createElement(DtHdView, { report: r }));
    const rows = [...r.blocks.flatMap((b) => b.groups.flatMap((g) => [...g.lines.flatMap((l) => l.invoices), ...g.groupOnly])), ...r.partB.flatMap((s) => s.lines)];
    expect(rows.length).toBeGreaterThan(0);
    for (const i of rows) expect(html, i.itemName).toContain(invoiceText(i));
    expect(invoiceText(rows.find((i) => i.invoiceLineId === 2)!)).toBe("↳ Bê tông HP · HĐ 2 · Bê tông M300 (SL 50, thiếu hệ số)");
    expect(invoiceText({ supplierName: "A", invoiceNo: "", itemName: "Thép", qty: 1500, factor: 0.5 })).toBe("↳ A · HĐ — · Thép (SL 1.500 × 0,5)");
  });
});
