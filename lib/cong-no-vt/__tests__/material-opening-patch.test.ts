/**
 * Unit: lưới Số dư ban đầu vật tư — sửa một dòng (patch hoặc dòng có id trong bulk) cập nhật ĐÚNG
 * dòng đó, kể cả khi đổi công trình hay khi Chủ thể lưu trên dòng khác Chủ thể công trình; không
 * bao giờ sinh dòng thứ hai (số dư bị tính hai lần). Dòng mới (không id) vẫn đi qua setOpeningBalance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

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

/** Công trình → Chủ thể. X=100 thuộc E1=1, Y=200 thuộc E2=2. */
const PROJECT_ENTITY: Record<number, number> = { 100: 1, 200: 2 };

const state = vi.hoisted(() => ({ rows: new Map<number, unknown>(), nextId: 100 }));

const tx = vi.hoisted(() => {
  type Row = { id: number; ledgerType: string; entityId: number; partyId: number; projectId: number | null };
  const all = () => [...state.rows.values()] as Row[];
  return {
    ledgerOpeningBalance: {
      findUnique: vi.fn(async ({ where }: { where: { id: number } }) => state.rows.get(where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: { id: { in: number[] } } }) =>
        all().filter((r) => where.id.in.includes(r.id)),
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { ledgerType: string; entityId: number; partyId: number; projectId: number | null; id?: { not: number } } }) =>
          all().find(
            (r) =>
              r.ledgerType === where.ledgerType &&
              r.entityId === where.entityId &&
              r.partyId === where.partyId &&
              r.projectId === where.projectId &&
              r.id !== where.id?.not,
          ) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => {
        const updated = { ...(state.rows.get(where.id) as object), ...data };
        state.rows.set(where.id, updated);
        return updated;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: state.nextId++, ...data };
        state.rows.set(created.id, created);
        return created;
      }),
    },
    supplierReconciliation: { findFirst: vi.fn(async () => null) },
    ledgerTransaction: {},
    project: { findUnique: vi.fn() },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    ledgerOpeningBalance: { findMany: tx.ledgerOpeningBalance.findMany },
  },
}));
vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: vi.fn(async () => ({ userId: "u1", role: "admin" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { bulkUpsertMaterialOpeningBalances, patchMaterialOpeningBalance } from "@/lib/cong-no-vt/material-ledger-service";

const ROW_10: OpeningRow = {
  id: 10,
  ledgerType: "material",
  entityId: 1,
  partyId: 5,
  projectId: 100,
  asOfDate: new Date("2026-11-01T00:00:00.000Z"),
  balanceTt: new Prisma.Decimal(1000),
  balanceHd: new Prisma.Decimal(900),
  note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = new Map([[10, { ...ROW_10 }]]);
  state.nextId = 100;
  tx.$queryRaw.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    if (sql.includes("FROM projects")) return [{ entityId: PROJECT_ENTITY[values[0] as number] }];
    if (sql.includes("FROM import_runs")) return []; // chưa có run chuyển đổi đã commit
    throw new Error(`SQL không mong đợi: ${sql}`);
  });
});

describe("patchMaterialOpeningBalance — sửa đúng dòng theo id", () => {
  it("đổi công trình X → Y: dòng #10 chuyển sang Y (Chủ thể theo Y), không có dòng thứ hai", async () => {
    const result = await patchMaterialOpeningBalance(10, { projectId: 200 });

    expect(tx.ledgerOpeningBalance.create).not.toHaveBeenCalled();
    expect(tx.ledgerOpeningBalance.update).toHaveBeenCalledTimes(1);
    expect(tx.ledgerOpeningBalance.update.mock.calls[0][0].where).toEqual({ id: 10 });
    expect(result).toMatchObject({ id: 10, projectId: 200, entityId: 2 });
    expect(state.rows.size).toBe(1);
  });

  it("Chủ thể lưu trên dòng ≠ Chủ thể công trình: sửa số tiền vẫn sửa #10, không nhân đôi", async () => {
    state.rows.set(10, { ...ROW_10, entityId: 7 });
    const result = await patchMaterialOpeningBalance(10, { balanceTt: "2500" });

    expect(tx.ledgerOpeningBalance.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 10, entityId: 1 });
    expect(String((result as { balanceTt: unknown }).balanceTt)).toBe("2500");
    expect(state.rows.size).toBe(1);
  });
});

describe("bulkUpsertMaterialOpeningBalances", () => {
  it("dòng có id sửa đúng dòng đó; dòng mới (không id) mới tạo", async () => {
    const results = await bulkUpsertMaterialOpeningBalances([
      { id: 10, projectId: 200 },
      { entityId: 1, partyId: 6, projectId: 100, balanceTt: "7", balanceHd: "0", asOfDate: "2026-11-01" },
    ]);

    expect(tx.ledgerOpeningBalance.update.mock.calls.map((c) => c[0].where)).toEqual([{ id: 10 }]);
    expect(tx.ledgerOpeningBalance.create).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(state.rows.size).toBe(2);
    expect(state.rows.get(10)).toMatchObject({ projectId: 200, entityId: 2 });
  });
});
