/**
 * Unit: tự tạo kỳ tháng 27→26 (chưa ký) khi có phát sinh sau mốc chuyển đổi trong tháng chưa có kỳ —
 * tháng cần tạo (liền kề, lấp tháng trống, không chèn trước kỳ đầu, không tạo cho tương lai) và
 * việc ghi phiếu chờ có đơn giá của tháng vừa tạo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { AUTO_PERIOD_NOTE, ensureMonthlyPeriodFor, monthsToCreate } from "../auto-monthly-period";
import type { PeriodBoundsContext } from "../period-bounds";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const months = (list: { from: Date; to: Date }[]) => list.map((m) => `${iso(m.from)}..${iso(m.to)}`);

/** Cặp có kỳ chuyển đổi đã ký 01/01 – 26/10/2026, số dư tới 31/12/2025. */
const AFTER_CUTOVER: PeriodBoundsContext = {
  markers: [{ id: 1, from: d("2026-01-01"), to: d("2026-10-26"), signed: true }],
  openingAsOf: d("2025-12-31"),
};
const NOV_END = d("2026-11-26");

describe("monthsToCreate", () => {
  it("tháng ngay sau kỳ chuyển đổi: tạo đúng kỳ 27/10 – 26/11", () => {
    expect(months(monthsToCreate(d("2026-10-27"), AFTER_CUTOVER, NOV_END))).toEqual(["2026-10-27..2026-11-26"]);
  });

  it("phát sinh cách kỳ gần nhất một tháng trống: tạo cả tháng trống để kỳ liền kề", () => {
    expect(months(monthsToCreate(d("2026-12-03"), AFTER_CUTOVER, d("2026-12-26")))).toEqual([
      "2026-10-27..2026-11-26",
      "2026-11-27..2026-12-26",
    ]);
  });

  it("đã có kỳ phủ ngày, ngày trước kỳ đầu, hoặc sau tháng hiện tại: không tạo", () => {
    const withNov: PeriodBoundsContext = {
      ...AFTER_CUTOVER,
      markers: [...AFTER_CUTOVER.markers, { id: 2, from: d("2026-10-27"), to: d("2026-11-26"), signed: false }],
    };
    expect(monthsToCreate(d("2026-11-05"), withNov, NOV_END)).toEqual([]);
    expect(monthsToCreate(d("2026-12-05"), AFTER_CUTOVER, NOV_END)).toEqual([]);
    const lateStart: PeriodBoundsContext = {
      markers: [{ id: 3, from: d("2026-11-27"), to: d("2026-12-26"), signed: false }],
      openingAsOf: null,
    };
    expect(monthsToCreate(d("2026-11-10"), lateStart, d("2026-12-26"))).toEqual([]);
  });

  it("cặp chưa có kỳ: tháng 27→26 chứa ngày; sau số dư ban đầu lệch tháng thì kỳ lẻ bắt đầu ngay sau số dư", () => {
    expect(months(monthsToCreate(d("2026-11-05"), { markers: [], openingAsOf: null }, NOV_END))).toEqual([
      "2026-10-27..2026-11-26",
    ]);
    expect(months(monthsToCreate(d("2026-11-05"), { markers: [], openingAsOf: d("2026-10-31") }, NOV_END))).toEqual([
      "2026-11-01..2026-11-26",
    ]);
    expect(monthsToCreate(d("2026-10-20"), { markers: [], openingAsOf: d("2026-10-31") }, NOV_END)).toEqual([]);
  });
});

describe("ensureMonthlyPeriodFor", () => {
  const created: Record<string, unknown>[] = [];
  const pendingSlip = {
    id: 4319,
    date: d("2026-10-27"),
    itemId: 180,
    qty: new Prisma.Decimal(5400),
    unitPrice: new Prisma.Decimal(1450),
  };
  let entityId: number | null = 2;
  const client = {
    // Mốc chuyển đổi 26/10/2026 (run đã commit).
    $queryRaw: vi.fn(async () => [{ id: 7, cutoverDate: "2026-10-26" }]),
    supplierReconciliation: {
      findMany: vi.fn(async () => [
        { id: 1, periodFrom: d("2026-01-01"), periodTo: d("2026-10-26"), signedBySupplier: true },
      ]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 99, ...data };
      }),
    },
    ledgerOpeningBalance: { findFirst: vi.fn(async () => ({ asOfDate: d("2025-12-31") })) },
    project: { findFirst: vi.fn(async () => ({ entityId })) },
    supplierDeliveryDaily: { findMany: vi.fn(async () => [pendingSlip]) },
  };
  const postSlip = vi.fn(async () => undefined);
  const run = (date: string) =>
    ensureMonthlyPeriodFor(client as never, 1, 4, d(date), postSlip);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(d("2026-11-13"));
    vi.clearAllMocks();
    created.length = 0;
    entityId = 2;
  });

  it("tạo kỳ tháng chưa ký và ghi phiếu chờ có đơn giá của tháng đó", async () => {
    await expect(run("2026-10-27")).resolves.toBe(1);
    expect(created).toEqual([
      { supplierId: 1, projectId: 4, periodFrom: d("2026-10-27"), periodTo: d("2026-11-26"), note: AUTO_PERIOD_NOTE },
    ]);
    expect(client.supplierDeliveryDaily.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ unitPrice: { not: null }, ledgerTransactions: { none: { deletedAt: null } } }),
      }),
    );
    expect(postSlip).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 4319, partyId: 1, projectId: 4, content: "Chốt kỳ 27/10/2026 – 26/11/2026 — phiếu ngày #4319" }),
    );
    vi.useRealTimers();
  });

  it("ngày tới mốc chuyển đổi hoặc công trình chưa gán Chủ thể: không tạo gì", async () => {
    await expect(run("2026-10-24")).resolves.toBe(0);
    entityId = null;
    await expect(run("2026-10-27")).resolves.toBe(0);
    expect(client.supplierReconciliation.create).not.toHaveBeenCalled();
    expect(postSlip).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
