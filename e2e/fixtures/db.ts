import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * E2E DB access uses an UN-extended PrismaClient so the audit `$extends`
 * extension (lib/prisma.ts) does not fire during fixture setup/teardown.
 * Guarded to a *_test database — never the dev DB.
 */
const url = process.env.DATABASE_URL ?? "";
if (!/_test(\?|$)/.test(url)) {
  throw new Error(`e2e/fixtures/db refuses to run against non-test DB: ${url || "(unset)"}`);
}

const pool = new Pool({ connectionString: url });
export const db = new PrismaClient({ adapter: new PrismaPg(pool) });

export async function closeDb(): Promise<void> {
  await db.$disconnect();
  await pool.end();
}

/** Deletes tasks created during a spec, identified by a unique title prefix. */
export async function cleanupTasksByPrefix(prefix: string): Promise<void> {
  await db.task.deleteMany({ where: { title: { startsWith: prefix } } });
}

/**
 * Ensures one active department exists for task-creation specs. Idempotent —
 * reuses the `E2E` department across runs, reactivating it if a prior spec
 * left it inactive.
 */
export async function ensureDepartment(): Promise<{ id: number; code: string; name: string }> {
  const code = "E2E";
  const existing = await db.department.findFirst({ where: { code } });
  if (existing) {
    if (!existing.isActive) {
      await db.department.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return { id: existing.id, code: existing.code, name: existing.name };
  }
  const created = await db.department.create({
    data: { code, name: "Phòng E2E", isActive: true },
  });
  return { id: created.id, code: created.code, name: created.name };
}

/**
 * Seeds a fresh sl-dt lot with a unique code so the báo cáo SL/DT report
 * renders an editable row. Returns the lot id; caller cleans up via `deleteLot`.
 */
export async function seedLot(codePrefix: string): Promise<{ id: number; code: string; lotName: string }> {
  const code = `${codePrefix}-${Date.now()}`;
  const lot = await db.slDtLot.create({
    data: {
      code,
      lotName: `Lô E2E ${code}`,
      phaseCode: "E2E",
      groupCode: "E2E",
      sortOrder: 1,
      estimateValue: 100,
    },
  });
  return { id: lot.id, code: lot.code, lotName: lot.lotName };
}

export async function deleteLot(lotId: number): Promise<void> {
  await db.slDtMonthlyInput.deleteMany({ where: { lotId } });
  await db.slDtLot.delete({ where: { id: lotId } });
}

/**
 * Ensures one active entity, supplier, and project exist so the payment-round
 * NewItemRow dropdowns (Chủ thể / NCC / Công trình) have a selectable option.
 * Idempotent — reuses the `E2E` fixtures across runs. Left in place after the
 * spec since they carry no per-run state.
 */
export async function ensurePaymentRefData(): Promise<void> {
  const entity = await db.entity.findFirst({ where: { name: "Chủ thể E2E", deletedAt: null } });
  if (!entity) {
    await db.entity.create({ data: { name: "Chủ thể E2E", type: "company" } });
  }
  const supplier = await db.supplier.findFirst({ where: { name: "NCC E2E", deletedAt: null } });
  if (!supplier) {
    await db.supplier.create({ data: { name: "NCC E2E" } });
  }
  const project = await db.project.findFirst({ where: { code: "E2E-PRJ", deletedAt: null } });
  if (!project) {
    await db.project.create({ data: { code: "E2E-PRJ", name: "Công trình E2E" } });
  }
}

/** Deletes a payment round and its items (FK-safe order). */
export async function deleteRound(roundId: number): Promise<void> {
  await db.paymentRoundItem.deleteMany({ where: { roundId } });
  await db.paymentRound.delete({ where: { id: roundId } });
}

/** Returns the highest-id round whose note matches, for teardown of UI-created rounds. */
export async function findRoundByNote(note: string): Promise<{ id: number } | null> {
  return db.paymentRound.findFirst({
    where: { note },
    orderBy: { id: "desc" },
    select: { id: true },
  });
}
