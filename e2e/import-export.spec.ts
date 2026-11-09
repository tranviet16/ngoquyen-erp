import path from "node:path";
import { test, expect } from "./fixtures/auth";

test.describe("excel import", () => {
  test("uploads a công nợ nhân công file and lands on the run detail page", async ({
    asAdmin: page,
  }) => {
    await page.goto("/admin/import");

    // Adapter vật tư một file đã gỡ; adapter nhân công đọc cùng bố cục "Nhập Liệu" / "Số Dư Ban Đầu"
    // (nhận cả tiêu đề "Nhà Cung Cấp" làm tên đội).
    await page.locator('select[name="adapter"]').selectOption("cong-no-nhan-cong");
    await page
      .locator('input[name="file"]')
      .setInputFiles(path.join(__dirname, "fixtures", "sample-import.xlsx"));
    await page.getByRole("button", { name: "Tải lên và phân tích" }).click();

    // router.push to the run-detail route; in dev the [runId] route compiles
    // on first hit, so allow well beyond the 5s default assertion timeout.
    await expect(page).toHaveURL(/\/admin\/import\/\d+/, { timeout: 30_000 });
    await expect(page.getByText("Phiên bản xem trước: v1")).toBeVisible({ timeout: 30_000 });
  });
});
