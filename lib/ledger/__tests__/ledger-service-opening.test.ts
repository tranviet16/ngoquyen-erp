/**
 * Unit: sửa số dư ban đầu theo id sửa ĐÚNG dòng đó (không bao giờ tạo dòng mới), kiểm cả cặp cũ
 * lẫn cặp mới (khoá số dư khi cặp đã ký, mốc chuyển đổi theo ngày cũ / mới) và unique
 * (Chủ thể, NCC, công trình). Chủ thể luôn suy từ công trình mới.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { LedgerService, type LedgerWriteClient } from "@/lib/ledger/ledger-service";

interface OpeningRow {
  id: number;
  ledgerType: string;
  entityId: number;
  partyId: number;
  projectId: number | null;
  asOfDate: Date;
  balanceTt: Prisma.Decimal;
  balanceHd: Prisma.Decimal;
  note: string | null;
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Công trình → Chủ thể. X=100 thuộc E1=1, Y=200 thuộc E2=2. */
const PROJECT_ENTITY: Record<number, number | null> = { 100: 1, 200: 2 };

function fakeClient(opts: {
  rows: OpeningRow[];
  /** Cặp "NCC:công trình" đã có kỳ đối chiếu được ký. */
  signedPairs?: string[];
  /** Mốc của run chuyển đổi đã commit (YYYY-MM-DD) hoặc không có. */
  cutoverDate?: string;
}) {
  const rows = new Map(opts.rows.map((r) => [r.id, { ...r }]));
  const locks: string[] = [];
  const ledgerOpeningBalance = {
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => rows.get(where.id) ?? null),
    findFirst: vi.fn(
      async ({ where }: { where: { ledgerType: string; entityId: number; partyId: number; projectId: number | null; id: { not: number } } }) =>
        [...rows.values()].find(
          (r) =>
            r.ledgerType === where.ledgerType &&
            r.entityId === where.entityId &&
            r.partyId === where.partyId &&
            r.projectId === where.projectId &&
            r.id !== where.id.not,
        ) ?? null,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<OpeningRow> }) => {
      const updated = { ...rows.get(where.id)!, ...data };
      rows.set(where.id, updated);
      return updated;
    }),
    create: vi.fn(),
  };
  const supplierReconciliation = {
    findFirst: vi.fn(async ({ where }: { where: { supplierId: number; projectId: number } }) =>
      (opts.signedPairs ?? []).includes(`${where.supplierId}:${where.projectId}`) ? { id: 99 } : null,
    ),
  };
  const $executeRaw = vi.fn(async (_s: TemplateStringsArray, key: string) => {
    locks.push(key);
    return 1;
  });
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("FROM projects")) {
      const entityId = PROJECT_ENTITY[values[0] as number];
      return entityId === undefined ? [] : [{ entityId }];
    }
    if (sql.includes("FROM import_runs")) return opts.cutoverDate ? [{ id: 1, cutoverDate: opts.cutoverDate }] : [];
    throw new Error(`SQL không mong đợi: ${sql}`);
  });
  const client = {
    ledgerOpeningBalance,
    supplierReconciliation,
    $executeRaw,
    $queryRaw,
    ledgerTransaction: {},
    project: { findUnique: vi.fn() },
  } as unknown as LedgerWriteClient;
  return { client, rows, locks, ledgerOpeningBalance };
}

const ROW_10: OpeningRow = {
  id: 10,
  ledgerType: "material",
  entityId: 1,
  partyId: 5,
  projectId: 100,
  asOfDate: day("2026-11-01"),
  balanceTt: new Prisma.Decimal(1000),
  balanceHd: new Prisma.Decimal(900),
  note: null,
};

const input = (over: Partial<{ partyId: number; projectId: number; balanceTt: string; asOfDate: string; entityId: number }> = {}) => ({
  entityId: 1,
  partyId: 5,
  projectId: 100,
  balanceTt: "1000",
  balanceHd: "900",
  asOfDate: "2026-11-01",
  note: null,
  ...over,
});

const service = new LedgerService("material");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LedgerService.updateOpeningBalance — sửa đúng dòng theo id", () => {
  it("đổi công trình X → Y sửa chính dòng #10 (Chủ thể theo Y), không tạo dòng mới", async () => {
    const { client, rows, locks, ledgerOpeningBalance } = fakeClient({ rows: [ROW_10] });
    const result = await service.updateOpeningBalance(10, input({ projectId: 200 }), client);

    expect(ledgerOpeningBalance.create).not.toHaveBeenCalled();
    expect(ledgerOpeningBalance.update).toHaveBeenCalledTimes(1);
    expect(ledgerOpeningBalance.update.mock.calls[0][0].where).toEqual({ id: 10 });
    expect(result).toMatchObject({ id: 10, projectId: 200, entityId: 2 });
    expect(rows.size).toBe(1);
    expect(locks).toContain("vat-tu-ncc:5");
  });

  it("dòng lưu Chủ thể khác Chủ thể công trình: sửa số tiền vẫn sửa #10 (Chủ thể được chuẩn hoá), không nhân đôi", async () => {
    const { client, rows, ledgerOpeningBalance } = fakeClient({ rows: [{ ...ROW_10, entityId: 7 }] });
    const result = await service.updateOpeningBalance(10, input({ balanceTt: "2500" }), client);

    expect(ledgerOpeningBalance.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 10, entityId: 1, projectId: 100 });
    expect(String(result.balanceTt)).toBe("2500");
    expect(rows.size).toBe(1);
  });

  it("đổi NCC: khoá cả NCC cũ lẫn NCC mới (tăng dần)", async () => {
    const { client, locks } = fakeClient({ rows: [ROW_10] });
    await service.updateOpeningBalance(10, input({ partyId: 3 }), client);
    expect(locks.slice(0, 2)).toEqual(["vat-tu-ncc:3", "vat-tu-ncc:5"]);
  });

  it("cặp CŨ đã có kỳ ký → từ chối, không ghi", async () => {
    const { client, ledgerOpeningBalance } = fakeClient({ rows: [ROW_10], signedPairs: ["5:100"] });
    await expect(service.updateOpeningBalance(10, input({ projectId: 200 }), client)).rejects.toThrow(/kỳ đối chiếu được ký/);
    expect(ledgerOpeningBalance.update).not.toHaveBeenCalled();
  });

  it("cặp MỚI đã có kỳ ký → từ chối, không ghi", async () => {
    const { client, ledgerOpeningBalance } = fakeClient({ rows: [ROW_10], signedPairs: ["5:200"] });
    await expect(service.updateOpeningBalance(10, input({ projectId: 200 }), client)).rejects.toThrow(/kỳ đối chiếu được ký/);
    expect(ledgerOpeningBalance.update).not.toHaveBeenCalled();
  });

  it("ngày số dư CŨ ≤ mốc chuyển đổi → cutover_locked", async () => {
    const { client, ledgerOpeningBalance } = fakeClient({
      rows: [{ ...ROW_10, asOfDate: day("2025-12-31") }],
      cutoverDate: "2026-10-26",
    });
    await expect(service.updateOpeningBalance(10, input({ asOfDate: "2026-11-05" }), client)).rejects.toMatchObject({
      code: "cutover_locked",
    });
    expect(ledgerOpeningBalance.update).not.toHaveBeenCalled();
  });

  it("ngày số dư MỚI ≤ mốc chuyển đổi → cutover_locked", async () => {
    const { client, ledgerOpeningBalance } = fakeClient({ rows: [ROW_10], cutoverDate: "2026-10-26" });
    await expect(service.updateOpeningBalance(10, input({ asOfDate: "2026-10-26" }), client)).rejects.toMatchObject({
      code: "cutover_locked",
    });
    expect(ledgerOpeningBalance.update).not.toHaveBeenCalled();
  });

  it("đổi vào bộ (Chủ thể, NCC, công trình) đã có dòng khác → từ chối rõ ràng, không ghi", async () => {
    const other: OpeningRow = { ...ROW_10, id: 11, entityId: 2, projectId: 200 };
    const { client, ledgerOpeningBalance } = fakeClient({ rows: [ROW_10, other] });
    await expect(service.updateOpeningBalance(10, input({ projectId: 200 }), client)).rejects.toThrow(
      /Đã có số dư ban đầu #11/,
    );
    expect(ledgerOpeningBalance.update).not.toHaveBeenCalled();
  });

  it("dòng không tồn tại → lỗi, không tạo mới", async () => {
    const { client, ledgerOpeningBalance } = fakeClient({ rows: [] });
    await expect(service.updateOpeningBalance(42, input(), client)).rejects.toThrow(/Số dư #42 không tồn tại/);
    expect(ledgerOpeningBalance.create).not.toHaveBeenCalled();
  });

  it("công trình mới chưa có Chủ thể → missing_entity", async () => {
    PROJECT_ENTITY[300] = null;
    const { client } = fakeClient({ rows: [ROW_10] });
    await expect(service.updateOpeningBalance(10, input({ projectId: 300 }), client)).rejects.toMatchObject({
      code: "missing_entity",
    });
  });
});
