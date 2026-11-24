import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures/auth";
import { db, deleteDtHdTtBook, resetDtHdTtLinks, seedDtHdTtBook, type DtHdTtBook } from "./fixtures/db";

/**
 * Typing H / S / X / Z on the HĐ-TT screen (Dự án xây dựng › Đối chiếu DT-HĐ-TT). These behaviours live in the
 * screen's client code — keyboard, focus and save flow — which unit tests cannot reach.
 */
test.describe("HĐ-TT in-place editing", () => {
  test.describe.configure({ mode: "serial" });

  let book: DtHdTtBook;
  test.beforeAll(async () => {
    book = await seedDtHdTtBook("E2E-HDTT");
  });
  test.afterAll(async () => {
    await deleteDtHdTtBook(book);
  });
  test.beforeEach(async () => {
    await resetDtHdTtLinks(book);
  });

  type Field = "H" | "S" | "X" | "Z";
  const cell = (page: Page, linkId: number, field: Field) => page.locator(`[data-edit-cell="${linkId}:${field}"]`);
  const stored = (linkId: number) => db.projectCounterpartySupplier.findUniqueOrThrow({ where: { id: linkId } });
  const money = (value: unknown) => (value == null ? null : Number(value));

  /** Opens HĐ-TT and turns on "Nhập H / S / X / Z". A click before hydration does nothing, so retry on state. */
  async function openEditMode(page: Page): Promise<void> {
    await page.goto(`/du-an/${book.projectId}/dt-hd-tt/hd-tt`);
    const screen = page.locator("[data-hd-tt-screen]");
    await expect(screen).toHaveAttribute("data-can-edit", "true");
    await expect(async () => {
      if ((await screen.getAttribute("data-editing")) !== "true") await page.locator("[data-hd-tt-edit-toggle]").click();
      await expect(screen).toHaveAttribute("data-editing", "true", { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
  }

  test("Enter saves Vietnamese-style money and moves to the next row; the value survives a reload", async ({ asAdmin: page }) => {
    await openEditMode(page);
    const h = cell(page, book.links.first, "H");
    await h.fill("1.500");
    await h.press("Enter");

    await expect.poll(async () => money((await stored(book.links.first)).paidOverrideVnd)).toBe(1500);
    await expect(cell(page, book.links.second, "H")).toBeFocused();

    await openEditMode(page);
    await expect(cell(page, book.links.first, "H")).toHaveValue("1500");
  });

  test("a failed save keeps focus after Enter but lets Tab and clicks leave; the red cell keeps its text", async ({ asAdmin: page }) => {
    await openEditMode(page);
    const bad = cell(page, book.links.first, "X");
    await bad.fill("12abc");
    await bad.press("Enter");
    await expect(bad).toHaveAttribute("data-edit-error", "");
    await expect(bad).toBeFocused();

    // Leaving saves again and fails again; the cursor must still be free to go.
    await bad.press("Tab");
    await expect(bad).not.toBeFocused();
    const other = cell(page, book.links.second, "X");
    await other.click();
    await expect(other).toBeFocused();
    await expect(bad).toHaveValue("12abc");
    await expect(bad).toHaveAttribute("data-edit-error", "");

    // Another cell's save re-renders the page; the failed draft and its mark stay.
    await other.fill("3.000");
    await other.press("Enter");
    await expect.poll(async () => money((await stored(book.links.second)).recoveredVnd)).toBe(3000);
    await expect(bad).toHaveValue("12abc");
    await expect(bad).toHaveAttribute("data-edit-error", "");
    expect(money((await stored(book.links.first)).recoveredVnd)).toBeNull();
  });

  test("Esc drops the draft and saves nothing", async ({ asAdmin: page }) => {
    await openEditMode(page);
    const x = cell(page, book.links.first, "X");
    await x.fill("777");
    await x.press("Escape");
    await expect(x).toHaveValue("");
    await x.press("Tab");
    await page.waitForTimeout(500);
    expect(money((await stored(book.links.first)).recoveredVnd)).toBeNull();
  });

  test("Z stores Vietnamese text exactly", async ({ asAdmin: page }) => {
    await openEditMode(page);
    const z = cell(page, book.links.first, "Z");
    await z.fill("Đã gửi hồ sơ, chờ ký quyết toán");
    await z.press("Enter");
    await expect.poll(async () => (await stored(book.links.first)).todoNote).toBe("Đã gửi hồ sơ, chờ ký quyết toán");
  });

  test("S is typeable only on a later NCC of a settled đầu mối", async ({ asAdmin: page }) => {
    await openEditMode(page);
    await expect(cell(page, book.links.first, "S")).toBeDisabled();
    await expect(cell(page, book.links.first, "S")).toHaveAttribute("title", /NCC đầu tiên/);
    await expect(cell(page, book.links.loose, "S")).toBeDisabled();
    await expect(cell(page, book.links.loose, "S")).toHaveAttribute("title", /đầu mối trước/);

    const s = cell(page, book.links.second, "S");
    await s.fill("2.000");
    await s.press("Enter");
    await expect.poll(async () => money((await stored(book.links.second)).splitActualVnd)).toBe(2000);
  });

  test("a read-only project user gets no edit toggle and no inputs", async ({ asProjectUser: page }) => {
    await page.goto(`/du-an/${book.projectId}/dt-hd-tt/hd-tt`);
    const screen = page.locator("[data-hd-tt-screen]");
    await expect(screen).toHaveAttribute("data-can-edit", "false");
    await expect(page.locator("[data-hd-tt-edit-toggle]")).toHaveCount(0);
    await expect(page.locator("[data-edit-cell]")).toHaveCount(0);
  });
});
