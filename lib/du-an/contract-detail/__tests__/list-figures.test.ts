import { describe, it, expect } from "vitest";
import {
  buildListFigure,
  sumByEntityRounded,
  sumReportRows,
  type ReportPairRow,
} from "@/lib/du-an/contract-detail/list-figures";
import type { ContractRef } from "@/lib/du-an/contract-detail/types";

function reportRow(entityId: number, partyId: number, cuoiKyTt: string, projectId: number | null = 1): ReportPairRow {
  return {
    entityId,
    partyId,
    projectId,
    openingTt: "0",
    phatSinhTt: cuoiKyTt,
    daTraTt: "0",
    cuoiKyTt,
    openingHd: "0",
    phatSinhHd: "0",
    daTraHd: "0",
    cuoiKyHd: "0",
  };
}

function contract(over: Partial<ContractRef> = {}): ContractRef {
  return {
    id: 1,
    projectId: 1,
    docType: "contract",
    partyKind: "ncc",
    supplierId: 10,
    contractorId: null,
    valueVnd: null,
    valueTtVnd: null,
    deletedAt: null,
    ...over,
  };
}

describe("sumByEntityRounded", () => {
  it("làm tròn theo từng Chủ thể rồi mới cộng: 0,50 + 0,50 ra 1 + 1 = 2 (cộng gộp trước sẽ ra 1)", () => {
    const t = sumByEntityRounded([
      { entityId: 1, incTt: "0.50" },
      { entityId: 2, incTt: "0.50" },
    ]);
    expect(t.phatSinhTt).toBe("2");
    expect(t.cuoiKyTt).toBe("2");
  });

  it("cộng chính xác trong một Chủ thể trước khi làm tròn", () => {
    const t = sumByEntityRounded([
      { entityId: 1, incTt: "0.25" },
      { entityId: 1, incTt: "0.25" },
    ]);
    expect(t.phatSinhTt).toBe("1");
  });

  it("nhận chung dòng sổ và số dư đầu kỳ; cuối kỳ làm tròn từ số chính xác", () => {
    const t = sumByEntityRounded([
      { entityId: 1, openingTt: "1000", openingHd: "900" },
      { entityId: 1, incTt: "500.4", incHd: "550", decTt: "0", decHd: "0" },
      { entityId: 1, incTt: "0", incHd: "0", decTt: "600.4", decHd: "650" },
    ]);
    expect(t).toEqual({
      openingTt: "1000",
      phatSinhTt: "500",
      daTraTt: "600",
      cuoiKyTt: "900",
      openingHd: "900",
      phatSinhHd: "550",
      daTraHd: "650",
      cuoiKyHd: "800",
    });
  });

  it("không có dòng nào thì mọi số bằng 0", () => {
    expect(sumByEntityRounded([]).cuoiKyHd).toBe("0");
  });
});

describe("sumReportRows", () => {
  it("cộng 8 số của các dòng báo cáo", () => {
    const t = sumReportRows([reportRow(1, 10, "300"), reportRow(2, 10, "-100")]);
    expect(t).toMatchObject({ phatSinhTt: "200", cuoiKyTt: "200", cuoiKyHd: "0" });
  });
});

describe("buildListFigure", () => {
  const canonical = {
    material: [reportRow(1, 10, "300"), reportRow(2, 10, "450"), reportRow(1, 11, "999"), reportRow(1, 10, "777", 2)],
    labor: [reportRow(1, 10, "123")],
  };
  const cdtTotals = { nghiemThu: "1000", daNhan: "650" };

  it("NCC: cuối kỳ TT = Σ qua các Chủ thể của đúng cặp NCC × công trình", () => {
    expect(buildListFigure(contract(), canonical, cdtTotals)).toEqual({ debtTt: "750" });
  });

  it("đội thi công đọc sổ nhân công theo contractorId", () => {
    const doi = contract({ partyKind: "doi_thi_cong", supplierId: null, contractorId: 10 });
    expect(buildListFigure(doi, canonical, cdtTotals)).toEqual({ debtTt: "123" });
  });

  it("CĐT: A' − C'", () => {
    const cdt = contract({ partyKind: "cdt", supplierId: null });
    expect(buildListFigure(cdt, canonical, cdtTotals)).toEqual({ debtTt: "350" });
  });

  it("cặp không có dòng báo cáo thì công nợ 0", () => {
    expect(buildListFigure(contract({ supplierId: 99 }), canonical, cdtTotals)).toEqual({ debtTt: "0" });
  });

  it("không phải hợp đồng kinh tế hoặc chưa gắn đối tác: null", () => {
    expect(buildListFigure(contract({ docType: "license" }), canonical, cdtTotals)).toEqual({ debtTt: null });
    expect(buildListFigure(contract({ partyKind: null, supplierId: null }), canonical, cdtTotals)).toEqual({ debtTt: null });
  });
});
