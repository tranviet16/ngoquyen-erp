import { test, expect } from "./fixtures/auth";
import { seedLot, deleteLot } from "./fixtures/db";

test.describe("sl-dt cell edit", () => {
  let lot: { id: number; code: string; lotName: string };

  test.beforeAll(async () => {
    lot = await seedLot("E2E-LOT");
  });

  test.afterAll(async () => {
    await deleteLot(lot.id);
  });

  test("edits a lot estimate cell on báo cáo SL and persists after reload", async ({ asAdmin: page }) => {
    const now = new Date();
    await page.goto(`/sl-dt/bao-cao-sl?year=${now.getFullYear()}&month=${now.getMonth() + 1}`);

    const row = page.locator("tr").filter({ hasText: lot.lotName });
    await expect(row).toBeVisible();

    await row.locator('td[title="Click để sửa (giá trị lô)"]').click();
    const input = row.locator("input");
    await input.fill("555");
    await input.press("Enter");

    await expect(row.locator('td[title="Click để sửa (giá trị lô)"]')).toHaveText("555");

    await page.reload();
    const reloadedRow = page.locator("tr").filter({ hasText: lot.lotName });
    await expect(reloadedRow.locator('td[title="Click để sửa (giá trị lô)"]')).toHaveText("555");
  });
});
