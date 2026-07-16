import { test, expect } from "./fixtures/auth";

test("admin can pause a module without exposing it to users lacking access", async ({
  asAdmin,
  asProjectUser,
  asViewer,
}) => {
  const moduleLabel = "Dự án xây dựng";

  try {
    await asAdmin.goto("/admin/permissions/modules");
    await asAdmin.getByRole("button", { name: "Quản lý trạng thái" }).click();
    await asAdmin.getByRole("switch", { name: `${moduleLabel}: Phát hành` }).click();
    await asAdmin.getByRole("button", { name: "Lưu thay đổi" }).click();
    await asAdmin.getByRole("button", { name: "Xác nhận và lưu" }).click();
    await expect(asAdmin.getByRole("dialog")).not.toBeVisible();

    await asAdmin.goto("/du-an");
    await expect(asAdmin).toHaveURL(/\/dang-phat-trien\?m=du-an/);
    await expect(asAdmin.getByRole("heading", { name: "Module đang phát triển" })).toBeVisible();
    await expect(asAdmin.getByText("Màn hình phía sau chỉ là giao diện minh họa")).toBeVisible();

    await asProjectUser.goto("/du-an");
    await expect(asProjectUser).toHaveURL(/\/dang-phat-trien\?m=du-an/);
    await expect(
      asProjectUser.getByRole("heading", { name: "Module đang phát triển" }),
    ).toBeVisible();

    await asViewer.goto("/du-an");
    await expect(asViewer).toHaveURL(/\/forbidden\?m=du-an/);
    await expect(asViewer.getByRole("link", { name: moduleLabel })).toHaveCount(0);
  } finally {
    await asAdmin.goto("/admin/permissions/modules");
    await asAdmin.getByRole("button", { name: "Quản lý trạng thái" }).click();
    const developmentSwitch = asAdmin.getByRole("switch", {
      name: `${moduleLabel}: Đang phát triển`,
    });
    if ((await developmentSwitch.count()) > 0) {
      await developmentSwitch.click();
      await asAdmin.getByRole("button", { name: "Lưu thay đổi" }).click();
      await expect(asAdmin.getByRole("dialog")).not.toBeVisible();
    }
  }
});
