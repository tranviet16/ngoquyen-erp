/**
 * Unit: lỗi DB tạm thời khi commit (Prisma P2028 / P2034, Postgres 40P01 / 55P03 / 40001) KHÔNG đánh
 * run `failed`: transaction đã rollback, run giữ `preview`, người dùng nhận thông điệp "thử lại"
 * (ImportPreconditionError) — không phải tải lại gói 20 MB. Lỗi thực thi khác vẫn → `failed`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mockPrisma = vi.hoisted(() => ({ $transaction: vi.fn() }));
const markRunFailed = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/import/import-run-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/import/import-run-store")>()),
  markRunFailed,
}));

import { TRANSIENT_COMMIT_MESSAGE, commitImport } from "@/lib/import/import-engine";
import { ImportPreconditionError, isTransientDbError } from "@/lib/import/import-errors";

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError(`lỗi ${code}`, { code, clientVersion: "test", meta });

/** Lỗi raw query qua driver adapter pg: mã Postgres lồng trong meta.driverAdapterError.cause. */
const adapterError = (pgCode: string) =>
  known("P2010", { driverAdapterError: { name: "DriverAdapterError", cause: { kind: "postgres", code: pgCode, originalCode: pgCode } } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("isTransientDbError", () => {
  it.each([
    ["P2028 (giao dịch hết giờ / đã đóng)", known("P2028")],
    ["P2034 (xung đột ghi / deadlock)", known("P2034")],
    ["40P01 qua driver adapter", adapterError("40P01")],
    ["55P03 qua driver adapter", adapterError("55P03")],
    ["40001 qua driver adapter", adapterError("40001")],
    ["lỗi pg thô có code", Object.assign(new Error("deadlock detected"), { code: "40P01" })],
    ["lỗi bọc trong cause", new Error("wrapped", { cause: { code: "55P03" } })],
  ])("nhận ra %s", (_label, err) => {
    expect(isTransientDbError(err)).toBe(true);
  });

  it.each([
    ["vi phạm unique P2002", known("P2002")],
    ["vi phạm CHECK 23514 qua adapter", adapterError("23514")],
    ["Error thường", new Error("Đối soát lệch")],
    ["không phải object", "40P01"],
  ])("không nhận %s", (_label, err) => {
    expect(isTransientDbError(err)).toBe(false);
  });

  it("chịu được vòng tham chiếu", () => {
    const err: Record<string, unknown> = { code: "X" };
    err.cause = err;
    expect(isTransientDbError(err)).toBe(false);
  });
});

describe("commitImport — lỗi DB tạm thời", () => {
  it.each([known("P2028"), known("P2034"), adapterError("40P01"), adapterError("55P03"), adapterError("40001")])(
    "giữ run ở preview và trả thông điệp thử lại (%#)",
    async (err) => {
      mockPrisma.$transaction.mockRejectedValue(err);
      const result = await commitImport(5, 2).catch((e: unknown) => e);
      expect(result).toBeInstanceOf(ImportPreconditionError);
      expect((result as Error).message).toBe(TRANSIENT_COMMIT_MESSAGE);
      expect(markRunFailed).not.toHaveBeenCalled();
    },
  );

  it("lỗi thực thi khác vẫn đánh failed và ném lại lỗi gốc", async () => {
    const err = new Error("Đối soát lệch — không ghi gì");
    mockPrisma.$transaction.mockRejectedValue(err);
    await expect(commitImport(5, 2)).rejects.toBe(err);
    expect(markRunFailed).toHaveBeenCalledWith(5, err);
  });

  it("ImportPreconditionError giữ nguyên, không đánh failed", async () => {
    const err = new ImportPreconditionError("Bản xem trước đã thay đổi, tải lại trang.");
    mockPrisma.$transaction.mockRejectedValue(err);
    await expect(commitImport(5, 2)).rejects.toBe(err);
    expect(markRunFailed).not.toHaveBeenCalled();
  });
});
