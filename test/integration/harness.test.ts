/**
 * Smoke test for the integration harness itself: verifies `truncateAll()`
 * gives a clean slate and that writes through the REAL extended `@/lib/prisma`
 * client genuinely fire the audit `$extends` extension.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { makeProject } from "@/test/helpers/fixtures";

describe("integration harness", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("truncateAll empties the DB between tests", async () => {
    expect(await prisma.project.count()).toBe(0);
    await prisma.project.create({ data: makeProject() });
    expect(await prisma.project.count()).toBe(1);
  });

  it("starts clean again (proves prior test was truncated)", async () => {
    expect(await prisma.project.count()).toBe(0);
  });

  it("a write through @/lib/prisma produces an audit row", async () => {
    const project = await prisma.project.create({ data: makeProject() });

    // The audit $extends stores the PascalCase model name + lowercase action.
    const auditRow = await prisma.auditLog.findFirst({
      where: {
        tableName: "Project",
        recordId: String(project.id),
        action: "create",
      },
    });
    expect(auditRow).not.toBeNull();
  });
});
