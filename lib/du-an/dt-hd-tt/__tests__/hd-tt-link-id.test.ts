/**
 * `HdTtRow.linkId` (trường thêm, không đổi số nào): id dòng NCC mà màn HĐ-TT ghi H / S / X / Z vào. Đi theo NCC,
 * không theo vị trí dòng — NCC mới chèn dòng giữa bảng thì mỗi dòng vẫn mang đúng link của nó.
 */

import { describe, expect, it } from "vitest";
import { buildHdTtReport, type HdTtRow } from "../hd-tt-report";
import { itemKeyOf } from "../keys";
import type { ReportInputs } from "../report-inputs";
import { fixture } from "./report-fixture";

const linkIds = (rows: HdTtRow[]) => Object.fromEntries(rows.map((r) => [r.supplierName, r.linkId]));
const withoutLinkId = (rows: HdTtRow[]) => rows.map((r) => {
  const copy: Partial<HdTtRow> = { ...r };
  delete copy.linkId;
  return copy;
});

/** NCC mới (id 6) có HĐ, thêm vào đầu mối 11 → dòng của nó chèn ngay sau NCC đầu của đầu mối đó. */
function withNewSupplier(): ReportInputs {
  const inp = fixture();
  inp.suppliers = [...inp.suppliers, { id: 6, name: "NCC Thử" }];
  inp.invoiceLines = [
    ...inp.invoiceLines,
    { id: 8, supplierId: 6, invoiceNo: "8", invoiceDate: null, itemName: "Thép D10", unit: "kg", itemKey: itemKeyOf("Thép D10", "kg"), qty: 10, amountVnd: 150_000, vatVnd: 12_000 },
  ];
  inp.counterpartySuppliers = [
    ...inp.counterpartySuppliers,
    { id: 206, counterpartyId: 11, supplierId: 6, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
  ];
  return inp;
}

describe("HdTtRow.linkId", () => {
  it("carries the NCC link id, and null for a supplier with no link row", () => {
    const { rows } = buildHdTtReport(fixture());
    expect(linkIds(rows)).toEqual({ "Đại Ngàn": 201, "Bê tông HP": 202, Sobek: 203, "Chương Dương": 204, "Máy Lộc Tài": null });
  });

  it("carries the id of a link row that belongs to no đầu mối", () => {
    const inp = fixture();
    inp.counterpartySuppliers = [
      ...inp.counterpartySuppliers,
      { id: 205, counterpartyId: null, supplierId: 5, splitActualVnd: null, paidOverrideVnd: null, recoveredVnd: null, todoNote: null },
    ];
    const r = buildHdTtReport(inp);
    expect(r.rows.find((x) => x.supplierId === 5)).toMatchObject({ linkId: 205, counterpartyId: null, actual: 0 });
    expect(r.totals).toEqual(buildHdTtReport(fixture()).totals);
  });

  it("is additive: every other field, the totals and the checks stay as before", () => {
    const r = buildHdTtReport(fixture());
    expect(Object.keys(r.rows[0])).toContain("linkId");
    expect(r.totals.invoiceTotal).toBe(93_420_000);
    expect(r.totals.actual).toBeCloseTo(95_670_000, 4);
    expect(r.checks.every((c) => c.ok)).toBe(true);
    expect(withoutLinkId(r.rows)[3]).toEqual({
      supplierId: 4, supplierName: "Chương Dương", counterpartyId: 13, counterpartyName: "Sobek",
      invoiceExVat: 1_000_000, invoiceVat: 80_000, invoiceTotal: 1_080_000, paidBook: 0, paidOverride: null, paid: 0, toPay: 1_080_000,
      overpaid: 0, paidRatio: 0, counterpartyActual: null, split: null, actual: 1_080_000, actualIsTemporary: false,
      actualMinusInvoice: 0, debt: 1_080_000, toRecover: 0, recovered: null, stillToRecover: 0, todo: null,
    });
  });

  it("follows the supplier when a new supplier inserts a row mid-list", () => {
    const before = buildHdTtReport(fixture()).rows;
    const after = buildHdTtReport(withNewSupplier()).rows;
    expect(after.map((r) => r.supplierName)).toEqual(["Đại Ngàn", "NCC Thử", "Bê tông HP", "Sobek", "Chương Dương", "Máy Lộc Tài"]);
    expect(linkIds(after)).toEqual({ ...linkIds(before), "NCC Thử": 206 });
    // Cùng vị trí 1 trước và sau: link khác nhau — nháp khóa theo vị trí sẽ ghi nhầm dòng.
    expect(before[1].linkId).toBe(202);
    expect(after[1].linkId).toBe(206);
  });
});
