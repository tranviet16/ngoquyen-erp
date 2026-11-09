/**
 * Unit: server action ghi sổ / số dư vật tư cho client trả `{ ok, … }` thay vì ném — lỗi khoá kỳ,
 * mốc chuyển đổi, thiếu công trình hiện được trên toast ở bản production; lỗi hạ tầng trả thông
 * điệp chung. Dữ liệu trả về đúng hình dạng lưới cần (`row` / `rows`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAcl = vi.hoisted(() => {
  class ModuleRequestError extends Error {}
  return { requireReleasedModuleRequest: vi.fn(), ModuleRequestError };
});
const mockRequest = mockAcl.requireReleasedModuleRequest;
const mockService = vi.hoisted(() => ({
  createMaterialTransaction: vi.fn(),
  patchMaterialTransaction: vi.fn(),
  adminPatchMaterialTransaction: vi.fn(),
  bulkUpsertMaterialTransactions: vi.fn(),
  softDeleteMaterialTransaction: vi.fn(),
  softDeleteMaterialTransactions: vi.fn(),
  patchMaterialOpeningBalance: vi.fn(),
  bulkUpsertMaterialOpeningBalances: vi.fn(),
  deleteMaterialOpeningBalances: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/acl/released-module-request", () => mockAcl);
vi.mock("@/lib/cong-no-vt/material-ledger-service", () => mockService);

import {
  adminPatchMaterialTransactionAction,
  bulkUpsertMaterialOpeningBalancesAction,
  bulkUpsertMaterialTransactionsAction,
  createMaterialTransactionAction,
  deleteMaterialOpeningBalancesAction,
  patchMaterialOpeningBalanceAction,
  patchMaterialTransactionAction,
  softDeleteMaterialTransactionAction,
  softDeleteMaterialTransactionsAction,
} from "@/lib/cong-no-vt/material-ledger-actions";
import { MaterialScopeError } from "@/lib/vat-tu-ncc/pair-scope";
import { GENERIC_ACTION_MESSAGE } from "@/lib/vat-tu-ncc/action-result";
import type { TransactionInput } from "@/lib/cong-no-vt/schemas";

const TX_INPUT: TransactionInput = {
  date: "2026-11-02",
  transactionType: "thanh_toan",
  entityId: 1,
  partyId: 3,
  projectId: 11,
  amountTt: "500000",
  vatPctTt: "0",
  amountHd: "0",
  vatPctHd: "0",
  status: "pending",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockRequest.mockResolvedValue({ userId: "u1", role: "admin" });
});

describe("material ledger actions — kết quả thành công", () => {
  it("tạo / sửa / xoá giao dịch (tab Thanh toán) và guard đúng cấp quyền", async () => {
    mockService.createMaterialTransaction.mockResolvedValue({ id: 7, partyId: 3 });
    await expect(createMaterialTransactionAction(TX_INPUT)).resolves.toEqual({ ok: true, id: 7 });
    expect(mockRequest).toHaveBeenLastCalledWith("cong-no-vt", { minLevel: "create", scope: "module" });

    mockService.patchMaterialTransaction.mockResolvedValue({ id: 7, totalTt: "1" });
    await expect(patchMaterialTransactionAction(7, { amountTt: "1" })).resolves.toEqual({
      ok: true,
      row: { id: 7, totalTt: "1" },
    });
    expect(mockRequest).toHaveBeenLastCalledWith("cong-no-vt", { minLevel: "edit", scope: "module" });

    await expect(softDeleteMaterialTransactionAction(7)).resolves.toEqual({ ok: true });
    expect(mockService.softDeleteMaterialTransaction).toHaveBeenCalledWith(7);
  });

  it("lưới sổ: patch admin trả row, bulk trả rows, xoá nhiều trả ok", async () => {
    mockService.adminPatchMaterialTransaction.mockResolvedValue({ id: 8, totalTt: "9" });
    await expect(adminPatchMaterialTransactionAction(8, { totalTt: "9" })).resolves.toEqual({
      ok: true,
      row: { id: 8, totalTt: "9" },
    });
    expect(mockRequest).toHaveBeenLastCalledWith("cong-no-vt", { minLevel: "read", scope: "module" });

    mockService.bulkUpsertMaterialTransactions.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await expect(bulkUpsertMaterialTransactionsAction([{ id: 1 }, { partyId: 3 }])).resolves.toEqual({
      ok: true,
      rows: [{ id: 1 }, { id: 2 }],
    });

    await expect(softDeleteMaterialTransactionsAction([1, 2])).resolves.toEqual({ ok: true });
    expect(mockService.softDeleteMaterialTransactions).toHaveBeenCalledWith([1, 2]);
  });

  it("lưới số dư: patch trả row, bulk trả rows, xoá nhiều trả ok", async () => {
    mockService.patchMaterialOpeningBalance.mockResolvedValue({ id: 10, projectId: 200 });
    await expect(patchMaterialOpeningBalanceAction(10, { projectId: 200 })).resolves.toEqual({
      ok: true,
      row: { id: 10, projectId: 200 },
    });
    mockService.bulkUpsertMaterialOpeningBalances.mockResolvedValue([{ id: 10 }]);
    await expect(bulkUpsertMaterialOpeningBalancesAction([{ id: 10 }])).resolves.toEqual({ ok: true, rows: [{ id: 10 }] });
    await expect(deleteMaterialOpeningBalancesAction([10])).resolves.toEqual({ ok: true });
    for (const call of mockRequest.mock.calls) {
      expect(call).toEqual(["cong-no-vt", { minLevel: "edit", scope: "module" }]);
    }
  });
});

describe("material ledger actions — lỗi", () => {
  it("lỗi khoá kỳ (Error thuần) và mốc chuyển đổi (MaterialScopeError) trả nguyên văn", async () => {
    mockService.patchMaterialTransaction.mockRejectedValue(
      new Error("Kỳ 27/09/2026 – 26/10/2026 đã được NCC ký xác nhận — không thể ghi/sửa."),
    );
    await expect(patchMaterialTransactionAction(7, {})).resolves.toEqual({
      ok: false,
      message: "Kỳ 27/09/2026 – 26/10/2026 đã được NCC ký xác nhận — không thể ghi/sửa.",
    });

    mockService.bulkUpsertMaterialOpeningBalances.mockRejectedValue(
      new MaterialScopeError("missing_entity", "Công trình chưa gán Chủ thể — gán ở Master data > Công trình"),
    );
    await expect(bulkUpsertMaterialOpeningBalancesAction([{ partyId: 3 }])).resolves.toEqual({
      ok: false,
      message: "Công trình chưa gán Chủ thể — gán ở Master data > Công trình",
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("lỗi quyền: không gọi service", async () => {
    mockRequest.mockRejectedValue(new mockAcl.ModuleRequestError("Module đang phát triển"));
    await expect(deleteMaterialOpeningBalancesAction([1])).resolves.toEqual({ ok: false, message: "Module đang phát triển" });
    expect(mockService.deleteMaterialOpeningBalances).not.toHaveBeenCalled();
  });

  it("lỗi hạ tầng (lớp con Error, vd. vi phạm CHECK) không lộ chi tiết, được ghi log", async () => {
    class PrismaLikeError extends Error {}
    mockService.createMaterialTransaction.mockRejectedValue(
      new PrismaLikeError('violates check constraint "ledger_material_project_required"'),
    );
    await expect(createMaterialTransactionAction(TX_INPUT)).resolves.toEqual({ ok: false, message: GENERIC_ACTION_MESSAGE });
    expect(console.error).toHaveBeenCalled();
  });
});
