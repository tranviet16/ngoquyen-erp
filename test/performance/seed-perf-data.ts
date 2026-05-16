/**
 * Deterministic seed for the performance suite.
 *
 * Seeds a representative data volume so N+1 regressions actually manifest:
 * one well-populated "focus" project + ~50 background projects, ledger
 * activity for one entity/party, an approved payment round with ~30 items,
 * and ~60 board tasks. Uses an UN-extended PrismaClient so `createMany` is
 * allowed (the audit `$extends` blocks bulk writes) and the seed itself is
 * not counted against any query-count assertion.
 *
 * Returns the ids the N+1 tests need. Call after `truncateAll()`.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

export interface PerfSeed {
  focusProjectId: number;
  ledgerEntityId: number;
  ledgerPartyId: number;
  paymentMonth: string;
  deptId: number;
  userId: string;
}

const url = process.env.DATABASE_URL ?? "";
const pool = new Pool({ connectionString: url });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

export async function seedPerfData(): Promise<PerfSeed> {
  const dept = await db.department.create({
    data: { code: "PERF-DEPT", name: "Perf Dept" },
  });
  const user = await db.user.create({
    data: {
      id: "perf-user",
      name: "Perf User",
      email: "perf-user@test.local",
      role: "admin",
      departmentId: dept.id,
    },
  });

  // ~50 background projects — volume so a project-scoped N+1 would show.
  await db.project.createMany({
    data: Array.from({ length: 50 }, (_, i) => ({
      code: `PERF-BG-${i}`,
      name: `Background Project ${i}`,
      status: "active",
    })),
  });

  const focus = await db.project.create({
    data: { code: "PERF-FOCUS", name: "Focus Project", status: "active" },
  });
  await db.projectSettings.create({
    data: { projectId: focus.id, contractWarningDays: 90 },
  });

  await db.projectSchedule.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      projectId: focus.id,
      categoryId: 1,
      taskName: `Schedule ${i}`,
      planStart: new Date("2026-01-01"),
      planEnd: new Date("2026-12-31"),
      status: ["pending", "in_progress", "done", "delayed"][i % 4],
    })),
  });
  await db.projectEstimate.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      projectId: focus.id,
      categoryId: 1,
      itemCode: `IT-${i}`,
      itemName: `Item ${i}`,
      unit: "cái",
      qty: 10,
      unitPrice: 1000,
      totalVnd: 10000,
    })),
  });
  await db.projectTransaction.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      projectId: focus.id,
      date: new Date("2026-03-01"),
      transactionType: "lay_hang",
      categoryId: 1,
      itemCode: `TX-${i}`,
      itemName: `Tx Item ${i}`,
      qty: 5,
      unit: "cái",
      amountTt: 5000,
    })),
  });
  await db.project3WayCashflow.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      projectId: focus.id,
      date: new Date("2026-03-01"),
      flowDirection: i % 2 === 0 ? "cdt_to_cty" : "cty_to_doi",
      category: "thanh_toan",
      payerName: "Payer",
      payeeName: "Payee",
      amountVnd: 1000,
    })),
  });
  await db.projectContract.createMany({
    data: Array.from({ length: 10 }, (_, i) => ({
      projectId: focus.id,
      docName: `Contract ${i}`,
      docType: "contract",
      status: "active",
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })),
  });

  // Ledger — one entity/party with opening balance + many transactions.
  const entity = await db.entity.create({
    data: { name: "Perf Entity", type: "company" },
  });
  const supplier = await db.supplier.create({ data: { name: "Perf Supplier" } });
  await db.ledgerOpeningBalance.create({
    data: {
      ledgerType: "material",
      entityId: entity.id,
      partyId: supplier.id,
      projectId: focus.id,
      balanceTt: 1000,
      balanceHd: 1000,
      asOfDate: new Date("2026-01-01"),
    },
  });
  await db.ledgerTransaction.createMany({
    data: Array.from({ length: 500 }, (_, i) => ({
      ledgerType: "material",
      date: new Date("2026-03-15"),
      transactionType: ["lay_hang", "thanh_toan", "dieu_chinh"][i % 3],
      entityId: entity.id,
      partyId: supplier.id,
      projectId: focus.id,
      totalTt: 100,
      totalHd: 100,
    })),
  });

  // Payment round — approved so aggregateMonth picks it up.
  const paymentMonth = "2026-04";
  const round = await db.paymentRound.create({
    data: {
      month: paymentMonth,
      sequence: 1,
      status: "approved",
      createdById: user.id,
    },
  });
  await db.paymentRoundItem.createMany({
    data: Array.from({ length: 30 }, (_, i) => ({
      roundId: round.id,
      entityId: entity.id,
      supplierId: supplier.id,
      projectId: focus.id,
      category: ["vat_tu", "nhan_cong", "dich_vu"][i % 3],
      soDeNghi: 1000,
      soDuyet: 900,
    })),
  });

  // Board tasks — top-level + children so getChildCounts has rows.
  await db.task.createMany({
    data: Array.from({ length: 60 }, (_, i) => ({
      title: `Task ${i}`,
      status: ["todo", "doing", "review", "done"][i % 4],
      priority: "trung_binh",
      deptId: dept.id,
      creatorId: user.id,
    })),
  });
  const parents = await db.task.findMany({ select: { id: true }, take: 20 });
  await db.task.createMany({
    data: parents.flatMap((p, i) => [
      {
        title: `Sub ${i}-a`,
        status: "todo",
        priority: "trung_binh",
        deptId: dept.id,
        creatorId: user.id,
        parentId: p.id,
      },
      {
        title: `Sub ${i}-b`,
        status: "done",
        priority: "trung_binh",
        deptId: dept.id,
        creatorId: user.id,
        parentId: p.id,
      },
    ]),
  });

  return {
    focusProjectId: focus.id,
    ledgerEntityId: entity.id,
    ledgerPartyId: supplier.id,
    paymentMonth,
    deptId: dept.id,
    userId: user.id,
  };
}

export async function closePerfSeed(): Promise<void> {
  await db.$disconnect();
  await pool.end();
}
