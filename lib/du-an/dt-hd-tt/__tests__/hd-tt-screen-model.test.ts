/**
 * Mô hình màn HĐ-TT: nhóm cột phủ đủ 13 cột tiền, quy tắc S trên năm tình huống dòng, đọc ô theo từng trường (H / S / X
 * tiền kiểu Việt Nam, Z chữ ≤ 1 000 ký tự), hai màn đọc "1.500" giống nhau, nháp khóa theo link, và quyền sửa.
 */

import { describe, expect, it, vi } from "vitest";
import { parseNumberCell } from "../entry-cell-parse";
import { HD_TT_MONEY_COLS } from "../export-sheet-hd-tt";
import { buildHdTtReport, type HdTtRow } from "../hd-tt-report";
import {
  buildHdTtView, buildScreenRows, canEditFrom, canTypeSplit, draftKey, HD_TT_COLUMN_GROUPS, HD_TT_SCREEN_LABELS, hdTtCellPatch, hdTtLocCounts,
  mergeDrafts, SPLIT_BLOCK_TITLES, splitBlock, storedText, supplierCellPatch, textMatchesStored, TODO_MAX_CHARS, type Drafts, type EntitlementCheck,
} from "../hd-tt-screen-model";
import { itemKeyOf } from "../keys";
import type { ReportInputs } from "../report-inputs";
import { fixture } from "./report-fixture";

const rowsOf = (inp: ReportInputs = fixture()) => buildScreenRows(buildHdTtReport(inp).rows);
const bySupplier = (rows: HdTtRow[], id: number) => rows.find((r) => r.supplierId === id)!;

describe("money columns", () => {
  const keys = HD_TT_MONEY_COLS.map((c) => c.key);

  it("puts every one of the 13 money keys in exactly one group, in the file's column order", () => {
    const grouped = HD_TT_COLUMN_GROUPS.flatMap((g) => g.keys);
    expect(keys).toHaveLength(13);
    expect(grouped).toEqual(keys);
    expect(new Set(grouped).size).toBe(13);
    expect(HD_TT_COLUMN_GROUPS.map((g) => [g.label, g.keys.length])).toEqual([["Hóa đơn", 3], ["Thanh toán", 4], ["Thực tế", 3], ["Lấy về", 3]]);
  });

  it("labels every money key for the screen, keeping the file's letter as a code", () => {
    expect(Object.keys(HD_TT_SCREEN_LABELS).sort()).toEqual([...keys].sort());
    expect(HD_TT_COLUMN_GROUPS.flatMap((g) => g.keys).map((k) => HD_TT_SCREEN_LABELS[k].code)).toEqual([null, null, "E", "G", "I", "J", "K", "T", "U", "V", "W", "X", "Y"]);
    expect(HD_TT_SCREEN_LABELS.invoiceTotal.label).toBe("HĐ gồm VAT");
    // Nhãn Excel vẫn là của file.
    expect(HD_TT_MONEY_COLS[2].label).toBe("E. HĐ gồm VAT");
  });
});

describe("screen rows", () => {
  it("know their place in the đầu mối and whether its thực tế is settled", () => {
    const rows = rowsOf();
    expect(rows.map((r) => [r.supplierName, r.siblingIndex, r.siblingCount, r.counterpartySettled])).toEqual([
      ["Đại Ngàn", 0, 1, true], ["Bê tông HP", 0, 1, true], ["Sobek", 0, 2, true], ["Chương Dương", 1, 2, true], ["Máy Lộc Tài", 0, 0, false],
    ]);
  });

  it("filter with Tổng quan's predicates and keep the report totals untouched", () => {
    const rows = rowsOf();
    // U > 0: Đại Ngàn và Sobek; Y > 0: Máy Lộc Tài (HĐ chưa trả, T = 0); Z: Bê tông HP.
    expect(hdTtLocCounts(rows)).toEqual({ "con-phai-lay-hd": 2, "con-phai-lay-ve": 1, "co-viec": 1 });
    const view = buildHdTtView(rows, "co-viec");
    expect(view).toMatchObject({ shown: 1, total: 5, filtering: true });
    expect(view.groups.map((g) => [g.key, g.name, g.rows.map((r) => r.supplierName)])).toEqual([[12, "Bê tông HP", ["Bê tông HP"]]]);
    expect(buildHdTtView(rows, undefined).groups.map((g) => g.key)).toEqual([11, 12, 13, "none"]);
  });
});

describe("canTypeSplit on the five row situations", () => {
  const unsettled = fixture();
  unsettled.counterparties = unsettled.counterparties.map((c) => (c.id === 13 ? { ...c, actualManualVnd: null } : c));

  it.each([
    ["no đầu mối", rowsOf(), 5, "no-counterparty"],
    ["only NCC of its đầu mối", rowsOf(), 1, "single"],
    ["first NCC of a multi-NCC đầu mối", rowsOf(), 3, "first"],
    ["later NCC of an unsettled đầu mối", rowsOf(unsettled), 4, "unsettled"],
    ["later NCC of a settled multi-NCC đầu mối", rowsOf(), 4, null],
  ] as const)("%s", (_name, rows, supplierId, block) => {
    const row = rows.find((r) => r.supplierId === supplierId)!;
    expect(splitBlock(row)).toBe(block);
    expect(canTypeSplit(row)).toBe(block === null);
  });

  it("gives each block its own reason", () => {
    expect(SPLIT_BLOCK_TITLES).toEqual({
      "no-counterparty": "Gắn NCC vào đầu mối trước",
      single: "Đầu mối chỉ có một NCC",
      first: "NCC đầu tiên nhận phần còn lại — nhập S ở NCC sau",
      unsettled: "Đầu mối chưa chốt thực tế",
    });
  });
});

describe("per-field parsing", () => {
  it("reads H / S / X as Vietnamese money and empty as null", () => {
    expect(hdTtCellPatch("H", "1.500.000")).toEqual({ paidOverrideVnd: 1_500_000 });
    expect(hdTtCellPatch("S", " 12,5 ")).toEqual({ splitActualVnd: 12.5 });
    expect(hdTtCellPatch("X", "-2 000")).toEqual({ recoveredVnd: -2000 });
    expect(hdTtCellPatch("X", "  ")).toEqual({ recoveredVnd: null });
    expect(() => hdTtCellPatch("H", "abc")).toThrow('H thực nộp rà soát: "abc" không phải số');
  });

  it("reads Z as trimmed text of at most 1 000 characters", () => {
    expect(hdTtCellPatch("Z", "  Lấy thêm HĐ tháng 3 ")).toEqual({ todoNote: "Lấy thêm HĐ tháng 3" });
    expect(hdTtCellPatch("Z", "   ")).toEqual({ todoNote: null });
    expect(hdTtCellPatch("Z", "đ".repeat(TODO_MAX_CHARS))).toEqual({ todoNote: "đ".repeat(1000) });
    expect(() => hdTtCellPatch("Z", "đ".repeat(1001))).toThrow("Z việc cần làm: tối đa 1000 ký tự (đang có 1001)");
  });

  it("parses 1.500 and 1.500.000 the same way on the Đầu mối grid and on HĐ-TT", () => {
    for (const [text, value] of [["1.500", 1500], ["1.500.000", 1_500_000], ["1500", 1500]] as const) {
      expect(supplierCellPatch("paidOverrideVnd", text)).toEqual(hdTtCellPatch("H", text));
      expect(supplierCellPatch("splitActualVnd", text)).toEqual(hdTtCellPatch("S", text));
      expect(supplierCellPatch("recoveredVnd", text)).toEqual({ recoveredVnd: value });
    }
    // Parser cũ của lưới đọc "1.500" thành 1,5 và từ chối "1.500.000".
    expect(parseNumberCell("1.500", "H")).toBe(1.5);
    expect(() => parseNumberCell("1.500.000", "H")).toThrow();
    // Lưới đưa số thô thì giữ nguyên số đó.
    expect(supplierCellPatch("recoveredVnd", 1500.5)).toEqual({ recoveredVnd: 1500.5 });
  });

  it("writes stored numbers back in a form the money parser reads to the same value", () => {
    const row = { ...bySupplier(rowsOf(), 2), recovered: 1500.5 };
    expect(storedText(row, "H")).toBe("50000000");
    expect(storedText(row, "X")).toBe("1500,5");
    expect(storedText(row, "S")).toBe("");
    expect(storedText(row, "Z")).toBe("Lấy thêm HĐ");
    expect(textMatchesStored(row, "X", storedText(row, "X"))).toBe(true);
    expect(textMatchesStored(row, "H", "50.000.000")).toBe(true);
    expect(textMatchesStored(row, "H", "5.000.000")).toBe(false);
    expect(textMatchesStored(row, "H", "abc")).toBe(false);
  });
});

describe("mergeDrafts", () => {
  /** Sau khi lưu H = 60 000 000 ở link 202, và một NCC mới (link 206) chèn dòng ngay sau Đại Ngàn. */
  function afterSave(): HdTtRow[] {
    const inp = fixture();
    inp.suppliers = [...inp.suppliers, { id: 6, name: "NCC Thử" }];
    inp.invoiceLines = [...inp.invoiceLines, { id: 8, supplierId: 6, invoiceNo: "8", invoiceDate: null, itemName: "Thép D10", unit: "kg", itemKey: itemKeyOf("Thép D10", "kg"), qty: 1, amountVnd: 100_000, vatVnd: 8_000 }];
    inp.counterpartySuppliers = [
      ...inp.counterpartySuppliers.map((l) => (l.id === 202 ? { ...l, paidOverrideVnd: 60_000_000 } : l)),
      { id: 206, counterpartyId: 11, supplierId: 6, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
    ];
    return buildHdTtReport(inp).rows;
  }

  const drafts: Drafts = {
    [draftKey(202, "H")]: { text: "60.000.000", error: null },
    [draftKey(204, "X")]: { text: "300.000", error: "Dòng NCC không còn trong công trình" },
    [draftKey(203, "Z")]: { text: "Gọi NCC", error: null },
    [draftKey(299, "H")]: { text: "1", error: "Dòng NCC không còn trong công trình" },
  };

  it("drops the saved draft and keeps the failed, the pending and the orphaned ones, matched by link not position", () => {
    const rows = afterSave();
    expect(rows[1].supplierName).toBe("NCC Thử");
    const merged = mergeDrafts(drafts, rows);
    expect(merged).toEqual({
      "204:X": { text: "300.000", error: "Dòng NCC không còn trong công trình" },
      "203:Z": { text: "Gọi NCC", error: null },
      "299:H": { text: "1", error: "Dòng NCC không còn trong công trình" },
    });
    expect(mergeDrafts(drafts, [...rows].reverse())).toEqual(merged);
  });

  it("keeps every draft through a re-render whose server values did not change", () => {
    expect(mergeDrafts(drafts, buildHdTtReport(fixture()).rows)).toEqual(drafts);
  });
});

describe("canEditFrom", () => {
  it("asks for edit on the module, scoped to the project", async () => {
    const check = vi.fn<EntitlementCheck>(async () => true);
    await expect(canEditFrom(check, "user-1", 4)).resolves.toBe(true);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("user-1", "du-an", { minLevel: "edit", scope: { kind: "project", projectId: 4 } });
  });

  it("passes a refusal through", async () => {
    await expect(canEditFrom(async () => false, "user-2", 4)).resolves.toBe(false);
  });
});
