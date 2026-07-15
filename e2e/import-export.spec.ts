import path from "node:path";
import { test, expect } from "./fixtures/auth";

test.describe("excel import", () => {
  test("uploads a công nợ vật tư file and lands on the run detail page", async ({
    asAdmin: page,
  }) => {
    await page.goto("/admin/import");

    await page.locator('select[name="adapter"]').selectOption("cong-no-vat-tu");
    await page
      .locator('input[name="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "sample-import.xlsx"));
    await page.getByRole("button", { name: "Tải lên và phân tích" }).click();

    // router.push to the run-detail route; in dev the [runId] route compiles
    // on first hit, so allow well beyond the 5s default assertion timeout.
    await expect(page).toHaveURL(/\/admin\/import\/\d+/, { timeout: 30_000 });
  });
});
