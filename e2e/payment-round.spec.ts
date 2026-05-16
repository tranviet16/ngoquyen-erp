import { test, expect } from "./fixtures/auth";
import { findRoundByNote, deleteRound, ensurePaymentRefData } from "./fixtures/db";

test.describe("payment round", () => {
  const note = `E2E-ROUND-${Date.now()}`;

  test.beforeAll(async () => {
    await ensurePaymentRefData();
  });

  test.afterAll(async () => {
    const round = await findRoundByNote(note);
    if (round) await deleteRound(round.id);
  });

  test("creates a round, adds a dịch vụ item, then runs the full lifecycle", async ({
    asAdmin: page,
  }) => {
    // Every lifecycle action confirms via window.confirm — auto-accept all.
    page.on("dialog", (dialog) => dialog.accept());

    await page.goto("/thanh-toan/ke-hoach");
    await page.getByRole("button", { name: "Tạo đợt mới" }).click();
    const dialog = page.getByRole("dialog");
    // The dialog has two inputs — month (type=month) then note; both expose the
    // textbox role, so the note field is the second one.
    await dialog.getByRole("textbox").nth(1).fill(note);
    await dialog.getByRole("button", { name: "Tạo", exact: true }).click();

    await expect(page).toHaveURL(/\/thanh-toan\/ke-hoach\/\d+/);

    // NewItemRow — the row carrying the "Thêm" button. category=dich_vu bypasses
    // the ledger-data cascade, so the lone seeded entity/project/supplier suffice.
    const newRow = page.locator("tr").filter({
      has: page.getByRole("button", { name: "Thêm" }),
    });
    // Selects in row order: category, entity (Chủ thể), project, supplier (NCC).
    await newRow.locator("select").nth(0).selectOption("dich_vu");
    await newRow.locator("select").nth(1).selectOption({ index: 1 }); // entity
    await newRow.locator("select").nth(2).selectOption({ index: 1 }); // project
    await newRow.locator("select").nth(3).selectOption({ index: 1 }); // supplier
    await newRow.locator('input[type="number"]').fill("1000000");
    await newRow.getByRole("button", { name: "Thêm" }).click();
    await expect(page.getByText("Đã thêm")).toBeVisible();

    await page.getByRole("button", { name: "Gửi duyệt" }).click();
    await page.getByRole("button", { name: "Duyệt tất cả = đề xuất" }).click();
    await page.getByRole("button", { name: "Đóng đợt" }).click();

    await expect(page.getByText("Đã đóng")).toBeVisible();
  });
});
