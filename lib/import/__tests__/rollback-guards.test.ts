/**
 * Unit: guard hoàn tác coi dòng sổ / số dư vật tư không thuộc run trong cặp của run là chặn khi
 * `createdAt` HOẶC `updatedAt` sau commit — `createdAt` có thể sớm hơn commit dù dòng được ghi sau
 * (giao dịch chờ khoá NCC trong lúc commit, event xoá mềm được khôi phục giữ `createdAt` cũ).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { assertRollbackAllowed } from "@/lib/import/rollback-guards";
import { RollbackBlockedError } from "@/lib/import/import-errors";
import type { ImportTx } from "@/lib/import/adapters/adapter-types";

const COMMITTED_AT = new Date("2026-11-06T03:00:00.000Z");

function client(rows: unknown[]) {
  const $queryRaw = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => rows);
  return { tx: { $queryRaw } as unknown as Pick<ImportTx, "$queryRaw">, $queryRaw };
}

describe("assertRollbackAllowed", () => {
  it("dòng sổ / số dư ngoài run bị chặn khi tạo HOẶC sửa sau commit", async () => {
    const { tx, $queryRaw } = client([]);
    await expect(
      assertRollbackAllowed(tx, { id: 9, committedAt: COMMITTED_AT, createdAt: new Date("2026-11-06T02:00:00.000Z") }),
    ).resolves.toBeUndefined();

    const [strings, ...values] = $queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?").replace(/\s+/g, " ");
    expect(sql).toContain(`AND (t."createdAt" > ? OR t."updatedAt" > ?)`);
    expect(sql).toContain(`AND (o."createdAt" > ? OR o."updatedAt" > ?)`);
    // Mốc so sánh là committedAt của run (không phải createdAt khi đã có committedAt).
    expect(values.filter((v) => v instanceof Date && v.getTime() === COMMITTED_AT.getTime())).toHaveLength(4);
  });

  it("run cũ không có committedAt → so với createdAt (chặt hơn)", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const { tx, $queryRaw } = client([]);
    await assertRollbackAllowed(tx, { id: 9, committedAt: null, createdAt });
    const values = ($queryRaw.mock.calls[0] as unknown[]).slice(1);
    expect(values.filter((v) => v instanceof Date && v.getTime() === createdAt.getTime())).toHaveLength(4);
  });

  it("có vi phạm → RollbackBlockedError liệt kê lý do theo thứ tự cố định", async () => {
    const { tx } = client([
      { kind: "opening_after_commit", n: 1, np: 1, pairs: ["NCC A × CT X"] },
      { kind: "ledger_after_commit", n: 2, np: 1, pairs: ["NCC A × CT X"] },
    ]);
    const err = await assertRollbackAllowed(tx, { id: 9, committedAt: COMMITTED_AT, createdAt: COMMITTED_AT }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RollbackBlockedError);
    const reasons = (err as RollbackBlockedError).reasons;
    expect(reasons[0]).toMatch(/2 dòng sổ vật tư .*ghi sau khi run được commit \(tạo mới hoặc sửa\).*NCC A × CT X/);
    expect(reasons[1]).toMatch(/1 số dư ban đầu vật tư ghi sau khi run được commit \(tạo mới hoặc sửa\)/);
  });
});
