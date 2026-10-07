import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canAccess: vi.fn(),
  findUser: vi.fn(),
  build: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/acl", () => ({ canAccess: mocks.canAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("@/lib/export/templates/cong-no-tong-hop", () => ({ buildCongNoTongHopExcel: mocks.build }));
vi.mock("@/lib/export/templates/cong-no-monthly", () => ({ buildCongNoMonthlyExcel: vi.fn() }));
vi.mock("@/lib/export/templates/doi-chieu", () => ({ buildDoiChieuExcel: vi.fn() }));
vi.mock("@/lib/export/templates/du-toan", () => ({ buildDuToanExcel: vi.fn() }));
vi.mock("@/lib/export/templates/sl-dt", () => ({ buildSlDtExcel: vi.fn() }));

import { POST } from "@/app/api/export/excel/route";

function request(params: Record<string, unknown>) {
  return new Request("http://localhost/api/export/excel", {
    method: "POST",
    body: JSON.stringify({ template: "cong-no-tong-hop", params }),
  }) as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: "u1" } });
  mocks.canAccess.mockResolvedValue(true);
  mocks.findUser.mockResolvedValue({ role: "user" });
  mocks.build.mockResolvedValue(Buffer.from("xlsx"));
});

describe("POST /api/export/excel (cong-no-tong-hop)", () => {
  it("lets a non-admin with cong-no-vt read access download the workbook", async () => {
    const res = await POST(request({ from: "2026-04-27", to: "2026-05-26", entityIds: [1, 2] }));
    expect(res.status).toBe(200);
    expect(mocks.canAccess).toHaveBeenCalledWith("u1", "cong-no-vt", { minLevel: "read", scope: "module" });
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.build).toHaveBeenCalledWith({ from: "2026-04-27", to: "2026-05-26", entityIds: [1, 2] });
    expect(res.headers.get("Content-Disposition")).toContain("cong-no-tong-hop-2026-04-27-2026-05-26.xlsx");
  });

  it("names an unbounded window toan-bo / den-nay", async () => {
    const res = await POST(request({ from: null, to: null }));
    expect(res.headers.get("Content-Disposition")).toContain("cong-no-tong-hop-toan-bo-den-nay.xlsx");
  });

  it("rejects without read access", async () => {
    mocks.canAccess.mockResolvedValue(false);
    expect((await POST(request({ from: null, to: null }))).status).toBe(403);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("returns a generic 400 for a bad window or entity list", async () => {
    expect((await POST(request({ from: "2026-13-40", to: null }))).status).toBe(400);
    expect((await POST(request({ from: "2026-06-01", to: "2026-05-01" }))).status).toBe(400);
    expect((await POST(request({ from: null, to: null, entityIds: ["x"] }))).status).toBe(400);
    expect((await POST(request({ from: null, to: null, entityIds: "1" }))).status).toBe(400);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("does not leak error detail on a 500", async () => {
    mocks.build.mockRejectedValue(new Error("relation ledger_transactions secret"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request({ from: null, to: null }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "Export failed" });
  });
});
