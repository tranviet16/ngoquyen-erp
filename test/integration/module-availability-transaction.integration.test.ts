import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/acl", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  assertModuleReleased: vi.fn().mockResolvedValue(undefined),
}));

import { updateModuleAvailability } from "@/app/(app)/admin/permissions/modules/availability-actions";
import { prisma } from "@/lib/prisma";
import { closeTestDb, truncateAll } from "@/test/helpers/test-db";

describe("module availability transaction atomicity", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_reject_module_audit ON "audit_logs"');
    await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS test_reject_module_audit()");
    await closeTestDb();
  });

  it("rolls back availability when the audit insert fails", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_reject_module_audit()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."tableName" = 'module_availability' THEN
          RAISE EXCEPTION 'injected audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_reject_module_audit
      BEFORE INSERT ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION test_reject_module_audit()
    `);

    await expect(
      updateModuleAvailability([
        { moduleKey: "du-an", previousStatus: "ready", status: "development" },
      ]),
    ).rejects.toThrow(/injected audit failure/i);

    await expect(
      prisma.moduleAvailability.findUniqueOrThrow({ where: { moduleKey: "du-an" } }),
    ).resolves.toMatchObject({ status: "ready" });
  });
});
