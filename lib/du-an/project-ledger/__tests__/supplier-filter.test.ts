import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({ $queryRaw: vi.fn(), ledgerOpeningBalance: { findMany: vi.fn() }, supplier: { findMany: vi.fn() } }));
const mockRequest = vi.hoisted(() => ({ requireReleasedModuleRequest: vi.fn() }));
const mockEffective = vi.hoisted(() => ({ canAccess: vi.fn() }));
const mockReport = vi.hoisted(() => ({ queryDetailReport: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("@/lib/acl/released-module-request", () => mockRequest);
vi.mock("@/lib/acl/effective", () => mockEffective);
vi.mock("@/lib/cong-no-vt/balance-report-service", () => mockReport);

import { loadProjectLedger, loadProjectLedgerSwitchInfo, parseSupplierFilter } from "@/lib/du-an/project-ledger/project-ledger-loader";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("parseSupplierFilter", () => {
  it("tách dấu phẩy, bỏ khoảng trắng và trùng", () => {
    expect(parseSupplierFilter("3, 1,3 ,2")).toEqual([3, 1, 2]);
  });

  it("tham số lặp (mảng) → lấy phần tử đầu", () => {
    expect(parseSupplierFilter(["5,6", "7"])).toEqual([5, 6]);
  });

  it("bỏ số âm, số 0, số lẻ, chữ và giá trị vượt int4", () => {
    expect(parseSupplierFilter("-1,0,1.5,abc,2147483648,2147483647,4")).toEqual([2147483647, 4]);
  });

  it("rỗng hoặc không còn gì hợp lệ → không lọc", () => {
    expect(parseSupplierFilter(undefined)).toBeNull();
    expect(parseSupplierFilter("")).toBeNull();
    expect(parseSupplierFilter(" , ,")).toBeNull();
    expect(parseSupplierFilter("x,-3")).toBeNull();
    expect(parseSupplierFilter([])).toBeNull();
  });
});

describe("loader chặn mã công trình không hợp lệ trước mọi truy vấn", () => {
  it.each([0, -1, 1.5, Number.NaN, 2147483648])("projectId %s bị từ chối", async (projectId) => {
    await expect(loadProjectLedger(projectId, { withRows: true })).rejects.toThrow("Mã công trình không hợp lệ");
    await expect(loadProjectLedgerSwitchInfo(projectId)).rejects.toThrow("Mã công trình không hợp lệ");
    expect(mockRequest.requireReleasedModuleRequest).not.toHaveBeenCalled();
    expect(mockReport.queryDetailReport).not.toHaveBeenCalled();
    expect(mockDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("thiếu quyền dự án → lỗi của guard, không đọc báo cáo", async () => {
    mockRequest.requireReleasedModuleRequest.mockRejectedValue(new Error("Forbidden"));
    await expect(loadProjectLedger(5, { withRows: false })).rejects.toThrow("Forbidden");
    expect(mockRequest.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "read", scope: { kind: "project", projectId: 5 } });
    expect(mockReport.queryDetailReport).not.toHaveBeenCalled();
  });

  it("báo cáo luôn được gọi với đúng một công trình, lũy kế toàn bộ, hiện cả dòng 0", async () => {
    mockRequest.requireReleasedModuleRequest.mockResolvedValue({ userId: "u1", role: "viewer" });
    mockEffective.canAccess.mockResolvedValue(false);
    mockReport.queryDetailReport.mockResolvedValue({ rows: [], subtotals: [], periodEnd: null });
    mockDb.$queryRaw.mockResolvedValue([]);
    const r = await loadProjectLedger(5, { withRows: true, supplierIds: [1] });
    expect(mockReport.queryDetailReport).toHaveBeenCalledWith({ ledgerType: "material", projectIds: [5], showZero: true });
    expect(r).toMatchObject({ rowsVisible: false, suppliers: [] });
    expect(r).not.toHaveProperty("rows");
    expect(r).not.toHaveProperty("openings");
    expect(r).not.toHaveProperty("rowCount");
  });
});
