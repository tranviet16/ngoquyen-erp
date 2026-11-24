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
 * Ensures one active department exists for task-creation specs, and makes the
 * E2E admin a member of it so a valid assignee exists (task creation requires
 * the assignee to belong to the task's department). Admin is chosen because the
 * RBAC admin short-circuit means its departmentId never alters authz outcomes.
 * Idempotent — reuses the `E2E` department across runs, reactivating it if a
 * prior spec left it inactive.
 */
export async function ensureDepartment(): Promise<{ id: number; code: string; name: string }> {
  const code = "E2E";
  const existing = await db.department.findFirst({ where: { code } });
  const dept =
    existing ??
    (await db.department.create({ data: { code, name: "Phòng E2E", isActive: true } }));
  if (existing && !existing.isActive) {
    await db.department.update({ where: { id: existing.id }, data: { isActive: true } });
  }
  await db.user.updateMany({
    where: { email: "e2e-admin@nq.local" },
    data: { departmentId: dept.id },
  });
  return { id: dept.id, code: dept.code, name: dept.name };
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

/** A DT-HĐ-TT book seeded for the HĐ-TT screen specs; every name is invented. */
export interface DtHdTtBook {
  projectId: number;
  projectCode: string;
  counterpartyId: number;
  supplierIds: number[];
  /** NCC rows of HĐ-TT, in the screen's order. */
  links: {
    /** First NCC of a settled đầu mối with two NCC: H / X / Z typeable, S blocked ("NCC đầu tiên…"). */
    first: number;
    /** Second NCC of the same đầu mối: S typeable. */
    second: number;
    /** NCC without a đầu mối: S blocked ("Gắn NCC vào đầu mối trước"). */
    loose: number;
  };
}

/**
 * Seeds one project whose HĐ-TT shows three linked NCC rows: two under a đầu mối with a manual (settled) actual,
 * and one without a đầu mối. `projectUserLevel` grants the E2E project user that level on the project.
 * Caller cleans up via `deleteDtHdTtBook`.
 */
export async function seedDtHdTtBook(prefix: string, projectUserLevel: "read" | "edit" = "read"): Promise<DtHdTtBook> {
  const stamp = `${prefix}-${Date.now()}`;
  const project = await db.project.create({ data: { code: stamp, name: `Công trình E2E ${stamp}`, status: "active" } });
  const names = ["NCC E2E An", "NCC E2E Bình", "NCC E2E Cường"].map((n) => `${n} ${stamp}`);
  const suppliers = [];
  for (const name of names) suppliers.push(await db.supplier.create({ data: { name } }));
  const counterparty = await db.projectCounterparty.create({
    data: { projectId: project.id, name: `Đầu mối E2E ${stamp}`, kind: "ncc", actualBasis: "manual", actualManualVnd: 7_000_000 },
  });
  const first = await db.projectCounterpartySupplier.create({ data: { projectId: project.id, counterpartyId: counterparty.id, supplierId: suppliers[0].id } });
  const second = await db.projectCounterpartySupplier.create({ data: { projectId: project.id, counterpartyId: counterparty.id, supplierId: suppliers[1].id } });
  const loose = await db.projectCounterpartySupplier.create({ data: { projectId: project.id, supplierId: suppliers[2].id } });
  const projectUser = await db.user.findFirst({ where: { email: "e2e-project@nq.local" }, select: { id: true } });
  if (!projectUser) throw new Error("E2E project user missing — global setup did not run");
  await db.projectPermission.create({ data: { userId: projectUser.id, projectId: project.id, level: projectUserLevel } });
  return {
    projectId: project.id,
    projectCode: project.code,
    counterpartyId: counterparty.id,
    supplierIds: suppliers.map((s) => s.id),
    links: { first: first.id, second: second.id, loose: loose.id },
  };
}

/** Clears H / S / X / Z on every NCC row of the book, so each spec starts from stored nothing. */
export async function resetDtHdTtLinks(book: DtHdTtBook): Promise<void> {
  await db.projectCounterpartySupplier.updateMany({
    where: { projectId: book.projectId },
    data: { paidOverrideVnd: null, splitActualVnd: null, recoveredVnd: null, todoNote: null, deletedAt: null },
  });
}

/** Deletes everything `seedDtHdTtBook` created (FK-safe order). */
export async function deleteDtHdTtBook(book: DtHdTtBook): Promise<void> {
  await db.projectPermission.deleteMany({ where: { projectId: book.projectId } });
  await db.projectCounterpartySupplier.deleteMany({ where: { projectId: book.projectId } });
  await db.projectCounterparty.deleteMany({ where: { projectId: book.projectId } });
  await db.project.delete({ where: { id: book.projectId } });
  await db.supplier.deleteMany({ where: { id: { in: book.supplierIds } } });
}

/** Returns the highest-id round whose note matches, for teardown of UI-created rounds. */
export async function findRoundByNote(note: string): Promise<{ id: number } | null> {
  return db.paymentRound.findFirst({
    where: { note },
    orderBy: { id: "desc" },
    select: { id: true },
  });
}
