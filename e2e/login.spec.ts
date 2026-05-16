import { test, expect } from "@playwright/test";
import { E2E_PASSWORD } from "./constants";

test.describe("login", () => {
  test("rejects a wrong password and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-admin@nq.local");
    await page.getByLabel("Mật khẩu").fill("wrong-password");
    await page.getByRole("button", { name: "Đăng nhập" }).click();

    await expect(page.getByText(/đăng nhập thất bại|invalid|sai/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("accepts valid credentials and redirects to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("e2e-admin@nq.local");
    await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
