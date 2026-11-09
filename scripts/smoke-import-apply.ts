/**
 * Smoke test: run each import adapter end-to-end against a dev/test DB.
 *
 * For every adapter:
 *   1. read its SOP .xlsx file (or build a small workbook when SOP has no sample for it)
 *   2. previewImport()  — engine stores the source + review (reviewVersion 1)
 *   3. auto-resolve conflicts via findFirst-or-create
 *   4. refreshPreview(runId, mapping)  — zod-validated, reviewVersion += 1
 *   5. commitImport(runId, reviewVersion)  — reads the stored source, no re-upload
 *   6. assert getRollbackInfo total > 0
 *   7. rollbackImportRun()  — the run is kept as "rolled_back"
 *   8. assert getRollbackInfo total === 0 and status === "rolled_back"
 *
 * Run:  npx tsx --env-file=.env scripts/smoke-import-apply.ts [adapter]
 * Ghi thật vào DB của file env được chỉ định — chỉ chạy trên DB dev/test, không chạy trên production.
 */

import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import {
  previewImport,
  refreshPreview,
  commitImport,
  getRollbackInfo,
  rollbackImportRun,
} from "@/lib/import/import-engine";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";
import { getAdapter } from "@/lib/import/adapters/adapter-registry";

interface Case {
  adapter: string;
  file: string;
  /** Optional minimum row count expected (sanity check) */
  minRows?: number;
  /** Workbook dựng sẵn khi thư mục SOP không có file mẫu cho adapter này. */
  build?: () => Buffer;
}

const SOP_DIR = path.resolve(process.cwd(), "SOP");

/** SOP không có file công nợ nhân công — dựng workbook nhỏ đúng bố cục "Nhập Liệu" / "Số Dư Ban Đầu". */
function laborWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["BẢNG NHẬP LIỆU CÔNG NỢ NHÂN CÔNG"],
      ["smoke"],
      ["Ngày GD", "Loại GD", "Chủ Thể", "Đội Thi Công", "Dự Án / Công Trình", "Hạng Mục", "Tổng TT (VND)", "Tổng HĐ (VND)", "Số HĐ", "Nội dung"],
      ["10/02/2026", "Lấy hàng", "Smoke Chủ Thể", "Smoke Đội", "Smoke Dự Án", "Xây tô", "1,000,000", "1,100,000", "SMOKE-01", "smoke"],
      ["12/02/2026", "Trả tiền", "Smoke Chủ Thể", "Smoke Đội", "Smoke Dự Án", "", "500,000", "0", "", "smoke"],
    ]),
    "Nhập Liệu",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["SỐ DƯ BAN ĐẦU"],
      ["smoke"],
      [""],
      [""],
      ["Chủ Thể", "Đội Thi Công", "Dự Án", "Số Dư TT", "Số Dư HĐ", "Ngày Xác Nhận"],
      ["Smoke Chủ Thể", "Smoke Đội", "Smoke Dự Án", "2,000,000", "2,000,000", "01/01/2026"],
    ]),
    "Số Dư Ban Đầu",
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const CASES: Case[] = [
  { adapter: "cong-no-nhan-cong", file: "(dựng sẵn) cong-no-nhan-cong.xlsx", minRows: 3, build: laborWorkbook },
  { adapter: "du-an-xay-dung",  file: "Quản Lý Dự Án Xây Dựng.xlsx",         minRows: 10 },
  { adapter: "sl-dt",           file: "SL - DT.xlsx",                        minRows: 50 },
  { adapter: "tai-chinh-nq",    file: "Hệ thống quản lý tài chính NQ.xlsx",  minRows: 50 },
];

async function autoResolveMapping(
  conflicts: { sourceName: string; entityType: string; candidates: { id: number }[] }[],
): Promise<ResolvedMapping> {
  const mapping: ResolvedMapping = {};
  for (const c of conflicts) {
    const key = `${c.entityType}:${c.sourceName}`;
    if (c.candidates.length > 0) {
      mapping[key] = c.candidates[0].id;
      continue;
    }
    // No candidate — auto-create a master record so apply() can proceed.
    if (c.entityType === "supplier") {
      const created = await prisma.supplier.create({ data: { name: c.sourceName } });
      mapping[key] = created.id;
    } else if (c.entityType === "item") {
      const code = slug(c.sourceName);
      const created = await prisma.item.create({
        data: { code, name: c.sourceName, unit: "m3", type: "material" },
      });
      mapping[key] = created.id;
    } else if (c.entityType === "project") {
      const code = slug(c.sourceName);
      const created = await prisma.project.create({ data: { code, name: c.sourceName } });
      mapping[key] = created.id;
    } else if (c.entityType === "entity") {
      const created = await prisma.entity.create({
        data: { name: c.sourceName, type: "company" },
      });
      mapping[key] = created.id;
    } else if (c.entityType === "contractor") {
      const created = await prisma.contractor.create({ data: { name: c.sourceName } });
      mapping[key] = created.id;
    }
  }
  return mapping;
}

function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `auto-${Date.now()}`
  );
}

function loadSource(c: Case): Buffer {
  if (c.build) return c.build();
  const filePath = path.join(SOP_DIR, c.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SOP file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

async function runCase(c: Case): Promise<void> {
  const buf = loadSource(c);
  console.log(`\n[${c.adapter}] file="${c.file}" size=${buf.length}b`);

  const preview = await previewImport(buf, c.adapter, c.file, "smoke-test");
  console.log(
    `  preview: rows=${preview.parsedData.rows.length} conflicts=${preview.parsedData.conflicts.length} validationErrors=${preview.validationErrors.length}`,
  );
  if (c.minRows && preview.parsedData.rows.length < c.minRows) {
    throw new Error(
      `parsed rows ${preview.parsedData.rows.length} < expected min ${c.minRows}`,
    );
  }
  if (preview.review.blocking.length > 0) {
    throw new Error(`preview has blocking errors: ${preview.review.blocking.join("; ")}`);
  }

  const mapping = await autoResolveMapping(preview.parsedData.conflicts);
  const refreshed = await refreshPreview(preview.runId, mapping, "smoke-test");
  console.log(`  mapping keys=${Object.keys(mapping).length} reviewVersion=${refreshed.reviewVersion}`);

  const commit = await commitImport(preview.runId, refreshed.reviewVersion);
  console.log(
    `  commit: imported=${commit.rowsImported} skipped=${commit.rowsSkipped} errors=${commit.errors.length}`,
  );
  if (commit.errors.length > 0) {
    console.log(`  first 3 errors:`);
    for (const e of commit.errors.slice(0, 3)) {
      console.log(`    row ${e.rowIndex}: ${e.message}`);
    }
  }

  // Adapters with idempotent upserts (e.g. SL-DT) intentionally don't tag rows
  // with importRunId — per-run rollback does not apply to them.
  if (getAdapter(c.adapter)?.supportsRollback === false) {
    console.log(`  rollback: skipped — adapter does not support per-run rollback`);
    console.log(`  ✓ ${c.adapter} OK`);
    return;
  }

  const info = await getRollbackInfo(preview.runId);
  console.log(`  rollback info: total=${info.total}`, info);
  if (info.total === 0 && commit.rowsImported > 0) {
    throw new Error(
      `commit reported ${commit.rowsImported} but no rows tagged with importRunId — rollback would orphan data`,
    );
  }

  const rb = await rollbackImportRun(preview.runId);
  console.log(`  rollback executed: total deleted=${rb.total}`);

  const after = await getRollbackInfo(preview.runId);
  if (after.total !== 0) {
    throw new Error(`rollback left ${after.total} rows behind`);
  }
  const run = await prisma.importRun.findUniqueOrThrow({ where: { id: preview.runId }, select: { status: true } });
  if (run.status !== "rolled_back") {
    throw new Error(`run status after rollback is "${run.status}", expected "rolled_back"`);
  }
  console.log(`  ✓ ${c.adapter} OK`);
}

async function main() {
  const only = process.argv[2];
  const cases = only ? CASES.filter((c) => c.adapter === only) : CASES;
  if (cases.length === 0) {
    console.error(`No matching case for "${only}". Available:`, CASES.map((c) => c.adapter));
    process.exit(1);
  }
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const c of cases) {
    try {
      await runCase(c);
      results.push({ name: c.adapter, ok: true });
    } catch (err) {
      console.error(`  ✗ ${c.adapter} FAILED:`, err);
      results.push({ name: c.adapter, ok: false, error: String(err) });
    }
  }
  console.log("\n=== Summary ===");
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.error ? ` — ${r.error}` : ""}`);
  }
  await prisma.$disconnect();
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch(async (err) => {
  console.error("Fatal:", err);
  await prisma.$disconnect();
  process.exit(1);
});
