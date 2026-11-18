/**
 * Unit: zod của hợp đồng dự án khớp các CHECK của DB — đúng khóa theo loại đối tác, chỉ hợp đồng kinh
 * tế mới gắn đối tác, đủ 5 loại tài liệu và 4 trạng thái mà import ghi được.
 */
import { describe, expect, it } from "vitest";
import { contractSchema } from "@/lib/du-an/schemas";
import { CONTRACT_DOC_TYPES, CONTRACT_STATUSES } from "@/lib/du-an/contract-labels";

const base = { projectId: 1, docName: "HĐ cung cấp", docType: "contract" as const, status: "active" as const };

describe("contractSchema", () => {
  it("NCC thiếu supplierId bị từ chối; có supplierId thì được", () => {
    const missing = contractSchema.safeParse({ ...base, partyKind: "ncc" });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual(["supplierId"]);
    expect(contractSchema.safeParse({ ...base, partyKind: "ncc", supplierId: 5 }).success).toBe(true);
  });

  it("đội thi công thiếu contractorId bị từ chối; khóa sai loại bị từ chối", () => {
    expect(contractSchema.safeParse({ ...base, partyKind: "doi_thi_cong" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, partyKind: "ncc", supplierId: 5, contractorId: 6 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, partyKind: "cdt", supplierId: 5 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, partyKind: null, supplierId: 5 }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, partyKind: "cdt" }).success).toBe(true);
  });

  it("giấy phép có partyKind bị từ chối", () => {
    const res = contractSchema.safeParse({ ...base, docType: "license", partyKind: "ncc", supplierId: 5 });
    expect(res.success).toBe(false);
    expect(res.error?.issues.map((i) => i.path[0])).toContain("partyKind");
  });

  it("đủ 5 loại tài liệu và 4 trạng thái đều hợp lệ", () => {
    for (const docType of CONTRACT_DOC_TYPES) {
      for (const status of CONTRACT_STATUSES) {
        expect(contractSchema.safeParse({ ...base, docType, status }).success, `${docType}/${status}`).toBe(true);
      }
    }
  });

  it("giá trị TT âm bị từ chối; null xóa được giá trị và ngày", () => {
    expect(contractSchema.safeParse({ ...base, valueTtVnd: -1 }).success).toBe(false);
    expect(
      contractSchema.safeParse({ ...base, valueVnd: null, valueTtVnd: null, expiryDate: null, signedDate: null, note: null }).success,
    ).toBe(true);
  });

  it("ngày không có thật hoặc sai dạng bị từ chối", () => {
    expect(contractSchema.safeParse({ ...base, expiryDate: "2026-02-30" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, signedDate: "18/11/2026" }).success).toBe(false);
    expect(contractSchema.safeParse({ ...base, signedDate: "2026-02-28" }).success).toBe(true);
  });

  it("tên tài liệu chỉ có khoảng trắng bị từ chối", () => {
    expect(contractSchema.safeParse({ ...base, docName: "   " }).success).toBe(false);
  });
});
