/**
 * Integration test: the import pipeline end-to-end against the REAL
 * `@/lib/prisma`. Drives previewImport → commitImport → rollbackImportRun
 * through the `cong-no-vat-tu` adapter (find-or-create master data + raw
 * SQL bulk inserts into ledger_*). Isolation: `truncateAll()` in beforeEach.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { truncateAll, closeTestDb } from "@/test/helpers/test-db";
import {
  previewImport,
  commitImport,
  getRollbackInfo,
  rollbackImportRun,
  deleteImportRun,
} from "@/lib/import/import-engine";

const CREATED_BY = "import-admin";

function congNoWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["BẢNG NHẬP LIỆU CÔNG NỢ VẬT TƯ"],
      ["năm 2026"],
      [
        "Ngày GD",
        "Loại GD",
        "Chủ Thể",
        "Nhà Cung Cấp",
        "Dự Án / Công Trình",
        "Tên Vật Tư",
        "Tổng TT (VND)",
        "Tổng HĐ (VND)",
        "Số HĐ",
        "Nội dung",
      ],
      ["10/02/2026", "Lấy hàng", "Cty Quản Lý", "NCC Thép Việt", "Dự án A", "Thép D10", "20,000,000", "22,000,000", "HD-01", ""],
      ["12/02/2026", "Trả tiền", "Cty Quản Lý", "NCC Thép Việt", "Dự án A", "", "5,000,000", "0", "", "thanh toán đợt 1"],
    ]),
    "Nhập Liệu",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("import engine — cong-no-vat-tu pipeline (integration)", () => {
  beforeEach(async () => {
    await truncateAll();
    await prisma.user.create({
      data: { id: CREATED_BY, name: "Import Admin", email: "import-admin@test.local", role: "admin" },
    });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("previews a workbook: parses rows and creates an ImportRun in preview state", async () => {
    const preview = await previewImport(congNoWorkbook(), "cong-no-vat-tu", "cong-no.xlsx", CREATED_BY);
    expect(preview.parsedData.rows).toHaveLength(2);
    expect(preview.duplicateWarning).toBe(false);
    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
    expect(run.status).toBe("preview");
    expect(run.rowsTotal).toBe(2);
  });

  it("commits the run: applies rows into ledger_transactions and auto-creates master data", async () => {
    const buf = congNoWorkbook();
    const preview = await previewImport(buf, "cong-no-vat-tu", "cong-no.xlsx", CREATED_BY);
    const result = await commitImport(preview.runId, buf, {});

    expect(result.rowsImported).toBe(2);
    expect(result.errors).toHaveLength(0);

    const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId } });
    expect(run.status).toBe("committed");

    const txs = await prisma.ledgerTransaction.findMany({ where: { importRunId: preview.runId } });
    expect(txs).toHaveLength(2);
    expect(txs.map((t) => t.transactionType).sort()).toEqual(["lay_hang", "thanh_toan"]);

    // master data was auto-created by find-or-create
    expect(await prisma.supplier.count({ where: { name: "NCC Thép Việt" } })).toBe(1);
    expect(await prisma.entity.count({ where: { name: "Cty Quản Lý" } })).toBe(1);
  });

  it("rejects commit when the file hash no longer matches the previewed file", async () => {
    const preview = await previewImport(congNoWorkbook(), "cong-no-vat-tu", "cong-no.xlsx", CREATED_BY);
    const otherWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(otherWb, XLSX.utils.aoa_to_sheet([["khác"]]), "Nhập Liệu");
    const tampered = XLSX.write(otherWb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    await expect(commitImport(preview.runId, tampered, {})).rejects.toThrow(
      "File hash mismatch",
    );
  });

  it("rolls back a committed run: deletes tagged ledger rows but keeps master data", async () => {
    const buf = congNoWorkbook();
    const preview = await previewImport(buf, "cong-no-vat-tu", "cong-no.xlsx", CREATED_BY);
    await commitImport(preview.runId, buf, {});

    const info = await getRollbackInfo(preview.runId);
    expect(info.ledgerTransactions).toBe(2);

    const undone = await rollbackImportRun(preview.runId);
    expect(undone.ledgerTransactions).toBe(2);

    expect(await prisma.ledgerTransaction.count()).toBe(0);
    expect(await prisma.importRun.findUnique({ where: { id: preview.runId } })).toBeNull();
    // master data survives a rollback
    expect(await prisma.supplier.count({ where: { name: "NCC Thép Việt" } })).toBe(1);
  });

  it("deletes a preview run that was never committed", async () => {
    const preview = await previewImport(congNoWorkbook(), "cong-no-vat-tu", "cong-no.xlsx", CREATED_BY);
    await deleteImportRun(preview.runId);
    expect(await prisma.importRun.findUnique({ where: { id: preview.runId } })).toBeNull();
  });
});
