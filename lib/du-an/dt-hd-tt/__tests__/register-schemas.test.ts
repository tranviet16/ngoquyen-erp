import { describe, expect, it } from "vitest";
import { counterpartyFieldsSchema, counterpartySupplierCreateSchema, groupCodeCreateSchema, mergePatch } from "../register-schemas";
import { parseNumberText } from "../register-ui";

describe("mergePatch", () => {
  const stored = { name: "Thanh Tùng", sortOrder: 3, note: "cũ" as string | null };

  it("only overwrites the fields present in the patch", () => {
    expect(mergePatch(stored, { sortOrder: 5 })).toEqual({ name: "Thanh Tùng", sortOrder: 5, note: "cũ" });
  });

  it("treats undefined as keep and null as clear", () => {
    expect(mergePatch(stored, { name: undefined, note: null })).toEqual({ name: "Thanh Tùng", sortOrder: 3, note: null });
  });

  it("ignores keys the stored row does not have", () => {
    expect(mergePatch(stored, { projectId: 99 } as unknown as Partial<typeof stored>)).toEqual(stored);
  });
});

describe("parseNumberText", () => {
  it("returns null for a blank field", () => {
    expect(parseNumberText("  ", "Số chốt tay")).toBeNull();
  });

  it("reads Vietnamese money formatting", () => {
    expect(parseNumberText("1.500.000", "Số chốt tay")).toBe(1_500_000);
    expect(parseNumberText("12,5", "Số chốt tay")).toBe(12.5);
    expect(parseNumberText("-200 000", "Số chốt tay")).toBe(-200_000);
  });

  it("reads a decimal with either separator", () => {
    expect(parseNumberText("0,95", "Hệ số", "decimal")).toBe(0.95);
    expect(parseNumberText("1.5", "Hệ số", "decimal")).toBe(1.5);
  });

  it("rejects unreadable text instead of saving null", () => {
    expect(() => parseNumberText("abc", "Hệ số", "decimal")).toThrow(/Hệ số: "abc" không phải số/);
    expect(() => parseNumberText("1,234,567", "Số chốt tay")).toThrow(/không phải số/);
  });
});

describe("register schemas", () => {
  it("requires a group code and name, defaulting flags", () => {
    expect(() => groupCodeCreateSchema.parse({ projectId: 1, code: " ", name: "Cọc" })).toThrow(/Mã nhóm không được để trống/);
    expect(groupCodeCreateSchema.parse({ projectId: 1, code: " COC-BTLT ", name: "Cọc" })).toMatchObject({
      code: "COC-BTLT", counterpartyId: null, isMainMaterial: false, sortOrder: 0, note: null,
    });
  });

  it("validates counterparty kind, basis and payment section", () => {
    const base = { name: "Ông Sơn", kind: "khac", actualBasis: "payments", paymentSection: "I" };
    expect(counterpartyFieldsSchema.parse(base)).toMatchObject({ paymentSection: "I", actualManualVnd: null, sortOrder: 0 });
    expect(() => counterpartyFieldsSchema.parse({ ...base, actualBasis: "ledger" })).toThrow(/Chọn nguồn thực tế/);
    expect(() => counterpartyFieldsSchema.parse({ ...base, paymentSection: "V" })).toThrow(/Mục chi phải là I–IV/);
  });

  it("does not accept typed HĐ-TT figures when linking a supplier", () => {
    const parsed = counterpartySupplierCreateSchema.parse({ projectId: 1, supplierId: 2, counterpartyId: null, paidOverrideVnd: 5 });
    expect(parsed).not.toHaveProperty("paidOverrideVnd");
  });
});
