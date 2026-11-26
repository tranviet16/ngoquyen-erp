import { describe, expect, it } from "vitest";
import {
  parseSupplierKind,
  supplierKindLabel,
  SUPPLIER_KIND_OPTIONS,
} from "@/lib/master-data/supplier-kind";

describe("parseSupplierKind", () => {
  it("accepts the two kinds", () => {
    expect(parseSupplierKind("vat_tu")).toBe("vat_tu");
    expect(parseSupplierKind("nhan_cong")).toBe("nhan_cong");
  });

  it("treats empty or unknown values as all kinds (null)", () => {
    expect(parseSupplierKind(undefined)).toBeNull();
    expect(parseSupplierKind("")).toBeNull();
    expect(parseSupplierKind("labor")).toBeNull();
    expect(parseSupplierKind(1)).toBeNull();
  });

  it("reads the first value of a repeated URL param", () => {
    expect(parseSupplierKind(["nhan_cong", "vat_tu"])).toBe("nhan_cong");
  });
});

describe("supplierKindLabel", () => {
  it("shows Vietnamese labels and falls back to the raw code", () => {
    expect(supplierKindLabel("vat_tu")).toBe("Vật tư");
    expect(supplierKindLabel("nhan_cong")).toBe("Nhân công");
    expect(supplierKindLabel("x")).toBe("x");
    expect(supplierKindLabel(null)).toBe("");
  });

  it("offers both kinds as select options", () => {
    expect(SUPPLIER_KIND_OPTIONS.map((o) => o.id)).toEqual(["vat_tu", "nhan_cong"]);
  });
});
