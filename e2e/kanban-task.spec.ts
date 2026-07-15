import { test, expect } from "./fixtures/auth";
import { ensureDepartment, cleanupTasksByPrefix } from "./fixtures/db";

const PREFIX = "E2E-KANBAN-";

test.describe("kanban task", () => {
  test.beforeAll(async () => {
    await ensureDepartment();
    // Clear tasks a crashed prior run may have left in the E2E department, so
    // the dept-filtered board below holds exactly the card this spec creates.
    await cleanupTasksByPrefix(PREFIX);
  });

  test.afterAll(async () => {
    await cleanupTasksByPrefix(PREFIX);
  });

  test("creates a task then drags it from Cần làm to Đang làm", async ({ asAdmin: page }) => {
    // Cold dev-server route compilation plus the staged manual drag can outrun
    // the 30s default; CI runs a prebuilt server and is unaffected.
    test.setTimeout(60_000);
    const title = `${PREFIX}${Date.now()}`;

    await page.goto("/van-hanh/cong-viec");
    await page.getByRole("button", { name: "Tạo task" }).click();

    const dialog = page.locator("form").filter({ hasText: "Tạo task mới" });
    await dialog.locator("input").first().fill(title);
    await dialog.locator("select").first().selectOption({ label: "E2E - Phòng E2E" });
    // Picking the department reloads its members; assignee is now required.
    // Locate the assignee <select> by the option it gains (avoids positional .nth).
    await dialog
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "E2E Admin" }) })
      .selectOption({ label: "E2E Admin" });
    await dialog.getByRole("button", { name: "Tạo task" }).click();

    const card = page.locator('[aria-roledescription="draggable"]').filter({ hasText: title });
    await expect(card).toBeVisible();

    // The shared test DB carries ~100 tasks from other fixtures, making the
    // "Cần làm" column scroll far past the viewport. Filter the board to the
    // E2E department so the new card sits in a short, fully-visible column the
    // manual-drag coordinates can reliably hit.
    await page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: "E2E - Phòng E2E" }) })
      .selectOption({ label: "E2E - Phòng E2E" });
    // The new card is visible in the *unfiltered* board too, so awaiting its
    // visibility would not wait for the filter's router.push to land. Wait on
    // the board collapsing to this spec's single E2E-dept task instead — that
    // proves the filtered render committed before we measure layout boxes.
    await expect(page.locator('[aria-roledescription="draggable"]')).toHaveCount(1);
    await expect(card).toBeVisible();

    const doingColumn = page
      .locator("div.rounded-lg.border-2")
      .filter({ has: page.getByRole("heading", { name: "Đang làm" }) });

    const cardBox = await card.boundingBox();
    const targetBox = await doingColumn.boundingBox();
    if (!cardBox || !targetBox) throw new Error("kanban: missing layout boxes");

    const cardX = cardBox.x + cardBox.width / 2;
    const cardY = cardBox.y + cardBox.height / 2;
    const dropX = targetBox.x + targetBox.width / 2;
    const dropY = targetBox.y + targetBox.height / 2;

    // dnd-kit's PointerSensor (5px activation distance) drives drag state through
    // React renders, and its collision detection recomputes `over` on each render.
    // Pause between pointer events so React flushes — otherwise Playwright fires
    // move+up in one synchronous burst and `onDragEnd` reads a stale/null `over`.
    await page.mouse.move(cardX, cardY);
    await page.mouse.down();
    await page.mouse.move(cardX + 12, cardY + 12, { steps: 4 }); // clear 5px threshold
    await page.waitForTimeout(100);
    await page.mouse.move(dropX, dropY, { steps: 12 });
    await page.waitForTimeout(100);
    await page.mouse.move(dropX, dropY); // settle so `over` commits before release
    await page.waitForTimeout(100);
    await page.mouse.up();

    await expect(page.getByText("Đã chuyển task")).toBeVisible();

    await page.reload();
    await expect(
      doingColumn.locator('[aria-roledescription="draggable"]').filter({ hasText: title }),
    ).toBeVisible();
  });
});
