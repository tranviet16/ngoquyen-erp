/**
 * Unit: "Lưu & tính lại" tăng `reviewVersion` NGUYÊN TỬ (`UPDATE … RETURNING`) và trả đúng version
 * của review vừa ghi — không đọc lại sau UPDATE (có thể thấy version của lần tính lại đồng thời).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  importRun: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));
const fakeAdapter = vi.hoisted(() => ({
  name: "fake",
  label: "Fake",
  parse: vi.fn(),
  validate: vi.fn(() => ({ valid: true, errors: [] })),
  apply: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/import/import-source", () => ({
  LONG_TX_OPTIONS: { timeout: 1, maxWait: 1 },
  toJson: (v: unknown) => v,
  requireAdapter: vi.fn(() => fakeAdapter),
  parseRunSource: vi.fn(async () => ({ rows: [], conflicts: [] })),
}));
vi.mock("@/lib/import/import-run-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/import/import-run-store")>()),
  readSourceFile: vi.fn(async () => Buffer.from("nguồn")),
}));

import { refreshPreview } from "@/lib/import/import-preview";
import { saveReviewIfPreview } from "@/lib/import/import-run-store";
import { ImportError } from "@/lib/import/import-errors";

const RUN = {
  id: 5,
  status: "preview",
  adapter: "fake",
  fileName: "f.xlsx",
  fileHash: "h",
  reviewVersion: 3,
  reviewJson: null,
  mapping: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.importRun.findUnique.mockResolvedValue(RUN);
});

describe("saveReviewIfPreview", () => {
  const rawClient = mockPrisma as unknown as Parameters<typeof saveReviewIfPreview>[0];

  it("một câu UPDATE … RETURNING, chỉ khi run đang preview", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ reviewVersion: 8 }]);
    await expect(saveReviewIfPreview(rawClient, 5, { a: 1 }, { blocking: [] })).resolves.toBe(8);
    const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
    const sql = strings.join("?").replace(/\s+/g, " ");
    expect(sql).toContain(`"reviewVersion" = "reviewVersion" + 1`);
    expect(sql).toContain(`WHERE id = ? AND status = 'preview' RETURNING "reviewVersion"`);
    expect(values).toEqual([JSON.stringify({ a: 1 }), JSON.stringify({ blocking: [] }), 5]);

    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(saveReviewIfPreview(rawClient, 5, {}, {})).resolves.toBeNull();
  });
});

describe("refreshPreview", () => {
  it("trả version do UPDATE … RETURNING trả về, không đọc lại run sau khi ghi", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([{ reviewVersion: 4 }]);
    const result = await refreshPreview(5, {}, "u1");
    expect(result.reviewVersion).toBe(4);
    expect(result.runId).toBe(5);
    // Chỉ một lần đọc run (trước khi tính); không có lần đọc lại version sau UPDATE.
    expect(mockPrisma.importRun.findUnique).toHaveBeenCalledTimes(1);
  });

  it("run rời preview trong lúc tính lại → lỗi, không trả version", async () => {
    mockPrisma.$queryRaw.mockResolvedValueOnce([]);
    const err = await refreshPreview(5, {}, "u1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect((err as Error).message).toMatch(/không còn ở trạng thái xem trước/);
  });
});
