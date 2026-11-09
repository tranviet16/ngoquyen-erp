/**
 * Unit: tổng quan theo công trình — cột nợ chỉ trả khi có quyền đọc cong-no-vt, số nợ cộng theo NCC
 * từ queryDetailReport, kỳ gần nhất mỗi NCC đúng trạng thái (chuyển đổi / đã ký / chưa ký).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn(), findMany: vi.fn() },
  supplier: { findMany: vi.fn() },
  supplierDeliveryDaily: { groupBy: vi.fn() },
  supplierReconciliation: { findMany: vi.fn() },
}));
const mockRequest = vi.hoisted(() => vi.fn());
const mockCanAccess = vi.hoisted(() => vi.fn());
const mockReport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: mockRequest }));
vi.mock("@/lib/acl/effective", () => ({ canAccess: mockCanAccess }));
vi.mock("@/lib/cong-no-vt/balance-report-service", () => ({ queryDetailReport: mockReport }));

import { listPairsOfProject, listSupplierProjects } from "@/lib/vat-tu-ncc/project-overview-service";

const PROJECT = { id: 7, code: "TC", name: "Trại Chuối", entityId: 1, entity: { name: "Ngô Quyền" } };

function reportRow(partyId: number, entityId: number, cuoiKyTt: string, cuoiKyHd: string) {
  return { partyId, entityId, cuoiKyTt, cuoiKyHd };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockRequest.mockResolvedValue({ userId: "u1", role: "ketoan" });
  mockDb.project.findFirst.mockResolvedValue(PROJECT);
  mockDb.$queryRaw.mockResolvedValue([{ supplier_id: 10 }, { supplier_id: 11 }]);
  mockDb.supplier.findMany.mockResolvedValue([
    { id: 11, name: "Bê tông HP" },
    { id: 10, name: "Ánh Dương" },
  ]);
  mockDb.supplierDeliveryDaily.groupBy.mockResolvedValue([
    { supplierId: 10, _count: { id: 3 }, _max: { date: new Date("2026-10-12T00:00:00Z") } },
  ]);
  mockDb.supplierReconciliation.findMany.mockResolvedValue([
    // Sắp periodTo giảm dần: dòng đầu mỗi NCC là kỳ gần nhất.
    { id: 5, supplierId: 10, periodFrom: new Date("2026-09-27Z"), periodTo: new Date("2026-10-26Z"), signedBySupplier: false, importRunId: null },
    { id: 4, supplierId: 11, periodFrom: new Date("2026-01-01Z"), periodTo: new Date("2026-10-26Z"), signedBySupplier: true, importRunId: 99 },
    { id: 3, supplierId: 10, periodFrom: new Date("2026-08-27Z"), periodTo: new Date("2026-09-26Z"), signedBySupplier: true, importRunId: null },
  ]);
  mockReport.mockResolvedValue({
    rows: [
      reportRow(10, 1, "27200000", "0"),
      // Dòng cũ mang Chủ thể khác của cùng cặp → phải cộng chung vào NCC 10.
      reportRow(10, 2, "800000", "100000"),
    ],
    subtotals: [],
    periodEnd: null,
  });
});

describe("listPairsOfProject", () => {
  it("không trả số nợ khi người dùng không có quyền đọc cong-no-vt", async () => {
    mockCanAccess.mockResolvedValue(false);

    const result = await listPairsOfProject(7, { includeDebt: true });

    expect(mockCanAccess).toHaveBeenCalledWith("u1", "cong-no-vt", { minLevel: "read", scope: "module" });
    expect(result?.debtVisible).toBe(false);
    expect(result?.pairs).toHaveLength(2);
    expect(result?.pairs.every((p) => p.debt === null)).toBe(true);
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("không tính số nợ khi trang không yêu cầu, kể cả người có quyền", async () => {
    mockCanAccess.mockResolvedValue(true);
    const result = await listPairsOfProject(7);
    expect(result?.debtVisible).toBe(false);
    expect(mockCanAccess).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("có quyền: nợ từng NCC = tổng dòng queryDetailReport của công trình (mọi Chủ thể)", async () => {
    mockCanAccess.mockResolvedValue(true);

    const result = await listPairsOfProject(7, { includeDebt: true });

    expect(mockReport).toHaveBeenCalledWith(
      expect.objectContaining({ ledgerType: "material", projectIds: [7], showZero: true, to: expect.any(Date) }),
    );
    expect(result?.debtVisible).toBe(true);
    const byId = new Map(result?.pairs.map((p) => [p.supplierId, p]));
    expect(byId.get(10)?.debt).toEqual({ tt: "28000000", hd: "100000" });
    // NCC không có dòng sổ → nợ 0, không phải null.
    expect(byId.get(11)?.debt).toEqual({ tt: "0", hd: "0" });
  });

  it("kỳ gần nhất mỗi NCC đúng trạng thái; số phiếu và ngày phiếu gần nhất; sắp theo tên NCC", async () => {
    mockCanAccess.mockResolvedValue(false);

    const result = await listPairsOfProject(7, { includeDebt: false });

    expect(result?.pairs.map((p) => p.supplierName)).toEqual(["Ánh Dương", "Bê tông HP"]);
    const [anhDuong, betong] = result!.pairs;
    expect(anhDuong).toMatchObject({
      supplierId: 10,
      deliveryCount: 3,
      lastDeliveryDate: "2026-10-12",
      latestPeriod: { id: 5, periodFrom: "2026-09-27", periodTo: "2026-10-26", status: "unsigned" },
    });
    expect(betong).toMatchObject({ deliveryCount: 0, lastDeliveryDate: null, latestPeriod: { id: 4, status: "cutover" } });
  });

  it("trả null khi công trình không tồn tại; từ chối projectId không hợp lệ", async () => {
    mockDb.project.findFirst.mockResolvedValue(null);
    await expect(listPairsOfProject(7)).resolves.toBeNull();
    await expect(listPairsOfProject(0)).rejects.toThrow(/công trình/i);
  });

  it("guard module chạy trước mọi truy vấn", async () => {
    mockRequest.mockRejectedValue(new Error("Forbidden"));
    await expect(listPairsOfProject(7, { includeDebt: true })).rejects.toThrow("Forbidden");
    expect(mockDb.project.findFirst).not.toHaveBeenCalled();
  });
});

describe("listSupplierProjects", () => {
  it("trả công trình có hoạt động của NCC, bỏ qua công trình đã xoá", async () => {
    mockDb.$queryRaw.mockResolvedValue([{ project_id: 7 }, { project_id: 8 }]);
    mockDb.project.findMany.mockResolvedValue([{ id: 7, code: "TC", name: "Trại Chuối" }]);

    const result = await listSupplierProjects(10);

    expect(result).toEqual([{ id: 7, code: "TC", name: "Trại Chuối" }]);
    expect(mockDb.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [7, 8] }, deletedAt: null } }),
    );
  });

  it("từ chối mã NCC không hợp lệ", async () => {
    await expect(listSupplierProjects(-1)).rejects.toThrow(/Mã NCC không hợp lệ/);
  });
});
