import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { collectSupplierIds, lockSuppliers, type SupplierLockClient } from "../period-lock";

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

describe("lockSuppliers", () => {
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
