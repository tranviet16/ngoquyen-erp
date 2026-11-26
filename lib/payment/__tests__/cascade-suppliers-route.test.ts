/**
 * GET /api/thanh-toan/cascade-suppliers: gợi ý NCC cho dòng đề nghị thanh toán theo Loại NCC.
 * Dòng vật tư gửi supplierKind=vat_tu, dòng nhân công gửi supplierKind=nhan_cong (cùng ledgerType
 * material); NCC chỉ có số dư đầu kỳ ở cặp vẫn được gợi ý.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUser: vi.fn(),
  findSuppliers: vi.fn(),
  queryRaw: vi.fn(),
  canAccess: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl", () => ({ canAccess: mocks.canAccess }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUser },
    supplier: { findMany: mocks.findSuppliers },
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "@/app/api/thanh-toan/cascade-suppliers/route";

function get(query: Record<string, string>) {
  return GET(new NextRequest(`http://localhost/api/thanh-toan/cascade-suppliers?${new URLSearchParams(query)}`));
}

/** SQL text and bound values of the last tagged-template `$queryRaw` call. */
function lastQuery() {
  const [strings, ...values] = mocks.queryRaw.mock.calls.at(-1)!;
  return { sql: (strings as string[]).join("?"), values };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.findUser.mockResolvedValue({ role: "admin", isActive: true });
  mocks.queryRaw.mockResolvedValue([{ id: 67, name: "NCC #67" }]);
});

describe("GET /api/thanh-toan/cascade-suppliers", () => {
  it("filters material suppliers by kind and includes opening-balance-only suppliers", async () => {
    const res = await get({ ledgerType: "material", entityId: "2", projectId: "11", supplierKind: "nhan_cong" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suppliers: [{ id: 67, name: "NCC #67" }] });
    const { sql, values } = lastQuery();
    expect(sql).toContain('s."kind"');
    expect(sql).toContain("ledger_opening_balances");
    expect(values).toContain("nhan_cong");
  });

  it("without supplierKind passes null, so every kind is suggested (old callers)", async () => {
    await get({ ledgerType: "material", entityId: "2" });
    const { values } = lastQuery();
    expect(values).not.toContain("vat_tu");
    expect(values).not.toContain("nhan_cong");
    expect(values).toContain(null);
  });

  it("rejects an unknown supplierKind", async () => {
    const res = await get({ ledgerType: "material", entityId: "2", supplierKind: "labor" });
    expect(res.status).toBe(400);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("denies a request without a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await get({ ledgerType: "material", entityId: "2", supplierKind: "nhan_cong" })).status).toBe(401);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("denies a non-admin without a payment-department grant (cross-scope)", async () => {
    mocks.findUser.mockResolvedValue({ role: "ketoan", isActive: true });
    mocks.canAccess.mockResolvedValue(false);
    const res = await get({ ledgerType: "material", entityId: "2", departmentId: "9", supplierKind: "nhan_cong" });
    expect(res.status).toBe(403);
    expect(mocks.canAccess).toHaveBeenCalledWith("u1", "thanh-toan.ke-hoach", {
      minLevel: "create",
      scope: { kind: "dept", deptId: 9 },
    });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("denies an inactive admin", async () => {
    mocks.findUser.mockResolvedValue({ role: "admin", isActive: false });
    expect((await get({ ledgerType: "material", entityId: "2" })).status).toBe(403);
  });

  it("keeps the labor short-circuit for old callers", async () => {
    const res = await get({ ledgerType: "labor", entityId: "2" });
    expect(await res.json()).toEqual({ suppliers: [] });
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
