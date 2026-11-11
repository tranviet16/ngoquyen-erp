/**
 * Integration test: adapter `vat-tu-chuyen-doi` qua engine import thật (preview → Lưu & tính lại →
 * commit → hoàn tác) trên gói tổng hợp nhỏ (`cutover-synthetic-bundle.ts`): file tổng, CSV, 3 file
 * theo dõi; 1 NCC × 2 công trình + một dòng CDC tách sang Tân Lộc CDC.
 *   1. Chưa ánh xạ / công trình chưa có Chủ thể → lỗi chặn; sau ánh xạ ra bảng cặp với mặc định đúng.
 *   2. Commit: mỗi cặp một marker 01/01→26/10 đã ký (kể cả cặp chỉ có Số Dư); Đầu kỳ 2026 = Số Dư;
 *      Kỳ chuẩn T1/2026 Đầu kỳ = Số Dư; phiếu trùng giữa khối còn 1; "Lấy Hàng" sau mốc không vào sổ.
 *   3. Sau commit: chốt kỳ 01/10→26/10 bị biên kỳ chặn; phiếu 20/10 ở cặp mới bị guard mốc chặn; kỳ
 *      gợi ý 27/10→26/11, chốt kỳ đó chỉ sinh event cho phiếu sau mốc, nợ sau chốt = Tổng nợ khối.
 *   4. Import lại (kể cả gói sửa 1 byte) bị guard độc quyền chặn.
 *   5. `reviewVersion` cũ → commit bị từ chối.
 *   6. Hoàn tác trước chốt kỳ ERP khôi phục đúng số dòng, run `rolled_back`, import lại được; sau chốt
 *      kỳ ERP hoặc có `dieu_chinh` mới thì bị từ chối.
 *   7. V2 lệch giả lập ở bước đối soát → commit ném lỗi, không còn dòng nào được ghi.
 *   8. Đợt vat_tu còn mở: xác nhận từng đợt (không chặn cứng); đợt trùng "Trả Nợ" chặn tới khi quyết định.
 * Cô lập: `truncateAll()` mỗi test.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { authMock } from "@/test/helpers/session-mock";

const verifyHook = vi.hoisted(() => ({ forceV2Failure: false }));

vi.mock("@/lib/auth", () => ({ auth: authMock }));
vi.mock("@/lib/acl/released-module-request", () => ({
  requireReleasedModuleRequest: vi.fn().mockResolvedValue({ userId: "cutover-admin", role: "admin" }),
}));
vi.mock("@/lib/admin/require-active-admin", () => ({
  requireActiveAdmin: vi.fn().mockResolvedValue("cutover-admin"),
}));
vi.mock("@/lib/import/adapters/vat-tu-chuyen-doi/verification-queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/import/adapters/vat-tu-chuyen-doi/verification-queries")>();
  return {
    ...actual,
    runVerification: async (...args: Parameters<typeof actual.runVerification>) => {
      const outcome = await actual.runVerification(...args);
      return verifyHook.forceV2Failure ? { ...outcome, failures: [...outcome.failures, "V2: lệch giả lập"] } : outcome;
    },
  };
});

import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import {
  commitImport,
  getRollbackInfo,
  previewBundleImport,
  refreshPreview,
  rollbackImportRun,
} from "@/lib/import/import-engine";
import { ImportPreconditionError, RollbackBlockedError } from "@/lib/import/import-errors";
import { nameKey } from "@/lib/import/adapters/vat-tu-chuyen-doi/mapping-keys";
import type { CutoverReviewPayload } from "@/lib/import/adapters/vat-tu-chuyen-doi/review-payload-types";
import { SYNTHETIC, syntheticCutoverBundle } from "@/lib/import/adapters/vat-tu-chuyen-doi/__tests__/cutover-synthetic-bundle";
import { queryDetailReport } from "@/lib/cong-no-vt/balance-report-service";
import { createMaterialTransaction } from "@/lib/cong-no-vt/material-ledger-service";
import { commitPeriodClose, previewPeriodClose } from "@/lib/vat-tu-ncc/period-close-service";
import { createDelivery } from "@/lib/vat-tu-ncc/delivery-service";
import { getMaterialCutoverDate } from "@/lib/vat-tu-ncc/pair-scope";
import { pairBalanceAsOf } from "@/lib/vat-tu-ncc/supplier-balance";
import { getReconciliationMonthView, listReconciliationsDerived } from "@/lib/vat-tu-ncc/reconciliation-derive-service";
import { monthlySlices } from "@/lib/vat-tu-ncc/period-bounds";

const ADMIN_ID = "cutover-admin";
const ADAPTER = "vat-tu-chuyen-doi";

interface Seed {
  quanLy: number;
  huyen: number;
  supplier: number;
  traiChuoi: number;
  daiCayXanh: number;
  tanLoc: number;
  m300: number;
}

async function seed(opts: { tanLocEntity?: boolean } = {}): Promise<Seed> {
  await prisma.user.create({ data: { id: ADMIN_ID, name: "Admin chuyển đổi", email: "cutover@test.local", role: "admin" } });
  const quanLy = await prisma.entity.create({ data: { name: SYNTHETIC.entities.quanLy, type: "company" } });
  const huyen = await prisma.entity.create({ data: { name: SYNTHETIC.entities.huyen, type: "person" } });
  const supplier = await prisma.supplier.create({ data: { name: SYNTHETIC.supplier } });
  const traiChuoi = await prisma.project.create({ data: { code: "TC", name: SYNTHETIC.projects.traiChuoi, entityId: quanLy.id } });
  const daiCayXanh = await prisma.project.create({ data: { code: "DCX", name: SYNTHETIC.projects.daiCayXanh, entityId: huyen.id } });
  const tanLoc = await prisma.project.create({
    data: { code: "TLCDC", name: SYNTHETIC.projects.tanLocCdc, entityId: opts.tanLocEntity === false ? null : quanLy.id },
  });
  const m300 = await prisma.item.create({ data: { code: "BT-M300", name: SYNTHETIC.items.m300, unit: "m3", type: "material" } });
  await prisma.item.create({ data: { code: "BT-M250", name: SYNTHETIC.items.m250, unit: "m3", type: "material" } });
  return {
    quanLy: quanLy.id,
    huyen: huyen.id,
    supplier: supplier.id,
    traiChuoi: traiChuoi.id,
    daiCayXanh: daiCayXanh.id,
    tanLoc: tanLoc.id,
    m300: m300.id,
  };
}

function mappingFor(s: Seed) {
  return {
    [nameKey("supplier", SYNTHETIC.csvSupplier)]: s.supplier,
    [nameKey("project-csv", SYNTHETIC.csvTraiChuoi)]: s.traiChuoi,
  };
}

async function previewAndMap(s: Seed, opts: { csvExtra?: string } = {}) {
  const preview = await previewBundleImport(syntheticCutoverBundle(opts), ADAPTER, ADMIN_ID);
  const refreshed = await refreshPreview(preview.runId, mappingFor(s), ADMIN_ID);
  return { runId: preview.runId, preview, refreshed };
}

async function committedRun(s: Seed) {
  const { runId, refreshed } = await previewAndMap(s);
  expect(refreshed.review.blocking).toEqual([]);
  expect(refreshed.missingAcks).toEqual([]);
  await commitImport(runId, refreshed.reviewVersion);
  return runId;
}

async function runRowCounts(runId: number) {
  const where = { importRunId: runId };
  return {
    ledger: await prisma.ledgerTransaction.count({ where }),
    openings: await prisma.ledgerOpeningBalance.count({ where }),
    deliveries: await prisma.supplierDeliveryDaily.count({ where }),
    recons: await prisma.supplierReconciliation.count({ where }),
  };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("adapter vat-tu-chuyen-doi (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    verifyHook.forceV2Failure = false;
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("1. chưa ánh xạ / công trình chưa có Chủ thể → lỗi chặn; sau ánh xạ ra bảng cặp với mặc định đúng", async () => {
    const s = await seed({ tanLocEntity: false });
    const preview = await previewBundleImport(syntheticCutoverBundle(), ADAPTER, ADMIN_ID);
    const blocking = preview.review.blocking.join("\n");
    expect(blocking).toContain(nameKey("supplier", SYNTHETIC.csvSupplier));
    expect(blocking).toContain(nameKey("project-csv", SYNTHETIC.csvTraiChuoi));
    expect(blocking).toContain("Tân Lộc CDC");
    expect((preview.review.payload as CutoverReviewPayload).verification).toBeNull();

    await prisma.project.update({ where: { id: s.tanLoc }, data: { entityId: s.quanLy } });
    const refreshed = await refreshPreview(preview.runId, mappingFor(s), ADMIN_ID);
    expect(refreshed.review.blocking).toEqual([]);
    const payload = refreshed.review.payload as CutoverReviewPayload;
    expect(Object.fromEntries(payload.pairs.map((p) => [p.projectName, p.defaultDecision]))).toEqual({
      [SYNTHETIC.projects.traiChuoi]: 1,
      [SYNTHETIC.projects.tanLocCdc]: 1,
      [SYNTHETIC.projects.daiCayXanh]: 0,
    });
    expect(payload.verification?.v1.every((r) => r.ok)).toBe(true);
    expect(payload.verification?.v4).toMatchObject({ total: 1, matched: 1, ok: true });
    // Chạy thử đã rollback: không còn dòng nào của run.
    expect(await runRowCounts(preview.runId)).toEqual({ ledger: 0, openings: 0, deliveries: 0, recons: 0 });
  });

  it("2. commit: marker cho mọi cặp, Đầu kỳ 2026 và Kỳ chuẩn T1/2026 = Số Dư, khử trùng phiếu, không ghi \"Lấy Hàng\" sau mốc", async () => {
    const s = await seed();
    const runId = await committedRun(s);

    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, reviewJson: true } });
    expect(run.status).toBe("committed");
    expect((run.reviewJson as { expected?: { cutoverDate?: string } }).expected?.cutoverDate).toBe("2026-10-26");
    expect(await getMaterialCutoverDate(prisma)).toEqual(day("2026-10-26"));

    const markers = await prisma.supplierReconciliation.findMany({ where: { importRunId: runId }, orderBy: { projectId: "asc" } });
    expect(markers.map((m) => m.projectId).sort()).toEqual([s.traiChuoi, s.daiCayXanh, s.tanLoc].sort());
    for (const m of markers) {
      expect(m).toMatchObject({ periodFrom: day("2026-01-01"), periodTo: day("2026-10-26"), signedBySupplier: true });
      expect(m.note).toBe(`Chuyển đổi từ Excel đến 26/10/2026 — import #${runId}`);
      expect(m.signedSnapshotJson).not.toBeNull();
    }

    for (const [from, to] of [["2026-01-01", "2026-01-26"], ["2025-12-27", "2026-01-26"]]) {
      const report = await queryDetailReport({ ledgerType: "material", from: day(from), to: day(to), showZero: true });
      const opening = (projectId: number) => report.rows.find((r) => r.partyId === s.supplier && r.projectId === projectId);
      expect(opening(s.traiChuoi)).toMatchObject({ openingTt: "100000000", openingHd: "90000000" });
      expect(opening(s.tanLoc)).toMatchObject({ openingTt: "20000000", openingHd: "0" });
      expect(opening(s.daiCayXanh)).toMatchObject({ openingTt: "5000000", openingHd: "0" });
    }

    expect(await runRowCounts(runId)).toEqual({ ledger: 9, openings: 1, deliveries: 4, recons: 3 });
    const pickups = await prisma.supplierDeliveryDaily.findMany({ where: { importRunId: runId, date: day("2026-10-27") } });
    expect(pickups).toHaveLength(1);
    const ledgerAfter = await prisma.ledgerTransaction.count({
      where: { importRunId: runId, date: { gt: day("2026-10-26") }, transactionType: { in: ["lay_hang", "thue_hd"] } },
    });
    expect(ledgerAfter).toBe(0);
    const linked = await prisma.ledgerTransaction.count({ where: { importRunId: runId, deliveryId: { not: null } } });
    expect(linked).toBe(0);
  });

  it("3. sau commit: biên kỳ / guard mốc chặn; kỳ gợi ý 27/10→26/11 chỉ chốt phiếu sau mốc, nợ = Tổng nợ khối", async () => {
    const s = await seed();
    await committedRun(s);

    await expect(commitPeriodClose(s.supplier, s.traiChuoi, { from: "2026-09-27", to: "2026-10-26" }, [])).rejects.toThrow(/chồng lấn/);
    const fresh = await prisma.project.create({ data: { code: "MOI", name: "Công trình mới", entityId: s.quanLy } });
    await expect(
      createDelivery({ supplierId: s.supplier, projectId: fresh.id, date: "2026-10-20", itemId: s.m300, qty: 1, unit: "m3" }),
    ).rejects.toMatchObject({ code: "cutover_locked" });

    const preview = await previewPeriodClose(s.supplier, s.traiChuoi);
    expect(preview.suggestedRange).toEqual({ from: "2026-10-27", to: "2026-11-26" });
    expect(preview.deliveries.map((d) => d.date)).toEqual(["2026-10-27"]);
    const closed = await commitPeriodClose(s.supplier, s.traiChuoi, preview.suggestedRange, []);
    expect(closed.closedCount).toBe(1);
    expect(await pairBalanceAsOf(s.supplier, s.traiChuoi, day("2026-11-26"))).toBe(SYNTHETIC.anchors.traiChuoi);
  });

  it("4. import lại (cùng gói hoặc gói sửa 1 byte) bị chặn", async () => {
    const s = await seed();
    const first = await committedRun(s);

    const same = await previewAndMap(s);
    expect(same.preview.duplicateWarning).toBe(true);
    await expect(commitImport(same.runId, same.refreshed.reviewVersion)).rejects.toBeInstanceOf(ImportPreconditionError);

    const edited = await previewAndMap(s, { csvExtra: " " });
    expect(edited.preview.duplicateWarning).toBe(false);
    expect(edited.refreshed.review.blocking.join("\n")).toContain(`Đã có run chuyển đổi #${first}`);
    await expect(commitImport(edited.runId, edited.refreshed.reviewVersion)).rejects.toBeInstanceOf(ImportPreconditionError);
    expect((await prisma.importRun.findUniqueOrThrow({ where: { id: edited.runId } })).status).toBe("preview");
  });

  it("5. reviewVersion cũ → commit bị từ chối", async () => {
    const s = await seed();
    const { runId, refreshed } = await previewAndMap(s);
    await expect(commitImport(runId, refreshed.reviewVersion - 1)).rejects.toBeInstanceOf(ImportPreconditionError);
    expect(await runRowCounts(runId)).toEqual({ ledger: 0, openings: 0, deliveries: 0, recons: 0 });
  });

  it("6a. hoàn tác trước chốt kỳ ERP: khôi phục đúng số dòng, run rolled_back, import lại được", async () => {
    const s = await seed();
    const runId = await committedRun(s);
    const info = await getRollbackInfo(runId);
    expect(info).toMatchObject({ ledgerTransactions: 9, ledgerOpeningBalances: 1, supplierDeliveryDaily: 4, supplierReconciliations: 3 });

    const removed = await rollbackImportRun(runId);
    expect(removed).toMatchObject({ ledgerTransactions: 9, ledgerOpeningBalances: 1, supplierDeliveryDaily: 4, supplierReconciliations: 3 });
    expect((await prisma.importRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("rolled_back");
    expect(await runRowCounts(runId)).toEqual({ ledger: 0, openings: 0, deliveries: 0, recons: 0 });
    expect(await getMaterialCutoverDate(prisma)).toBeNull();

    const again = await committedRun(s);
    expect(await runRowCounts(again)).toEqual({ ledger: 9, openings: 1, deliveries: 4, recons: 3 });
  });

  it("6b. hoàn tác bị từ chối sau chốt kỳ ERP hoặc khi có dieu_chinh mới trong cặp", async () => {
    const s = await seed();
    const runId = await committedRun(s);
    await createMaterialTransaction({
      date: "2026-11-02",
      transactionType: "dieu_chinh",
      entityId: s.huyen,
      partyId: s.supplier,
      projectId: s.daiCayXanh,
      amountTt: "1000",
      vatPctTt: "0",
      amountHd: "0",
      vatPctHd: "0",
      status: "pending",
    });
    await expect(rollbackImportRun(runId)).rejects.toBeInstanceOf(RollbackBlockedError);

    await truncateAll();
    const s2 = await seed();
    const run2 = await committedRun(s2);
    const preview = await previewPeriodClose(s2.supplier, s2.traiChuoi);
    await commitPeriodClose(s2.supplier, s2.traiChuoi, preview.suggestedRange, []);
    await expect(rollbackImportRun(run2)).rejects.toBeInstanceOf(RollbackBlockedError);
    expect((await prisma.importRun.findUniqueOrThrow({ where: { id: run2 } })).status).toBe("committed");
  });

  it("8. đợt vat_tu còn mở: không chặn cứng, xác nhận từng đợt; đợt trùng \"Trả Nợ\" chặn tới khi chọn bỏ dòng Nhập Liệu", async () => {
    const s = await seed();
    const openRound = async (sequence: number, amount: number) => {
      const round = await prisma.paymentRound.create({ data: { month: "2026-11", sequence, status: "submitted", createdById: ADMIN_ID } });
      await prisma.paymentRoundItem.create({
        data: { roundId: round.id, entityId: s.huyen, supplierId: s.supplier, projectId: s.daiCayXanh, category: "vat_tu", soDeNghi: amount },
      });
      return round.id;
    };
    const plain = await openRound(1, 7_000_000);
    const twin = await openRound(2, SYNTHETIC.postCutoverPayment); // trùng "Trả Nợ" 28/10 của Dải Cây Xanh

    const { runId, refreshed } = await previewAndMap(s);
    const blocking = refreshed.review.blocking.join("\n");
    expect(blocking).toContain(`Đợt #${twin}`);
    expect(blocking).not.toContain(`Đợt #${plain}`);
    const plainAck = `open-round:${plain}:7000000`;
    const twinAck = `open-round:${twin}:${SYNTHETIC.postCutoverPayment}`;
    expect(refreshed.missingAcks).toEqual(expect.arrayContaining([plainAck, twinAck]));
    const payload = refreshed.review.payload as CutoverReviewPayload;
    expect(payload.postCutover.openRounds.find((r) => r.roundId === twin)?.matches.map((m) => m.amount)).toEqual([SYNTHETIC.postCutoverPayment]);

    const decided = await refreshPreview(
      runId,
      { ...mappingFor(s), [`round:${twin}`]: "drop-nl", [`ack:${plainAck}`]: 1, [`ack:${twinAck}`]: 1 },
      ADMIN_ID,
    );
    expect(decided.review.blocking).toEqual([]);
    expect(decided.missingAcks).toEqual([]);
    await commitImport(runId, decided.reviewVersion);
    // "Trả Nợ" 28/10 bị bỏ (khoản chi vào sổ khi đóng đợt) → 8 dòng sổ thay vì 9.
    expect(await runRowCounts(runId)).toEqual({ ledger: 8, openings: 1, deliveries: 4, recons: 3 });
  });

  it("7. V2 lệch ở bước đối soát → commit ném lỗi, không còn dòng nào được ghi", async () => {
    const s = await seed();
    const { runId, refreshed } = await previewAndMap(s);
    verifyHook.forceV2Failure = true;
    await expect(commitImport(runId, refreshed.reviewVersion)).rejects.toThrow(/Đối soát lệch/);
    expect(await runRowCounts(runId)).toEqual({ ledger: 0, openings: 0, deliveries: 0, recons: 0 });
    expect((await prisma.importRun.findUniqueOrThrow({ where: { id: runId } })).status).toBe("failed");
    expect(await getMaterialCutoverDate(prisma)).toBeNull();
  });

  it("9. danh sách đối chiếu tách kỳ chuyển đổi theo tháng 27→26, bỏ tháng trống đầu, xem được từng tháng", async () => {
    const s = await seed();
    await committedRun(s);
    const marker = await prisma.supplierReconciliation.findFirstOrThrow({
      where: { supplierId: s.supplier, projectId: s.traiChuoi, deletedAt: null },
    });

    const rows = await listReconciliationsDerived(s.supplier, s.traiChuoi);
    const asc = [...rows].reverse();
    // Mỗi dòng là một tháng: kết thúc ngày 26, không dài quá một kỳ 27→26.
    for (const r of asc) {
      expect(r.periodTo.slice(8)).toBe("26");
      expect(monthlySlices(day(r.periodFrom), day(r.periodTo))).toHaveLength(1);
      expect(r.monthOfLongerPeriod).toBe(true);
    }
    // Tháng đầu có phát sinh (số dư đầu năm) — không có tháng trống nào phía trước; tháng cuối là 27/9 → 26/10.
    expect(asc[0]).toMatchObject({ periodFrom: "2026-01-01", periodTo: "2026-01-26" });
    expect(asc[0].opening !== 0 || asc[0].totalIn !== 0 || asc[0].totalPaid !== 0).toBe(true);
    const last = asc[asc.length - 1];
    expect(last).toMatchObject({ periodFrom: "2026-09-27", periodTo: "2026-10-26", lastMonthOfPeriod: true });
    // Chuỗi liền: đầu tháng sau = cuối tháng trước; cuối tháng cuối = số cuối kỳ chuyển đổi đã ký.
    for (let i = 1; i < asc.length; i++) expect(asc[i].opening).toBe(asc[i - 1].closing);
    expect(last.closing).toBe(Number(marker.closingBalance));

    const month = await getReconciliationMonthView(marker.id, last.periodFrom, last.periodTo);
    expect(month).toMatchObject({ periodFrom: "2026-09-27", periodTo: "2026-10-26", closing: last.closing });
    expect(month.parentPeriodLabel).toMatch(/01\/01\/2026/);
    await expect(getReconciliationMonthView(marker.id, "2026-09-01", "2026-10-26")).rejects.toThrow(/không thuộc kỳ/);
  });
});
