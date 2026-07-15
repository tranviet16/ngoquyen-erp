import { expect, test } from "./fixtures/auth";

test("does not prefetch a missing route for grouping-only breadcrumbs", async ({
  asAdmin: page,
}) => {
  const cases = [
    { path: "/admin/permissions/roles", parent: "/admin", label: "Quản trị" },
    { path: "/thanh-toan/ke-hoach", parent: "/thanh-toan", label: "Thanh toán" },
    { path: "/van-hanh/cong-viec", parent: "/van-hanh", label: "Vận hành" },
  ] as const;
  const missingParentResponses: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      cases.some(({ parent }) => url.pathname === parent) &&
      response.status() === 404
    ) {
      missingParentResponses.push(response.url());
    }
  });

  for (const { path, label } of cases) {
    await page.goto(path);
    const breadcrumb = page.getByRole("navigation", { name: "Đường dẫn" });

    await expect(breadcrumb.getByText(label, { exact: true })).toBeVisible();
    await expect(
      breadcrumb.getByRole("link", { name: label, exact: true }),
    ).toHaveCount(0);
  }
  await page.waitForTimeout(500);
  expect(missingParentResponses).toEqual([]);
});
