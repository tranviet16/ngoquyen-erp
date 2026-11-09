/**
 * Unit: server action lưới phiếu ngày trả kết quả thay vì ném — lỗi nghiệp vụ (khoá kỳ, mốc chuyển
 * đổi, zod) giữ nguyên văn để toast hiện được ở bản production; lỗi hạ tầng trả thông điệp chung.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockAcl = vi.hoisted(() => {
  class ModuleRequestError extends Error {}
  return { requireReleasedModuleRequest: vi.fn(), ModuleRequestError };
});
const mockRequest = mockAcl.requireReleasedModuleRequest;
const mockService = vi.hoisted(() => ({
  createDelivery: vi.fn(),
  updateDelivery: vi.fn(),
  softDeleteDelivery: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/acl/released-module-request", () => mockAcl);
vi.mock("@/lib/vat-tu-ncc/delivery-service", () => mockService);

import { createDeliveryAction, deleteDeliveryAction, updateDeliveryAction } from "@/lib/vat-tu-ncc/delivery-actions";
import { MaterialScopeError } from "@/lib/vat-tu-ncc/pair-scope";
import type { DeliveryInput } from "@/lib/vat-tu-ncc/schemas";

const { ModuleRequestError } = mockAcl;

const INPUT: DeliveryInput = {
  supplierId: 1,
  projectId: 2,
  date: "2026-10-15",
  itemId: 3,
  qty: 1,
  unit: "m3",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRequest.mockResolvedValue({ userId: "u1", role: "admin" });
});

describe("delivery actions", () => {
  it("trả ok khi ghi thành công, guard đúng cấp quyền", async () => {
    mockService.createDelivery.mockResolvedValue({ id: 1 });
    await expect(createDeliveryAction(INPUT)).resolves.toEqual({ ok: true });
    expect(mockRequest).toHaveBeenCalledWith("vat-tu-ncc", { minLevel: "create", scope: "module" });

    mockService.updateDelivery.mockResolvedValue({ id: 1 });
    await expect(updateDeliveryAction(1, INPUT)).resolves.toEqual({ ok: true });
    expect(mockRequest).toHaveBeenLastCalledWith("vat-tu-ncc", { minLevel: "edit", scope: "module" });
    expect(mockService.updateDelivery).toHaveBeenCalledWith(1, INPUT);
  });

  it("lỗi khoá kỳ (Error thuần) được trả nguyên văn", async () => {
    mockService.createDelivery.mockRejectedValue(
      new Error("Kỳ 27/09/2026 – 26/10/2026 đã được NCC ký xác nhận — không thể ghi/sửa."),
    );
    await expect(createDeliveryAction(INPUT)).resolves.toEqual({
      ok: false,
      message: "Kỳ 27/09/2026 – 26/10/2026 đã được NCC ký xác nhận — không thể ghi/sửa.",
    });
  });

  it("MaterialScopeError (mốc chuyển đổi) và lỗi quyền được trả nguyên văn", async () => {
    mockService.softDeleteDelivery.mockRejectedValue(new MaterialScopeError("cutover_locked", "Ngày 15/10/2026 thuộc giai đoạn đã chuyển đổi"));
    await expect(deleteDeliveryAction(5, 1)).resolves.toEqual({ ok: false, message: "Ngày 15/10/2026 thuộc giai đoạn đã chuyển đổi" });

    mockRequest.mockRejectedValue(new ModuleRequestError("Forbidden"));
    await expect(deleteDeliveryAction(5, 1)).resolves.toEqual({ ok: false, message: "Forbidden" });
  });

  it("lỗi zod gộp thông điệp các trường", async () => {
    const zodError = z.object({ projectId: z.number({ error: "Chọn công trình" }) }).safeParse({}).error;
    mockService.createDelivery.mockRejectedValue(zodError);
    await expect(createDeliveryAction(INPUT)).resolves.toEqual({ ok: false, message: "Chọn công trình" });
  });

  it("lỗi hạ tầng (lớp con của Error) không lộ chi tiết, được ghi log", async () => {
    class PrismaLikeError extends Error {}
    mockService.updateDelivery.mockRejectedValue(new PrismaLikeError('violates check constraint "supplier_delivery_project_required"'));

    const result = await updateDeliveryAction(1, INPUT);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/Lỗi hệ thống/);
    expect(console.error).toHaveBeenCalled();
  });
});
