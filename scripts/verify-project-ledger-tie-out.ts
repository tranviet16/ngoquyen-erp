/**
 * Tie-out (CHỈ ĐỌC): tab Công Nợ NCC và Giao Dịch (nguồn "Sổ công nợ vật tư") của Dự án khớp báo cáo công nợ
 * lũy kế đến từng đồng, với mọi công trình có sổ vật tư.
 *
 * Với mỗi công trình (có dòng sổ, số dư đầu kỳ hoặc phiếu vật tư ngày):
 *   - công nợ từng NCC (`buildSupplierBalances` trên báo cáo lọc đúng công trình) so với Σ dòng báo cáo lũy kế
 *     toàn bộ (gọi riêng, không lọc) của cặp NCC × công trình — như `/cong-no-vt/chi-tiet` "Toàn bộ";
 *   - Σ (số dư đầu kỳ + dòng sổ của lưới), cộng theo Chủ thể rồi làm tròn như báo cáo, so với từng NCC;
 *   - tổng công trình so với Σ dòng báo cáo của công trình.
 * In mã công trình, số NCC, số dòng sổ, số dư đầu kỳ, phiếu chưa chốt, số dòng sổ dự án — không in tên hay số
 * tiền (repo công khai). Có lệch thì in cột lệch và thoát mã 1.
 *
 *   npx tsx scripts/verify-project-ledger-tie-out.ts
 */
import { prisma } from "../lib/prisma";
import { queryDetailReport } from "../lib/cong-no-vt/balance-report-service";
import { sumByEntityRounded, sumReportRows, type PairTotals } from "../lib/du-an/contract-detail/list-figures";
import {
  loadPendingDeliveriesByProject,
  loadProjectLedgerOpenings,
  loadProjectLedgerRows,
} from "../lib/du-an/project-ledger/project-ledger-source";
import { buildSupplierBalances } from "../lib/du-an/project-ledger/supplier-balances";

const FIELDS: (keyof PairTotals)[] = ["openingTt", "phatSinhTt", "daTraTt", "cuoiKyTt", "openingHd", "phatSinhHd", "daTraHd", "cuoiKyHd"];

async function projectsWithMaterialActivity(): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ projectId: number }[]>`
    SELECT "projectId" FROM ledger_transactions WHERE "ledgerType" = 'material' AND "projectId" IS NOT NULL AND "deletedAt" IS NULL
    UNION
    SELECT "projectId" FROM ledger_opening_balances WHERE "ledgerType" = 'material' AND "projectId" IS NOT NULL
    UNION
    SELECT "projectId" FROM supplier_delivery_daily WHERE "projectId" IS NOT NULL AND "deletedAt" IS NULL
    ORDER BY 1`;
  return rows.map((r) => Number(r.projectId));
}

async function main() {
  const projects = await projectsWithMaterialActivity();
  const all = await queryDetailReport({ ledgerType: "material", showZero: true });
  const mismatches: string[] = [];
  console.log("công trình | NCC | dòng sổ | đầu kỳ | phiếu chưa chốt | dòng sổ dự án | khớp");
  for (const projectId of projects) {
    const [report, pending, rows, openings, projectTx] = await Promise.all([
      queryDetailReport({ ledgerType: "material", projectIds: [projectId], showZero: true }),
      loadPendingDeliveriesByProject(projectId),
      loadProjectLedgerRows(projectId),
      loadProjectLedgerOpenings(projectId),
      prisma.projectTransaction.count({ where: { projectId, deletedAt: null } }),
    ]);
    const balances = buildSupplierBalances(report.rows, pending, new Map(), null);
    const canonicalRows = all.rows.filter((r) => r.projectId === projectId);
    const before = mismatches.length;
    for (const s of balances.suppliers) {
      const canonical = sumReportRows(canonicalRows.filter((r) => r.partyId === s.supplierId));
      const fromRows = sumByEntityRounded([
        ...openings.filter((o) => o.partyId === s.supplierId),
        ...rows.filter((r) => r.partyId === s.supplierId),
      ]);
      for (const f of FIELDS) {
        if (s[f] !== canonical[f]) mismatches.push(`  công trình #${projectId} NCC #${s.supplierId} ${f}: tab ≠ báo cáo`);
        if (fromRows[f] !== canonical[f]) mismatches.push(`  công trình #${projectId} NCC #${s.supplierId} ${f}: dòng sổ ≠ báo cáo`);
      }
    }
    const total = sumReportRows(canonicalRows);
    for (const f of FIELDS) if (balances.totals[f] !== total[f]) mismatches.push(`  công trình #${projectId} tổng ${f}: tab ≠ báo cáo`);
    const pendingCount = balances.pending.count;
    console.log(
      `#${projectId} | ${balances.suppliers.length} | ${rows.length} | ${openings.length} | ${pendingCount} | ${projectTx} | ${mismatches.length === before ? "khớp" : "LỆCH"}`,
    );
  }
  console.log(`${projects.length} công trình, ${mismatches.length === 0 ? "tất cả khớp" : `${mismatches.length} ô lệch`}`);
  if (mismatches.length > 0) console.log(mismatches.join("\n"));
  await prisma.$disconnect();
  process.exit(mismatches.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
