import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { prisma as rootPrisma } from "@/lib/prisma";
import {
  MATERIAL_CUTOVER_ADAPTER,
  MaterialScopeError,
  getMaterialCutoverDate,
  parseCutoverDate,
  requireProjectId,
  resolveMaterialEntityId,
  type CutoverClient,
} from "../pair-scope";

describe("requireProjectId", () => {
  it("nhận số nguyên dương", () => {
    expect(requireProjectId(5)).toBe(5);
  });

  it.each([null, undefined, 0, -1, 1.5])("từ chối %s với mã missing_project", (value) => {
    expect(() => requireProjectId(value as number | null | undefined, "Phiếu #1")).toThrow(MaterialScopeError);
    try {
      requireProjectId(value as number | null | undefined, "Phiếu #1");
    } catch (e) {
      expect((e as MaterialScopeError).code).toBe("missing_project");
      expect((e as Error).message).toMatch(/^Phiếu #1: Thiếu công trình/);
    }
  });
});

describe("resolveMaterialEntityId — Chủ thể suy từ công trình", () => {
  /** Client transaction giả: đọc công trình bằng `$queryRaw … FOR SHARE`. */
  const txClient = (row: { entityId: number | null } | null) => {
    const $queryRaw = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => (row ? [row] : []));
    const findUnique = vi.fn();
    return {
      client: { $queryRaw, project: { findUnique } } as unknown as Parameters<typeof resolveMaterialEntityId>[0],
      $queryRaw,
      findUnique,
    };
  };

  it("trong transaction: đọc Project.entityId FOR SHARE (khoá tới hết transaction ghi)", async () => {
    const { client, $queryRaw, findUnique } = txClient({ entityId: 4 });
    await expect(resolveMaterialEntityId(client, 7)).resolves.toBe(4);
    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toMatch(/FROM projects WHERE id = \? FOR SHARE/);
    expect(values).toEqual([7]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("client gốc (không transaction): đọc thường, không khoá", async () => {
    const findUnique = vi.fn(async () => ({ entityId: 6 }));
    const $queryRaw = vi.fn();
    Object.assign(rootPrisma, { project: { findUnique }, $queryRaw });
    await expect(resolveMaterialEntityId(rootPrisma as Parameters<typeof resolveMaterialEntityId>[0], 7)).resolves.toBe(6);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { entityId: true } });
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it("công trình chưa có Chủ thể → missing_entity với hướng dẫn tiếng Việt", async () => {
    await expect(resolveMaterialEntityId(txClient({ entityId: null }).client, 7)).rejects.toMatchObject({
      code: "missing_entity",
      message: "Công trình chưa gán Chủ thể — gán ở Master data > Công trình",
    });
  });

  it("công trình không tồn tại → missing_project", async () => {
    await expect(resolveMaterialEntityId(txClient(null).client, 7)).rejects.toMatchObject({ code: "missing_project" });
  });
});

describe("parseCutoverDate — hợp đồng reviewJson.expected.cutoverDate", () => {
  it("đọc ngày YYYY-MM-DD thành UTC 00:00", () => {
    expect(parseCutoverDate({ expected: { cutoverDate: "2026-10-26" } })?.toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
  });

  it.each([
    null,
    "2026-10-26",
    {},
    { expected: null },
    { expected: { cutoverDate: 20261026 } },
    { expected: { cutoverDate: "26/10/2026" } },
    { expected: { cutoverDate: "2026-02-30" } },
  ])("trả null khi sai hình dạng: %j", (value) => {
    expect(parseCutoverDate(value)).toBeNull();
  });
});

describe("getMaterialCutoverDate", () => {
  /** `$queryRaw` giả: `row` = dòng run committed mới nhất (chỉ id + trường mốc), null = chưa có run. */
  const client = (row: { id: number; cutoverDate: string | null } | null) => {
    const $queryRaw = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => (row ? [row] : []));
    return { client: { $queryRaw } as unknown as CutoverClient, $queryRaw };
  };

  it("chưa có run chuyển đổi đã commit → null", async () => {
    const { client: c, $queryRaw } = client(null);
    await expect(getMaterialCutoverDate(c)).resolves.toBeNull();
    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?");
    expect(values).toEqual([MATERIAL_CUTOVER_ADAPTER]);
    expect(sql).toMatch(/status = 'committed'/);
    // Chỉ đọc đúng một trường bằng SQL — không kéo cả reviewJson (payload review nhiều MB) hay sourceFile.
    expect(sql).toMatch(/"reviewJson" -> 'expected' ->> 'cutoverDate'/);
    expect(sql).not.toMatch(/SELECT\s+\*|"sourceFile"|SELECT id, "reviewJson"/);
    expect(sql).toMatch(/ORDER BY "committedAt" DESC NULLS LAST, id DESC\s+LIMIT 1/);
  });

  it("run đã commit → mốc của run", async () => {
    const { client: c } = client({ id: 3, cutoverDate: "2026-10-26" });
    expect((await getMaterialCutoverDate(c))?.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it.each([null, "", "26/10/2026", "2026-02-30", "{\"x\":1}"])(
    "run đã commit nhưng mốc thiếu / sai (%j) → cutover_invalid (fail closed)",
    async (raw) => {
      const { client: c } = client({ id: 3, cutoverDate: raw });
      await expect(getMaterialCutoverDate(c)).rejects.toMatchObject({ code: "cutover_invalid" });
    },
  );
});
