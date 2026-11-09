/**
 * Unit: server action chốt kỳ / đối chiếu trả `{ ok, … }` thay vì ném — lỗi nghiệp vụ (biên kỳ, kỳ
 * đã ký, mốc chuyển đổi, Chủ thể) giữ nguyên văn để toast hiện được ở bản production; lỗi hạ tầng
 * trả thông điệp chung và được ghi log phía server.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAcl = vi.hoisted(() => {
  class ModuleRequestError extends Error {}
  return { requireReleasedModuleRequest: vi.fn(), ModuleRequestError };
});
const mockRequest = mockAcl.requireReleasedModuleRequest;
const mockClose = vi.hoisted(() => ({ previewPeriodClose: vi.fn(), commitPeriodClose: vi.fn() }));
const mockRecon = vi.hoisted(() => ({ createReconciliation: vi.fn(), softDeleteReconciliation: vi.fn() }));
const mockDerive = vi.hoisted(() => ({ signReconciliation: vi.fn(), unsignReconciliation: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/acl/released-module-request", () => mockAcl);
vi.mock("@/lib/vat-tu-ncc/period-close-service", () => mockClose);
vi.mock("@/lib/vat-tu-ncc/reconciliation-service", () => mockRecon);
vi.mock("@/lib/vat-tu-ncc/reconciliation-derive-service", () => mockDerive);

import { commitPeriodCloseAction, previewPeriodCloseAction } from "@/lib/vat-tu-ncc/period-close-actions";
import {
  createReconciliationAction,
  signReconciliationAction,
  softDeleteReconciliationAction,
  unsignReconciliationAction,
} from "@/lib/vat-tu-ncc/reconciliation-actions";
import { MaterialScopeError } from "@/lib/vat-tu-ncc/pair-scope";
import { GENERIC_ACTION_MESSAGE } from "@/lib/vat-tu-ncc/action-result";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRequest.mockResolvedValue({ userId: "u1", role: "admin" });
});

describe("period close actions", () => {
  it("xem trước: trả preview, guard đọc", async () => {
    const preview = { periodFrom: "2026-10-27", periodTo: "2026-11-26", deliveries: [] };
    mockClose.previewPeriodClose.mockResolvedValue(preview);
    await expect(previewPeriodCloseAction(1, 2, { from: "2026-10-27", to: "2026-11-26" })).resolves.toEqual({
      ok: true,
      preview,
    });
    expect(mockRequest).toHaveBeenCalledWith("vat-tu-ncc");
    expect(mockClose.previewPeriodClose).toHaveBeenCalledWith(1, 2, { from: "2026-10-27", to: "2026-11-26" });
  });

  it("chốt kỳ: trả số phiếu + tổng, guard edit", async () => {
    mockClose.commitPeriodClose.mockResolvedValue({ closedCount: 3, totalAmountTt: "150000" });
    const prices = [{ deliveryId: 9, unitPrice: 50_000 }];
    await expect(commitPeriodCloseAction(1, 2, { from: "2026-10-27", to: "2026-11-26" }, prices)).resolves.toEqual({
      ok: true,
      closedCount: 3,
      totalAmountTt: "150000",
    });
    expect(mockRequest).toHaveBeenCalledWith("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  });

  it("lỗi mốc chuyển đổi / kỳ đã ký được trả nguyên văn", async () => {
    mockClose.commitPeriodClose.mockRejectedValue(
      new MaterialScopeError("cutover_locked", "Ngày 20/10/2026 thuộc giai đoạn đã chuyển đổi từ Excel"),
    );
    await expect(commitPeriodCloseAction(1, 2, { from: "2026-10-01", to: "2026-10-26" }, [])).resolves.toEqual({
      ok: false,
      message: "Ngày 20/10/2026 thuộc giai đoạn đã chuyển đổi từ Excel",
    });

    mockClose.previewPeriodClose.mockRejectedValue(new Error("Kỳ mới phải bắt đầu ngay sau kỳ gần nhất."));
    await expect(previewPeriodCloseAction(1, 2)).resolves.toEqual({
      ok: false,
      message: "Kỳ mới phải bắt đầu ngay sau kỳ gần nhất.",
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("lỗi hạ tầng: thông điệp chung, ghi log", async () => {
    class PrismaLikeError extends Error {}
    mockClose.commitPeriodClose.mockRejectedValue(new PrismaLikeError("Transaction already closed"));
    await expect(commitPeriodCloseAction(1, 2, { from: "2026-10-27", to: "2026-11-26" }, [])).resolves.toEqual({
      ok: false,
      message: GENERIC_ACTION_MESSAGE,
    });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("reconciliation actions", () => {
  it("tạo kỳ: chỉ trả id, guard create", async () => {
    mockRecon.createReconciliation.mockResolvedValue({ id: 42, openingBalance: null });
    const input = { supplierId: 1, projectId: 2, periodFrom: "2026-10-27", periodTo: "2026-11-26" };
    await expect(createReconciliationAction(input)).resolves.toEqual({ ok: true, id: 42 });
    expect(mockRequest).toHaveBeenCalledWith("vat-tu-ncc", { minLevel: "create", scope: "module" });
  });

  it("ký / gỡ ký / xoá: ok khi thành công, guard edit", async () => {
    await expect(signReconciliationAction(5)).resolves.toEqual({ ok: true });
    await expect(unsignReconciliationAction(5)).resolves.toEqual({ ok: true });
    await expect(softDeleteReconciliationAction(5, 1)).resolves.toEqual({ ok: true });
    expect(mockDerive.signReconciliation).toHaveBeenCalledWith(5);
    expect(mockRecon.softDeleteReconciliation).toHaveBeenCalledWith(5, 1);
    expect(mockRequest).toHaveBeenCalledTimes(3);
    for (const call of mockRequest.mock.calls) {
      expect(call).toEqual(["vat-tu-ncc", { minLevel: "edit", scope: "module" }]);
    }
  });

  it("lỗi nghiệp vụ khi ký / gỡ ký và lỗi quyền được trả nguyên văn", async () => {
    mockDerive.signReconciliation.mockRejectedValue(new Error("Không thể ký kỳ 27/10/2026 – 26/11/2026: 2 phiếu trong kỳ chưa được chốt"));
    await expect(signReconciliationAction(5)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/chưa được chốt/) });

    mockDerive.unsignReconciliation.mockRejectedValue(new Error("Kỳ chuyển đổi từ Excel (gắn với lần import) — không gỡ ký"));
    await expect(unsignReconciliationAction(5)).resolves.toMatchObject({ ok: false, message: expect.stringMatching(/Kỳ chuyển đổi/) });

    mockRequest.mockRejectedValue(new mockAcl.ModuleRequestError("Forbidden"));
    await expect(softDeleteReconciliationAction(5, 1)).resolves.toEqual({ ok: false, message: "Forbidden" });
    expect(mockRecon.softDeleteReconciliation).not.toHaveBeenCalled();
  });
});
