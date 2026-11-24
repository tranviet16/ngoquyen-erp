/**
 * `loadAliasSourceLines` (dòng nguồn của khóa đang mở trên Ánh xạ): kiểm quyền đọc TRƯỚC mọi truy vấn và
 * bị từ chối thì không truy vấn; truy vấn theo đúng công trình + khóa, bỏ dòng đã xóa mềm, giới hạn 20 ngay
 * trên truy vấn; khóa dự toán không truy vấn gì. `shapeAliasSourceLines` đổi Decimal sang số, giữ null.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  requireReleasedModuleRequest: vi.fn(),
  invoiceFindMany: vi.fn(),
  receiptFindMany: vi.fn(),
  /** Các hàm prisma khác: loader không được gọi tới. */
  other: vi.fn(),
}));

vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: mocks.requireReleasedModuleRequest }));
vi.mock("@/lib/prisma", () => {
  const other = { findMany: mocks.other, findFirst: mocks.other, count: mocks.other };
  return {
    prisma: {
      projectInvoiceLine: { findMany: mocks.invoiceFindMany },
      projectActualReceipt: { findMany: mocks.receiptFindMany },
      projectEstimate: other,
      projectItemAlias: other,
    },
  };
});

import { ALIAS_SOURCE_LINES_MAX, loadAliasSourceLines, shapeAliasSourceLines, type RawSourceLine } from "../alias-source-lines";

const dec = (n: number) => ({ toNumber: () => n });
const invoiceRow = (id: number): RawSourceLine => ({
  id, qty: dec(2.5), unitPrice: dec(120_000), amountVnd: dec(300_000), supplierId: 7, invoiceNo: `HD-${id}`, supplier: { name: "NCC Mẫu Một" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  mocks.requireReleasedModuleRequest.mockImplementation(async () => {
    mocks.order.push("acl");
    return { userId: "u1", role: "viewer" };
  });
  mocks.invoiceFindMany.mockImplementation(async () => {
    mocks.order.push("invoices");
    return [invoiceRow(1), invoiceRow(2)];
  });
  mocks.receiptFindMany.mockImplementation(async () => {
    mocks.order.push("receipts");
    return [{ id: 9, qty: null, unitPrice: null, amountVnd: dec(1_080_000), counterparty: null }];
  });
});

describe("loadAliasSourceLines", () => {
  it("checks read access on the project first; a denial throws and makes no database call", async () => {
    mocks.requireReleasedModuleRequest.mockRejectedValue(new Error("Forbidden"));

    await expect(loadAliasSourceLines(4, "hd", "cat vang|m3")).rejects.toThrow("Forbidden");
    expect(mocks.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "read", scope: { kind: "project", projectId: 4 } });
    expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
    expect(mocks.receiptFindMany).not.toHaveBeenCalled();
    expect(mocks.other).not.toHaveBeenCalled();
  });

  it("reads invoice lines of that project and key only, live rows, capped at 20 on the query", async () => {
    const result = await loadAliasSourceLines(4, "hd", "cat vang|m3");

    expect(mocks.order).toEqual(["acl", "invoices"]);
    expect(mocks.invoiceFindMany).toHaveBeenCalledTimes(1);
    const query = mocks.invoiceFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ projectId: 4, itemKey: "cat vang|m3", deletedAt: null });
    expect(query.take).toBe(20);
    expect(ALIAS_SOURCE_LINES_MAX).toBe(20);
    expect(query.orderBy).toEqual([{ invoiceDate: "asc" }, { id: "asc" }]);
    expect(result).toEqual({ source: "hd", itemKey: "cat vang|m3", lines: shapeAliasSourceLines([invoiceRow(1), invoiceRow(2)]) });
    expect(mocks.receiptFindMany).not.toHaveBeenCalled();
  });

  it("reads receipt lines for a TT key the same way", async () => {
    const result = await loadAliasSourceLines(4, "tt", "da 1x2|m3");

    expect(mocks.order).toEqual(["acl", "receipts"]);
    const query = mocks.receiptFindMany.mock.calls[0][0];
    expect(query.where).toEqual({ projectId: 4, itemKey: "da 1x2|m3", deletedAt: null });
    expect(query.take).toBe(20);
    expect(result.lines).toEqual([{ id: 9, party: null, supplierId: null, invoiceNo: null, qty: null, unitPrice: null, amount: 1_080_000 }]);
  });

  it("returns no lines for a DT key without touching the database (after the access check)", async () => {
    await expect(loadAliasSourceLines(4, "dt", "cat vang|m3|VL")).resolves.toEqual({ source: "dt", itemKey: "cat vang|m3|VL", lines: [] });
    expect(mocks.order).toEqual(["acl"]);
    expect(mocks.other).not.toHaveBeenCalled();
  });
});

describe("shapeAliasSourceLines", () => {
  it("turns an invoice row into NCC, số HĐ, SL, đơn giá and amount as plain numbers", () => {
    expect(shapeAliasSourceLines([invoiceRow(3)])).toEqual([
      { id: 3, party: "NCC Mẫu Một", supplierId: 7, invoiceNo: "HD-3", qty: 2.5, unitPrice: 120_000, amount: 300_000 },
    ]);
  });

  it("turns a receipt row into its đầu mối, keeping missing numbers as null", () => {
    const row: RawSourceLine = { id: 5, qty: dec(4), unitPrice: null, amountVnd: dec(500_000), counterparty: { name: "Tổ Mẫu" } };
    expect(shapeAliasSourceLines([row])).toEqual([{ id: 5, party: "Tổ Mẫu", supplierId: null, invoiceNo: null, qty: 4, unitPrice: null, amount: 500_000 }]);
  });

  it("keeps the order and never returns more than 20 lines", () => {
    const rows = Array.from({ length: 25 }, (_, i) => invoiceRow(i + 1));
    const lines = shapeAliasSourceLines(rows);
    expect(lines).toHaveLength(20);
    expect(lines.map((l) => l.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});
