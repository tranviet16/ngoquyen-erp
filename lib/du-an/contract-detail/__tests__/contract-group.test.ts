import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { buildContractFigures, resolveGroup } from "@/lib/du-an/contract-detail/contract-group";
import type { ContractRef, LedgerRowInput } from "@/lib/du-an/contract-detail/types";

function contract(id: number, over: Partial<ContractRef> = {}): ContractRef {
  return {
    id,
    projectId: 1,
    docType: "contract",
    partyKind: "ncc",
    supplierId: 10,
    contractorId: null,
    valueVnd: "1000",
    valueTtVnd: "900",
    deletedAt: null,
    ...over,
  };
}

const EMPTY_CDT = { acceptances: [], invoices: [], cashflows: [], projectContractValue: null };

describe("resolveGroup", () => {
  it("nhóm 3 hợp đồng cùng NCC, 1 hợp đồng thiếu V_tt: TT 2/3, DT cộng đủ 3", () => {
    const self = contract(1);
    const siblings = [
      self,
      contract(2, { valueVnd: new Prisma.Decimal(500), valueTtVnd: null }),
      contract(3, { valueVnd: "250.5", valueTtVnd: "0" }),
    ];
    const g = resolveGroup(self, siblings);
    expect(g).toEqual({
      partyKind: "ncc",
      contractIds: [1, 2, 3],
      valueDt: { sum: "1750.5", have: 3, total: 3 },
      valueTt: { sum: "900", have: 2, total: 3 },
    });
  });

  it("loại khỏi nhóm: đã xóa, khác công trình, khác NCC, khác loại đối tác, khác docType", () => {
    const self = contract(1);
    const g = resolveGroup(self, [
      contract(2, { deletedAt: new Date() }),
      contract(3, { projectId: 2 }),
      contract(4, { supplierId: 11 }),
      contract(5, { partyKind: "doi_thi_cong", supplierId: null, contractorId: 10 }),
      contract(6, { docType: "license" }),
    ]);
    expect(g?.contractIds).toEqual([1]);
  });

  it("hợp đồng hết hạn hoặc chấm dứt vẫn nằm trong nhóm (không lọc theo trạng thái)", () => {
    const expired = { ...contract(2), status: "expired" } as ContractRef;
    expect(resolveGroup(contract(1), [expired])?.contractIds).toEqual([1, 2]);
  });

  it("đội thi công gộp theo contractorId", () => {
    const doi = (id: number, contractorId: number) =>
      contract(id, { partyKind: "doi_thi_cong", supplierId: null, contractorId });
    expect(resolveGroup(doi(1, 5), [doi(2, 5), doi(3, 6)])?.contractIds).toEqual([1, 2]);
  });

  it("CĐT gộp mọi hợp đồng CĐT của công trình", () => {
    const cdt = (id: number) => contract(id, { partyKind: "cdt", supplierId: null });
    const g = resolveGroup(cdt(2), [cdt(1), cdt(3), contract(4)]);
    expect(g?.partyKind).toBe("cdt");
    expect(g?.contractIds).toEqual([1, 2, 3]);
  });

  it("không phải hợp đồng kinh tế, chưa gắn đối tác, loại đối tác lạ hoặc thiếu khóa: không có nhóm", () => {
    expect(resolveGroup(contract(1, { docType: "license" }), [])).toBeNull();
    expect(resolveGroup(contract(1, { partyKind: null, supplierId: null }), [])).toBeNull();
    expect(resolveGroup(contract(1, { partyKind: "khac" }), [])).toBeNull();
    expect(resolveGroup(contract(1, { supplierId: null }), [])).toBeNull();
  });
});

describe("buildContractFigures", () => {
  const ledgerRow: LedgerRowInput = {
    id: 1,
    entityId: 1,
    date: "2026-01-02",
    transactionType: "lay_hang",
    invoiceNo: null,
    invoiceDate: null,
    content: null,
    qty: null,
    itemName: null,
    incTt: "300",
    incHd: "0",
    decTt: "0",
    decHd: "0",
  };

  it("không phải hợp đồng kinh tế hoặc chưa gắn đối tác: không có khối số", () => {
    const source = { kind: "ledger" as const, rows: [ledgerRow], openings: [] };
    expect(buildContractFigures(contract(1, { docType: "license", partyKind: null, supplierId: null }), [], source)).toBeNull();
    expect(buildContractFigures(contract(1, { partyKind: null, supplierId: null }), [], source)).toBeNull();
  });

  it("NCC: ghép số sổ, phần chưa thực hiện theo nhóm và ghi chú đầu kỳ", () => {
    const f = buildContractFigures(contract(1), [contract(2, { valueTtVnd: null })], {
      kind: "ledger",
      rows: [ledgerRow],
      openings: [{ entityId: 1, openingTt: "50", openingHd: "0" }],
    });
    if (f?.partyKind !== "ncc") throw new Error("thiếu khối số NCC");
    expect(f.ledger.debt.conPhaiTraTt).toBe("350");
    expect(f.openingNote).toBe(true);
    expect(f.unfulfilled.layHang).toEqual({ dt: { kind: "amount", value: "1700" }, tt: { kind: "missing", have: 1, total: 2 } });
  });

  it("CĐT rỗng: tổng 0, tổng DT hợp đồng CĐT lấy từ nhóm để so với giá trị dự án", () => {
    const cdt = (id: number, valueVnd: string | null) => contract(id, { partyKind: "cdt", supplierId: null, valueVnd });
    const f = buildContractFigures(cdt(1, "3000"), [cdt(2, "1800"), cdt(3, null)], {
      kind: "cdt",
      inputs: { ...EMPTY_CDT, projectContractValue: "5000" },
    });
    if (f?.partyKind !== "cdt") throw new Error("thiếu khối số CĐT");
    expect(f.cdt).toMatchObject({ nghiemThu: "0", cdtContractsValueDt: "4800", projectValueMismatch: true });
    expect(f.openingNote).toBe(false);
    expect(f.unfulfilled.hoaDon.dt).toEqual({ kind: "missing", have: 2, total: 3 });
  });

  it("nguồn số sai loại đối tác là lỗi lập trình", () => {
    expect(() => buildContractFigures(contract(1), [], { kind: "cdt", inputs: EMPTY_CDT })).toThrow();
    const cdt = contract(1, { partyKind: "cdt", supplierId: null });
    expect(() => buildContractFigures(cdt, [], { kind: "ledger", rows: [], openings: [] })).toThrow();
  });
});
