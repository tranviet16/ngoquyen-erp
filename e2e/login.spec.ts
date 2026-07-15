import { test, expect } from "@playwright/test";
import { E2E_PASSWORD, E2E_USERS } from "./constants";

const admin = E2E_USERS[0];

test.describe("login", () => {
  test("rejects a wrong password and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên đăng nhập").fill(admin.username);
    await page.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
    await page.getByRole("button", { name: "Đăng nhập" }).click();

    await expect(page.getByText(/đăng nhập thất bại|invalid|sai/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("accepts valid credentials and redirects to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Tên đăng nhập").fill(admin.username);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("accepts a valid email address and redirects to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/Tên đăng nhập|email/i).fill(admin.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Đăng nhập" }).click();

    await expect(page).toHaveURL(/\/dashboard/);
  });
});
