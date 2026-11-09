import { test, expect } from "./fixtures/auth";
import { db } from "./fixtures/db";

/**
 * Cửa vào theo công trình (vat-tu-ncc):
 *  - công trình → NCC → Chốt kỳ: công trình đã chọn sẵn, tab giữ `?projectId=`;
 *  - mở chi tiết kỳ đối chiếu với `projectId` sai → 404;
 *  - ghi phiếu vào kỳ đã ký của cặp → toast lỗi.
 * Dữ liệu riêng của spec (mã có hậu tố thời gian), dọn ở afterAll.
 */
const SUFFIX = Date.now().toString(36).toUpperCase();
const PROJECT_CODE = `E2E-CT-${SUFFIX}`;
const OTHER_PROJECT_CODE = `E2E-CT2-${SUFFIX}`;

interface Seeded {
  entityId: number;
  supplierId: number;
  projectId: number;
  otherProjectId: number;
  itemId: number;
  reconciliationId: number;
}

let seeded: Seeded;

test.describe("vật tư theo công trình", () => {
  test.beforeAll(async () => {
    const entity = await db.entity.create({ data: { name: `Chủ thể E2E ${SUFFIX}`, type: "company" } });
    const supplier = await db.supplier.create({ data: { name: `NCC công trình E2E ${SUFFIX}` } });
    const project = await db.project.create({
      data: { code: PROJECT_CODE, name: `Công trình E2E ${SUFFIX}`, entityId: entity.id },
    });
    const otherProject = await db.project.create({
      data: { code: OTHER_PROJECT_CODE, name: `Công trình E2E khác ${SUFFIX}`, entityId: entity.id },
    });
    const item = await db.item.create({
      data: { code: `E2E-BT-${SUFFIX}`, name: `Bê tông E2E ${SUFFIX}`, unit: "m3", type: "material" },
    });
    await db.supplierDeliveryDaily.create({
      data: {
        supplierId: supplier.id,
        projectId: project.id,
        date: new Date("2026-10-10T00:00:00Z"),
        itemId: item.id,
        qty: 18,
        unit: "m3",
      },
    });
    // Kỳ 27/09 → 26/10/2026 của cặp đã được NCC ký → mọi ghi trong kỳ của cặp bị khoá.
    const recon = await db.supplierReconciliation.create({
      data: {
        supplierId: supplier.id,
        projectId: project.id,
        periodFrom: new Date("2026-09-27T00:00:00Z"),
        periodTo: new Date("2026-10-26T00:00:00Z"),
        openingBalance: 0,
        totalIn: 0,
        totalPaid: 0,
        closingBalance: 0,
        signedBySupplier: true,
        signedDate: new Date("2026-10-27T00:00:00Z"),
      },
    });
    seeded = {
      entityId: entity.id,
      supplierId: supplier.id,
      projectId: project.id,
      otherProjectId: otherProject.id,
      itemId: item.id,
      reconciliationId: recon.id,
    };
  });

  test.afterAll(async () => {
    if (!seeded) return;
    const projectIds = [seeded.projectId, seeded.otherProjectId];
    await db.ledgerTransaction.deleteMany({ where: { partyId: seeded.supplierId, ledgerType: "material" } });
    await db.supplierReconciliation.deleteMany({ where: { supplierId: seeded.supplierId } });
    await db.supplierDeliveryDaily.deleteMany({ where: { supplierId: seeded.supplierId } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.item.deleteMany({ where: { id: seeded.itemId } });
    await db.supplier.deleteMany({ where: { id: seeded.supplierId } });
    await db.entity.deleteMany({ where: { id: seeded.entityId } });
  });

  test("công trình → NCC → Chốt kỳ: công trình chọn sẵn và tab giữ projectId", async ({ asAdmin: page }) => {
    await page.goto("/vat-tu-ncc/cong-trinh");
    await page.getByRole("link", { name: PROJECT_CODE, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vat-tu-ncc/cong-trinh/${seeded.projectId}$`));

    const supplierRow = page.locator("tr").filter({ hasText: `NCC công trình E2E ${SUFFIX}` });
    await supplierRow.getByRole("link", { name: "Chốt kỳ", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vat-tu-ncc/${seeded.supplierId}/chot-ky\\?projectId=${seeded.projectId}$`));
    await expect(page.getByRole("heading", { name: "Chốt kỳ vật tư" })).toBeVisible();
    await expect(page.getByLabel("Công trình", { exact: true })).toHaveValue(String(seeded.projectId));

    // Đổi tab vẫn giữ cặp NCC × công trình.
    await page.getByRole("link", { name: "Đối chiếu công nợ", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/vat-tu-ncc/${seeded.supplierId}/doi-chieu\\?projectId=${seeded.projectId}$`));
    await expect(page.getByRole("heading", { name: "Đối chiếu công nợ" })).toBeVisible();
  });

  test("tab theo cặp thiếu projectId thì hiện bộ chọn công trình", async ({ asAdmin: page }) => {
    await page.goto(`/vat-tu-ncc/${seeded.supplierId}/chot-ky`);
    await expect(page.getByText("Chọn công trình để tiếp tục.").first()).toBeVisible();
    await page.getByRole("list", { name: "Công trình của NCC" }).getByRole("link", { name: new RegExp(PROJECT_CODE) }).click();
    await expect(page).toHaveURL(new RegExp(`/chot-ky\\?projectId=${seeded.projectId}$`));
  });

  test("chi tiết kỳ đối chiếu với projectId sai thì 404", async ({ asAdmin: page }) => {
    const base = `/vat-tu-ncc/${seeded.supplierId}/doi-chieu/${seeded.reconciliationId}`;
    const ok = await page.goto(`${base}?projectId=${seeded.projectId}`);
    expect(ok?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Bảng đối chiếu công nợ" })).toBeVisible();

    const wrong = await page.goto(`${base}?projectId=${seeded.otherProjectId}`);
    expect(wrong?.status()).toBe(404);
  });

  test("ghi phiếu vào kỳ đã ký thì thấy toast lỗi", async ({ asAdmin: page }) => {
    await page.goto(`/vat-tu-ncc/${seeded.supplierId}/ngay?projectId=${seeded.projectId}`);
    await page.getByRole("button", { name: "Thêm phiếu nhập" }).click();

    const dialog = page.getByRole("dialog");
    // Công trình khoá sẵn theo `?projectId=`.
    await expect(dialog.getByLabel("Công trình")).toBeDisabled();
    await expect(dialog.getByLabel("Công trình")).toHaveValue(String(seeded.projectId));
    const dateInput = dialog.getByPlaceholder("dd/mm/yyyy").first();
    await dateInput.fill("15/10/2026");
    await dateInput.press("Tab");
    await dialog.getByLabel("Vật tư").selectOption(String(seeded.itemId));
    await dialog.getByRole("button", { name: "Lưu" }).click();

    // Kỳ đã ký của cặp (hoặc mốc chuyển đổi nếu DB test có run chuyển đổi) chặn ghi — lý do hiện trên toast.
    await expect(page.getByText(/Thêm phiếu thất bại: .*(đã được NCC ký|chuyển đổi từ Excel)/)).toBeVisible();
    // Dialog vẫn mở để sửa, không có phiếu mới.
    await expect(dialog).toBeVisible();
    expect(await db.supplierDeliveryDaily.count({ where: { supplierId: seeded.supplierId, deletedAt: null } })).toBe(1);
  });
});
