/**
 * Integration test: import workbook "Cân đối vật tư" của đội qua engine thật (xem trước → xác nhận →
 * ghi → báo cáo đọc từ DB khớp số trong file → hoàn tác). Cần file thật (không có trong repo):
 *   DT_HD_TT_WORKBOOK="<bản sao Can Doi Vat Tu 2.xlsx>" npm run test:integration -- du-an-dt-hd-tt-import
 * Không có biến môi trường → bỏ qua.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({ userId: "import-admin", role: "admin" }),
}));

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import { commitImport, previewImport, refreshPreview, rollbackImportRun } from "@/lib/import/import-engine";
import { parseStoredReview } from "@/lib/import/import-review";
import { parseDtHdTtWorkbook } from "@/lib/import/adapters/du-an-dt-hd-tt/parse-workbook";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";

const file = process.env.DT_HD_TT_WORKBOOK;
const ADMIN = "import-admin";

describe.skipIf(!file)("import Đối chiếu DT-HĐ-TT từ file thật", () => {
  const buffer = file ? readFileSync(file) : Buffer.alloc(0);
  const wb = file ? parseDtHdTtWorkbook(buffer) : (undefined as never);
  let projectId = 0;
  let oldRunId = 0;
  let runId = 0;
  const oldTx: number[] = [];

  beforeAll(async () => {
    await truncateAll();
    await prisma.user.create({ data: { id: ADMIN, name: "Import Admin", email: "import-admin@test.local", role: "admin" } });
    const project = await prisma.project.create({ data: { code: "MNTC-GD1", name: "Mầm Non Trại Chuối GĐ1", status: "active" } });
    projectId = project.id;
    const cats = await Promise.all(["HM1-VL", "HM1-NC", "HM1-MAY"].map((code) => prisma.projectCategory.create({ data: { projectId, code, name: code } })));
    const r = wb.goldens.rates;
    await prisma.projectSettings.create({
      data: { projectId, vatPct: r.vatPct, generalCostPct: r.generalCostPct, tempHousingPct: r.tempHousingPct, unmeasuredPct: r.unmeasuredPct, presumptiveIncomePct: r.presumptiveIncomePct },
    });
    for (const s of wb.suppliers) await prisma.supplier.create({ data: { name: s.canonical, taxCode: s.mst } });
    // Lần import "bảng cân đối" cũ: 1 dòng dự toán trùng file, 1 dòng file không có, 3 giao dịch HĐ.
    oldRunId = (await prisma.importRun.create({ data: { fileName: "bang-can-doi.xlsx", fileHash: "old", adapter: "bang-can-doi-vat-tu", status: "committed", createdBy: ADMIN, committedAt: new Date("2025-12-01") } })).id;
    const d0 = wb.dtLines.find((d) => d.kind === "VL" && d.qty > 0)!;
    await prisma.projectEstimate.create({ data: { projectId, categoryId: cats[0].id, itemCode: "VL-001", itemName: d0.name, unit: d0.unit, qty: d0.qty, unitPrice: d0.value / d0.qty, totalVnd: d0.value, importRunId: oldRunId } });
    await prisma.projectEstimate.create({ data: { projectId, categoryId: cats[0].id, itemCode: "VL-999", itemName: "Vữa XMPC30 M250", unit: "m3", qty: 3, unitPrice: 970_000, totalVnd: 2_910_000, importRunId: oldRunId } });
    for (const amount of [1_000_000, 2_000_000, 3_000_000]) {
      oldTx.push((await prisma.projectTransaction.create({ data: { projectId, date: new Date("2025-12-01"), transactionType: "lay_hang", categoryId: cats[0].id, itemCode: "VL-001", itemName: d0.name, qty: 1, unit: d0.unit, amountHd: amount, importRunId: oldRunId } })).id);
    }
  }, 120_000);

  afterAll(async () => {
    await closeTestDb();
  });

  it("xem trước: chọn công trình, NCC tự gắn theo MST, chỉ còn các mục cần xác nhận", async () => {
    const preview = await previewImport(buffer, "du-an-dt-hd-tt", "Can Doi Vat Tu 2.xlsx", ADMIN);
    runId = preview.runId;
    await refreshPreview(runId, { "project:target": projectId }, ADMIN);
    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: runId }, omit: { sourceFile: true } });
    const review = parseStoredReview(run.reviewJson)!;
    expect(review.blocking).toEqual([]);
    expect(review.requiredAcks.some((c) => c.startsWith(`replace-ptx:v1:${projectId}:3:6000000.00`))).toBe(true);
    expect(review.requiredAcks.some((c) => c.startsWith(`dt-sync:v1:${projectId}:`))).toBe(true);

    const mapping: Record<string, number> = { "project:target": projectId };
    for (const code of review.requiredAcks) mapping[`ack:${code}`] = 1;
    const refreshed = await refreshPreview(runId, mapping, ADMIN);
    expect(refreshed.review.blocking).toEqual([]);
    expect(refreshed.missingAcks).toEqual([]);

    const committed = await commitImport(runId, refreshed.reviewVersion);
    expect(committed.errors).toEqual([]);
    expect((await prisma.importRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true } })).status).toBe("committed");
  }, 300_000);

  it("sau khi ghi: dự toán theo file, giao dịch cũ được thay, báo cáo đọc từ DB khớp số trong file", async () => {
    expect(await prisma.projectTransaction.count({ where: { id: { in: oldTx }, deletedAt: null } })).toBe(0);
    expect(await prisma.projectTransaction.count({ where: { projectId, deletedAt: null, sourceInvoiceLineId: { not: null } } })).toBe(wb.invoices.length);
    const reports = await getDtHdTtReports(projectId);
    const g = wb.goldens;
    expect(reports.dtTt.phanII.totalA).toBeCloseTo(g.totalA, 0);
    expect(reports.dtTt.phanII.totalAB).toBeCloseTo(g.totalAB, 0);
    expect(reports.phanIII.rows.find((r) => r.key === "total")!.estimate).toBeCloseTo(g.estimateTotal, 0);
    expect(reports.hdTt.totals.invoiceTotal).toBeCloseTo(g.hdTt.invoiceTotal, 0);
    expect(reports.hdTt.totals.paid).toBeCloseTo(g.hdTt.paid, 0);
    expect(reports.hdTt.totals.actual).toBeCloseTo(g.hdTt.actual, 0);
    expect(reports.hdTt.totals.recovered).toBeCloseTo(g.hdTt.recovered, 0);
    expect(reports.dtHd.grandCheck.ok).toBe(true);
    await expect(rollbackImportRun(oldRunId)).rejects.toThrow(/đang bị một run "Đối chiếu DT-HĐ-TT" thay thế/);
  }, 120_000);

  it("hoàn tác khôi phục đúng giao dịch và dự toán cũ, xóa sổ", async () => {
    const result = await rollbackImportRun(runId);
    expect(result.duAnBook.restoredTransactions).toBe(3);
    expect(result.duAnBook.restoredEstimates).toBe(1); // chỉ dòng vữa bị thay; dòng trùng file được giữ
    expect(await prisma.projectTransaction.count({ where: { projectId, deletedAt: null } })).toBe(3);
    expect(await prisma.projectEstimate.count({ where: { projectId, deletedAt: null } })).toBe(2);
    expect(await prisma.projectInvoiceLine.count()).toBe(0);
    expect(await prisma.projectCounterparty.count()).toBe(0);
  }, 120_000);
});
