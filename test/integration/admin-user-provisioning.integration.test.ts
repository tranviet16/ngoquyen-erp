import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { auth, userProvisioningAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { closeTestDb, truncateAll } from "@/test/helpers/test-db";

const input = {
  name: "Provisioning Test",
  username: "provisioning.test",
  email: "provisioning.test@example.com",
  password: "safe-password-12",
};

describe("admin user provisioning auth contract", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("keeps primary email signup disabled outside E2E", async () => {
    expect(process.env.E2E).not.toBe("true");
    await expect(auth.api.signUpEmail({ body: input })).rejects.toMatchObject({
      body: { code: "EMAIL_PASSWORD_SIGN_UP_DISABLED" },
    });
    expect(await prisma.user.count()).toBe(0);
  });

  it("creates a credential Account without a Session or token", async () => {
    const result = await userProvisioningAuth.api.signUpEmail({ body: input });

    expect(result.token).toBeNull();
    expect(await prisma.user.count({ where: { id: result.user.id } })).toBe(1);
    expect(
      await prisma.account.count({
        where: { userId: result.user.id, providerId: "credential" },
      }),
    ).toBe(1);
    expect(
      await prisma.session.count({ where: { userId: result.user.id } }),
    ).toBe(0);
  });

  it("returns a synthetic duplicate response without creating another row", async () => {
    const first = await userProvisioningAuth.api.signUpEmail({ body: input });
    const duplicate = await userProvisioningAuth.api.signUpEmail({
      body: { ...input, username: "provisioning.duplicate" },
    });

    expect(duplicate.token).toBeNull();
    expect(duplicate.user.id).not.toBe(first.user.id);
    expect(await prisma.user.count({ where: { email: input.email } })).toBe(1);
    expect(await prisma.user.count({ where: { id: duplicate.user.id } })).toBe(
      0,
    );
  });
});
