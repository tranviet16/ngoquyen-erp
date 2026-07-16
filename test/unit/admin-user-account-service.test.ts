import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireActiveAdmin: vi.fn(),
  signUpEmail: vi.fn(),
  roleFind: vi.fn(),
  departmentFind: vi.fn(),
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userDelete: vi.fn(),
  sessionCount: vi.fn(),
}));

vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: mocks.requireActiveAdmin,
}));
vi.mock("@/lib/auth", () => ({
  userProvisioningAuth: { api: { signUpEmail: mocks.signUpEmail } },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    role: { findUnique: mocks.roleFind },
    department: { findUnique: mocks.departmentFind },
    user: {
      findFirst: mocks.userFindFirst,
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
      delete: mocks.userDelete,
    },
    session: { count: mocks.sessionCount },
  },
}));

import { createUserAccount } from "@/lib/admin/user-account-service";

const validInput = {
  name: "Nguyễn Văn Test",
  username: "Test.User",
  email: "TEST@EXAMPLE.COM",
  password: "safe-password-12",
  role: "viewer",
  departmentId: 7,
};

describe("createUserAccount validation and preflight", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireActiveAdmin.mockResolvedValue("admin-1");
    mocks.roleFind.mockResolvedValue({ id: "viewer" });
    mocks.departmentFind.mockResolvedValue({ id: 7, isActive: true });
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "created-user-42" },
      token: null,
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "created-user-42",
      email: "test@example.com",
    });
    mocks.sessionCount.mockResolvedValue(0);
    mocks.userUpdate.mockResolvedValue({ id: "created-user-42" });
    mocks.userDelete.mockResolvedValue({ id: "created-user-42" });
  });

  it("validates only after the active-admin guard", async () => {
    mocks.requireActiveAdmin.mockRejectedValue(new Error("Chỉ admin được thao tác"));

    await expect(createUserAccount(validInput)).rejects.toThrow("Chỉ admin được thao tác");
    expect(mocks.roleFind).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 12 before preflight", async () => {
    await expect(createUserAccount({ ...validInput, password: "too-short" })).rejects.toThrow(
      "Mật khẩu phải có ít nhất 12 ký tự",
    );
    expect(mocks.roleFind).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it.each([
    ["missing role", () => mocks.roleFind.mockResolvedValue(null), "Vai trò không tồn tại"],
    [
      "inactive department",
      () => mocks.departmentFind.mockResolvedValue({ id: 7, isActive: false }),
      "Phòng ban không tồn tại hoặc đã ngừng hoạt động",
    ],
    [
      "duplicate email",
      () =>
        mocks.userFindFirst.mockResolvedValue({
          email: "test@example.com",
          username: null,
        }),
      "Email đã được sử dụng",
    ],
    [
      "duplicate username",
      () =>
        mocks.userFindFirst.mockResolvedValue({
          email: null,
          username: "test.user",
        }),
      "Tên đăng nhập đã được sử dụng",
    ],
  ])("rejects %s before provisioning", async (_name, arrange, message) => {
    arrange();

    await expect(createUserAccount(validInput)).rejects.toThrow(message);
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("provisions an Account without token or Session and applies attributes", async () => {
    await expect(createUserAccount(validInput)).resolves.toEqual({
      id: "created-user-42",
      email: "test@example.com",
      username: "test.user",
    });
    expect(mocks.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: "Nguyễn Văn Test",
        username: "test.user",
        email: "test@example.com",
        password: "safe-password-12",
      },
    });
    expect(mocks.sessionCount).toHaveBeenCalledWith({
      where: { userId: "created-user-42" },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "created-user-42" },
      data: {
        role: "viewer",
        departmentId: 7,
        isActive: true,
        isLeader: false,
        isDirector: false,
      },
    });
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("compensates an attribute-update failure by exact created user ID", async () => {
    mocks.userUpdate.mockRejectedValue(new Error("update failed"));

    await expect(createUserAccount(validInput)).rejects.toThrow("Không thể tạo tài khoản");
    expect(mocks.userDelete).toHaveBeenCalledTimes(1);
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: "created-user-42" },
    });
  });

  it("does not compensate a provisioning duplicate race without a created ID", async () => {
    mocks.signUpEmail.mockRejectedValue(new Error("duplicate"));

    await expect(createUserAccount(validInput)).rejects.toThrow("Không thể tạo tài khoản");
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("does not delete an existing user for a synthetic duplicate response", async () => {
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "synthetic-user-id" },
      token: null,
    });
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(createUserAccount(validInput)).rejects.toThrow("Không thể tạo tài khoản");
    expect(mocks.userDelete).not.toHaveBeenCalled();
  });

  it("reconciles an exact newly-created ID when post-create lookup fails", async () => {
    mocks.userFindUnique.mockRejectedValueOnce(new Error("temporary lookup failure")).mockResolvedValueOnce({
      id: "created-user-42",
      email: "test@example.com",
    });

    await expect(createUserAccount(validInput)).rejects.toThrow("Không thể tạo tài khoản");
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: "created-user-42" },
    });
  });

  it("rejects and compensates if provisioning creates a token or Session", async () => {
    mocks.signUpEmail.mockResolvedValue({
      user: { id: "created-user-42" },
      token: "unexpected-token",
    });

    await expect(createUserAccount(validInput)).rejects.toThrow("Provisioning đã tạo phiên đăng nhập ngoài dự kiến");
    expect(mocks.userDelete).toHaveBeenCalledWith({
      where: { id: "created-user-42" },
    });
  });
});
