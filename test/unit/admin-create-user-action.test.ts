import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserAccount: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/user-account-service", () => ({
  createUserAccount: mocks.createUserAccount,
}));
vi.mock("@/lib/admin/user-grants-service", () => ({
  setGrant: vi.fn(),
  removeGrant: vi.fn(),
  updateUserAttributes: vi.fn(),
}));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue(undefined),
}));

import { createUserAccountAction } from "@/app/(app)/admin/nguoi-dung/actions";

const input = {
  name: "Nguyễn Văn Test",
  username: "test.user",
  email: "test@example.com",
  password: "safe-password-12",
  role: "viewer",
  departmentId: null,
};

describe("createUserAccountAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns the service result and revalidates only after success", async () => {
    const created = {
      id: "created-user-42",
      email: "test@example.com",
      username: "test.user",
    };
    mocks.createUserAccount.mockResolvedValue(created);

    await expect(createUserAccountAction(input)).resolves.toEqual(created);
    expect(mocks.createUserAccount).toHaveBeenCalledWith(input);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/nguoi-dung");
    expect(mocks.createUserAccount.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.revalidatePath.mock.invocationCallOrder[0],
    );
  });

  it("does not revalidate when the service rejects", async () => {
    mocks.createUserAccount.mockRejectedValue(
      new Error("Email đã được sử dụng"),
    );

    await expect(createUserAccountAction(input)).rejects.toThrow(
      "Email đã được sử dụng",
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
