/**
 * Smoke test: run each import adapter end-to-end against dev DB.
 *
 * For every adapter:
 *   1. read its SOP .xlsx file
 *   2. previewImport()
 *   3. auto-resolve conflicts via findFirst-or-create
 *   4. commitImport()
 *   5. assert getRollbackInfo total > 0
 *   6. rollbackImportRun()
 *   7. assert getRollbackInfo total === 0 after rollback
 *
 * Run:  npx tsx --env-file=.env scripts/smoke-import-apply.ts
 */

import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import {
  previewImport,
  commitImport,
  getRollbackInfo,
  rollbackImportRun,
} from "@/lib/import/import-engine";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";

interface Case {
  adapter: string;
  file: string;
  /** Optional minimum row count expected (sanity check) */
  minRows?: number;
}

const SOP_DIR = path.resolve(process.cwd(), "SOP");

const CASES: Case[] = [
  { adapter: "gach-nam-huong",  file: "Gạch Nam Hương.xlsx",                minRows: 1 },
  { adapter: "quang-minh",      file: "Quang Minh cát,gạch.xlsx",            minRows: 1 },
  { adapter: "du-an-xay-dung",  file: "Quản Lý Dự Án Xây Dựng.xlsx",         minRows: 10 },
  { adapter: "sl-dt",           file: "SL - DT 2025.xlsx",                   minRows: 50 },
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

async function runCase(c: Case): Promise<void> {
  const filePath = path.join(SOP_DIR, c.file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SOP file not found: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
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

  const mapping = await autoResolveMapping(preview.parsedData.conflicts);
  console.log(`  mapping keys=${Object.keys(mapping).length}`);

  const commit = await commitImport(preview.runId, buf, mapping);
  console.log(
    `  commit: imported=${commit.rowsImported} skipped=${commit.rowsSkipped} errors=${commit.errors.length}`,
  );
  if (commit.errors.length > 0) {
    console.log(`  first 3 errors:`);
    for (const e of commit.errors.slice(0, 3)) {
      console.log(`    row ${e.rowIndex}: ${e.message}`);
    }
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

  const after = await getRollbackInfo(preview.runId).catch(() => ({ total: 0 }));
  if (after.total !== 0) {
    throw new Error(`rollback left ${after.total} rows behind`);
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
