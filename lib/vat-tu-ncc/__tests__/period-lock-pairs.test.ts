import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  assertMaterialTypeWritable,
  assertPairOpeningEditable,
  assertPeriodOpen,
  collectSupplierIds,
  findSignedPeriodCovering,
  isCutoverMarker,
  loadPeriodBoundsContext,
  lockSuppliers,
  type PeriodLockClient,
  type SupplierLockClient,
} from "../period-lock";

const SIGNED_X = {
  id: 10,
  periodFrom: new Date("2026-09-27T00:00:00Z"),
  periodTo: new Date("2026-10-26T00:00:00Z"),
};

/**
 * Client giả: kỳ đã ký chỉ có ở cặp (NCC 1, công trình X=100). Mốc run chuyển đổi đọc bằng một câu
 * SQL (`$queryRaw`) chỉ lấy `reviewJson.expected.cutoverDate`: `cutoverDate` = giá trị trường đó;
 * `committedWithoutDate` = run đã commit nhưng thiếu mốc (SQL trả NULL).
 */
function fakeClient(opts: { cutoverDate?: string | null; committedWithoutDate?: boolean } = {}) {
  const supplierReconciliation = {
    findFirst: vi.fn(async (args: { where: { supplierId: number; projectId: number } }) =>
      args.where.supplierId === 1 && args.where.projectId === 100 ? SIGNED_X : null,
    ),
  };
  const $queryRaw = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => {
    if (opts.committedWithoutDate) return [{ id: 9, cutoverDate: null }];
    return opts.cutoverDate ? [{ id: 9, cutoverDate: opts.cutoverDate }] : [];
  });
  return { client: { supplierReconciliation, $queryRaw } as unknown as PeriodLockClient, supplierReconciliation, $queryRaw };
}

describe("collectSupplierIds", () => {
  it("gộp nhiều nguồn, bỏ trùng, sắp tăng dần", () => {
    expect(collectSupplierIds([7, 3], [3, 5], [7])).toEqual([3, 5, 7]);
  });

  it("bỏ giá trị không phải số nguyên dương (undefined, null, chuỗi, 0, số lẻ)", () => {
    expect(collectSupplierIds([undefined, null, "4", 0, -1, 2.5, 9])).toEqual([9]);
  });

  it("không có NCC nào -> mảng rỗng", () => {
    expect(collectSupplierIds([], [])).toEqual([]);
  });
});

describe("lockSuppliers — khoá vẫn theo NCC (thô hơn phạm vi cặp)", () => {
  it("lấy khoá theo id tăng dần dù đầu vào lộn xộn, mỗi NCC một lần", async () => {
    const locked: string[] = [];
    const client = {
      $executeRaw: vi.fn(async (_s: TemplateStringsArray, key: string) => {
        locked.push(key);
        return 1;
      }),
    } as unknown as SupplierLockClient;
    await lockSuppliers(client, collectSupplierIds([7, 3], [3, 7, 1]));
    expect(locked).toEqual(["vat-tu-ncc:1", "vat-tu-ncc:3", "vat-tu-ncc:7"]);
  });
});

describe("khoá kỳ theo cặp NCC × công trình", () => {
  it("kỳ ký của A×X chặn A×X nhưng không chặn A×Y cùng ngày", async () => {
    const { client } = fakeClient();
    await expect(assertPeriodOpen(1, 100, new Date("2026-10-15T00:00:00Z"), client)).rejects.toThrow(/đã được NCC ký/);
    await expect(assertPeriodOpen(1, 200, new Date("2026-10-15T00:00:00Z"), client)).resolves.toBeUndefined();
  });

  it("findSignedPeriodCovering lọc theo (NCC, công trình) và ngày nghiệp vụ Bangkok", async () => {
    const { client, supplierReconciliation } = fakeClient();
    // 20:00 26/10 Bangkok (13:00Z) vẫn là ngày 26/10 → nằm trong kỳ
    expect(await findSignedPeriodCovering(1, 100, new Date("2026-10-26T13:00:00Z"), client)).toEqual(SIGNED_X);
    expect(supplierReconciliation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 1,
          projectId: 100,
          signedBySupplier: true,
          periodFrom: { lte: new Date("2026-10-26T00:00:00Z") },
          periodTo: { gte: new Date("2026-10-26T00:00:00Z") },
        }),
      }),
    );
  });

  it("projectId thiếu (nơi gọi không định kiểu) bị từ chối thay vì lặng lẽ bỏ khoá", async () => {
    const { client } = fakeClient();
    await expect(assertPeriodOpen(1, null as unknown as number, new Date(), client)).rejects.toMatchObject({
      code: "missing_project",
    });
    await expect(assertPeriodOpen(1, 0, new Date(), client)).rejects.toMatchObject({ code: "missing_project" });
  });
});

describe("guard mốc chuyển đổi toàn cục", () => {
  it("không có run chuyển đổi đã commit → không ảnh hưởng", async () => {
    const { client } = fakeClient({ cutoverDate: null });
    await expect(assertPeriodOpen(1, 200, new Date("2020-01-01T00:00:00Z"), client)).resolves.toBeUndefined();
  });

  it("có mốc 26/10: ghi ngày ≤ mốc ở cặp mới bị chặn (kể cả ngày đúng mốc), ngày sau mốc qua", async () => {
    const { client, $queryRaw } = fakeClient({ cutoverDate: "2026-10-26" });
    await expect(assertPeriodOpen(5, 500, new Date("2026-10-20T00:00:00Z"), client)).rejects.toMatchObject({
      code: "cutover_locked",
    });
    await expect(assertPeriodOpen(5, 500, new Date("2026-10-26T13:00:00Z"), client)).rejects.toMatchObject({
      code: "cutover_locked",
    });
    await expect(assertPeriodOpen(5, 500, new Date("2026-10-27T00:00:00Z"), client)).resolves.toBeUndefined();
    // Chỉ run `committed` của adapter chuyển đổi, chỉ đọc đúng trường mốc (không kéo cả reviewJson).
    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toContain("vat-tu-chuyen-doi");
    expect(strings.join("?")).toMatch(/status = 'committed'/);
    expect(strings.join("?")).toMatch(/"reviewJson" -> 'expected' ->> 'cutoverDate'/);
  });

  it("ghi của chính run import (cutoverImportRunId) không đi qua guard mốc", async () => {
    const { client, $queryRaw } = fakeClient({ cutoverDate: "2026-10-26" });
    await expect(
      assertPeriodOpen(5, 500, new Date("2026-03-01T00:00:00Z"), client, { cutoverImportRunId: 9 }),
    ).resolves.toBeUndefined();
    expect($queryRaw).not.toHaveBeenCalled();
    await expect(
      assertPeriodOpen(5, 500, new Date("2026-03-01T00:00:00Z"), client, { cutoverImportRunId: 0 }),
    ).rejects.toThrow(/run import không hợp lệ/);
  });

  it("run đã commit nhưng thiếu mốc → chặn (fail closed)", async () => {
    const { client } = fakeClient({ committedWithoutDate: true });
    await expect(assertPeriodOpen(5, 500, new Date("2026-12-01T00:00:00Z"), client)).rejects.toMatchObject({
      code: "cutover_invalid",
    });
  });
});

describe("assertMaterialTypeWritable", () => {
  it("dieu_chinh không bị khoá kỳ nhưng vẫn phải sau mốc chuyển đổi", async () => {
    const { client, supplierReconciliation } = fakeClient({ cutoverDate: "2026-10-26" });
    await expect(
      assertMaterialTypeWritable("dieu_chinh", 1, 100, new Date("2026-10-30T00:00:00Z"), client),
    ).resolves.toBeUndefined();
    expect(supplierReconciliation.findFirst).not.toHaveBeenCalled();
    await expect(
      assertMaterialTypeWritable("dieu_chinh", 1, 100, new Date("2026-10-15T00:00:00Z"), client),
    ).rejects.toMatchObject({ code: "cutover_locked" });
  });

  it("loại bị khoá kỳ đi qua assertPeriodOpen của cặp", async () => {
    const { client } = fakeClient();
    await expect(
      assertMaterialTypeWritable("thanh_toan", 1, 100, new Date("2026-10-15T00:00:00Z"), client),
    ).rejects.toThrow(/đã được NCC ký/);
    await expect(
      assertMaterialTypeWritable("thanh_toan", 1, 200, new Date("2026-10-15T00:00:00Z"), client),
    ).resolves.toBeUndefined();
  });
});

describe("số dư ban đầu và biên kỳ theo cặp", () => {
  it("cặp đã có kỳ ký → số dư ban đầu chỉ đọc; cặp khác sửa được", async () => {
    const { client, supplierReconciliation } = fakeClient();
    await expect(assertPairOpeningEditable(1, 100, client)).rejects.toThrow(/số dư ban đầu không thể sửa/);
    await expect(assertPairOpeningEditable(1, 200, client)).resolves.toBeUndefined();
    expect(supplierReconciliation.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ supplierId: 1, projectId: 200, signedBySupplier: true }) }),
    );
  });

  it("loadPeriodBoundsContext chỉ đọc marker và số dư của cặp", async () => {
    const findMany = vi.fn(async () => [
      { id: 1, periodFrom: new Date("2026-01-01T00:00:00Z"), periodTo: new Date("2026-10-26T00:00:00Z"), signedBySupplier: true },
    ]);
    const findFirst = vi.fn(async () => ({ asOfDate: new Date("2025-12-31T00:00:00Z") }));
    const client = {
      supplierReconciliation: { findMany },
      ledgerOpeningBalance: { findFirst },
    } as unknown as Parameters<typeof loadPeriodBoundsContext>[2];
    const ctx = await loadPeriodBoundsContext(1, 100, client);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { supplierId: 1, projectId: 100, deletedAt: null } }));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ledgerType: "material", partyId: 1, projectId: 100 } }),
    );
    expect(ctx.markers).toHaveLength(1);
    expect(ctx.openingAsOf?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
  });

  it("isCutoverMarker nhận ra marker gắn importRunId", () => {
    expect(isCutoverMarker({ importRunId: 3 })).toBe(true);
    expect(isCutoverMarker({ importRunId: null })).toBe(false);
  });
});
