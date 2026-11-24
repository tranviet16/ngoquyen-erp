/**
 * Hoàn tác phần sổ "Đối chiếu DT-HĐ-TT" của một run import (dự án xây dựng).
 *
 * Run của sổ này ghi 7 bảng riêng (mã nhóm, ánh xạ, đầu mối, NCC của đầu mối, hóa đơn, thực tế nhập,
 * chi thực tế), sinh giao dịch HĐ cho các tab cũ (`project_transactions.sourceInvoiceLineId`), và
 * THAY (xóa mềm + `supersededByRunId`) dòng dự toán / giao dịch cũ của công trình. Hoàn tác:
 *   - khôi phục đúng tập dòng đã thay — chỉ khi tập id và tổng tiền khớp tập đã lưu lúc commit
 *     (`reviewJson.expected.superseded`), và chưa có run "bảng cân đối" / "dự án xây dựng" mới hơn
 *     ghi lại giao dịch / dự toán cho cùng công trình (nếu không, khôi phục sẽ nhân đôi);
 *   - xóa 7 bảng (con trước cha).
 * Guard (bất biến "guard hoàn tác = guard import lại"): từ chối khi
 *   - dòng của run bị thay bởi một run khác còn hiệu lực (run "bảng cân đối" cũ — hoàn tác nó sẽ xóa
 *     cứng dự toán mà báo cáo đang dùng);
 *   - dòng của run trong 7 bảng (hoặc giao dịch sinh từ hóa đơn) đã sửa / xóa sau commit;
 *   - công trình đã có dòng sổ không thuộc run (nhập tay, run khác).
 * Caller giữ khóa dòng run và gọi `lockProjectDtHdTt` cho `duAnBookProjects` trước khi kiểm.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ImportTx } from "./adapters/adapter-types";
import { RollbackBlockedError } from "./import-errors";

type RawClient = Pick<ImportTx, "$queryRaw" | "$executeRaw">;

/** 7 bảng sổ, theo thứ tự xóa (con trước cha). */
export const DU_AN_BOOK_TABLES = [
  "project_item_aliases",
  "project_group_codes",
  "project_counterparty_suppliers",
  "project_actual_receipts",
  "project_cash_payments",
  "project_invoice_lines",
  "project_counterparties",
] as const;

/** Tập dòng bị thay khi commit: id tăng dần + tổng tiền (chuỗi thập phân). */
export interface SupersededSet {
  ids: number[];
  sum: string;
}
export interface SupersededExpectation {
  transactions?: SupersededSet;
  estimates?: SupersededSet;
}

/** Đọc `reviewJson.expected.superseded` do adapter lưu lúc commit. */
export function readSupersededExpectation(reviewJson: unknown): SupersededExpectation {
  const expected = (reviewJson as { expected?: { superseded?: SupersededExpectation } } | null)?.expected;
  return expected?.superseded ?? {};
}

const unionTables = (where: (table: string) => Prisma.Sql) =>
  Prisma.join(
    DU_AN_BOOK_TABLES.map((t) => Prisma.sql`SELECT "projectId" FROM ${Prisma.raw(`"${t}"`)} WHERE ${where(t)}`),
    " UNION ",
  );

/** Công trình mà run đã ghi sổ, đã thay dòng, hoặc có dòng dự toán / giao dịch đang bị thay. */
export async function duAnBookProjects(tx: RawClient, runId: number): Promise<number[]> {
  const rows = await tx.$queryRaw<{ projectId: number }[]>`
    ${unionTables(() => Prisma.sql`"importRunId" = ${runId}`)}
    UNION SELECT "projectId" FROM project_transactions
     WHERE "supersededByRunId" = ${runId} OR ("importRunId" = ${runId} AND "supersededByRunId" IS NOT NULL)
    UNION SELECT "projectId" FROM project_estimates
     WHERE "supersededByRunId" = ${runId} OR ("importRunId" = ${runId} AND "supersededByRunId" IS NOT NULL)`;
  return rows.map((r) => Number(r.projectId)).sort((a, b) => a - b);
}

interface Hit {
  kind: "superseded_by_other" | "run_rows_edited" | "foreign_rows";
  tbl: string;
  n: number;
}

const TABLE_LABEL: Record<string, string> = {
  project_item_aliases: "ánh xạ",
  project_group_codes: "mã nhóm",
  project_counterparty_suppliers: "NCC của đầu mối",
  project_actual_receipts: "thực tế nhập",
  project_cash_payments: "chi thực tế",
  project_invoice_lines: "hóa đơn",
  project_counterparties: "đầu mối",
  project_transactions: "giao dịch",
  project_estimates: "dự toán",
};

function describe(hit: Hit): string {
  const what = `${hit.n} dòng ${TABLE_LABEL[hit.tbl] ?? hit.tbl}`;
  switch (hit.kind) {
    case "superseded_by_other":
      return `Có ${what} của run đang bị một run "Đối chiếu DT-HĐ-TT" thay thế — hoàn tác run đó trước.`;
    case "run_rows_edited":
      return `Có ${what} của run đã sửa hoặc xóa sau khi commit — sửa tiếp trên màn hình thay vì hoàn tác.`;
    case "foreign_rows":
      return `Công trình đã có ${what} không thuộc run (nhập tay hoặc run khác).`;
  }
}

export async function assertDuAnBookRollbackAllowed(
  tx: RawClient,
  run: { id: number; committedAt: Date | null; createdAt: Date },
  projectIds: number[],
): Promise<void> {
  const since = run.committedAt ?? run.createdAt;
  const id = run.id;
  const parts: Prisma.Sql[] = [
    Prisma.sql`SELECT 'superseded_by_other'::text AS kind, 'project_transactions'::text AS tbl, COUNT(*)::int AS n
                 FROM project_transactions WHERE "importRunId" = ${id} AND "supersededByRunId" IS NOT NULL`,
    Prisma.sql`SELECT 'superseded_by_other', 'project_estimates', COUNT(*)::int
                 FROM project_estimates WHERE "importRunId" = ${id} AND "supersededByRunId" IS NOT NULL`,
  ];
  for (const t of DU_AN_BOOK_TABLES) {
    const table = Prisma.raw(`"${t}"`);
    parts.push(Prisma.sql`SELECT 'run_rows_edited', ${t}::text, COUNT(*)::int FROM ${table}
      WHERE "importRunId" = ${id} AND ("updatedAt" > ${since} OR "deletedAt" > ${since})`);
    if (projectIds.length > 0) {
      parts.push(Prisma.sql`SELECT 'foreign_rows', ${t}::text, COUNT(*)::int FROM ${table}
        WHERE "projectId" = ANY(${projectIds}::int[]) AND "deletedAt" IS NULL AND "importRunId" IS DISTINCT FROM ${id}`);
    }
  }
  parts.push(Prisma.sql`SELECT 'run_rows_edited', 'project_transactions', COUNT(*)::int FROM project_transactions
    WHERE "importRunId" = ${id} AND "sourceInvoiceLineId" IS NOT NULL AND "deletedAt" > ${since}`);
  if (projectIds.length > 0) {
    parts.push(Prisma.sql`SELECT 'foreign_rows', 'project_transactions', COUNT(*)::int FROM project_transactions
      WHERE "projectId" = ANY(${projectIds}::int[]) AND "sourceInvoiceLineId" IS NOT NULL
        AND "deletedAt" IS NULL AND "importRunId" IS DISTINCT FROM ${id}`);
  }
  const rows = await tx.$queryRaw<Hit[]>`${Prisma.join(parts, " UNION ALL ")}`;
  const hits = rows.map((r) => ({ ...r, n: Number(r.n) })).filter((r) => r.n > 0);
  if (hits.length > 0) throw new RollbackBlockedError(id, hits.map(describe));
}

/** Tập dòng hiện đang bị run thay ở một bảng (id tăng dần + tổng tiền). */
async function currentSuperseded(
  tx: RawClient,
  table: "project_transactions" | "project_estimates",
  runId: number,
): Promise<SupersededSet> {
  const amount = Prisma.raw(table === "project_transactions" ? `"amountHd"` : `"totalVnd"`);
  const rows = await tx.$queryRaw<{ id: number; amount: Prisma.Decimal }[]>`
    SELECT id, ${amount} AS amount FROM ${Prisma.raw(`"${table}"`)} WHERE "supersededByRunId" = ${runId} ORDER BY id`;
  const sum = rows.reduce((acc, r) => acc.add(new Prisma.Decimal(r.amount)), new Prisma.Decimal(0));
  return { ids: rows.map((r) => Number(r.id)), sum: sum.toFixed(2) };
}

function sameSet(a: SupersededSet, b: SupersededSet | undefined): boolean {
  const expected = b ?? { ids: [], sum: "0" };
  const ids = [...expected.ids].sort((x, y) => x - y);
  return (
    a.ids.length === ids.length &&
    a.ids.every((v, i) => v === ids[i]) &&
    new Prisma.Decimal(a.sum).equals(new Prisma.Decimal(expected.sum))
  );
}

/**
 * Khôi phục dòng đã thay rồi xóa 7 bảng của run. Phải chạy SAU khi xóa giao dịch / dự toán mang
 * `importRunId` của run (giao dịch sinh từ hóa đơn trỏ khóa ngoại tới dòng hóa đơn).
 */
export async function deleteDuAnBookRows(
  tx: RawClient,
  run: { id: number; committedAt: Date | null; createdAt: Date; reviewJson: unknown },
  projectIds: number[],
) {
  const id = run.id;
  const since = run.committedAt ?? run.createdAt;
  const expected = readSupersededExpectation(run.reviewJson);
  const ptx = await currentSuperseded(tx, "project_transactions", id);
  const est = await currentSuperseded(tx, "project_estimates", id);
  const reasons: string[] = [];
  if (!sameSet(ptx, expected.transactions)) {
    reasons.push(`Tập giao dịch cũ đang bị thay (${ptx.ids.length} dòng, ${ptx.sum}) khác tập lúc commit — có dòng đã bị sửa.`);
  }
  if (!sameSet(est, expected.estimates)) {
    reasons.push(`Tập dự toán cũ đang bị thay (${est.ids.length} dòng, ${est.sum}) khác tập lúc commit — có dòng đã bị sửa.`);
  }
  if ((ptx.ids.length > 0 || est.ids.length > 0) && projectIds.length > 0) {
    const [newer] = await tx.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT t.id FROM project_transactions t JOIN import_runs r ON r.id = t."importRunId"
         WHERE t."projectId" = ANY(${projectIds}::int[]) AND t."deletedAt" IS NULL
           AND r.adapter IN ('bang-can-doi-vat-tu', 'du-an-xay-dung') AND r.status = 'committed' AND r."committedAt" > ${since}
        UNION ALL
        SELECT e.id FROM project_estimates e JOIN import_runs r ON r.id = e."importRunId"
         WHERE e."projectId" = ANY(${projectIds}::int[]) AND e."deletedAt" IS NULL
           AND r.adapter IN ('bang-can-doi-vat-tu', 'du-an-xay-dung') AND r.status = 'committed' AND r."committedAt" > ${since}
      ) x`;
    if (Number(newer?.n ?? 0) > 0) {
      reasons.push(`Công trình đã có ${newer.n} dòng dự toán / giao dịch từ một lần import cũ hơn ghi sau run này — khôi phục sẽ nhân đôi.`);
    }
  }
  if (reasons.length > 0) throw new RollbackBlockedError(id, reasons);

  const restoredTransactions = await tx.$executeRaw`
    UPDATE project_transactions SET "deletedAt" = NULL, "supersededByRunId" = NULL WHERE "supersededByRunId" = ${id}`;
  const restoredEstimates = await tx.$executeRaw`
    UPDATE project_estimates SET "deletedAt" = NULL, "supersededByRunId" = NULL WHERE "supersededByRunId" = ${id}`;
  const deleted: Record<string, number> = {};
  for (const t of DU_AN_BOOK_TABLES) {
    deleted[t] = await tx.$executeRaw`DELETE FROM ${Prisma.raw(`"${t}"`)} WHERE "importRunId" = ${id}`;
  }
  return { restoredTransactions, restoredEstimates, deleted };
}

/** Số dòng 7 bảng mang `importRunId` của run (trang thông tin hoàn tác). */
export async function countDuAnBookRows(id: number) {
  const [gc, al, cp, cps, inv, rc, pay] = await Promise.all([
    prisma.projectGroupCode.count({ where: { importRunId: id } }),
    prisma.projectItemAlias.count({ where: { importRunId: id } }),
    prisma.projectCounterparty.count({ where: { importRunId: id } }),
    prisma.projectCounterpartySupplier.count({ where: { importRunId: id } }),
    prisma.projectInvoiceLine.count({ where: { importRunId: id } }),
    prisma.projectActualReceipt.count({ where: { importRunId: id } }),
    prisma.projectCashPayment.count({ where: { importRunId: id } }),
  ]);
  return {
    projectGroupCodes: gc,
    projectItemAliases: al,
    projectCounterparties: cp,
    projectCounterpartySuppliers: cps,
    projectInvoiceLines: inv,
    projectActualReceipts: rc,
    projectCashPayments: pay,
    total: gc + al + cp + cps + inv + rc + pay,
  };
}
