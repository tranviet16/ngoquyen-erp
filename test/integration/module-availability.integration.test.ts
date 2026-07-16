import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { MODULE_KEYS } from "@/lib/acl/modules";
import { closeTestDb, truncateAll } from "@/test/helpers/test-db";

describe("module availability persistence", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("keeps a ready row for every catalog module after test isolation", async () => {
    const rows = await prisma.moduleAvailability.findMany({
      orderBy: { moduleKey: "asc" },
    });
    expect(rows).toHaveLength(MODULE_KEYS.length);
    expect(rows.every((row) => row.status === "ready")).toBe(true);
    expect(rows.map((row) => row.moduleKey).sort()).toEqual([...MODULE_KEYS].sort());
  });

  it.each(["dashboard", "admin.permissions"])(
    "enforces ready as a database invariant for %s",
    async (moduleKey) => {
      await expect(
        prisma.moduleAvailability.update({
          where: { moduleKey },
          data: { status: "development" },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.moduleAvailability.findUniqueOrThrow({ where: { moduleKey } }),
      ).resolves.toMatchObject({ status: "ready" });
      await expect(
        prisma.moduleAvailability.delete({ where: { moduleKey } }),
      ).rejects.toThrow();
      await expect(
        prisma.moduleAvailability.findUniqueOrThrow({ where: { moduleKey } }),
      ).resolves.toMatchObject({ status: "ready" });
    },
  );

  it("allows a non-core module to move between valid rollout states", async () => {
    await expect(
      prisma.moduleAvailability.update({
        where: { moduleKey: "du-an" },
        data: { status: "development" },
      }),
    ).resolves.toMatchObject({ status: "development" });
  });
});
