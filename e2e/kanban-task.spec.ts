import { test, expect } from "./fixtures/auth";
import { ensureDepartment, cleanupTasksByPrefix } from "./fixtures/db";

const PREFIX = "E2E-KANBAN-";

test.describe("kanban task", () => {
  test.beforeAll(async () => {
    await ensureDepartment();
  });

  test.afterAll(async () => {
    await cleanupTasksByPrefix(PREFIX);
  });

  test("creates a task then drags it from Cần làm to Đang làm", async ({ asAdmin: page }) => {
    const title = `${PREFIX}${Date.now()}`;

    await page.goto("/van-hanh/cong-viec");
    await page.getByRole("button", { name: "Tạo task" }).click();

    const dialog = page.locator("form").filter({ hasText: "Tạo task mới" });
    await dialog.locator("input").first().fill(title);
    await dialog.locator("select").first().selectOption({ label: "E2E - Phòng E2E" });
    await dialog.getByRole("button", { name: "Tạo task" }).click();

    const card = page.locator('[aria-roledescription="draggable"]').filter({ hasText: title });
    await expect(card).toBeVisible();

    // dnd-kit PointerSensor has a 5px activation distance — drag manually so the
    // threshold is cleared before the pointer reaches the target column.
    const doingColumn = page
      .locator("div.rounded-lg.border-2")
      .filter({ has: page.getByRole("heading", { name: "Đang làm" }) });

    const cardBox = await card.boundingBox();
    const targetBox = await doingColumn.boundingBox();
    if (!cardBox || !targetBox) throw new Error("kanban: missing layout boxes");

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + cardBox.width / 2 + 20, cardBox.y + cardBox.height / 2 + 20, { steps: 5 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 80, { steps: 10 });
    await page.mouse.up();

    await expect(page.getByText("Đã chuyển task")).toBeVisible();

    await page.reload();
    await expect(
      doingColumn.locator('[aria-roledescription="draggable"]').filter({ hasText: title }),
    ).toBeVisible();
  });
});
