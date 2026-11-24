import { describe, it, expect } from "vitest";
import { groupInvoiceRows, MISSING_INVOICE_NO_LABEL } from "@/lib/du-an/contract-detail/invoice-grouping";

const r = (invoiceNo: string | null, amount: string, invoiceDate: string | null = null) => ({
  invoiceNo,
  invoiceDate,
  amount,
});

describe("groupInvoiceRows", () => {
  it('" HD1" và "HD1" gộp một nhóm, dòng không số đứng riêng; Σ nhóm = Σ dòng', () => {
    const { groups, missingNoCount } = groupInvoiceRows([
      r(" HD1", "100", "2026-03-05"),
      r("HD1", "50", "2026-03-01"),
      r(null, "20"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ key: "no:HD1", invoiceNo: "HD1", label: "HD1", invoiceDate: "2026-03-01", total: "150" });
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[1]).toMatchObject({ invoiceNo: null, label: MISSING_INVOICE_NO_LABEL, total: "20" });
    expect(missingNoCount).toBe(1);
    expect(groups.reduce((s, g) => s + Number(g.total), 0)).toBe(170);
  });

  it("số HĐ chỉ có khoảng trắng coi như chưa ghi số; mỗi dòng không số một nhóm, khóa khác nhau", () => {
    const { groups, missingNoCount } = groupInvoiceRows([r("  ", "1"), r(null, "2")]);
    expect(groups.map((g) => g.label)).toEqual([MISSING_INVOICE_NO_LABEL, MISSING_INVOICE_NO_LABEL]);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
    expect(missingNoCount).toBe(2);
  });

  it("giữ thứ tự xuất hiện đầu tiên và cộng cả dòng âm", () => {
    const { groups } = groupInvoiceRows([r("B", "10"), r("A", "5"), r("B", "-3")]);
    expect(groups.map((g) => [g.label, g.total])).toEqual([
      ["B", "7"],
      ["A", "5"],
    ]);
  });

  it("đầu vào rỗng", () => {
    expect(groupInvoiceRows([])).toEqual({ groups: [], missingNoCount: 0 });
  });
});
