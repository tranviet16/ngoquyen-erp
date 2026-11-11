/**
 * Integration test: đơn giá nhập ở phiếu ngày tự tạo báo giá (NCC × vật tư), báo giá đi theo phiếu.
 *   - Giá khác mức đang hiệu lực ở ngày phiếu → báo giá mới hiệu lực từ ngày phiếu, gắn với phiếu.
 *   - Giá bằng mức đang hiệu lực, phiếu không giá → không tạo.
 *   - Sửa giá cùng phiếu → sửa luôn báo giá đó; giá trở lại bằng mức hiệu lực → xoá báo giá đó.
 *   - Sửa ghi chú không đụng báo giá; xoá phiếu → xoá báo giá; báo giá đã sửa tay thì giữ.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock, mockSession } from "@/test/helpers/session-mock";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({ userId: "quote-admin", role: "admin" }),
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue("quote-admin"),
}));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { createDelivery, softDeleteDelivery, updateDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { updatePriceQuote } from "@/lib/vat-tu-ncc/price-quote-service";

async function seed() {
  await prisma.user.create({
    data: { id: "quote-admin", name: "Kế toán", email: "quote-admin@test.local", role: "admin", isDirector: true },
  });
  const entity = await prisma.entity.create({ data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "Gạch Nam Hương" } });
  const project = await prisma.project.create({
    data: { code: "TC", name: "Trại Chuối", status: "active", entityId: entity.id },
  });
  const item = await prisma.item.create({ data: { code: "G-01", name: "Gạch đặc", unit: "viên", type: "material" } });
  mockSession({ id: "quote-admin", role: "admin" });
  const base = { supplierId: supplier.id, projectId: project.id, itemId: item.id, unit: "viên", qty: 100 };
  return { supplier, item, base };
}

const liveQuotes = (supplierId: number) =>
  prisma.supplierPriceQuote.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: [{ effectiveFrom: "asc" }, { id: "asc" }],
  });

const day = (d: Date) => d.toISOString().slice(0, 10);

describe("vat-tu-ncc báo giá tự tạo từ phiếu ngày (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("tạo khi giá mới, đi theo phiếu khi sửa / xoá, giữ bản đã sửa tay", async () => {
    const { supplier, base } = await seed();

    // Giá đầu tiên của vật tư → báo giá mới từ 10/11, gắn với phiếu.
    const s1 = await createDelivery({ ...base, date: "2026-11-10", unitPrice: 1000 });
    expect(s1.quoteChange).toBe("created");
    let quotes = await liveQuotes(supplier.id);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ sourceDeliveryId: s1.id, note: `Tự tạo từ phiếu ngày #${s1.id}` });
    expect(Number(quotes[0].unitPrice)).toBe(1000);
    expect(day(quotes[0].effectiveFrom)).toBe("2026-11-10");

    // Cùng giá với mức đang hiệu lực → không tạo; phiếu không giá → không tạo.
    const s2 = await createDelivery({ ...base, date: "2026-11-12", unitPrice: 1000 });
    expect(s2.quoteChange).toBeNull();
    const unpriced = await createDelivery({ ...base, date: "2026-11-13" });
    expect(unpriced.quoteChange).toBeNull();
    expect(await liveQuotes(supplier.id)).toHaveLength(1);

    // Giá đổi ở phiếu 2 → báo giá mới từ 12/11; sửa tiếp giá phiếu 2 → sửa luôn báo giá đó.
    const up1 = await updateDelivery(s2.id, { ...base, date: "2026-11-12", unitPrice: 1200 });
    expect(up1.quoteChange).toBe("created");
    const up2 = await updateDelivery(s2.id, { ...base, date: "2026-11-12", unitPrice: 1250 });
    expect(up2.quoteChange).toBe("updated");
    quotes = await liveQuotes(supplier.id);
    expect(quotes.map((q) => [day(q.effectiveFrom), Number(q.unitPrice), q.sourceDeliveryId])).toEqual([
      ["2026-11-10", 1000, s1.id],
      ["2026-11-12", 1250, s2.id],
    ]);

    // Sửa ghi chú không đụng báo giá.
    const noted = await updateDelivery(s2.id, { ...base, date: "2026-11-12", unitPrice: 1250, note: "ghi chú" });
    expect(noted.quoteChange).toBeNull();

    // Giá trở lại bằng mức đang hiệu lực (1.000 từ 10/11) → báo giá của phiếu 2 bị xoá.
    const back = await updateDelivery(s2.id, { ...base, date: "2026-11-12", unitPrice: 1000 });
    expect(back.quoteChange).toBe("removed");
    expect(await liveQuotes(supplier.id)).toHaveLength(1);

    // Xoá phiếu đã sinh báo giá → báo giá bị xoá theo.
    const s3 = await createDelivery({ ...base, date: "2026-11-15", unitPrice: 1300 });
    expect(s3.quoteChange).toBe("created");
    await softDeleteDelivery(s3.id, supplier.id);
    expect((await liveQuotes(supplier.id)).map((q) => Number(q.unitPrice))).toEqual([1000]);

    // Báo giá đã sửa tay ở trang Báo giá thôi gắn với phiếu → xoá phiếu vẫn giữ báo giá.
    const s4 = await createDelivery({ ...base, date: "2026-11-16", unitPrice: 1400 });
    const q4 = (await liveQuotes(supplier.id)).find((q) => q.sourceDeliveryId === s4.id)!;
    await updatePriceQuote(q4.id, {
      supplierId: supplier.id,
      itemId: base.itemId,
      unitPrice: 1450,
      effectiveFrom: "2026-11-16",
      note: "Báo giá NCC gửi",
    });
    await softDeleteDelivery(s4.id, supplier.id);
    quotes = await liveQuotes(supplier.id);
    expect(quotes.map((q) => [Number(q.unitPrice), q.sourceDeliveryId])).toEqual([
      [1000, s1.id],
      [1450, null],
    ]);
  });

  it("đổi ngày / vật tư của phiếu thì báo giá của phiếu đi theo", async () => {
    const { supplier, base } = await seed();
    const other = await prisma.item.create({ data: { code: "G-02", name: "Gạch lỗ", unit: "viên", type: "material" } });
    const s = await createDelivery({ ...base, date: "2026-11-10", unitPrice: 900 });
    expect(s.quoteChange).toBe("created");

    const moved = await updateDelivery(s.id, { ...base, itemId: other.id, date: "2026-11-11", unitPrice: 900 });
    expect(moved.quoteChange).toBe("updated");
    const quotes = await liveQuotes(supplier.id);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ itemId: other.id, sourceDeliveryId: s.id });
    expect(day(quotes[0].effectiveFrom)).toBe("2026-11-11");
  });
});
