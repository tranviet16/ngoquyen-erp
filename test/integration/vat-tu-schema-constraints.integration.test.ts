/**
 * Integration test: ràng buộc DB của phạm vi cặp NCC × công trình
 * (migration 20261106090000_vat_tu_pair_scope_and_import_review).
 *  - Sổ vật tư, số dư vật tư, phiếu ngày, kỳ đối chiếu thiếu công trình bị DB từ chối.
 *  - Sổ nhân công thiếu công trình vẫn ghi được.
 *  - Unique một phần theo cặp: hai công trình cùng biên được phép, trùng biên trong cặp thì không.
 *  - Pre-check đầu migration dừng với thông báo rõ khi còn kỳ đối chiếu cũ.
 * Ghi thô bằng $executeRaw để chạm thẳng ràng buộc DB (không qua zod/service).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";

const MIGRATION_SQL = join(
  process.cwd(),
  "prisma/migrations/20261106090000_vat_tu_pair_scope_and_import_review/migration.sql",
);

/** Gom message + meta + cause của lỗi Prisma/driver để so mã SQLSTATE hoặc tên ràng buộc. */
function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) parts.push(current.message);
    const meta = (current as { meta?: unknown }).meta;
    if (meta) parts.push(JSON.stringify(meta));
    current = (current as { cause?: unknown }).cause;
  }
  return parts.join(" | ");
}

async function expectDbRejects(promise: Promise<unknown>, markers: string[]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "DB phải từ chối thao tác").not.toBeNull();
  const text = describeError(error);
  expect(markers.some((m) => text.includes(m)), `lỗi không khớp ${markers.join("/")}: ${text}`).toBe(true);
}

async function seed() {
  const entity = await prisma.entity.create({ data: { name: "Cty Ràng buộc", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "NCC Ràng buộc" } });
  const contractor = await prisma.contractor.create({ data: { name: "Đội Ràng buộc" } });
  const projectX = await prisma.project.create({
    data: { code: "RB-X", name: "Công trình X", status: "active", entityId: entity.id },
  });
  const projectY = await prisma.project.create({
    data: { code: "RB-Y", name: "Công trình Y", status: "active", entityId: entity.id },
  });
  const item = await prisma.item.create({ data: { code: "RB-VT", name: "Vật tư RB", unit: "m3", type: "material" } });
  return { entity, supplier, contractor, projectX, projectY, item };
}

describe("ràng buộc DB phạm vi cặp vật tư (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("dòng sổ vật tư thiếu công trình bị CHECK từ chối; sổ nhân công vẫn được", async () => {
    const { entity, supplier, contractor } = await seed();
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO ledger_transactions ("ledgerType", date, "transactionType", "entityId", "partyId", "projectId", "updatedAt")
        VALUES ('material', '2026-11-01', 'thanh_toan', ${entity.id}, ${supplier.id}, NULL, NOW())
      `,
      ["ledger_material_project_required", "23514"],
    );
    await expect(
      prisma.$executeRaw`
        INSERT INTO ledger_transactions ("ledgerType", date, "transactionType", "entityId", "partyId", "projectId", "updatedAt")
        VALUES ('labor', '2026-11-01', 'thanh_toan', ${entity.id}, ${contractor.id}, NULL, NOW())
      `,
    ).resolves.toBe(1);
  });

  it("số dư ban đầu vật tư thiếu công trình bị CHECK từ chối", async () => {
    const { entity, supplier, contractor } = await seed();
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO ledger_opening_balances ("ledgerType", "entityId", "partyId", "projectId", "balanceTt", "balanceHd", "asOfDate", "updatedAt")
        VALUES ('material', ${entity.id}, ${supplier.id}, NULL, 100, 0, '2025-12-31', NOW())
      `,
      ["ledger_opening_material_project_required", "23514"],
    );
    await expect(
      prisma.$executeRaw`
        INSERT INTO ledger_opening_balances ("ledgerType", "entityId", "partyId", "projectId", "balanceTt", "balanceHd", "asOfDate", "updatedAt")
        VALUES ('labor', ${entity.id}, ${contractor.id}, NULL, 100, 0, '2025-12-31', NOW())
      `,
    ).resolves.toBe(1);
  });

  it("phiếu ngày thiếu công trình bị CHECK từ chối", async () => {
    const { supplier, item } = await seed();
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO supplier_delivery_daily ("supplierId", "projectId", date, "itemId", qty, unit)
        VALUES (${supplier.id}, NULL, '2026-11-01', ${item.id}, 1, 'm3')
      `,
      ["supplier_delivery_project_required", "23514"],
    );
  });

  it("kỳ đối chiếu thiếu công trình bị NOT NULL từ chối", async () => {
    const { supplier } = await seed();
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO supplier_reconciliations ("supplierId", "projectId", "periodFrom", "periodTo")
        VALUES (${supplier.id}, NULL, '2026-09-27', '2026-10-26')
      `,
      ["23502", "projectId"],
    );
  });

  it("unique theo cặp: cùng biên ở hai công trình được, trùng biên trong một cặp thì không (trừ kỳ đã xoá mềm)", async () => {
    const { supplier, projectX, projectY } = await seed();
    const period = { periodFrom: new Date("2026-09-27"), periodTo: new Date("2026-10-26") };
    const x = await prisma.supplierReconciliation.create({ data: { supplierId: supplier.id, projectId: projectX.id, ...period } });
    await prisma.supplierReconciliation.create({ data: { supplierId: supplier.id, projectId: projectY.id, ...period } });
    await expectDbRejects(
      prisma.$executeRaw`
        INSERT INTO supplier_reconciliations ("supplierId", "projectId", "periodFrom", "periodTo")
        VALUES (${supplier.id}, ${projectX.id}, '2026-09-27', '2026-10-26')
      `,
      ["supplier_recon_pair_period_unique", "23505"],
    );
    // Kỳ đã xoá mềm không giữ chỗ trong unique một phần.
    await prisma.supplierReconciliation.update({ where: { id: x.id }, data: { deletedAt: new Date() } });
    await expect(
      prisma.supplierReconciliation.create({ data: { supplierId: supplier.id, projectId: projectX.id, ...period } }),
    ).resolves.toMatchObject({ projectId: projectX.id });
  });

  it("pre-check của migration dừng với thông báo rõ khi còn kỳ đối chiếu", async () => {
    // DB test đã ở schema mới, nên chạy lại đúng khối pre-check (khối DO đầu tiên của migration.sql):
    // không có kỳ nào → qua; có kỳ → RAISE với hướng dẫn chạy script dọn.
    const sql = readFileSync(MIGRATION_SQL, "utf8");
    const precheck = /DO \$\$[\s\S]*?END \$\$;/.exec(sql)?.[0];
    expect(precheck, "migration.sql phải mở đầu bằng khối DO pre-check").toBeTruthy();
    expect(precheck).toContain('"supplier_reconciliations"');

    await expect(prisma.$executeRawUnsafe(precheck!)).resolves.toBeDefined();

    const { supplier, projectX } = await seed();
    await prisma.supplierReconciliation.create({
      data: {
        supplierId: supplier.id,
        projectId: projectX.id,
        periodFrom: new Date("2026-09-27"),
        periodTo: new Date("2026-10-26"),
      },
    });
    await expectDbRejects(prisma.$executeRawUnsafe(precheck!), ["Còn kỳ đối chiếu cũ", "vat-tu-cutover-cleanup.sql"]);
  });
});
