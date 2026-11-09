/**
 * Integration test: vòng đời run import trên `@/lib/prisma` thật.
 * - Adapter một file: `cong-no-nhan-cong` (sổ nhân công, không có cặp vật tư).
 * - Adapter gói giả lập `fake-bundle` đăng ký trong test (vi.mock registry): nhận thư mục, có
 *   `lockScope` / `review` / `requiredAcks`, ghi phiếu + sổ vật tư mang `importRunId`.
 * Bao phủ: lưu nguồn, commit không cần buffer, hai commit đồng thời, commit lại, apply lỗi,
 * reviewVersion cũ, lỗi chặn / thiếu xác nhận, refresh, hoàn tác giữ run `rolled_back` và guard
 * hoàn tác, xóa run, listImportRuns không trả sourceFile. Cô lập: `truncateAll()` mỗi test.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import type { RegisteredImportAdapter } from "@/lib/import/adapters/adapter-types";

const fake = vi.hoisted(() => {
  const DATE = new Date("2026-03-15T00:00:00.000Z");
  const state = {
    blocking: [] as string[],
    requiredAcks: [] as string[],
    failApply: false,
    reviewPhases: [] as string[],
  };
  interface FakeRow {
    supplierId: number;
    projectId: number;
    entityId: number;
    itemId: number;
    amount: number;
  }
  // `tx` của adapter là client transaction; chỉ cần $executeRaw.
  type RawTx = { $executeRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<number> };

  async function writeRows(tx: RawTx, rows: FakeRow[], importRunId: number): Promise<number> {
    for (const r of rows) {
      await tx.$executeRaw`
        INSERT INTO supplier_delivery_daily ("supplierId", "projectId", date, "itemId", qty, unit, "importRunId", "createdAt", "updatedAt")
        VALUES (${r.supplierId}, ${r.projectId}, ${DATE}, ${r.itemId}, 1, 'm3', ${importRunId}, NOW(), NOW())`;
      await tx.$executeRaw`
        INSERT INTO ledger_transactions ("ledgerType", date, "transactionType", "entityId", "partyId", "projectId",
          "amountTt", "totalTt", status, "importRunId", "createdAt", "updatedAt")
        VALUES ('material', ${DATE}, 'lay_hang', ${r.entityId}, ${r.supplierId}, ${r.projectId},
          ${r.amount}, ${r.amount}, 'approved', ${importRunId}, NOW(), NOW())`;
      if (state.failApply) throw new Error("apply giả lập lỗi");
    }
    return rows.length * 2;
  }

  const rowsOf = (data: { rows: { data: Record<string, unknown> }[] }) => data.rows.map((r) => r.data as unknown as FakeRow);

  const adapter: RegisteredImportAdapter = {
    name: "fake-bundle",
    label: "Gói giả lập (test)",
    acceptsBundle: true,
    supportsRollback: true,
    async parse(_buffer, ctx) {
      const files = ctx?.bundle?.files ?? [];
      const rows = files
        .filter((f) => f.path.endsWith(".csv"))
        .flatMap((f) =>
          f.buffer
            .toString("utf8")
            .trim()
            .split("\n")
            .map((line, i) => {
              const [supplierId, projectId, entityId, itemId, amount] = line.split(",").map(Number);
              return { rowIndex: i, data: { supplierId, projectId, entityId, itemId, amount } };
            }),
        );
      return { rows, conflicts: [], meta: {} };
    },
    validate: () => ({ valid: true, errors: [] }),
    lockScope: (data) => rowsOf(data).map((r) => r.supplierId),
    async review(data, _mapping, db, ctx) {
      state.reviewPhases.push(ctx.phase);
      // Chạy thử đúng đường ghi ở pha xem trước — engine phải rollback.
      if (ctx.phase === "preview" && !state.failApply) await writeRows(db as unknown as RawTx, rowsOf(data), ctx.runId);
      return { payload: { rows: data.rows.length }, blocking: [...state.blocking], requiredAcks: [...state.requiredAcks] };
    },
    async apply(data, _mapping, tx, importRunId) {
      const imported = await writeRows(tx as RawTx, rowsOf(data), importRunId);
      return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: 0, errors: [], expected: { marker: "ok" } };
    },
  };

  function reset() {
    state.blocking = [];
    state.requiredAcks = [];
    state.failApply = false;
    state.reviewPhases = [];
  }

  return { adapter, state, reset };
});

vi.mock("@/lib/import/adapters/adapter-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/import/adapters/adapter-registry")>();
  return {
    ...actual,
    getAdapter: (name: string) => (name === fake.adapter.name ? fake.adapter : actual.getAdapter(name)),
  };
});

import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import {
  previewImport,
  previewBundleImport,
  refreshPreview,
  commitImport,
  getRollbackInfo,
  rollbackImportRun,
  deleteImportRun,
  listImportRuns,
  getImportRun,
} from "@/lib/import/import-engine";
import { ImportError, ImportPreconditionError, RollbackBlockedError } from "@/lib/import/import-errors";
import { encodeBundle } from "@/lib/import/file-bundle";

const CREATED_BY = "import-admin";

function laborWorkbook(note = ""): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["BẢNG NHẬP LIỆU CÔNG NỢ NHÂN CÔNG"],
      ["năm 2026"],
      ["Ngày GD", "Loại GD", "Chủ Thể", "Đội Thi Công", "Dự Án / Công Trình", "Hạng Mục", "Tổng TT (VND)", "Tổng HĐ (VND)", "Số HĐ", "Nội dung"],
      ["10/02/2026", "Lấy hàng", "Cty Quản Lý", "Đội X", "Dự án A", "Xây tô", "20,000,000", "22,000,000", "HD-01", note],
      ["12/02/2026", "Trả tiền", "Cty Quản Lý", "Đội X", "Dự án A", "", "5,000,000", "0", "", "thanh toán đợt 1"],
    ]),
    "Nhập Liệu",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

interface Seed {
  entityId: number;
  supplierId: number;
  projectId: number;
  otherProjectId: number;
  itemId: number;
}

async function seed(): Promise<Seed> {
  await prisma.user.create({
    data: { id: CREATED_BY, name: "Import Admin", email: "import-admin@test.local", role: "admin" },
  });
  const entity = await prisma.entity.create({ data: { name: "Công ty CP Xây dựng Ngô Quyền", type: "company" } });
  const supplier = await prisma.supplier.create({ data: { name: "Bê tông HP" } });
  const project = await prisma.project.create({
    data: { code: "TC", name: "Trại Chuối", status: "active", entityId: entity.id },
  });
  const other = await prisma.project.create({
    data: { code: "DCX", name: "Đường Cao Xanh", status: "active", entityId: entity.id },
  });
  const item = await prisma.item.create({ data: { code: "BT-M300", name: "Bê tông M300", unit: "m3", type: "material" } });
  return { entityId: entity.id, supplierId: supplier.id, projectId: project.id, otherProjectId: other.id, itemId: item.id };
}

function bundleFiles(s: Seed, amount = 28_980_000) {
  const enc = (t: string) => new TextEncoder().encode(t);
  return [
    { path: "Gói test/data.csv", data: enc(`${s.supplierId},${s.projectId},${s.entityId},${s.itemId},${amount}\n`) },
    { path: "Gói test/.claude/agent-memory/a.md", data: enc("ghi chú agent") },
  ];
}

async function runStatus(id: number) {
  return (await prisma.importRun.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
}

describe("import engine — run lifecycle (integration)", () => {
  let s: Seed;

  beforeEach(async () => {
    await truncateAll();
    fake.reset();
    s = await seed();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("single-file adapter (cong-no-nhan-cong)", () => {
    it("stores the source at preview; commit needs no buffer; list/get never return sourceFile", async () => {
      const buf = laborWorkbook();
      const preview = await previewImport(buf, "cong-no-nhan-cong", "nhan-cong.xlsx", CREATED_BY);
      expect(preview.parsedData.rows).toHaveLength(2);
      expect(preview.reviewVersion).toBe(1);

      const stored = await prisma.importRun.findUniqueOrThrow({
        where: { id: preview.runId },
        select: { status: true, sourceFile: true, reviewVersion: true, reviewJson: true },
      });
      expect(stored.status).toBe("preview");
      expect(Buffer.from(stored.sourceFile!).equals(buf)).toBe(true);
      expect(stored.reviewVersion).toBe(1);
      expect(stored.reviewJson).toMatchObject({ blocking: [], requiredAcks: [], acks: {} });

      const result = await commitImport(preview.runId, 1);
      expect(result.rowsImported).toBe(2);
      expect(await runStatus(preview.runId)).toBe("committed");
      const txs = await prisma.ledgerTransaction.findMany({ where: { importRunId: preview.runId } });
      expect(txs.map((t) => [t.ledgerType, t.transactionType]).sort()).toEqual([
        ["labor", "lay_hang"],
        ["labor", "thanh_toan"],
      ]);

      const listed = (await listImportRuns()).find((r) => r.id === preview.runId);
      expect(listed).toBeDefined();
      expect(listed).not.toHaveProperty("sourceFile");
      expect(await getImportRun(preview.runId)).not.toHaveProperty("sourceFile");
    });

    it("two concurrent commits of one run: one wins, the other is rejected without marking failed", async () => {
      const preview = await previewImport(laborWorkbook(), "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      const results = await Promise.allSettled([commitImport(preview.runId, 1), commitImport(preview.runId, 1)]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ImportPreconditionError);
      expect(String(rejected[0].reason)).toMatch(/đã được ghi hoặc hoàn tác/);
      expect(await runStatus(preview.runId)).toBe("committed");
      expect(await prisma.ledgerTransaction.count({ where: { importRunId: preview.runId } })).toBe(2);
    });

    it("committing again after committed is rejected and the status stays committed", async () => {
      const preview = await previewImport(laborWorkbook(), "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      await commitImport(preview.runId, 1);
      await expect(commitImport(preview.runId, 1)).rejects.toThrow(/đã được ghi hoặc hoàn tác/);
      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
      expect(run.status).toBe("committed");
      expect(run.errors).toBeNull();
    });

    it("a stale reviewVersion is rejected and the run stays in preview", async () => {
      const preview = await previewImport(laborWorkbook(), "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      await refreshPreview(preview.runId, {}, CREATED_BY); // → v2
      await expect(commitImport(preview.runId, 1)).rejects.toThrow("Bản xem trước đã thay đổi, tải lại trang.");
      expect(await runStatus(preview.runId)).toBe("preview");
      await expect(commitImport(preview.runId, 2)).resolves.toMatchObject({ rowsImported: 2 });
    });

    it("refresh validates the mapping with zod and bumps reviewVersion; rejected after commit", async () => {
      const contractor = await prisma.contractor.create({ data: { name: "Đội Xây Dựng Số 1" } });
      const preview = await previewImport(laborWorkbook(), "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);

      await expect(refreshPreview(preview.runId, { "contractor:Đội X": "abc" }, CREATED_BY)).rejects.toThrow(ImportError);
      const refreshed = await refreshPreview(preview.runId, { "contractor:Đội X": contractor.id }, CREATED_BY);
      expect(refreshed.reviewVersion).toBe(2);

      await commitImport(preview.runId, 2);
      const partyIds = await prisma.ledgerTransaction.findMany({
        where: { importRunId: preview.runId },
        select: { partyId: true },
      });
      expect(new Set(partyIds.map((p) => p.partyId))).toEqual(new Set([contractor.id]));

      await expect(refreshPreview(preview.runId, {}, CREATED_BY)).rejects.toThrow(/Chỉ tính lại được run đang xem trước/);
    });

    it("rollback keeps the run as rolled_back, clears sourceFile and deletes its rows", async () => {
      const preview = await previewImport(laborWorkbook(), "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      await commitImport(preview.runId, 1);
      expect((await getRollbackInfo(preview.runId)).ledgerTransactions).toBe(2);

      const undone = await rollbackImportRun(preview.runId);
      expect(undone.ledgerTransactions).toBe(2);

      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
      expect(run.status).toBe("rolled_back");
      expect(run.rolledBackAt).not.toBeNull();
      expect(run.sourceFile).toBeNull();
      expect(await prisma.ledgerTransaction.count()).toBe(0);
      expect(await prisma.contractor.count({ where: { name: "Đội X" } })).toBe(1); // master data giữ nguyên

      await expect(rollbackImportRun(preview.runId)).rejects.toThrow(/Chỉ hoàn tác được run đã ghi/);
    });

    it("blocks committing a second run of the same file while the first is committed", async () => {
      const buf = laborWorkbook();
      const first = await previewImport(buf, "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      const second = await previewImport(buf, "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      await commitImport(first.runId, 1);

      await expect(commitImport(second.runId, 1)).rejects.toThrow(`đã được import ở run #${first.runId}`);
      expect(await runStatus(second.runId)).toBe("preview");
      const third = await previewImport(buf, "cong-no-nhan-cong", "nc.xlsx", CREATED_BY);
      expect(third.duplicateWarning).toBe(true);
    });

    it("deletes only preview/failed runs without data; committed and rolled_back runs are kept", async () => {
      const preview = await previewImport(laborWorkbook("a"), "cong-no-nhan-cong", "a.xlsx", CREATED_BY);
      await deleteImportRun(preview.runId);
      expect(await prisma.importRun.findUnique({ where: { id: preview.runId } })).toBeNull();

      const committed = await previewImport(laborWorkbook("b"), "cong-no-nhan-cong", "b.xlsx", CREATED_BY);
      await commitImport(committed.runId, 1);
      await expect(deleteImportRun(committed.runId)).rejects.toThrow(/Dùng Hoàn tác/);

      await rollbackImportRun(committed.runId);
      await expect(deleteImportRun(committed.runId)).rejects.toThrow(/giữ làm dấu vết/);
      expect(await prisma.importRun.findUnique({ where: { id: committed.runId } })).not.toBeNull();
    });
  });

  describe("bundle adapter (fake-bundle, registered in-test)", () => {
    it("stores the bundle, lists skipped files, rolls back the preview dry-run and commits from the stored bundle", async () => {
      const files = bundleFiles(s);
      const preview = await previewBundleImport(files, "fake-bundle", CREATED_BY, { skippedPaths: ["Gói test/ghi chú.pdf"] });

      expect(preview.fileHash).toBe(encodeBundle(files).bundleHash);
      expect(preview.fileName).toBe("Gói test (1 file)");
      expect(preview.review.bundle?.files.map((f) => f.path)).toEqual(["Gói test/data.csv"]);
      expect(preview.review.bundle?.skipped).toEqual([
        { path: "Gói test/.claude/agent-memory/a.md", reason: "Thư mục / file ẩn" },
        { path: "Gói test/ghi chú.pdf", reason: "Không phải .xlsx / .csv" },
      ]);
      expect(preview.review.payload).toEqual({ rows: 1 });
      // Dòng chạy thử của review đã bị rollback.
      expect(await prisma.supplierDeliveryDaily.count()).toBe(0);
      expect(await prisma.ledgerTransaction.count()).toBe(0);

      await commitImport(preview.runId, 1);
      expect(fake.state.reviewPhases).toEqual(["preview", "commit"]);
      expect(await prisma.supplierDeliveryDaily.count({ where: { importRunId: preview.runId } })).toBe(1);
      expect(await prisma.ledgerTransaction.count({ where: { importRunId: preview.runId } })).toBe(1);
      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
      expect(run.status).toBe("committed");
      expect(run.reviewJson).toMatchObject({ expected: { marker: "ok" }, bundle: { files: [{ path: "Gói test/data.csv" }] } });
    });

    it("rejects a client-reported skipped path that is actually a valid source file", async () => {
      await expect(
        previewBundleImport(bundleFiles(s), "fake-bundle", CREATED_BY, { skippedPaths: ["Gói test/thiếu.xlsx"] }),
      ).rejects.toThrow(/không được tải lên/);
    });

    it("apply failure writes nothing and marks the run failed", async () => {
      const preview = await previewBundleImport(bundleFiles(s), "fake-bundle", CREATED_BY);
      fake.state.failApply = true;
      await expect(commitImport(preview.runId, 1)).rejects.toThrow("apply giả lập lỗi");

      expect(await prisma.supplierDeliveryDaily.count()).toBe(0);
      expect(await prisma.ledgerTransaction.count()).toBe(0);
      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
      expect(run.status).toBe("failed");
      expect(JSON.stringify(run.errors)).toContain("apply giả lập lỗi");

      await deleteImportRun(preview.runId); // failed + không dữ liệu → xóa được
      expect(await prisma.importRun.findUnique({ where: { id: preview.runId } })).toBeNull();
    });

    it("blocking errors and missing acks reject the commit (run stays preview); acks record who and when", async () => {
      fake.state.blocking = ["Tên NCC chưa ánh xạ"];
      const preview = await previewBundleImport(bundleFiles(s), "fake-bundle", CREATED_BY);
      expect(preview.review.blocking).toEqual(["Tên NCC chưa ánh xạ"]);
      await expect(commitImport(preview.runId, 1)).rejects.toThrow(/lỗi chặn/);
      expect(await runStatus(preview.runId)).toBe("preview");

      fake.state.blocking = [];
      fake.state.requiredAcks = ["v1:a"];
      const v2 = await refreshPreview(preview.runId, {}, CREATED_BY);
      expect(v2.missingAcks).toEqual(["v1:a"]);
      await expect(commitImport(preview.runId, v2.reviewVersion)).rejects.toThrow(/chưa xác nhận/);
      expect(await runStatus(preview.runId)).toBe("preview");

      const v3 = await refreshPreview(preview.runId, { "ack:v1:a": 1, "ack:stale": 1 }, CREATED_BY);
      expect(v3.missingAcks).toEqual([]);
      expect(v3.review.acks["v1:a"].ackedBy).toBe(CREATED_BY);
      expect(Number.isNaN(Date.parse(v3.review.acks["v1:a"].ackedAt))).toBe(false);
      const stored = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId }, select: { mapping: true } });
      expect(stored.mapping).toEqual({ "ack:v1:a": 1 }); // ack không còn cần bị bỏ

      // Review lại dưới khóa đòi thêm xác nhận → từ chối.
      fake.state.requiredAcks = ["v1:a", "v1:b"];
      await expect(commitImport(preview.runId, v3.reviewVersion)).rejects.toThrow(/v1:b/);
      expect(await runStatus(preview.runId)).toBe("preview");

      fake.state.requiredAcks = ["v1:a"];
      await expect(commitImport(preview.runId, v3.reviewVersion)).resolves.toMatchObject({ rowsImported: 2 });
    });

    async function committedBundleRun() {
      const preview = await previewBundleImport(bundleFiles(s), "fake-bundle", CREATED_BY);
      await commitImport(preview.runId, 1);
      return preview.runId;
    }

    async function expectRollbackBlocked(runId: number, pattern: RegExp) {
      const err = await rollbackImportRun(runId).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RollbackBlockedError);
      expect(String(err)).toMatch(pattern);
      expect(await runStatus(runId)).toBe("committed");
      expect(await prisma.ledgerTransaction.count({ where: { importRunId: runId } })).toBe(1);
      return String(err);
    }

    it("rollback is refused when the run's pair has a signed ERP reconciliation", async () => {
      const runId = await committedBundleRun();
      await prisma.supplierReconciliation.create({
        data: {
          supplierId: s.supplierId,
          projectId: s.projectId,
          periodFrom: new Date("2026-10-27T00:00:00.000Z"),
          periodTo: new Date("2026-11-26T00:00:00.000Z"),
          signedBySupplier: true,
          signedDate: new Date(),
        },
      });
      await expectRollbackBlocked(runId, /kỳ đối chiếu đã ký ngoài run.*Bê tông HP × Trại Chuối/);
    });

    it("rollback is refused when a dieu_chinh was written in the run's pair after commit", async () => {
      const runId = await committedBundleRun();
      await prisma.ledgerTransaction.create({
        data: {
          ledgerType: "material",
          date: new Date("2026-10-30T00:00:00.000Z"),
          transactionType: "dieu_chinh",
          entityId: s.entityId,
          partyId: s.supplierId,
          projectId: s.projectId,
          amountTt: 100_000,
          totalTt: 100_000,
          status: "approved",
        },
      });
      await expectRollbackBlocked(runId, /ghi sau khi run được commit/);
    });

    it("rollback is refused when a ledger event points to a delivery of the run", async () => {
      const runId = await committedBundleRun();
      const delivery = await prisma.supplierDeliveryDaily.findFirstOrThrow({ where: { importRunId: runId } });
      // Event đã xóa mềm: chỉ điều kiện "event trỏ tới phiếu của run" bắt được.
      await prisma.ledgerTransaction.create({
        data: {
          ledgerType: "material",
          date: delivery.date,
          transactionType: "lay_hang",
          entityId: s.entityId,
          partyId: s.supplierId,
          projectId: s.projectId,
          deliveryId: delivery.id,
          amountTt: 28_980_000,
          totalTt: 28_980_000,
          status: "approved",
          deletedAt: new Date(),
        },
      });
      const message = await expectRollbackBlocked(runId, /phiếu của run/);
      expect(message).not.toMatch(/ghi sau khi run được commit/);
    });

    it("ERP activity in a pair the run did not touch does not block rollback", async () => {
      const runId = await committedBundleRun();
      await prisma.ledgerTransaction.create({
        data: {
          ledgerType: "material",
          date: new Date("2026-10-30T00:00:00.000Z"),
          transactionType: "dieu_chinh",
          entityId: s.entityId,
          partyId: s.supplierId,
          projectId: s.otherProjectId,
          amountTt: 100_000,
          totalTt: 100_000,
          status: "approved",
        },
      });
      const undone = await rollbackImportRun(runId);
      expect(undone.supplierDeliveryDaily).toBe(1);
      expect(undone.ledgerTransactions).toBe(1);
      const run = await prisma.importRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.status).toBe("rolled_back");
      expect(run.sourceFile).toBeNull();
    });
  });
});
