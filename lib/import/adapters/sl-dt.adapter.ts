/**
 * Adapter: SL - DT 2025.xlsx → sl_dt_targets + payment_schedules
 *
 * Real SOP layout:
 *   - "Chỉ tiêu SL DT Tháng XX (năm YYYY)" — multiple monthly sheets.
 *     Header at row 7 (1-indexed: 8). Row 8 has sub-headers under SL/DT kỳ này.
 *     Data rows: each "Lô" (lot) is a sub-project. SL target = col 5,
 *     DT target = col 7.
 *   - "TIẾN ĐỘ NỘP TIỀN" — pivot matrix. Header at row 3, sub-header row 4.
 *     Per lot: 4 batches, each batch has (Nộp tiền, Tiến độ) sub-columns.
 *     planDate is not present → synthesize end-of-quarter for 2025.
 *
 * Each "Lô X" name becomes a `projectName` requiring mapping. User maps lots
 * to existing Project records or creates new ones via /admin/import conflicts UI.
 *
 * Idempotency: targets dedup by (projectId, year, month); payments by (projectId, batch).
 * importRunId persisted for full rollback.
 */

import * as XLSX from "xlsx";
import { num, normHeader, findHeaderRow } from "./excel-utils";
import type {
  ImportAdapter,
  ParsedData,
  ParsedRow,
  ValidationResult,
  ImportSummary,
} from "./adapter-types";

function slugifyName(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || `lot-${Date.now()}`
  );
}

function readMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
}

/** Parse "Chỉ tiêu SL DT Tháng 07 năm 2025" or "...Tháng 12 năm 202" → { year, month }. */
function parseTargetSheetName(name: string): { year: number; month: number } | null {
  const m = name.match(/Tháng\s*(\d{1,2})\s*(?:năm\s*(\d{2,4}))?/i);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  let year = m[2] ? parseInt(m[2], 10) : 2025;
  if (year < 100) year = 2000 + year;
  if (year < 1000) year = 2025; // truncated "202" → assume 2025
  return { year, month };
}

const QUARTER_END_2025 = [
  new Date(2025, 2, 31), // Đợt 1 → Q1
  new Date(2025, 5, 30), // Đợt 2 → Q2
  new Date(2025, 8, 30), // Đợt 3 → Q3
  new Date(2025, 11, 31), // Đợt 4 → Q4
];

function isLotRow(stt: unknown, dm: unknown): boolean {
  const s = String(stt ?? "").trim();
  const d = String(dm ?? "").trim();
  if (!d) return false;
  // Numeric STT and Danh mục starting with "Lô"
  return /^\d+$/.test(s) && /^Lô\s/i.test(d);
}

export const SlDtAdapter: ImportAdapter = {
  name: "sl-dt",
  label: "SL - DT 2025",

  async parse(buffer: Buffer): Promise<ParsedData> {
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const rows: ParsedRow[] = [];
    const projectNames = new Set<string>();

    // ── Targets: iterate ALL "Chỉ tiêu SL DT Tháng" sheets ──
    const targetSheets = wb.SheetNames.filter((n) => normHeader(n).includes("chi tieu sl dt"));
    for (const sheetName of targetSheets) {
      const ym = parseTargetSheetName(sheetName);
      if (!ym) continue;
      const matrix = readMatrix(wb.Sheets[sheetName]);
      // Header is around row 7-8; fall back to scanning for "STT" + "Danh mục".
      const headerIdx = findHeaderRow(matrix, ["stt"]);
      if (headerIdx < 0) continue;
      // Data starts after header + 2 (subheader + blank).
      const dataStart = headerIdx + 2;
      for (let i = dataStart; i < matrix.length; i++) {
        const r = matrix[i] || [];
        if (!isLotRow(r[0], r[1])) continue;
        const projectName = String(r[1]).trim();
        projectNames.add(projectName);
        // Column layout per inspect: 0:STT 1:Danh mục 2:Dự toán 3:SL luỹ kế đầu 4:DT luỹ kế đầu
        // 5:SL chỉ tiêu kỳ này 6:SL thực hiện 7:DT chỉ tiêu 8:DT thực hiện
        const slTarget = num(r[5]);
        const dtTarget = num(r[7]);
        if (slTarget === 0 && dtTarget === 0) continue;
        rows.push({
          rowIndex: rows.length,
          data: {
            kind: "target",
            projectName,
            year: ym.year,
            month: ym.month,
            slTarget,
            dtTarget,
            note: undefined,
          },
        });
      }
    }

    // ── Payments: TIẾN ĐỘ NỘP TIỀN matrix → 4 batches per lot ──
    const paymentSheet = wb.SheetNames.find((n) => {
      const norm = normHeader(n);
      return norm.includes("nop tien") || norm.includes("nộp tiền".toLowerCase());
    });
    if (paymentSheet) {
      const matrix = readMatrix(wb.Sheets[paymentSheet]);
      const headerIdx = findHeaderRow(matrix, ["stt"]);
      if (headerIdx >= 0) {
        const dataStart = headerIdx + 3; // skip subheader + blank
        for (let i = dataStart; i < matrix.length; i++) {
          const r = matrix[i] || [];
          if (!isLotRow(r[0], r[1])) continue;
          const projectName = String(r[1]).trim();
          projectNames.add(projectName);
          // Batch cols: 3,5,7,9 = Nộp tiền; 4,6,8,10 = Tiến độ (milestone)
          for (let b = 0; b < 4; b++) {
            const amount = num(r[3 + b * 2]);
            const milestone = String(r[4 + b * 2] ?? "").trim();
            if (amount <= 0 && !milestone) continue;
            rows.push({
              rowIndex: rows.length,
              data: {
                kind: "payment",
                projectName,
                batch: `Đợt ${b + 1}`,
                planDate: QUARTER_END_2025[b],
                planAmount: amount,
                actualDate: null,
                actualAmount: 0,
                note: milestone || undefined,
              },
            });
          }
        }
      }
    }

    // Lots are auto-created in apply() (find-or-create by name) — no manual mapping needed.
    // Users can rename / re-parent the auto-created Project records via /admin/projects later.
    return {
      rows,
      conflicts: [],
      meta: { targetSheets: targetSheets.length, paymentSheet, projects: projectNames.size },
    };
  },

  validate(data: ParsedData): ValidationResult {
    const errors: ValidationResult["errors"] = [];
    for (const row of data.rows) {
      if (row.data.kind === "target") {
        const y = Number(row.data.year);
        const m = Number(row.data.month);
        if (y < 2000 || y > 2100)
          errors.push({ rowIndex: row.rowIndex, field: "year", message: "Năm không hợp lệ" });
        if (m < 1 || m > 12)
          errors.push({ rowIndex: row.rowIndex, field: "month", message: "Tháng phải 1–12" });
      } else if (row.data.kind === "payment") {
        if (!row.data.batch)
          errors.push({ rowIndex: row.rowIndex, field: "batch", message: "Thiếu Đợt" });
      }
    }
    return { valid: errors.length === 0, errors };
  },

  async apply(data, mapping, tx, importRunId): Promise<ImportSummary> {
    let imported = 0;
    let skipped = 0;
    const errors: ImportSummary["errors"] = [];
    type Tx = typeof import("@/lib/prisma")["prisma"];
    const db = tx as Tx;

    const projectCache = new Map<string, number>();
    async function getOrCreateProject(name: string): Promise<number> {
      if (projectCache.has(name)) return projectCache.get(name)!;
      const fromMap = mapping[`project:${name}`];
      if (fromMap) {
        projectCache.set(name, fromMap);
        return fromMap;
      }
      const found = await db.project.findFirst({
        where: { name, deletedAt: null },
        select: { id: true },
      });
      if (found) {
        projectCache.set(name, found.id);
        return found.id;
      }
      const created = await db.project.create({
        data: { code: slugifyName(name), name },
        select: { id: true },
      });
      projectCache.set(name, created.id);
      return created.id;
    }

    for (const row of data.rows) {
      try {
        const projectName = String(row.data.projectName ?? "");
        if (!projectName) {
          skipped++;
          continue;
        }
        const projectId = await getOrCreateProject(projectName);

        if (row.data.kind === "target") {
          const year = Number(row.data.year);
          const month = Number(row.data.month);
          const existing = await db.$queryRaw<{ id: number }[]>`
            SELECT id FROM sl_dt_targets
            WHERE "projectId" = ${projectId} AND year = ${year} AND month = ${month}
            LIMIT 1
          `;
          if (existing.length > 0) {
            skipped++;
            continue;
          }
          await db.$executeRaw`
            INSERT INTO sl_dt_targets
              ("projectId", year, month, "slTarget", "dtTarget", note, "importRunId", "createdAt", "updatedAt")
            VALUES
              (${projectId}, ${year}, ${month},
               ${Number(row.data.slTarget ?? 0)}, ${Number(row.data.dtTarget ?? 0)},
               ${row.data.note ? String(row.data.note) : null},
               ${importRunId ?? null}, NOW(), NOW())
          `;
          imported++;
          continue;
        }

        // payment schedule
        const batch = String(row.data.batch ?? "");
        const planDate = row.data.planDate as Date;
        const existing = await db.$queryRaw<{ id: number }[]>`
          SELECT id FROM payment_schedules
          WHERE "projectId" = ${projectId} AND batch = ${batch} AND "deletedAt" IS NULL
          LIMIT 1
        `;
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        const actualAmount = Number(row.data.actualAmount ?? 0);
        const status = actualAmount > 0 ? "paid" : "pending";

        await db.$executeRaw`
          INSERT INTO payment_schedules
            ("projectId", batch, "planDate", "planAmount", "actualDate", "actualAmount",
             status, note, "importRunId", "createdAt", "updatedAt")
          VALUES
            (${projectId}, ${batch}, ${planDate}, ${Number(row.data.planAmount ?? 0)},
             ${(row.data.actualDate as Date) ?? null},
             ${actualAmount > 0 ? actualAmount : null},
             ${status}, ${row.data.note ? String(row.data.note) : null},
             ${importRunId ?? null}, NOW(), NOW())
        `;
        imported++;
      } catch (err) {
        errors.push({ rowIndex: row.rowIndex, message: String(err) });
      }
    }

    return { rowsTotal: data.rows.length, rowsImported: imported, rowsSkipped: skipped, errors };
  },
};
