/**
 * Unit: tab "Kiểm tra khớp" — phiếu / dòng lay_hang có ngày ≤ mốc chuyển đổi đã commit là lịch sử
 * Excel (không cần event), không phải "mồ côi", kể cả khi nằm ngoài marker 01/01→26/10/2026 (D6:
 * phiếu lịch sử có thể trước 2026). Sau mốc, phiếu chưa có event vẫn là mồ côi.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  supplierReconciliation: { findMany: vi.fn() },
}));
const mockCutover = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: vi.fn(async () => ({ userId: "u1", role: "admin" })) }));
vi.mock("@/lib/admin/require-active-admin", () => ({ requireActiveAdmin: vi.fn(async () => "u1") }));
vi.mock("@/lib/vat-tu-ncc/pair-scope", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vat-tu-ncc/pair-scope")>()),
  getMaterialCutoverDate: mockCutover,
}));

import { checkPeriodConsistency } from "@/lib/vat-tu-ncc/period-recon-check-service";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const delivery = (id: number, iso: string) => ({
  delivery_id: id,
  tx_id: null,
  d_date: day(iso),
  t_date: null,
  item_id: 3,
  qty: 2,
  unit_price: 100,
  delivery_amount: 200,
  ledger_amount: null,
  content: null,
});
const event = (id: number, iso: string) => ({
  delivery_id: null,
  tx_id: id,
  d_date: null,
  t_date: day(iso),
  item_id: null,
  qty: null,
  unit_price: null,
  delivery_amount: null,
  ledger_amount: 500,
  content: "NL",
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([
    delivery(1, "2025-08-15"), // lịch sử trước 2026, ngoài marker
    delivery(2, "2026-03-10"), // trong marker
    delivery(3, "2026-10-26"), // đúng mốc
    delivery(4, "2026-10-27"), // sau mốc, chưa chốt → mồ côi
    event(11, "2025-12-20"), // dòng Nhập Liệu lịch sử
    event(12, "2026-11-02"), // nhập tay sau mốc → mồ côi
  ]);
  mockPrisma.supplierReconciliation.findMany.mockResolvedValue([
    { periodFrom: day("2026-01-01"), periodTo: day("2026-10-26") },
  ]);
});

describe("checkPeriodConsistency — lịch sử theo mốc chuyển đổi", () => {
  it("ngày ≤ mốc đã commit là lịch sử (kể cả trước marker); sau mốc mới là mồ côi", async () => {
    mockCutover.mockResolvedValue(day("2026-10-26"));
    const result = await checkPeriodConsistency(5, 50, "2025-01-01", "2026-12-31");

    expect(result.historicalDeliveries.map((d) => d.deliveryId)).toEqual([1, 2, 3]);
    expect(result.orphanDeliveries.map((d) => d.deliveryId)).toEqual([4]);
    expect(result.historicalEvents.map((e) => e.transactionId)).toEqual([11]);
    expect(result.orphanEvents.map((e) => e.transactionId)).toEqual([12]);
  });

  it("chưa có run chuyển đổi đã commit: chỉ marker của cặp được coi là lịch sử", async () => {
    mockCutover.mockResolvedValue(null);
    const result = await checkPeriodConsistency(5, 50, "2025-01-01", "2026-12-31");

    expect(result.historicalDeliveries.map((d) => d.deliveryId)).toEqual([2, 3]);
    expect(result.orphanDeliveries.map((d) => d.deliveryId)).toEqual([1, 4]);
  });
});
