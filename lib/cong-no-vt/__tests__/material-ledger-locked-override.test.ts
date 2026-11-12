/**
 * Unit: tab Thanh toán của NCC — admin đã xác nhận thì ghi / sửa / xoá được dòng thanh toán / thuế HĐ
 * trong kỳ đã ký hoặc giai đoạn chuyển đổi từ Excel: server tự kiểm admin, ghi qua LedgerService có
 * `adminOverride`, rồi đông cứng lại kỳ đã ký của mọi cặp bị đụng từ ngày sớm nhất. Không có cờ thì
 * đi đường thường (guard khoá kỳ giữ nguyên), không hỏi admin, không đông cứng lại.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const services: { guard: unknown; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; softDelete: ReturnType<typeof vi.fn> }[] = [];
  const rows = new Map<number, Record<string, unknown>>();
  const tx = {
    ledgerTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null),
    },
  };
  return { services, rows, tx };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (client: typeof h.tx) => unknown) => fn(h.tx)),
    ledgerTransaction: { findUnique: vi.fn(async ({ where }: { where: { id: number } }) => h.rows.get(where.id) ?? null) },
  },
}));
vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/admin/require-active-admin", () => ({ requireActiveAdmin: vi.fn(async () => "admin-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/vat-tu-ncc/locked-delivery-edit", () => ({ refreezeSignedPeriodsFrom: vi.fn() }));
vi.mock("@/lib/vat-tu-ncc/period-lock", () => ({
  assertMaterialTypeWritable: vi.fn(),
  lockSuppliers: vi.fn(),
  collectSupplierIds: (a: unknown[], b: unknown[]) => [...new Set([...a, ...b].filter((v): v is number => typeof v === "number"))],
}));
vi.mock("@/lib/ledger/ledger-service", () => ({
  LedgerService: class {
    create = vi.fn();
    update = vi.fn();
    softDelete = vi.fn();
    constructor(_type: string, guard?: unknown) {
      h.services.push({ guard, create: this.create, update: this.update, softDelete: this.softDelete });
    }
  },
}));

import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { refreezeSignedPeriodsFrom } from "@/lib/vat-tu-ncc/locked-delivery-edit";
import {
  createMaterialTransaction,
  patchMaterialTransaction,
  softDeleteMaterialTransaction,
} from "@/lib/cong-no-vt/material-ledger-service";
import type { TransactionInput } from "@/lib/cong-no-vt/schemas";

// Hai instance tạo lúc nạp module: [0] = service thường, [1] = service admin bỏ qua khoá kỳ.
const plain = () => h.services.find((s) => s.guard === undefined)!;
const override = () => h.services.find((s) => (s.guard as { adminOverride?: true } | undefined)?.adminOverride)!;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const ROW = {
  id: 7,
  ledgerType: "material",
  transactionType: "thanh_toan",
  entityId: 2,
  partyId: 3,
  projectId: 11,
  itemId: null,
  date: day("2026-10-24"),
  amountTt: "500000",
  vatPctTt: "0",
  amountHd: "0",
  vatPctHd: "0",
  invoiceNo: null,
  invoiceDate: null,
  content: "CK ngày 24/10/2026",
  status: "pending",
  note: null,
  deletedAt: null,
};

const INPUT: TransactionInput = {
  date: "2026-10-24",
  transactionType: "thanh_toan",
  entityId: 2,
  partyId: 3,
  projectId: 11,
  amountTt: "500000",
  vatPctTt: "0",
  amountHd: "0",
  vatPctHd: "0",
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  h.rows.set(7, { ...ROW, amountTt: { toString: () => "500000" }, vatPctTt: { toString: () => "0" }, amountHd: { toString: () => "0" }, vatPctHd: { toString: () => "0" } });
});

describe("không có cờ overrideLocked", () => {
  it("đi đường thường: không hỏi admin, không đông cứng lại", async () => {
    plain().create.mockResolvedValue({ ...ROW });
    await createMaterialTransaction(INPUT);
    plain().update.mockResolvedValue({ ...ROW });
    await patchMaterialTransaction(7, { amountTt: "1" });
    await softDeleteMaterialTransaction(7);

    expect(plain().create).toHaveBeenCalledTimes(1);
    expect(plain().update).toHaveBeenCalledTimes(1);
    expect(plain().softDelete).toHaveBeenCalledWith(7);
    expect(override().create).not.toHaveBeenCalled();
    expect(requireActiveAdmin).not.toHaveBeenCalled();
    expect(refreezeSignedPeriodsFrom).not.toHaveBeenCalled();
  });
});

describe("admin xác nhận ghi trong kỳ khoá", () => {
  it("ghi mới: kiểm admin, ghi qua service bỏ qua khoá, đông cứng lại cặp từ ngày ghi", async () => {
    override().create.mockResolvedValue({ ...ROW });
    await createMaterialTransaction(INPUT, { overrideLocked: true });

    expect(requireActiveAdmin).toHaveBeenCalledTimes(1);
    expect(override().create).toHaveBeenCalledWith(expect.objectContaining({ partyId: 3, projectId: 11 }), h.tx);
    expect(plain().create).not.toHaveBeenCalled();
    expect(refreezeSignedPeriodsFrom).toHaveBeenCalledTimes(1);
    expect(refreezeSignedPeriodsFrom).toHaveBeenCalledWith(h.tx, 3, 11, day("2026-10-24"), {
      reason: expect.stringContaining("ngày 24/10/2026 (#7)"),
      adminUserId: "admin-1",
    });
  });

  it("sửa đổi ngày và công trình: đông cứng lại cả cặp cũ lẫn cặp mới, mỗi cặp từ ngày của nó", async () => {
    override().update.mockResolvedValue({ ...ROW, projectId: 12, date: day("2026-10-20") });
    await patchMaterialTransaction(7, { projectId: 12, date: "2026-10-20" }, { overrideLocked: true });

    expect(override().update).toHaveBeenCalledWith(7, expect.objectContaining({ projectId: 12 }), h.tx);
    const calls = vi.mocked(refreezeSignedPeriodsFrom).mock.calls.map((c) => [c[1], c[2], c[3]]);
    expect(calls).toEqual([
      [3, 11, day("2026-10-24")],
      [3, 12, day("2026-10-20")],
    ]);
  });

  it("sửa trong cùng cặp: đông cứng lại một lần từ ngày sớm hơn", async () => {
    override().update.mockResolvedValue({ ...ROW, date: day("2026-10-30") });
    await patchMaterialTransaction(7, { date: "2026-10-30" }, { overrideLocked: true });
    expect(vi.mocked(refreezeSignedPeriodsFrom).mock.calls.map((c) => [c[1], c[2], c[3]])).toEqual([
      [3, 11, day("2026-10-24")],
    ]);
  });

  it("xoá: đông cứng lại cặp từ ngày của dòng bị xoá", async () => {
    await softDeleteMaterialTransaction(7, { overrideLocked: true });
    expect(override().softDelete).toHaveBeenCalledWith(7, h.tx);
    expect(refreezeSignedPeriodsFrom).toHaveBeenCalledWith(h.tx, 3, 11, day("2026-10-24"), expect.objectContaining({
      reason: expect.stringContaining("Admin xoá"),
    }));
  });

  it("không phải admin: từ chối trước khi ghi", async () => {
    vi.mocked(requireActiveAdmin).mockRejectedValueOnce(new Error("Chỉ admin được thao tác"));
    await expect(createMaterialTransaction(INPUT, { overrideLocked: true })).rejects.toThrow("Chỉ admin được thao tác");
    expect(override().create).not.toHaveBeenCalled();
    expect(refreezeSignedPeriodsFrom).not.toHaveBeenCalled();
  });
});
