/**
 * `loadBookHeadline` (thẻ "Thực tế" của Dashboard): kiểm quyền TRƯỚC mọi truy vấn, công trình không dùng sổ
 * thì không tính báo cáo, lỗi nào cũng trả null (Dashboard giữ thẻ cũ), lỗi điều khiển của Next được ném lại.
 * Test entrypoint chỉ so thứ tự chữ trong trang, nên thứ tự quyền của chính loader được chứng minh ở đây.
 */

import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { legacyPlusOneInvoice } from "@/lib/du-an/dt-hd-tt/__tests__/book-card-fixture";
import { bookActualCard } from "@/lib/du-an/dt-hd-tt/overview";
import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  requireReleasedModuleRequest: vi.fn(),
  projectUsesBook: vi.fn(),
  getDtHdTtReports: vi.fn(),
  /** Mọi hàm của prisma giả: loader không được tự truy vấn, chỉ đi qua `projectUsesBook`. */
  db: vi.fn(),
}));

// vitest.setup.ts thay next/navigation bằng bản giả không có `unstable_rethrow`: test này cần bản thật để lỗi
// điều khiển (redirect) được nhận ra đúng như trong Next.
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { notFound: actual.notFound, redirect: actual.redirect, unstable_rethrow: actual.unstable_rethrow };
});
vi.mock("@/lib/acl/released-module-request", () => ({ requireReleasedModuleRequest: mocks.requireReleasedModuleRequest }));
vi.mock("@/lib/prisma", () => {
  const model = { count: mocks.db, findMany: mocks.db, findUnique: mocks.db, findFirst: mocks.db };
  return { prisma: { projectTransaction: model, projectEstimate: model, projectItemAlias: model, projectInvoiceLine: model, projectActualReceipt: model } };
});
vi.mock("@/lib/du-an/dt-hd-tt/book-presence", () => ({ projectUsesBook: mocks.projectUsesBook }));
vi.mock("@/lib/du-an/dt-hd-tt/report-service", () => ({ getDtHdTtReports: mocks.getDtHdTtReports }));

import { loadBookHeadline } from "@/components/du-an/dt-hd-tt/load-report-page";

const legacyReports = () => buildReports(legacyPlusOneInvoice());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireReleasedModuleRequest.mockImplementation(async () => {
    mocks.order.push("acl");
    return { userId: "u1", role: "viewer" };
  });
  mocks.projectUsesBook.mockImplementation(async () => {
    mocks.order.push("book");
    return true;
  });
  mocks.getDtHdTtReports.mockImplementation(async () => {
    mocks.order.push("reports");
    return legacyReports();
  });
});

describe("loadBookHeadline", () => {
  it("checks read access on the project first; a denial makes no database call, no report load, and returns null", async () => {
    mocks.requireReleasedModuleRequest.mockRejectedValue(Object.assign(new Error("Forbidden"), { name: "ModuleRequestError" }));

    await expect(loadBookHeadline(4)).resolves.toBeNull();
    expect(mocks.requireReleasedModuleRequest).toHaveBeenCalledWith("du-an", { minLevel: "read", scope: { kind: "project", projectId: 4 } });
    expect(mocks.projectUsesBook).not.toHaveBeenCalled();
    expect(mocks.getDtHdTtReports).not.toHaveBeenCalled();
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("returns null without loading the reports when the project does not use the book", async () => {
    mocks.projectUsesBook.mockResolvedValue(false);

    await expect(loadBookHeadline(4)).resolves.toBeNull();
    expect(mocks.projectUsesBook).toHaveBeenCalledWith(expect.anything(), 4);
    expect(mocks.getDtHdTtReports).not.toHaveBeenCalled();
  });

  it("returns null and logs when the report load fails", async () => {
    mocks.getDtHdTtReports.mockRejectedValue(new Error("db down"));

    await expect(loadBookHeadline(4)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("returns null when the book predicate fails", async () => {
    mocks.projectUsesBook.mockRejectedValue(new Error("db down"));

    await expect(loadBookHeadline(4)).resolves.toBeNull();
    expect(mocks.getDtHdTtReports).not.toHaveBeenCalled();
  });

  it("reaches bookActualCard on the legacy-plus-one-invoice project, after the access check and the predicate", async () => {
    const card = await loadBookHeadline(4);

    expect(mocks.order).toEqual(["acl", "book", "reports"]);
    expect(mocks.getDtHdTtReports).toHaveBeenCalledWith(4);
    expect(card).toEqual(bookActualCard(legacyReports()));
    expect(card).toMatchObject({ label: "Thực tế (sổ DT-HĐ-TT)", actual: 0, tone: "warning", incomplete: true });
    expect(mocks.db).not.toHaveBeenCalled();
  });

  it("rethrows Next control-flow errors instead of swallowing them", async () => {
    let nextError: unknown;
    try {
      redirect("/login");
    } catch (err) {
      nextError = err;
    }
    mocks.requireReleasedModuleRequest.mockRejectedValue(nextError);

    await expect(loadBookHeadline(4)).rejects.toBe(nextError);
    expect(console.error).not.toHaveBeenCalled();
  });
});
