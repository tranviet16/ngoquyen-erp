/**
 * Tạo danh mục ngay trong ô chọn: chỉ admin, tên gần trùng thì hỏi trước, mã trùng thì từ chối,
 * lỗi luôn trả về dạng { ok: false, message } (bản production ẩn thông điệp của lỗi ném ra).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  supplier: { findMany: vi.fn(), create: vi.fn() },
  contractor: { findMany: vi.fn(), create: vi.fn() },
  entity: { findMany: vi.fn(), create: vi.fn() },
  item: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  project: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
}));
const mockModuleRequest = vi.hoisted(() => vi.fn());
const mockRequireActiveAdmin = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: (...args: unknown[]) => mockModuleRequest(...args),
  ModuleRequestError: class ModuleRequestError extends Error {
    constructor(public readonly reason: string) {
      super(reason);
    }
  },
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: () => mockRequireActiveAdmin(),
}));

import { quickCreateRecordAction } from "@/lib/master-data/quick-create-actions";
import { ModuleRequestError } from "@/lib/acl/released-module-request";

beforeEach(() => {
  vi.resetAllMocks();
  mockModuleRequest.mockResolvedValue({ userId: "admin-1", role: "admin" });
  mockRequireActiveAdmin.mockResolvedValue("admin-1");
  for (const model of Object.values(mockDb)) model.findMany.mockResolvedValue([]);
  mockDb.item.findFirst.mockResolvedValue(null);
  mockDb.project.findFirst.mockResolvedValue(null);
});

describe("quickCreateRecordAction", () => {
  it("tạo NCC khi không có tên gần trùng và trả bản ghi để ô chọn chọn ngay", async () => {
    mockDb.supplier.create.mockResolvedValue({ id: 51, name: "Thép Việt Đức" });

    const result = await quickCreateRecordAction("supplier", { name: "  Thép Việt Đức " });

    expect(result).toEqual({ ok: true, record: { kind: "supplier", id: 51, name: "Thép Việt Đức" } });
    expect(mockDb.supplier.create).toHaveBeenCalledWith({ data: { name: "Thép Việt Đức" } });
    expect(mockModuleRequest).toHaveBeenCalledWith("master-data");
  });

  it("tên gần trùng: không tạo, trả danh sách bản ghi cũ để hỏi người dùng", async () => {
    mockDb.supplier.findMany.mockResolvedValue([
      { id: 7, name: "Thép Hòa Phát" },
      { id: 8, name: "Xi măng" },
    ]);

    const result = await quickCreateRecordAction("supplier", { name: "thep hoa phat" });

    expect(result).toMatchObject({
      ok: false,
      code: "similar_name",
      similar: [{ kind: "supplier", id: 7, name: "Thép Hòa Phát" }],
    });
    expect(mockDb.supplier.create).not.toHaveBeenCalled();
  });

  it("người dùng xác nhận vẫn tạo: bỏ qua kiểm tên gần trùng", async () => {
    mockDb.contractor.findMany.mockResolvedValue([{ id: 3, name: "Đội Hùng" }]);
    mockDb.contractor.create.mockResolvedValue({ id: 9, name: "Đội Hùng" });

    const result = await quickCreateRecordAction("contractor", { name: "Đội Hùng" }, { allowSimilarName: true });

    expect(result).toEqual({ ok: true, record: { kind: "contractor", id: 9, name: "Đội Hùng" } });
    expect(mockDb.contractor.findMany).not.toHaveBeenCalled();
  });

  it("vật tư: trả mã, đơn vị và loại để form phiếu điền đơn vị", async () => {
    mockDb.item.create.mockResolvedValue({ id: 180, code: "G-01", name: "Gạch đặc", unit: "viên", type: "material" });

    const result = await quickCreateRecordAction("item", { code: "G-01", name: "Gạch đặc", unit: "viên", type: "material" });

    expect(result).toEqual({
      ok: true,
      record: { kind: "item", id: 180, name: "Gạch đặc", code: "G-01", unit: "viên", itemType: "material" },
    });
  });

  it("mã vật tư đã dùng: từ chối kèm tên vật tư đang giữ mã, kể cả khi đã xác nhận tên", async () => {
    mockDb.item.findFirst.mockResolvedValue({ name: "Gạch lỗ" });

    const result = await quickCreateRecordAction(
      "item",
      { code: "G-01", name: "Gạch đặc", unit: "viên", type: "material" },
      { allowSimilarName: true },
    );

    expect(result).toEqual({ ok: false, message: 'Mã "G-01" đã được dùng cho vật tư "Gạch lỗ"' });
    expect(mockDb.item.create).not.toHaveBeenCalled();
  });

  it("dự án: kiểm mã trước khi hỏi tên gần trùng", async () => {
    mockDb.project.findFirst.mockResolvedValue({ name: "346 Cát Dài" });
    mockDb.project.findMany.mockResolvedValue([{ id: 5, name: "346 Cát Dài", code: "CD346" }]);

    const result = await quickCreateRecordAction("project", { code: "CD346", name: "346 Cát Dài", status: "active" });

    expect(result).toEqual({ ok: false, message: 'Mã "CD346" đã được dùng cho dự án / công trình "346 Cát Dài"' });
  });

  it("thiếu trường bắt buộc: trả thông điệp kiểm dữ liệu", async () => {
    const result = await quickCreateRecordAction("entity", { name: "", type: "company" });

    expect(result).toEqual({ ok: false, message: "Tên không được để trống" });
  });

  it("không phải admin: từ chối, không đọc hay ghi danh mục", async () => {
    mockRequireActiveAdmin.mockRejectedValue(new Error("Chỉ admin được thao tác"));

    const result = await quickCreateRecordAction("supplier", { name: "NCC mới" });

    expect(result).toEqual({ ok: false, message: "Chỉ admin được thao tác" });
    expect(mockDb.supplier.findMany).not.toHaveBeenCalled();
    expect(mockDb.supplier.create).not.toHaveBeenCalled();
  });

  it("không có quyền module Danh mục: thông điệp tiếng Việt", async () => {
    mockModuleRequest.mockRejectedValue(new ModuleRequestError("forbidden"));

    const result = await quickCreateRecordAction("supplier", { name: "NCC mới" });

    expect(result).toEqual({ ok: false, message: "Bạn không có quyền tạo danh mục" });
  });
});
