/**
 * (Tên không bắt đầu bằng "check-": .gitignore bỏ qua scripts/check-*.)
 * Tie-out (CHỈ ĐỌC): số của màn chi tiết hợp đồng khớp báo cáo công nợ lũy kế đến từng đồng.
 *
 * Đếm lúc chạy mọi cặp (đối tác, công trình) của sổ vật tư (và sổ nhân công), rồi với mỗi cặp so 8 số
 * (đầu kỳ, phát sinh, đã trả, cuối kỳ — mỗi số theo TT và HĐ):
 *   - phía màn hợp đồng: dòng sổ + số dư đầu kỳ do `ledger-source` đọc, cộng bằng `sumByEntityRounded`
 *     (cộng chính xác trong Chủ thể, làm tròn theo Chủ thể như báo cáo, rồi cộng các Chủ thể);
 *   - phía báo cáo: các dòng của `queryDetailReport` (lũy kế, không cắt ngày) của cặp, `sumReportRows`.
 * In "N/N cặp khớp" cho từng sổ; có lệch thì in bảng lệch và thoát mã 1.
 *
 *   npx tsx scripts/verify-contract-detail-tie-out.ts
 */
import { prisma } from "../lib/prisma";
import { queryDetailReport } from "../lib/cong-no-vt/balance-report-service";
import { loadLedgerOpenings, loadLedgerRows } from "../lib/du-an/contract-detail/ledger-source";
import { sumByEntityRounded, sumReportRows, type PairTotals } from "../lib/du-an/contract-detail/list-figures";

type LedgerType = "material" | "labor";
const FIELDS: (keyof PairTotals)[] = ["openingTt", "phatSinhTt", "daTraTt", "cuoiKyTt", "openingHd", "phatSinhHd", "daTraHd", "cuoiKyHd"];

async function pairsOf(ledgerType: LedgerType): Promise<{ partyId: number; projectId: number }[]> {
  const rows = await prisma.$queryRaw<{ partyId: number; projectId: number }[]>`
    SELECT "partyId", "projectId" FROM ledger_transactions
     WHERE "ledgerType" = ${ledgerType} AND "projectId" IS NOT NULL AND "deletedAt" IS NULL
    UNION
    SELECT "partyId", "projectId" FROM ledger_opening_balances
     WHERE "ledgerType" = ${ledgerType} AND "projectId" IS NOT NULL
    ORDER BY 1, 2`;
  return rows.map((r) => ({ partyId: Number(r.partyId), projectId: Number(r.projectId) }));
}

async function check(ledgerType: LedgerType): Promise<number> {
  const pairs = await pairsOf(ledgerType);
  const report = await queryDetailReport({ ledgerType, showZero: true });
  let matched = 0;
  const mismatches: string[] = [];
  for (const { partyId, projectId } of pairs) {
    const [rows, openings] = await Promise.all([
      loadLedgerRows(ledgerType, partyId, projectId),
      loadLedgerOpenings(ledgerType, partyId, projectId),
    ]);
    const screen = sumByEntityRounded([...openings, ...rows]);
    const canonical = sumReportRows(report.rows.filter((r) => r.partyId === partyId && r.projectId === projectId));
    const diff = FIELDS.filter((f) => screen[f] !== canonical[f]);
    if (diff.length === 0) {
      matched += 1;
      continue;
    }
    for (const f of diff) mismatches.push(`  ${ledgerType} đối tác #${partyId} × công trình #${projectId} ${f}: màn HĐ ${screen[f]} ≠ báo cáo ${canonical[f]}`);
  }
  console.log(`[${ledgerType === "material" ? "Vật tư" : "Nhân công"}] ${matched}/${pairs.length} cặp khớp`);
  if (mismatches.length > 0) console.log(mismatches.join("\n"));
  return pairs.length - matched;
}

async function main() {
  const failed = (await check("material")) + (await check("labor"));
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
