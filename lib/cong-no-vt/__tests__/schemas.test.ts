import { describe, it, expect } from "vitest";
import { openingBalanceSchema, transactionSchema } from "@/lib/cong-no-vt/schemas";
import { transactionSchema as laborTransactionSchema } from "@/lib/cong-no-nc/schemas";
import { normalizeTxType } from "@/lib/import/adapters/cong-no-vat-tu.parse";

const base = {
  date: "2026-05-26",
  entityId: 1,
  partyId: 2,
  projectId: 5,
  amountTt: "11448000",
};

describe("cong-no-vt transactionSchema thue_hd", () => {
  it("accepts thue_hd with invoiceNo and defaults amountHd to 0", () => {
    const r = transactionSchema.parse({ ...base, transactionType: "thue_hd", invoiceNo: "00000232" });
    expect(r.amountHd).toBe("0");
    expect(r.transactionType).toBe("thue_hd");
  });

  it("rejects thue_hd without a (non-blank) invoiceNo", () => {
    expect(transactionSchema.safeParse({ ...base, transactionType: "thue_hd" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, transactionType: "thue_hd", invoiceNo: "  " }).success).toBe(false);
  });

  it("keeps amountHd editable", () => {
    const r = transactionSchema.parse({ ...base, transactionType: "thue_hd", invoiceNo: "1", amountHd: "500" });
    expect(r.amountHd).toBe("500");
  });

  it("does not require invoiceNo for other types", () => {
    expect(transactionSchema.safeParse({ ...base, transactionType: "lay_hang" }).success).toBe(true);
  });

  it("labor ledger schema keeps projectId optional (labor unchanged)", () => {
    const { projectId: _omit, ...withoutProject } = base;
    void _omit;
    expect(laborTransactionSchema.safeParse({ ...withoutProject, transactionType: "lay_hang", amountHd: "0" }).success).toBe(true);
  });

  it("labor ledger schema rejects thue_hd", () => {
    const r = laborTransactionSchema.safeParse({ ...base, transactionType: "thue_hd", amountHd: "0", invoiceNo: "1" });
    expect(r.success).toBe(false);
  });
});

describe("cong-no-vt schemas — công trình bắt buộc (NCC × công trình)", () => {
  const { projectId: _omit, ...withoutProject } = base;
  void _omit;

  it("rejects a material transaction without projectId, with a Vietnamese message", () => {
    const r = transactionSchema.safeParse({ ...withoutProject, transactionType: "lay_hang" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["projectId"], message: "Chọn công trình" });
  });

  it("rejects projectId null or non-positive", () => {
    expect(transactionSchema.safeParse({ ...base, transactionType: "lay_hang", projectId: null }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, transactionType: "lay_hang", projectId: 0 }).success).toBe(false);
  });

  it("requires projectId on material opening balances", () => {
    const opening = { entityId: 1, partyId: 2, balanceTt: "100", balanceHd: "0", asOfDate: "2025-12-31" };
    expect(openingBalanceSchema.safeParse(opening).success).toBe(false);
    expect(openingBalanceSchema.safeParse({ ...opening, projectId: null }).success).toBe(false);
    expect(openingBalanceSchema.safeParse({ ...opening, projectId: 5 }).success).toBe(true);
  });
});

describe("normalizeTxType", () => {
  it("maps thuế to thue_hd only when allowTax", () => {
    expect(normalizeTxType("Thuế HĐ", true)).toBe("thue_hd");
    expect(normalizeTxType("Thuế HĐ")).toBe("lay_hang");
  });

  it("checks payment before tax", () => {
    expect(normalizeTxType("Thuế đã trả", true)).toBe("thanh_toan");
  });
});
